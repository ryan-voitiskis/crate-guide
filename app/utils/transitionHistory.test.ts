import { describe, expect, it } from 'vitest'
import type { LibraryPlayedTrackEntry } from '../../shared/types/library'
import type { TransitionPairStats } from '../../shared/types/session'
import {
	HISTORY_BONUS_MAX,
	UNRATED_PLAY_WEIGHT,
	buildTransitionHistoryIndex,
	describeTransitionHistory,
	describeTransitionHistorySpoken,
	formatAverageRating,
	getTransitionHistoryBonus,
	rankTrackTransitions
} from './transitionHistory'

let clock = 0

function entry(
	trackId: string,
	rating: number | null = null
): LibraryPlayedTrackEntry {
	clock += 1_000
	return {
		track_id: trackId,
		time_added: clock,
		adjusted_bpm: null,
		transition_rating: rating
	}
}

function set(...entries: LibraryPlayedTrackEntry[]) {
	return { played_tracks: entries }
}

function stats(overrides: Partial<TransitionPairStats>): TransitionPairStats {
	return {
		plays: 1,
		ratedCount: 0,
		ratingSum: 0,
		averageRating: null,
		lastPlayedAt: 0,
		...overrides
	}
}

describe('buildTransitionHistoryIndex', () => {
	it('reads each rating as the transition from the previous entry', () => {
		const index = buildTransitionHistoryIndex([
			set(entry('a', 2), entry('b', 5), entry('c', null))
		])

		expect(index.outgoing.get('a')?.get('b')).toMatchObject({
			plays: 1,
			ratedCount: 1,
			averageRating: 5
		})
		expect(index.outgoing.get('b')?.get('c')).toMatchObject({
			plays: 1,
			ratedCount: 0,
			averageRating: null
		})
		// The first entry's rating has no transition into it.
		expect(index.incoming.get('a')).toBeUndefined()
		expect(index.outgoing.get('c')).toBeUndefined()
	})

	it('aggregates plays and ratings across saved sets', () => {
		const index = buildTransitionHistoryIndex([
			set(entry('a'), entry('b', 5)),
			set(entry('a'), entry('b', 4), entry('c')),
			set(entry('a'), entry('b'))
		])

		const pair = index.outgoing.get('a')?.get('b')
		expect(pair).toMatchObject({
			plays: 3,
			ratedCount: 2,
			ratingSum: 9,
			averageRating: 4.5
		})
		expect(pair?.lastPlayedAt).toBe(clock)
		expect(index.incoming.get('b')?.get('a')).toBe(pair)
	})

	it('keeps direction: A then B is not B then A', () => {
		const index = buildTransitionHistoryIndex([set(entry('a'), entry('b', 5))])

		expect(index.outgoing.get('b')?.get('a')).toBeUndefined()
		expect(index.incoming.get('a')).toBeUndefined()
	})

	it('ignores self-pairs, empty ids and out-of-range ratings', () => {
		const index = buildTransitionHistoryIndex([
			set(entry('a'), entry('a', 5), entry(''), entry('b', 3)),
			set(entry('c'), entry('d', 7)),
			set(entry('c'), entry('d', 2.5))
		])

		expect(index.outgoing.get('a')?.get('a')).toBeUndefined()
		expect(index.outgoing.get('')).toBeUndefined()
		expect(index.incoming.get('b')).toBeUndefined()
		expect(index.outgoing.get('c')?.get('d')).toMatchObject({
			plays: 2,
			ratedCount: 0,
			averageRating: null
		})
	})

	it('returns empty maps for no saved sets', () => {
		const index = buildTransitionHistoryIndex([])
		expect(index.outgoing.size).toBe(0)
		expect(index.incoming.size).toBe(0)
	})
})

