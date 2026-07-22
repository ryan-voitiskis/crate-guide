import { describe, expect, it } from 'vitest'
import type { LibraryTrack } from '../../shared/types/library'
import {
	currentTrackEvidenceV2Golden,
	legacyTrackAudioFeaturesV1Golden
} from '../../test/fixtures/trackEvidence'
import { createMockTrack } from '../../test/mocks/fixtures/tracks'
import {
	DEFAULT_TRACK_EVIDENCE_LENS_FILTERS,
	type TrackEvidenceLensFilters,
	countTrackEvidenceLensRows,
	deriveTrackEvidenceLensRow,
	deriveTrackEvidenceLensRows,
	filterTrackEvidenceLensRows,
	hasTrackEvidenceLensFilters
} from './trackEvidenceLens'

function trackWithEvidence(
	id: string,
	evidence: unknown,
	overrides: Partial<LibraryTrack> = {}
): LibraryTrack {
	return {
		...createMockTrack({ id, bpm: 128, key: 5, mode: 0 }),
		audio_features: evidence,
		...overrides
	} as LibraryTrack
}

function filters(
	overrides: Partial<TrackEvidenceLensFilters> = {}
): TrackEvidenceLensFilters {
	return { ...DEFAULT_TRACK_EVIDENCE_LENS_FILTERS, ...overrides }
}

