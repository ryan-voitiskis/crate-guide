import { describe, expect, it } from 'vitest'
import type { LibraryPlayedTrackEntry } from '../../shared/types/library'
import {
	calculatePitchAdjustment,
	calculateTempoScore,
	filterAlreadyPlayed,
	filterByBpmReach,
	getSuggestionRank,
	getTrackSuggestions,
	scoreTrack
} from './trackSuggestions'
import {
	HISTORY_BONUS_MAX,
	buildTransitionHistoryIndex
} from './transitionHistory'

// Helper to create a minimal Track object for testing
function createTestTrack(overrides: Partial<Track> = {}): Track {
	return {
		id: 'track-1',
		record_id: 'record-1',
		position: 'A1',
		title: 'Test Track',
		duration: 300, // Duration in seconds
		bpm: 120,
		key: 0,
		mode: 0,
		rpm: null,
		playable: true,
		time_signature_upper: null,
		time_signature_lower: null,
		artists: [],
		extraartists: [],
		genres: [],
		beatport_data: null,
		audio_features: null,
		created_at: null,
		updated_at: null,
		...overrides
	}
}

describe('filterByBpmReach', () => {
	it('includes tracks within BPM reach', () => {
		const tracks = [
			createTestTrack({ id: '1', bpm: 120 }),
			createTestTrack({ id: '2', bpm: 125 }),
			createTestTrack({ id: '3', bpm: 130 })
		]

		// With 8% pitch range and target 120 BPM:
		// Track at 120 BPM can reach 110.4 - 129.6 (includes 120)
		// Track at 125 BPM can reach 115 - 135 (includes 120)
		// Track at 130 BPM can reach 119.6 - 140.4 (includes 120)
		const result = filterByBpmReach(tracks, 120, 8)

		expect(result).toHaveLength(3)
	})

	it('excludes tracks outside BPM reach', () => {
		const tracks = [
			createTestTrack({ id: '1', bpm: 120 }),
			createTestTrack({ id: '2', bpm: 150 }) // Too far away
		]

		// With 8% pitch range and target 120 BPM:
		// Track at 150 BPM can reach 138 - 162 (does not include 120)
		const result = filterByBpmReach(tracks, 120, 8)

		expect(result).toHaveLength(1)
		expect(result[0]?.id).toBe('1')
	})

	it('excludes tracks with null BPM', () => {
		const tracks = [
			createTestTrack({ id: '1', bpm: 120 }),
			createTestTrack({ id: '2', bpm: null })
		]

		const result = filterByBpmReach(tracks, 120, 8)

		expect(result).toHaveLength(1)
		expect(result[0]?.id).toBe('1')
	})

	it('handles wider pitch range', () => {
		const tracks = [
			createTestTrack({ id: '1', bpm: 100 }),
			createTestTrack({ id: '2', bpm: 130 })
		]

		// With 16% pitch range and target 120 BPM:
		// Track at 100 BPM can reach 84 - 116 (does not include 120)
		// Track at 130 BPM can reach 109.2 - 150.8 (includes 120)
		const result = filterByBpmReach(tracks, 120, 16)

		expect(result).toHaveLength(1)
		expect(result[0]?.id).toBe('2')
	})

	it('returns empty array for empty input', () => {
		const result = filterByBpmReach([], 120, 8)
		expect(result).toEqual([])
	})
})

describe('filterAlreadyPlayed', () => {
	it('excludes tracks in the played set', () => {
		const tracks = [
			createTestTrack({ id: '1' }),
			createTestTrack({ id: '2' }),
			createTestTrack({ id: '3' })
		]
		const playedIds = new Set(['2'])

		const result = filterAlreadyPlayed(tracks, playedIds)

		expect(result).toHaveLength(2)
		expect(result.map((t) => t.id)).toEqual(['1', '3'])
	})

	it('returns all tracks when none are played', () => {
		const tracks = [createTestTrack({ id: '1' }), createTestTrack({ id: '2' })]
		const playedIds = new Set<string>()

		const result = filterAlreadyPlayed(tracks, playedIds)

		expect(result).toHaveLength(2)
	})

	it('returns empty array when all tracks are played', () => {
		const tracks = [createTestTrack({ id: '1' }), createTestTrack({ id: '2' })]
		const playedIds = new Set(['1', '2'])

		const result = filterAlreadyPlayed(tracks, playedIds)

		expect(result).toEqual([])
	})

	it('returns empty array for empty input', () => {
		const result = filterAlreadyPlayed([], new Set(['1']))
		expect(result).toEqual([])
	})
})

