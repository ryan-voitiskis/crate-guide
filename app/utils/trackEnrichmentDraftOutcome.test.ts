import { describe, expect, it } from 'vitest'
import type { Track } from '~~/shared/types/supabase'
import type {
	TrackBatchIssueCode,
	TrackBatchUpdateOutcome,
	TrackBatchUpdateResult
} from '~~/shared/types/trackUpdates'
import {
	type TrackEnrichmentDraftBatchBinding,
	TrackEnrichmentDraftOutcomeMappingError,
	getTrackEnrichmentDraftOutcomeDisposition,
	mapTrackEnrichmentDraftBatchOutcome
} from './trackEnrichmentDraftOutcome'

const ATTEMPTED_AT = '2026-07-23T04:00:00.000Z'

function track(id: string): Track {
	return {
		id,
		record_id: 'record-a',
		title: id,
		artists: [],
		extraartists: [],
		position: null,
		duration: null,
		bpm: 124,
		rpm: null,
		key: null,
		mode: null,
		genres: [],
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true,
		beatport_data: null,
		audio_features: null,
		created_at: null,
		updated_at: ATTEMPTED_AT
	}
}

function success(id: string): TrackBatchUpdateResult {
	return {
		id,
		status: 'updated',
		success: true,
		track: track(id),
		issue: null,
		error: null,
		operation: null
	}
}

function failure(
	id: string,
	status: Exclude<TrackBatchUpdateResult['status'], 'updated'>,
	code: TrackBatchIssueCode
): TrackBatchUpdateResult {
	return {
		id,
		status,
		success: false,
		track: null,
		issue: { code, message: code },
		error: code,
		operation: null
	}
}

function binding(
	targetTrackId: string,
	requested: TrackEnrichmentDraftBatchBinding['requested'] = {
		bpm: true,
		keyMode: false
	}
): TrackEnrichmentDraftBatchBinding {
	return {
		intentKind: 'fill-empty-fields',
		sourceFingerprint: `source-${targetTrackId}`,
		targetTrackId,
		requested
	}
}

function map(
	bindings: readonly TrackEnrichmentDraftBatchBinding[],
	results: TrackBatchUpdateResult[],
	cancelled = false
) {
	return mapTrackEnrichmentDraftBatchOutcome({
		bindings,
		outcome: { results, cancelled, requiresReview: true },
		attemptedAt: ATTEMPTED_AT
	})
}