describe('track Evidence collection lens', () => {
	it('derives a sanitized current-v2 row with conservative agreement and application state', () => {
		const row = deriveTrackEvidenceLensRow(
			trackWithEvidence('current', currentTrackEvidenceV2Golden, {
				bpm: 128,
				key: 5,
				mode: 0
			})
		)

		expect(row).toMatchObject({
			id: 'current',
			current: { bpm: 128, key: 5, mode: 0 },
			evidence: {
				presence: 'retained',
				version: 'current-v2',
				retainedSourceCount: 3,
				sources: {
					rekordboxXml: true,
					embeddedTags: true,
					essentiaBrowser: true
				},
				comparison: {
					bpm: 'agreement',
					keyMode: 'agreement',
					overall: 'agreement'
				},
				application: {
					bpm: 'applied',
					keyMode: 'applied',
					changedSinceApplication: false
				}
			}
		})
		const serialized = JSON.stringify(row)
		expect(serialized).not.toContain('audio_features')
		expect(serialized).not.toContain('collection.xml')
		expect(serialized).not.toContain('locationHint')
	})

	it('makes any field conflict dominant and keeps changed application state separate', () => {
		const evidence = structuredClone(currentTrackEvidenceV2Golden)
		evidence.sources.embeddedTags!.data.bpm = 130
		const row = deriveTrackEvidenceLensRow(
			trackWithEvidence('conflict', evidence, { bpm: 129 })
		)

		expect(row.evidence.comparison).toEqual({
			bpm: 'conflict',
			keyMode: 'agreement',
			overall: 'conflict'
		})
		expect(row.evidence.application).toMatchObject({
			bpm: 'changed-since-application',
			keyMode: 'applied',
			changedSinceApplication: true
		})
	})

	it('requires both fields to agree before assigning aggregate Agreement', () => {
		const evidence = structuredClone(currentTrackEvidenceV2Golden)
		evidence.applied = { bpm: null, keyMode: null }
		delete evidence.sources.embeddedTags
		delete evidence.sources.essentiaBrowser
		const row = deriveTrackEvidenceLensRow(
			trackWithEvidence('insufficient', evidence)
		)

		expect(row.evidence.comparison).toEqual({
			bpm: 'insufficient-evidence',
			keyMode: 'insufficient-evidence',
			overall: 'insufficient-evidence'
		})
		expect(row.evidence.retainedSourceCount).toBe(1)
		expect(row.evidence.application.bpm).toBe('unattributed')
	})

	it('keeps compatible v1 evidence explicit and unattributed', () => {
		const row = deriveTrackEvidenceLensRow(
			trackWithEvidence('legacy', legacyTrackAudioFeaturesV1Golden)
		)

		expect(row.evidence).toMatchObject({
			presence: 'retained',
			version: 'legacy-v1',
			retainedSourceCount: 3,
			comparison: { overall: 'agreement' },
			application: {
				bpm: 'unattributed',
				keyMode: 'unattributed',
				changedSinceApplication: false
			}
		})
	})

	it('distinguishes no retained Evidence from malformed unavailable Evidence without derived claims', () => {
		const none = deriveTrackEvidenceLensRow(trackWithEvidence('none', null))
		const malformed = deriveTrackEvidenceLensRow(
			trackWithEvidence('malformed', {
				version: 2,
				sources: { rekordboxXml: { locationHint: '/private/audio.wav' } }
			})
		)

		expect(none.evidence.presence).toBe('none')
		expect(malformed.evidence.presence).toBe('unavailable')
		for (const row of [none, malformed]) {
			expect(row.evidence.version).toBeNull()
			expect(row.evidence.comparison).toEqual({
				bpm: null,
				keyMode: null,
				overall: null
			})
			expect(row.evidence.application.changedSinceApplication).toBe(false)
			expect(JSON.stringify(row)).not.toContain('/private/audio.wav')
		}
	})

	it('counts overlapping source coverage and applies independent lens filters', () => {
		const conflictEvidence = structuredClone(currentTrackEvidenceV2Golden)
		conflictEvidence.sources.embeddedTags!.data.bpm = 131
		const insufficientEvidence = structuredClone(currentTrackEvidenceV2Golden)
		insufficientEvidence.applied = { bpm: null, keyMode: null }
		delete insufficientEvidence.sources.embeddedTags
		delete insufficientEvidence.sources.essentiaBrowser
		const rows = deriveTrackEvidenceLensRows([
			trackWithEvidence('current', currentTrackEvidenceV2Golden),
			trackWithEvidence('changed-conflict', conflictEvidence, { bpm: 129 }),
			trackWithEvidence('legacy', legacyTrackAudioFeaturesV1Golden),
			trackWithEvidence('insufficient', insufficientEvidence),
			trackWithEvidence('none', null),
			trackWithEvidence('malformed', { version: 2 })
		])

		expect(countTrackEvidenceLensRows(rows)).toEqual({
			total: 6,
			retained: 4,
			none: 1,
			unavailable: 1,
			sources: { rekordboxXml: 4, embeddedTags: 3, essentiaBrowser: 3 },
			comparison: {
				agreement: 2,
				conflict: 1,
				'insufficient-evidence': 1
			},
			changedSinceApplication: 1,
			versions: { 'current-v2': 3, 'legacy-v1': 1 }
		})
		expect(
			filterTrackEvidenceLensRows(rows, filters({ presence: 'none' })).map(
				(row) => row.id
			)
		).toEqual(['none'])
		expect(
			filterTrackEvidenceLensRows(
				rows,
				filters({ source: 'essentiaBrowser', version: 'legacy-v1' })
			).map((row) => row.id)
		).toEqual(['legacy'])
		expect(
			filterTrackEvidenceLensRows(
				rows,
				filters({
					comparison: 'conflict',
					application: 'changed-since-application'
				})
			).map((row) => row.id)
		).toEqual(['changed-conflict'])
		expect(hasTrackEvidenceLensFilters(filters())).toBe(false)
		expect(hasTrackEvidenceLensFilters(filters({ presence: 'retained' }))).toBe(
			true
		)
	})

	it('derives and filters ten thousand tracks without truncating the dataset', () => {
		const tracks = Array.from({ length: 10_000 }, (_, index) =>
			trackWithEvidence(
				`track-${String(index).padStart(5, '0')}`,
				index % 1000 === 0 ? { version: 2 } : null
			)
		)
		const rows = deriveTrackEvidenceLensRows(tracks)

		expect(rows).toHaveLength(10_000)
		expect(countTrackEvidenceLensRows(rows)).toMatchObject({
			total: 10_000,
			none: 9990,
			unavailable: 10
		})
		expect(
			filterTrackEvidenceLensRows(rows, filters({ presence: 'none' }))
		).toHaveLength(9990)
		expect(rows.at(-1)?.id).toBe('track-09999')
	})
})