describe('calculateTempoScore', () => {
	it('returns 1 for exact BPM match', () => {
		const score = calculateTempoScore(120, 120, 8)
		expect(score).toBe(1)
	})

	it('returns value between 0 and 1 for close BPM', () => {
		// 4% off with 8% range should give ~0.5
		const score = calculateTempoScore(120, 124.8, 8)
		expect(score).toBeCloseTo(0.5, 1)
	})

	it('returns 0 for BPM at edge of range', () => {
		// 8% off with 8% range should give 0
		const score = calculateTempoScore(120, 129.6, 8)
		expect(score).toBeCloseTo(0, 1)
	})

	it('returns 0 for BPM beyond range', () => {
		const score = calculateTempoScore(120, 140, 8)
		expect(score).toBe(0)
	})

	it('returns 0 for null track BPM', () => {
		const score = calculateTempoScore(null, 120, 8)
		expect(score).toBe(0)
	})
})

describe('calculatePitchAdjustment', () => {
	it('returns 0 for matching BPM', () => {
		const adjustment = calculatePitchAdjustment(120, 120)
		expect(adjustment).toBeCloseTo(0)
	})

	it('returns negative for track slower than target', () => {
		// Track at 110 needs to speed up to match 120
		// Inverted: positive pitch = slower, so adjustment is negative
		const adjustment = calculatePitchAdjustment(110, 120)
		expect(adjustment).toBeLessThan(0)
	})

	it('returns positive for track faster than target', () => {
		// Track at 130 needs to slow down to match 120
		// Inverted: positive pitch = slower, so adjustment is positive
		const adjustment = calculatePitchAdjustment(130, 120)
		expect(adjustment).toBeGreaterThan(0)
	})

	it('calculates correct magnitude', () => {
		// To go from 100 to 110, factor is 1.1, so adjustment is (1.1 - 1) * -1 = -0.1
		const adjustment = calculatePitchAdjustment(100, 110)
		expect(adjustment).toBeCloseTo(-0.1, 5)
	})
})

describe('scoreTrack', () => {
	it('returns perfect score for identical key and BPM', () => {
		const track = createTestTrack({ bpm: 120, key: 0, mode: 0 })
		const scored = scoreTrack(track, 120, 0, 0, 8)

		expect(scored.tempoScore).toBe(1)
		expect(scored.harmonyScore).toBe(1)
		expect(scored.score).toBeCloseTo(0.7 * 1 + 0.3 * 1, 5) // 1.0
		expect(scored.keyCombination).toBe(0) // Same key
	})

	it('scores harmony higher than tempo in weighting', () => {
		// Track with same key and same BPM - perfect scores
		const perfectTrack = createTestTrack({
			id: 'perfect',
			bpm: 120,
			key: 0,
			mode: 0
		})
		const scoredPerfect = scoreTrack(perfectTrack, 120, 0, 0, 8)

		// Track with incompatible key but same BPM
		const badHarmonyTrack = createTestTrack({
			id: 'bad-harmony',
			bpm: 120,
			key: 6, // F# is incompatible with C (tritone)
			mode: 0
		})
		const scoredBadHarmony = scoreTrack(badHarmonyTrack, 120, 0, 0, 8)

		// Perfect track should have 1.0 harmony and tempo scores
		expect(scoredPerfect.harmonyScore).toBe(1)
		expect(scoredPerfect.tempoScore).toBe(1)

		// Bad harmony track should have 0 harmony but perfect tempo
		expect(scoredBadHarmony.harmonyScore).toBe(0)
		expect(scoredBadHarmony.tempoScore).toBe(1)

		// Verify weighting: harmony 0.7, tempo 0.3
		// Perfect: 1.0 * 0.7 + 1.0 * 0.3 = 1.0
		// Bad harmony: 0 * 0.7 + 1.0 * 0.3 = 0.3
		expect(scoredPerfect.score).toBeCloseTo(1.0, 5)
		expect(scoredBadHarmony.score).toBeCloseTo(0.3, 5)
	})

	it('handles null target BPM', () => {
		const track = createTestTrack({ bpm: 120, key: 0, mode: 0 })
		const scored = scoreTrack(track, null, 0, 0, 8)

		expect(scored.tempoScore).toBeNull()
		expect(scored.pitchAdjustment).toBeNull()
		expect(scored.harmonyScore).toBe(1)
		expect(scored.score).toBe(1)
		expect(scored.scoreBasis).toBe('harmony')
	})

	it('handles null target key', () => {
		const track = createTestTrack({ bpm: 120, key: 0, mode: 0 })
		const scored = scoreTrack(track, 120, null, 0, 8)

		expect(scored.harmonyScore).toBeNull()
		expect(scored.keyCombination).toBe(-1)
		expect(scored.tempoScore).toBe(1)
		expect(scored.score).toBe(1)
		expect(scored.scoreBasis).toBe('tempo')
	})

	it('handles track with null key', () => {
		const track = createTestTrack({ bpm: 120, key: null, mode: null })
		const scored = scoreTrack(track, 120, 0, 0, 8)

		expect(scored.harmonyScore).toBeNull()
		expect(scored.keyCombination).toBe(-1)
		expect(scored.tempoScore).toBe(1)
		expect(scored.score).toBe(1)
		expect(scored.scoreBasis).toBe('tempo')
	})

	it('marks compatibility unavailable when neither dimension can be scored', () => {
		const track = createTestTrack({ bpm: null, key: null, mode: null })
		const scored = scoreTrack(track, null, null, null, 8)

		expect(scored.tempoScore).toBeNull()
		expect(scored.harmonyScore).toBeNull()
		expect(scored.pitchAdjustment).toBeNull()
		expect(scored.score).toBeNull()
		expect(scored.scoreBasis).toBe('none')
	})

	it('includes all original track properties', () => {
		const track = createTestTrack({
			id: 'test-id',
			title: 'Test Title',
			bpm: 120,
			key: 0,
			mode: 0
		})
		const scored = scoreTrack(track, 120, 0, 0, 8)

		expect(scored.id).toBe('test-id')
		expect(scored.title).toBe('Test Title')
	})
})

