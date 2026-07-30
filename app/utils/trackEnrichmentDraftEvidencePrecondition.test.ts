import { describe, expect, it } from 'vitest'
import { createTrackEnrichmentCurrentEvidenceFingerprint } from './trackEnrichmentDraftEvidencePrecondition'

function currentEvidence() {
	return {
		version: 1 as const,
		updatedAt: '2026-07-23T01:00:00.000Z',
		applied: { bpm: null, keyMode: null },
		match: {
			confidence: 'high' as const,
			score: 100,
			reasons: ['title'],
			warnings: []
		},
		sources: {
			rekordboxXml: {
				importedAt: '2026-07-23T01:00:00.000Z',
				fileName: 'collection.xml',
				name: 'Track',
				artist: 'Artist',
				album: null,
				genre: null,
				locationHint: 'Artist/Track.wav',
				averageBpm: 128,
				tonality: '8A',
				parsedKey: 9,
				parsedMode: 0,
				totalTimeSeconds: 240,
				year: null,
				kind: null,
				sampleRate: null,
				bitRate: null,
				rating: null,
				playCount: null,
				comments: null,
				remixer: null,
				label: null,
				dateAdded: null
			}
		}
	}
}

describe('track enrichment draft current Evidence fingerprint', () => {
	it('is deterministic across object insertion order and distinct for absence', async () => {
		const evidence = currentEvidence()
		const reordered = {
			sources: evidence.sources,
			match: evidence.match,
			applied: evidence.applied,
			updatedAt: evidence.updatedAt,
			version: evidence.version
		}

		const [first, second, absent] = await Promise.all([
			createTrackEnrichmentCurrentEvidenceFingerprint(evidence),
			createTrackEnrichmentCurrentEvidenceFingerprint(reordered),
			createTrackEnrichmentCurrentEvidenceFingerprint(null)
		])

		expect(first).toMatch(/^[a-f0-9]{64}$/)
		expect(second).toBe(first)
		expect(absent).toMatch(/^[a-f0-9]{64}$/)
		expect(absent).not.toBe(first)
	})

	it('changes for an exact current Evidence change', async () => {
		const before = currentEvidence()
		const after = structuredClone(before)
		after.sources.rekordboxXml.averageBpm = 129

		const [beforeDigest, afterDigest] = await Promise.all([
			createTrackEnrichmentCurrentEvidenceFingerprint(before),
			createTrackEnrichmentCurrentEvidenceFingerprint(after)
		])
		expect(beforeDigest).toMatch(/^[a-f0-9]{64}$/)
		expect(afterDigest).toMatch(/^[a-f0-9]{64}$/)
		expect(afterDigest).not.toBe(beforeDigest)
	})

	it.each([
		[
			'private runtime payload',
			{ ...currentEvidence(), rawAudio: '/secret.wav' }
		],
		[
			'oversized Evidence',
			{
				...currentEvidence(),
				match: {
					...currentEvidence().match,
					reasons: ['x'.repeat(50_000)]
				}
			}
		],
		['malformed Evidence', { version: 1 }]
	] as const)('fails closed for %s', async (_name, evidence) => {
		await expect(
			createTrackEnrichmentCurrentEvidenceFingerprint(evidence)
		).resolves.toBeNull()
	})
})
