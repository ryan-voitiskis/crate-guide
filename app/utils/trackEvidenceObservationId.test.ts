import { describe, expect, it } from 'vitest'
import { createTrackEvidenceObservationId } from './trackEvidenceObservationId'

const input = {
	observedAt: '2026-07-30T10:00:00.000Z',
	match: {
		confidence: 'high' as const,
		score: 96,
		reasons: ['Exact title'],
		warnings: [],
		matcherPolicyVersion: 'track-enrichment-draft-matcher-v1'
	},
	data: {
		fileName: 'track.flac',
		bpm: 128,
		nested: { artist: 'Artist', title: 'Track' }
	}
}

describe('createTrackEvidenceObservationId', () => {
	it('is stable across object key order', async () => {
		const reordered = {
			data: {
				nested: { title: 'Track', artist: 'Artist' },
				bpm: 128,
				fileName: 'track.flac'
			},
			match: {
				matcherPolicyVersion: 'track-enrichment-draft-matcher-v1',
				warnings: [] as string[],
				reasons: ['Exact title'],
				score: 96,
				confidence: 'high' as const
			},
			observedAt: input.observedAt
		}

		await expect(
			createTrackEvidenceObservationId('embeddedTags', reordered)
		).resolves.toBe(
			await createTrackEvidenceObservationId('embeddedTags', input)
		)
	})

	it.each([
		[
			'source',
			() => createTrackEvidenceObservationId('essentiaBrowser', input)
		],
		[
			'observation time',
			() =>
				createTrackEvidenceObservationId('embeddedTags', {
					...input,
					observedAt: '2026-07-30T10:00:00.001Z'
				})
		],
		[
			'match evidence',
			() =>
				createTrackEvidenceObservationId('embeddedTags', {
					...input,
					match: { ...input.match, score: 95 }
				})
		],
		[
			'source data',
			() =>
				createTrackEvidenceObservationId('embeddedTags', {
					...input,
					data: { ...input.data, bpm: 129 }
				})
		]
	])('changes when %s changes', async (_label, changed) => {
		const original = await createTrackEvidenceObservationId(
			'embeddedTags',
			input
		)
		await expect(changed()).resolves.not.toBe(original)
	})

	it('uses the bounded versioned source and SHA-256 form', async () => {
		await expect(
			createTrackEvidenceObservationId('embeddedTags', input)
		).resolves.toMatch(/^te2:embeddedTags:[0-9a-f]{64}$/u)
	})
})