describe('track enrichment draft batch outcomes', () => {
	it('preserves confirmed successes in a mixed result even when the batch is cancelled', () => {
		const outcomes = map(
			[binding('track-a'), binding('track-b', { bpm: false, keyMode: true })],
			[
				success('track-a'),
				failure('track-b', 'unattempted', 'account_replaced')
			],
			true
		)

		expect(outcomes).toEqual([
			{
				intentKind: 'fill-empty-fields',
				sourceFingerprint: 'source-track-a',
				targetTrackId: 'track-a',
				status: 'succeeded',
				applied: { bpm: true, keyMode: false },
				attemptedAt: ATTEMPTED_AT,
				failureCode: null
			},
			{
				intentKind: 'fill-empty-fields',
				sourceFingerprint: 'source-track-b',
				targetTrackId: 'track-b',
				status: 'failed',
				applied: { bpm: false, keyMode: false },
				attemptedAt: ATTEMPTED_AT,
				failureCode: 'workspace-changed'
			}
		])
		expect(getTrackEnrichmentDraftOutcomeDisposition(outcomes[0]!)).toBe('done')
		expect(getTrackEnrichmentDraftOutcomeDisposition(outcomes[1]!)).toBe(
			'rematch'
		)
	})

	it.each([
		['request_unknown', 'unknown'],
		['prior_chunk_unknown', 'unattempted'],
		['invalid_response', 'invalid']
	] as const)(
		'keeps %s distinct from a definite retry',
		(issueCode, status) => {
			const [outcome] = map(
				[binding('track-a')],
				[failure('track-a', status, issueCode)],
				status === 'unattempted'
			)

			expect(outcome).toMatchObject({
				status: 'unknown',
				failureCode: 'request-unknown',
				applied: { bpm: false, keyMode: false }
			})
			expect(getTrackEnrichmentDraftOutcomeDisposition(outcome!)).toBe('review')
		}
	)

	it.each([
		['stale', 'stale_revision', 'conflict'],
		['not_found', 'not_found', 'not-found']
	] as const)(
		'maps %s/%s to rematch-required %s',
		(status, issueCode, failureCode) => {
			const [outcome] = map(
				[binding('track-a')],
				[failure('track-a', status, issueCode)]
			)
			expect(outcome).toMatchObject({ status: 'failed', failureCode })
			expect(getTrackEnrichmentDraftOutcomeDisposition(outcome!)).toBe(
				'rematch'
			)
		}
	)

	it('maps a definite capacity rejection to retry without claiming an apply', () => {
		const [outcome] = map(
			[binding('track-a')],
			[failure('track-a', 'unattempted', 'receipt_capacity')],
			true
		)
		expect(outcome).toMatchObject({
			status: 'failed',
			failureCode: 'capacity',
			applied: { bpm: false, keyMode: false }
		})
		expect(getTrackEnrichmentDraftOutcomeDisposition(outcome!)).toBe('retry')
	})

	it('records a confirmed Evidence-only save without claiming value application', () => {
		const [outcome] = map(
			[
				{
					...binding('track-a', { bpm: false, keyMode: false }),
					intentKind: 'evidence-only'
				}
			],
			[success('track-a')]
		)

		expect(outcome).toEqual({
			intentKind: 'evidence-only',
			sourceFingerprint: 'source-track-a',
			targetTrackId: 'track-a',
			status: 'succeeded',
			applied: { bpm: false, keyMode: false },
			attemptedAt: ATTEMPTED_AT,
			failureCode: null
		})
		expect(getTrackEnrichmentDraftOutcomeDisposition(outcome!)).toBe('done')
	})

	it('does not invent outcomes for cancelled bindings that returned no result', () => {
		expect(map([binding('track-a')], [], true)).toEqual([])
		expect(() => map([binding('track-a')], [], false)).toThrowError(
			new TrackEnrichmentDraftOutcomeMappingError('missing-result')
		)
	})

	it('fails closed for duplicate identities, target drift, and status/code drift', () => {
		expect(() =>
			map([binding('track-a'), binding('track-a')], [success('track-a')])
		).toThrowError(
			new TrackEnrichmentDraftOutcomeMappingError('duplicate-binding')
		)
		expect(() => map([binding('track-a')], [success('track-b')])).toThrowError(
			new TrackEnrichmentDraftOutcomeMappingError('result-target-mismatch')
		)
		expect(() =>
			map(
				[
					binding('track-a'),
					{ ...binding('track-b'), sourceFingerprint: 'source-track-a' }
				],
				[success('track-a'), success('track-b')]
			)
		).toThrowError(
			new TrackEnrichmentDraftOutcomeMappingError('duplicate-binding')
		)
		expect(() =>
			map(
				[binding('track-a', { bpm: false, keyMode: false })],
				[success('track-a')]
			)
		).toThrowError(
			new TrackEnrichmentDraftOutcomeMappingError('invalid-binding')
		)
		expect(() =>
			map(
				[binding('track-a')],
				[failure('track-a', 'invalid', 'stale_revision')]
			)
		).toThrowError(
			new TrackEnrichmentDraftOutcomeMappingError('result-status-mismatch')
		)

		const duplicateResults: TrackBatchUpdateOutcome = {
			results: [success('track-a'), success('track-a')],
			cancelled: true,
			requiresReview: true
		}
		expect(() =>
			mapTrackEnrichmentDraftBatchOutcome({
				bindings: [binding('track-a')],
				outcome: duplicateResults,
				attemptedAt: ATTEMPTED_AT
			})
		).toThrowError(
			new TrackEnrichmentDraftOutcomeMappingError('duplicate-result')
		)
	})
})