describe('getTrackSuggestions', () => {
	const defaultOptions = {
		targetBpm: 120,
		targetKey: 0,
		sourceMode: 0,
		sourceRecordId: 'source-record',
		sourceTrackId: 'source-track',
		playedIds: new Set<string>(),
		pitchRange: 8
	}

	it('filters by BPM reach', () => {
		const candidates = [
			createTestTrack({ id: '1', bpm: 120 }),
			createTestTrack({ id: '2', bpm: 200 }) // Too far
		]

		const result = getTrackSuggestions(candidates, defaultOptions)

		expect(result).toHaveLength(1)
		expect(result[0]?.id).toBe('1')
	})

	it('filters already played tracks', () => {
		const candidates = [
			createTestTrack({ id: '1', bpm: 120 }),
			createTestTrack({ id: '2', bpm: 120 })
		]

		const result = getTrackSuggestions(candidates, {
			...defaultOptions,
			playedIds: new Set(['2'])
		})

		expect(result).toHaveLength(1)
		expect(result[0]?.id).toBe('1')
	})

	it('filters tracks from same record', () => {
		const candidates = [
			createTestTrack({ id: '1', record_id: 'other-record', bpm: 120 }),
			createTestTrack({ id: '2', record_id: 'source-record', bpm: 120 })
		]

		const result = getTrackSuggestions(candidates, defaultOptions)

		expect(result).toHaveLength(1)
		expect(result[0]?.id).toBe('1')
	})

	it('filters the source track itself', () => {
		const candidates = [
			createTestTrack({ id: '1', bpm: 120 }),
			createTestTrack({ id: 'source-track', bpm: 120 })
		]

		const result = getTrackSuggestions(candidates, defaultOptions)

		expect(result).toHaveLength(1)
		expect(result[0]?.id).toBe('1')
	})

	it('sorts by score descending', () => {
		const candidates = [
			createTestTrack({ id: 'bad', bpm: 128, key: 6, mode: 0 }), // Incompatible key
			createTestTrack({ id: 'good', bpm: 120, key: 0, mode: 0 }) // Perfect match
		]

		const result = getTrackSuggestions(candidates, defaultOptions)

		expect(result[0]?.id).toBe('good')
		expect(result[1]?.id).toBe('bad')
	})

	it('limits results to specified count', () => {
		const candidates = Array.from({ length: 100 }, (_, i) =>
			createTestTrack({ id: `track-${i}`, bpm: 120, key: 0, mode: 0 })
		)

		const result = getTrackSuggestions(candidates, {
			...defaultOptions,
			limit: 10
		})

		expect(result).toHaveLength(10)
	})

	it('defaults to 50 result limit', () => {
		const candidates = Array.from({ length: 100 }, (_, i) =>
			createTestTrack({ id: `track-${i}`, bpm: 120, key: 0, mode: 0 })
		)

		const result = getTrackSuggestions(candidates, defaultOptions)

		expect(result).toHaveLength(50)
	})

	it('handles null targetBpm by skipping BPM filter', () => {
		const candidates = [
			createTestTrack({ id: '1', bpm: 60, key: 0, mode: 0 }),
			createTestTrack({ id: '2', bpm: 200, key: 0, mode: 0 })
		]

		const result = getTrackSuggestions(candidates, {
			...defaultOptions,
			targetBpm: null
		})

		// Both should be included since BPM filtering is skipped
		expect(result).toHaveLength(2)
	})

	it('returns empty array for empty candidates', () => {
		const result = getTrackSuggestions([], defaultOptions)
		expect(result).toEqual([])
	})

	it('returns empty array when all candidates are filtered', () => {
		const candidates = [
			createTestTrack({ id: 'source-track', bpm: 120 }) // Is the source track
		]

		const result = getTrackSuggestions(candidates, defaultOptions)

		expect(result).toEqual([])
	})
})

