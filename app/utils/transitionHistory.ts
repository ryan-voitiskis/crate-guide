import type {
	LibraryPlayedTrackEntry,
	LibrarySavedSet
} from '../../shared/types/library'
import type { TransitionPairStats } from '../../shared/types/session'

/**
 * Upper bound of the ranking adjustment from transition history, on the same
 * 0–1 scale as suggestion compatibility. The adjustment is always within
 * [-HISTORY_BONUS_MAX, +HISTORY_BONUS_MAX], so two candidates can only swap
 * places when their compatibility differs by at most 2 × HISTORY_BONUS_MAX.
 */
export const HISTORY_BONUS_MAX = 0.08

/** Weight of a pair that was played but never rated (a weak positive). */
export const UNRATED_PLAY_WEIGHT = 0.25

/** Plays needed before the history adjustment reaches full strength. */
export const HISTORY_FULL_CONFIDENCE_PLAYS = 3

const NEUTRAL_RATING = 3
const RATING_HALF_SPAN = 2

export interface TransitionHistoryIndex {
	/** from track id → (to track id → stats) */
	readonly outgoing: ReadonlyMap<
		string,
		ReadonlyMap<string, TransitionPairStats>
	>
	/** to track id → (from track id → stats); shares stats objects with outgoing */
	readonly incoming: ReadonlyMap<
		string,
		ReadonlyMap<string, TransitionPairStats>
	>
}

export type TransitionDirection = 'incoming' | 'outgoing'

export interface RankedTransition {
	trackId: string
	stats: TransitionPairStats
}

export const EMPTY_TRANSITION_HISTORY: TransitionHistoryIndex = Object.freeze({
	outgoing: new Map(),
	incoming: new Map()
})

function isValidRating(rating: number | null): rating is number {
	return (
		rating !== null && Number.isInteger(rating) && rating >= 1 && rating <= 5
	)
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
	let value = map.get(key)
	if (value === undefined) {
		value = create()
		map.set(key, value)
	}
	return value
}

function recordPair(
	outgoing: Map<string, Map<string, TransitionPairStats>>,
	incoming: Map<string, Map<string, TransitionPairStats>>,
	previous: LibraryPlayedTrackEntry,
	next: LibraryPlayedTrackEntry
) {
	const fromId = previous.track_id
	const toId = next.track_id
	if (!fromId || !toId || fromId === toId) return

	const targets = getOrCreate(outgoing, fromId, () => new Map())
	let stats = targets.get(toId)
	if (!stats) {
		stats = {
			plays: 0,
			ratedCount: 0,
			ratingSum: 0,
			averageRating: null,
			lastPlayedAt: 0
		}
		targets.set(toId, stats)
		getOrCreate(incoming, toId, () => new Map()).set(fromId, stats)
	}

	stats.plays += 1
	if (Number.isFinite(next.time_added)) {
		stats.lastPlayedAt = Math.max(stats.lastPlayedAt, next.time_added)
	}
	if (isValidRating(next.transition_rating)) {
		stats.ratedCount += 1
		stats.ratingSum += next.transition_rating
		stats.averageRating = stats.ratingSum / stats.ratedCount
	}
}

/**
 * Aggregates consecutive track pairs across saved sets. Entry `i`'s
 * `transition_rating` rates the transition from entry `i - 1` into entry `i`,
 * matching the session history UI, so the first entry's rating is ignored.
 * Runs in O(total entries); build it once per saved-set change.
 */
export function buildTransitionHistoryIndex(
	savedSets: readonly Pick<LibrarySavedSet, 'played_tracks'>[]
): TransitionHistoryIndex {
	const outgoing = new Map<string, Map<string, TransitionPairStats>>()
	const incoming = new Map<string, Map<string, TransitionPairStats>>()

	for (const savedSet of savedSets) {
		const entries = savedSet.played_tracks
		for (let index = 1; index < entries.length; index += 1) {
			recordPair(outgoing, incoming, entries[index - 1]!, entries[index]!)
		}
	}

	return { outgoing, incoming }
}

/**
 * Ranking adjustment for a candidate that has been played after the source
 * track before. Rated pairs map 1★..5★ to -1..+1 (3★ is neutral); pairs only
 * ever played unrated get UNRATED_PLAY_WEIGHT. Confidence grows linearly to
 * full strength at HISTORY_FULL_CONFIDENCE_PLAYS plays. The result is always
 * within [-HISTORY_BONUS_MAX, HISTORY_BONUS_MAX].
 */
export function getTransitionHistoryBonus(
	stats: TransitionPairStats | null | undefined
): number {
	if (!stats || stats.plays <= 0) return 0
	const weight =
		stats.averageRating === null
			? UNRATED_PLAY_WEIGHT
			: (stats.averageRating - NEUTRAL_RATING) / RATING_HALF_SPAN
	const confidence =
		Math.min(stats.plays, HISTORY_FULL_CONFIDENCE_PLAYS) /
		HISTORY_FULL_CONFIDENCE_PLAYS
	const bonus = HISTORY_BONUS_MAX * weight * confidence
	return Math.max(-HISTORY_BONUS_MAX, Math.min(HISTORY_BONUS_MAX, bonus))
}

function compareTransitions(
	left: RankedTransition,
	right: RankedTransition
): number {
	const leftRated = left.stats.averageRating !== null
	const rightRated = right.stats.averageRating !== null
	if (leftRated !== rightRated) return leftRated ? -1 : 1
	return (
		(right.stats.averageRating ?? 0) - (left.stats.averageRating ?? 0) ||
		right.stats.ratedCount - left.stats.ratedCount ||
		right.stats.plays - left.stats.plays ||
		right.stats.lastPlayedAt - left.stats.lastPlayedAt ||
		left.trackId.localeCompare(right.trackId)
	)
}

/**
 * Transitions into (`incoming`) or out of (`outgoing`) a track, best first:
 * rated before unrated, then by average rating, rated count, plays and
 * recency. `include` can drop pairs, for example tracks no longer in the
 * library, before the limit applies.
 */
export function rankTrackTransitions(
	index: TransitionHistoryIndex,
	trackId: string,
	direction: TransitionDirection,
	options: { limit?: number; include?: (trackId: string) => boolean } = {}
): RankedTransition[] {
	const { limit = 3, include } = options
	const pairs = index[direction].get(trackId)
	if (!pairs) return []

	const ranked: RankedTransition[] = []
	for (const [otherId, stats] of pairs) {
		if (include && !include(otherId)) continue
		ranked.push({ trackId: otherId, stats })
	}
	return ranked.sort(compareTransitions).slice(0, Math.max(0, limit))
}

/** "4.5" or "4" — one decimal, without a trailing ".0". */
export function formatAverageRating(averageRating: number): string {
	return String(Math.round(averageRating * 10) / 10)
}

/** "Played after this 3×, avg 4.5★" or "Played after this 2×, unrated". */
export function describeTransitionHistory(
	stats: TransitionPairStats,
	relation = 'Played after this'
): string {
	const rating =
		stats.averageRating === null
			? 'unrated'
			: `avg ${formatAverageRating(stats.averageRating)}★`
	return `${relation} ${stats.plays}×, ${rating}`
}
