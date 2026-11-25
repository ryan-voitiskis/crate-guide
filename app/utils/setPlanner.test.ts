import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { describe, expect, it } from 'vitest'
import type { LibraryPlayedTrackEntry } from '~~/shared/types/library'
import {
	collectSetRecordIds,
	getSetArc,
	getSetEntryBpm,
	moveSetEntry,
	removeSetEntry
} from './setPlanner'

function entry(
	trackId: string,
	rating: number | null,
	overrides: Partial<LibraryPlayedTrackEntry> = {}
): LibraryPlayedTrackEntry {
	return {
		track_id: trackId,
		time_added: trackId.charCodeAt(0),
		adjusted_bpm: null,
		transition_rating: rating,
		...overrides
	}
}

/** A -> B rated 1, B -> C rated 2, C -> D rated 3. */
function abcd(): LibraryPlayedTrackEntry[] {
	return [entry('A', null), entry('B', 1), entry('C', 2), entry('D', 3)]
}

function summary(entries: LibraryPlayedTrackEntry[]) {
	return entries.map((item) => `${item.track_id}:${item.transition_rating}`)
}

describe('moveSetEntry', () => {
	it('keeps ratings whose predecessor is unchanged and clears the rest', () => {
		const edit = moveSetEntry(abcd(), 3, 1)

		// A D B C: D's predecessor is now A, B's is now D; C still follows B.
		expect(summary(edit!.entries)).toEqual([
			'A:null',
			'D:null',
			'B:null',
			'C:2'
		])
		expect(edit!.clearedRatings).toBe(2)
	})

	it('clears the rating of an entry moved to the top', () => {
		const edit = moveSetEntry(abcd(), 2, 0)

		// C A B D: C has no predecessor; A was first and stays unrated; A -> B kept.
		expect(summary(edit!.entries)).toEqual([
			'C:null',
			'A:null',
			'B:1',
			'D:null'
		])
		expect(edit!.clearedRatings).toBe(2)
	})

	it('swapping neighbours breaks all three pairs around them', () => {
		const edit = moveSetEntry(abcd(), 1, 2)

		expect(summary(edit!.entries)).toEqual([
			'A:null',
			'C:null',
			'B:null',
			'D:null'
		])
		expect(edit!.clearedRatings).toBe(3)
	})

	it('tracks entry identity, not track id, when a track repeats', () => {
		const entries = [
			entry('A', null),
			entry('B', 4),
			entry('A', 5, { time_added: 99 }),
			entry('C', 3)
		]

		// Move the second A to the end: A B C A. B still follows the first A.
		const edit = moveSetEntry(entries, 2, 3)

		expect(summary(edit!.entries)).toEqual([
			'A:null',
			'B:4',
			'C:null',
			'A:null'
		])
		expect(edit!.entries[3]!.time_added).toBe(99)
	})

	it('does not count already-empty ratings as cleared', () => {
		const entries = [entry('A', null), entry('B', null), entry('C', null)]

		expect(moveSetEntry(entries, 0, 2)!.clearedRatings).toBe(0)
	})

	it('returns new entry objects and leaves the input untouched', () => {
		const entries = abcd()
		const before = structuredClone(entries)

		const edit = moveSetEntry(entries, 0, 3)!

		expect(entries).toEqual(before)
		for (const moved of edit.entries) {
			expect(entries).not.toContain(moved)
		}
	})

	it.each([
		[0, 0],
		[-1, 2],
		[1, 4],
		[1.5, 2]
	])('rejects a no-op or out-of-range move from %s to %s', (from, to) => {
		expect(moveSetEntry(abcd(), from, to)).toBeNull()
	})
})

describe('removeSetEntry', () => {
	it('clears the rating of the entry that follows the removed one', () => {
		const edit = removeSetEntry(abcd(), 1)

		expect(summary(edit!.entries)).toEqual(['A:null', 'C:null', 'D:3'])
		expect(edit!.clearedRatings).toBe(1)
	})

	it('clears the new first entry when the first is removed', () => {
		const edit = removeSetEntry(abcd(), 0)

		expect(summary(edit!.entries)).toEqual(['B:null', 'C:2', 'D:3'])
		expect(edit!.clearedRatings).toBe(1)
	})

	it('removing the last entry clears nothing', () => {
		const edit = removeSetEntry(abcd(), 3)

		expect(summary(edit!.entries)).toEqual(['A:null', 'B:1', 'C:2'])
		expect(edit!.clearedRatings).toBe(0)
	})

	it('rejects an out-of-range index', () => {
		expect(removeSetEntry(abcd(), 4)).toBeNull()
	})
})

describe('getSetEntryBpm', () => {
	it('prefers the played BPM and falls back to the track BPM', () => {
		const track = createMockTrack({ bpm: 124 })

		expect(
			getSetEntryBpm(entry('A', null, { adjusted_bpm: 126.4 }), track)
		).toBe(126.4)
		expect(getSetEntryBpm(entry('A', null), track)).toBe(124)
		expect(getSetEntryBpm(entry('A', null), undefined)).toBeNull()
		expect(
			getSetEntryBpm(entry('A', null), createMockTrack({ bpm: null }))
		).toBeNull()
	})
})

describe('getSetArc', () => {
	it('needs at least two BPM values', () => {
		expect(getSetArc([120, null], 100, 20)).toBeNull()
	})

	it('maps the slowest track to the bottom and the fastest to the top', () => {
		const arc = getSetArc([120, null, 130], 102, 22, 1)!

		expect(arc.min).toBe(120)
		expect(arc.max).toBe(130)
		expect(arc.points).toEqual([
			{ index: 0, bpm: 120, x: 1, y: 21 },
			{ index: 2, bpm: 130, x: 101, y: 1 }
		])
	})

	it('draws a flat line through the middle when every BPM is equal', () => {
		const arc = getSetArc([124, 124], 100, 20)!

		expect(arc.points.map((point) => point.y)).toEqual([10, 10])
	})
})

describe('collectSetRecordIds', () => {
	it('returns distinct records in set order and counts missing tracks', () => {
		const tracks = new Map([
			['t1', createMockTrack({ id: 't1', record_id: 'r2' })],
			['t2', createMockTrack({ id: 't2', record_id: 'r1' })],
			['t3', createMockTrack({ id: 't3', record_id: 'r2' })]
		])

		const result = collectSetRecordIds(
			[entry('t1', null), entry('gone', null), entry('t2', 3), entry('t3', 4)],
			(id) => tracks.get(id)
		)

		expect(result).toEqual({ recordIds: ['r2', 'r1'], missingTracks: 1 })
	})
})