describe('getTrackSuggestions with transition history', () => {
	const options = {
		targetBpm: 120,
		targetKey: 0,
		sourceMode: 0,
		sourceRecordId: 'source-record',
		sourceTrackId: 'source-track',
		playedIds: new Set<string>(),
		pitchRange: 8
	}

	function historyEntry(
		trackId: string,
		rating: number | null
	): LibraryPlayedTrackEntry {
		return {
			track_id: trackId,
			time_added: 1,
			adjusted_bpm: null,
			transition_rating: rating
		}
	}

	/** `times` saved sets that each play the source track, then `trackId`. */
	function playedAfterSource(
		trackId: string,
		rating: number | null,
		times = 3,
		sourceTrackId = 'source-track'
	) {
		return Array.from({ length: times }, () => ({
			played_tracks: [
				historyEntry(sourceTrackId, null),
				historyEntry(trackId, rating)
			]
		}))
	}

	it('ranks a well-rated pair above an equally compatible candidate', () => {
		const candidates = [
			createTestTrack({ id: 'never-played', record_id: 'r1' }),
			createTestTrack({ id: 'loved-pair', record_id: 'r2' })
		]

		const result = getTrackSuggestions(candidates, {
			...options,
			transitionHistory: buildTransitionHistoryIndex(
				playedAfterSource('loved-pair', 5)
			)
		})

		expect(result.map((track) => track.id)).toEqual([
			'loved-pair',
			'never-played'
		])
		expect(result[0]!.score).toBe(result[1]!.score)
		expect(result[0]!.historyBonus).toBeCloseTo(HISTORY_BONUS_MAX)
		expect(result[0]!.transitionHistory).toMatchObject({
			plays: 3,
			averageRating: 5
		})
		expect(result[1]!.transitionHistory).toBeNull()
		expect(result[1]!.historyBonus).toBe(0)
	})

	it('ranks a badly rated pair below an equally compatible candidate', () => {
		const candidates = [
			createTestTrack({ id: 'bad-pair', record_id: 'r1' }),
			createTestTrack({ id: 'never-played', record_id: 'r2' })
		]

		const result = getTrackSuggestions(candidates, {
			...options,
			transitionHistory: buildTransitionHistoryIndex(
				playedAfterSource('bad-pair', 1)
			)
		})

		expect(result.map((track) => track.id)).toEqual([
			'never-played',
			'bad-pair'
		])
		expect(result[1]!.historyBonus).toBeCloseTo(-HISTORY_BONUS_MAX)
	})

	it('leaves the compatibility score itself unchanged', () => {
		const candidate = createTestTrack({ id: 'loved-pair', bpm: 123, key: 7 })
		const [withHistory] = getTrackSuggestions([candidate], {
			...options,
			transitionHistory: buildTransitionHistoryIndex(
				playedAfterSource('loved-pair', 5)
			)
		})
		const [withoutHistory] = getTrackSuggestions([candidate], options)

		expect(withHistory!.score).toBe(withoutHistory!.score)
		expect(withHistory!.tempoScore).toBe(withoutHistory!.tempoScore)
		expect(withHistory!.harmonyScore).toBe(withoutHistory!.harmonyScore)
		expect(withHistory!.historyBonus).toBeGreaterThan(0)
	})

	it('only uses pairs that start from the source track', () => {
		const candidates = [
			createTestTrack({ id: 'first', record_id: 'r1' }),
			createTestTrack({ id: 'second', record_id: 'r2' })
		]

		const result = getTrackSuggestions(candidates, {
			...options,
			transitionHistory: buildTransitionHistoryIndex([
				...playedAfterSource('second', 5, 3, 'another-track'),
				{
					played_tracks: [
						historyEntry('second', null),
						historyEntry('source-track', 5)
					]
				}
			])
		})

		expect(result.map((track) => track.id)).toEqual(['first', 'second'])
		expect(result.every((track) => track.historyBonus === 0)).toBe(true)
	})

	it('never lets history overturn a compatibility gap above twice the bound', () => {
		// Tempo-only scores spread from 1 down to about 0.5 in small steps.
		const candidates = Array.from({ length: 19 }, (_, index) =>
			createTestTrack({
				id: `candidate-${index}`,
				record_id: `record-${index}`,
				bpm: 120 + index * 0.25,
				key: null,
				mode: null
			})
		)
		// Worst case: every better-scored candidate was hated and every
		// worse-scored one loved, alternating so neighbours pull apart.
		const transitionHistory = buildTransitionHistoryIndex(
			candidates.flatMap((track, index) =>
				playedAfterSource(track.id, index % 2 === 0 ? 1 : 5)
			)
		)

		const result = getTrackSuggestions(candidates, {
			...options,
			targetKey: null,
			transitionHistory
		})

		let swaps = 0
		for (let earlier = 0; earlier < result.length; earlier += 1) {
			for (let later = earlier + 1; later < result.length; later += 1) {
				const earlierScore = result[earlier]!.score!
				const laterScore = result[later]!.score!
				expect(laterScore - earlierScore).toBeLessThanOrEqual(
					2 * HISTORY_BONUS_MAX + 1e-9
				)
				if (laterScore > earlierScore) swaps += 1
			}
			expect(Math.abs(result[earlier]!.historyBonus)).toBeLessThanOrEqual(
				HISTORY_BONUS_MAX
			)
		}
		// History did reorder close candidates, so the bound is what held.
		expect(swaps).toBeGreaterThan(0)
	})

	it('keeps unscored candidates below every scored candidate', () => {
		const candidates = [
			createTestTrack({ id: 'unscored-loved', key: null, mode: null }),
			createTestTrack({ id: 'scored-hated', key: 6, mode: 0 })
		]

		const result = getTrackSuggestions(candidates, {
			...options,
			targetBpm: null,
			transitionHistory: buildTransitionHistoryIndex([
				...playedAfterSource('unscored-loved', 5),
				...playedAfterSource('scored-hated', 1)
			])
		})

		expect(result.map((track) => track.id)).toEqual([
			'scored-hated',
			'unscored-loved'
		])
		expect(result[1]!.score).toBeNull()
		expect(getSuggestionRank(result[1]!)).toBeLessThan(
			getSuggestionRank(result[0]!)
		)
	})

	it('orders unscored candidates by history among themselves', () => {
		const candidates = [
			createTestTrack({ id: 'unscored-plain', key: null, mode: null }),
			createTestTrack({ id: 'unscored-loved', key: null, mode: null })
		]

		const result = getTrackSuggestions(candidates, {
			...options,
			targetBpm: null,
			transitionHistory: buildTransitionHistoryIndex(
				playedAfterSource('unscored-loved', 5)
			)
		})

		expect(result.map((track) => track.id)).toEqual([
			'unscored-loved',
			'unscored-plain'
		])
	})

	it('applies the limit after the history-aware sort', () => {
		const candidates = ['a', 'b', 'c'].map((id) =>
			createTestTrack({ id, record_id: `record-${id}` })
		)

		const result = getTrackSuggestions(candidates, {
			...options,
			limit: 2,
			transitionHistory: buildTransitionHistoryIndex(playedAfterSource('c', 4))
		})

		expect(result.map((track) => track.id)).toEqual(['c', 'a'])
	})

	it('never adds candidates that the filters remove', () => {
		const candidates = [
			createTestTrack({ id: 'out-of-reach', bpm: 200 }),
			createTestTrack({ id: 'already-played' }),
			createTestTrack({ id: 'same-record', record_id: 'source-record' })
		]

		const result = getTrackSuggestions(candidates, {
			...options,
			playedIds: new Set(['already-played']),
			transitionHistory: buildTransitionHistoryIndex(
				candidates.flatMap((track) => playedAfterSource(track.id, 5))
			)
		})

		expect(result).toEqual([])
	})
})
