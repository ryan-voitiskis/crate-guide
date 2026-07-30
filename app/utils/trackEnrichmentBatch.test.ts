import { describe, expect, it } from 'vitest'
import type { TrackBatchUpdate } from '~~/shared/types/trackUpdates'
import {
	TRACK_ENRICHMENT_BATCH_SIZE,
	canonicalizeTrackEnrichmentRequest,
	createTrackEnrichmentBatchRequest,
	decodeTrackEnrichmentBatchResponse
} from './trackEnrichmentBatch'

const OPERATION_ID = '00000000-0000-4000-8000-000000000001'

function createUpdate(index = 0): TrackBatchUpdate {
	return {
		id: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
		expectedUpdatedAt: '2026-07-22T00:00:00.000Z',
		updates: {
			bpm: 128,
			audio_features: {
				version: 1,
				updatedAt: '2026-07-22T00:00:00.000Z',
				applied: { bpm: null, keyMode: null },
				match: {
					confidence: 'high',
					score: 100,
					reasons: [],
					warnings: []
				},
				sources: {}
			}
		},
		preconditions: { bpmMustBeNull: true }
	}
}

describe('track enrichment batch request codec', () => {
	it('canonicalizes object keys recursively and omits undefined values', () => {
		expect(
			canonicalizeTrackEnrichmentRequest({
				z: [{ b: 2, a: 1 }],
				a: undefined
			})
		).toBe('{"z":[{"a":1,"b":2}]}')
	})

	it('builds deterministic item and operation hashes with explicit ordinals', async () => {
		const entries = [{ ordinal: 12, update: createUpdate() }]
		const first = await createTrackEnrichmentBatchRequest(
			entries,
			() => OPERATION_ID
		)
		const second = await createTrackEnrichmentBatchRequest(
			entries,
			() => OPERATION_ID
		)

		expect(first).toEqual(second)
		expect(first.operationId).toBe(OPERATION_ID)
		expect(first.operationHash).toMatch(/^[0-9a-f]{64}$/)
		expect(first.items).toEqual([
			expect.objectContaining({
				ordinal: 12,
				track_id: createUpdate().id,
				expected_updated_at: '2026-07-22T00:00:00.000Z',
				preconditions: {
					bpm_must_be_null: true,
					key_mode_must_be_null: false
				},
				request_hash: expect.stringMatching(/^[0-9a-f]{64}$/)
			})
		])
	})

	it('enforces the client chunk bound', async () => {
		await expect(createTrackEnrichmentBatchRequest([])).rejects.toThrow('1-100')
		await expect(
			createTrackEnrichmentBatchRequest(
				Array.from({ length: TRACK_ENRICHMENT_BATCH_SIZE + 1 }, (_, index) => ({
					ordinal: index,
					update: createUpdate(index)
				}))
			)
		).rejects.toThrow('1-100')
	})

	it('decodes one exact ordered status per request item', async () => {
		const request = await createTrackEnrichmentBatchRequest(
			[
				{ ordinal: 3, update: createUpdate(1) },
				{ ordinal: 9, update: createUpdate(2) }
			],
			() => OPERATION_ID
		)
		const response = {
			version: 1,
			operation_id: request.operationId,
			operation_hash: request.operationHash,
			results: request.items.map((item, index) => ({
				ordinal: item.ordinal,
				track_id: item.track_id,
				request_hash: item.request_hash,
				status: index === 0 ? 'updated' : 'stale',
				issue_code: index === 0 ? null : 'stale_revision',
				track: index === 0 ? { id: item.track_id } : null
			}))
		}

		expect(decodeTrackEnrichmentBatchResponse(response, request)).toEqual([
			expect.objectContaining({
				status: 'updated',
				identity: expect.objectContaining({ ordinal: 3 })
			}),
			expect.objectContaining({
				status: 'stale',
				issueCode: 'stale_revision',
				identity: expect.objectContaining({ ordinal: 9 })
			})
		])
	})

	it.each([
		['wrong operation', { operation_id: crypto.randomUUID() }],
		['wrong order', { resultOrdinal: 99 }],
		['unknown status', { status: 'mystery' }],
		['missing updated row', { track: null }]
	])('rejects a %s response', async (_label, mutation) => {
		const request = await createTrackEnrichmentBatchRequest(
			[{ ordinal: 0, update: createUpdate() }],
			() => OPERATION_ID
		)
		const item = request.items[0]!
		const response = {
			version: 1,
			operation_id:
				'operation_id' in mutation
					? mutation.operation_id
					: request.operationId,
			operation_hash: request.operationHash,
			results: [
				{
					ordinal:
						'resultOrdinal' in mutation ? mutation.resultOrdinal : item.ordinal,
					track_id: item.track_id,
					request_hash: item.request_hash,
					status: 'status' in mutation ? mutation.status : 'updated',
					issue_code: null,
					track: 'track' in mutation ? mutation.track : { id: item.track_id }
				}
			]
		}

		expect(() =>
			decodeTrackEnrichmentBatchResponse(response, request)
		).toThrow()
	})
})