describe('getTransitionHistoryBonus', () => {
	it('pins the documented product bound independently of the code', () => {
		// The plan promises ±0.08. Changing it is a product decision: update
		// plans/080-ratings-feed-suggestions.md and this literal together.
		expect(HISTORY_BONUS_MAX).toBe(0.08)
		expect(
			getTransitionHistoryBonus(
				stats({ plays: 99, ratedCount: 99, ratingSum: 495, averageRating: 5 })
			)
		).toBeLessThanOrEqual(0.08)
		expect(
			getTransitionHistoryBonus(
				stats({ plays: 99, ratedCount: 99, ratingSum: 99, averageRating: 1 })
			)
		).toBeGreaterThanOrEqual(-0.08)
	})

	it('is zero without history and neutral at three stars', () => {
		expect(getTransitionHistoryBonus(null)).toBe(0)
		expect(getTransitionHistoryBonus(undefined)).toBe(0)
		expect(
			getTransitionHistoryBonus(
				stats({ plays: 3, ratedCount: 3, ratingSum: 9, averageRating: 3 })
			)
		).toBe(0)
	})

	it('reaches the bound at five stars with full confidence', () => {
		expect(
			getTransitionHistoryBonus(
				stats({ plays: 3, ratedCount: 3, ratingSum: 15, averageRating: 5 })
			)
		).toBeCloseTo(HISTORY_BONUS_MAX)
		expect(
			getTransitionHistoryBonus(
				stats({ plays: 3, ratedCount: 3, ratingSum: 3, averageRating: 1 })
			)
		).toBeCloseTo(-HISTORY_BONUS_MAX)
	})

	it('scales with plays up to full confidence', () => {
		const once = getTransitionHistoryBonus(
			stats({ plays: 1, ratedCount: 1, ratingSum: 5, averageRating: 5 })
		)
		const many = getTransitionHistoryBonus(
			stats({ plays: 40, ratedCount: 40, ratingSum: 200, averageRating: 5 })
		)
		expect(once).toBeCloseTo(HISTORY_BONUS_MAX / 3)
		expect(many).toBeCloseTo(HISTORY_BONUS_MAX)
	})

	it('treats unrated plays as a weak positive', () => {
		expect(getTransitionHistoryBonus(stats({ plays: 3 }))).toBeCloseTo(
			HISTORY_BONUS_MAX * UNRATED_PLAY_WEIGHT
		)
	})

	it('never leaves the documented bound', () => {
		for (const plays of [0, 1, 2, 3, 10, 1_000]) {
			for (const averageRating of [null, 1, 1.5, 2, 3, 4, 4.5, 5]) {
				const bonus = getTransitionHistoryBonus(
					stats({
						plays,
						ratedCount: averageRating === null ? 0 : plays,
						averageRating
					})
				)
				expect(Math.abs(bonus)).toBeLessThanOrEqual(HISTORY_BONUS_MAX)
			}
		}
	})
})

describe('rankTrackTransitions', () => {
	const index = buildTransitionHistoryIndex([
		set(entry('x'), entry('hub', 2)),
		set(entry('y'), entry('hub')),
		set(entry('y'), entry('hub')),
		set(entry('z'), entry('hub', 5)),
		set(entry('w'), entry('hub', 5)),
		set(entry('w'), entry('hub', 5)),
		set(entry('v'), entry('hub', 4), entry('out-1', 5)),
		set(entry('hub'), entry('out-2', 1))
	])

	it('orders rated before unrated, then rating, rated count and plays', () => {
		const ranked = rankTrackTransitions(index, 'hub', 'incoming', {
			limit: 10
		})
		expect(ranked.map((transition) => transition.trackId)).toEqual([
			'w',
			'z',
			'v',
			'x',
			'y'
		])
	})

	it('limits after filtering', () => {
		const ranked = rankTrackTransitions(index, 'hub', 'incoming', {
			limit: 2,
			include: (trackId) => trackId !== 'w'
		})
		expect(ranked.map((transition) => transition.trackId)).toEqual(['z', 'v'])
	})

	it('reads the outgoing direction separately', () => {
		expect(
			rankTrackTransitions(index, 'hub', 'outgoing').map(
				(transition) => transition.trackId
			)
		).toEqual(['out-1', 'out-2'])
		expect(rankTrackTransitions(index, 'unknown', 'outgoing')).toEqual([])
	})
})

describe('transition history labels', () => {
	it('formats averages without a trailing zero', () => {
		expect(formatAverageRating(4.5)).toBe('4.5')
		expect(formatAverageRating(4)).toBe('4')
		expect(formatAverageRating(11 / 3)).toBe('3.7')
	})

	it('describes rated and unrated pairs', () => {
		expect(
			describeTransitionHistory(
				stats({ plays: 3, ratedCount: 2, ratingSum: 9, averageRating: 4.5 })
			)
		).toBe('Played after this 3×, avg 4.5★')
		expect(
			describeTransitionHistory(stats({ plays: 2 }), 'Played before this')
		).toBe('Played before this 2×, unrated')
	})

	it('describes pairs for screen readers without symbols', () => {
		expect(
			describeTransitionHistorySpoken(
				stats({ plays: 3, ratedCount: 2, ratingSum: 9, averageRating: 4.5 })
			)
		).toBe('Played after this 3 times, average 4.5 stars')
		expect(
			describeTransitionHistorySpoken(
				stats({ plays: 1, ratedCount: 1, ratingSum: 1, averageRating: 1 }),
				'Played before this'
			)
		).toBe('Played before this once, average 1 star')
		expect(describeTransitionHistorySpoken(stats({ plays: 2 }))).toBe(
			'Played after this 2 times, not rated'
		)
	})
})
