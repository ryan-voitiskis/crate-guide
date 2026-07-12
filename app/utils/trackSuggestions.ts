import { adjustKey, scoreHarmony } from '~/utils/keyFunctions'
import type { ScoredTrack } from '../../shared/types/session'

/**
 * Filters tracks to those reachable within the pitch range from a target BPM.
 * A track is reachable if the target BPM falls within the track's
 * adjustable BPM range (track BPM +/- pitch range percentage).
 */
export function filterByBpmReach(
	tracks: Track[],
	targetBpm: number,
	pitchRange: number
): Track[] {
	return tracks.filter((track) => {
		if (!track.bpm) return false
		const minReachable = track.bpm * (1 - pitchRange / 100)
		const maxReachable = track.bpm * (1 + pitchRange / 100)
		return targetBpm >= minReachable && targetBpm <= maxReachable
	})
}

/**
 * Filters out tracks that have already been played in the session.
 */
export function filterAlreadyPlayed(
	tracks: Track[],
	playedIds: Set<string>
): Track[] {
	return tracks.filter((track) => !playedIds.has(track.id))
}

/**
 * Calculates the tempo score for a track based on how close its BPM
 * is to the target BPM within the pitch range.
 * Returns a value between 0 and 1, where 1 means perfect match.
 */
export function calculateTempoScore(
	trackBpm: number | null,
	targetBpm: number,
	pitchRange: number
): number {
	if (!trackBpm) return 0
	const tempoCloseness =
		1 - (Math.abs(1 - targetBpm / trackBpm) * 100) / pitchRange
	return Math.max(0, tempoCloseness)
}

/**
 * Calculates the pitch adjustment needed for a track to match the target BPM.
 * Returns a value between -1 and 1 representing the pitch shift needed.
 * Inverted to match turntable pitch fader orientation (up = slower, down = faster).
 */
export function calculatePitchAdjustment(
	trackBpm: number,
	targetBpm: number
): number {
	return (targetBpm / trackBpm - 1) * -1
}

/**
 * Scores a track for compatibility with the currently playing track.
 * Considers both harmonic compatibility (70% weight) and tempo closeness (30% weight).
 */
export function scoreTrack(
	track: Track,
	targetBpm: number | null,
	targetKey: number | null,
	sourceMode: number | null,
	pitchRange: number
): ScoredTrack {
	let tempoScore = 0
	let harmonyScore = 0
	let pitchAdjustment = 0
	let keyCombination = -1

	// Tempo scoring
	if (targetBpm && track.bpm) {
		pitchAdjustment = calculatePitchAdjustment(track.bpm, targetBpm)
		tempoScore = calculateTempoScore(track.bpm, targetBpm, pitchRange)
	}

	// Harmony scoring
	if (
		targetKey !== null &&
		track.key !== null &&
		sourceMode !== null &&
		track.mode !== null
	) {
		// Adjust candidate key for pitch shift
		const trackAdjustedKey =
			targetBpm && track.bpm
				? adjustKey(track.key, targetBpm / track.bpm)
				: track.key

		const harmony = scoreHarmony(
			{ key: targetKey, mode: sourceMode },
			{ key: trackAdjustedKey, mode: track.mode }
		)
		harmonyScore = harmony.harmonicAffinity ?? 0
		keyCombination = harmony.keyCombination
	}

	// Combined score (weighted: harmony more important)
	const score = harmonyScore * 0.7 + tempoScore * 0.3

	return {
		...track,
		score,
		tempoScore,
		harmonyScore,
		pitchAdjustment,
		keyCombination
	}
}

/**
 * Gets track suggestions for mixing, filtering and scoring candidates
 * based on compatibility with the source track.
 */
export function getTrackSuggestions(
	candidates: Track[],
	options: {
		targetBpm: number | null
		targetKey: number | null
		sourceMode: number | null
		sourceRecordId: string
		sourceTrackId: string
		playedIds: Set<string>
		pitchRange: number
		limit?: number
	}
): ScoredTrack[] {
	const {
		targetBpm,
		targetKey,
		sourceMode,
		sourceRecordId,
		sourceTrackId,
		playedIds,
		pitchRange,
		limit = 50
	} = options

	let filtered = candidates

	// Filter: BPM range (candidate must be reachable with pitch adjustment)
	if (targetBpm) {
		filtered = filterByBpmReach(filtered, targetBpm, pitchRange)
	}

	// Filter: Already played in session
	filtered = filterAlreadyPlayed(filtered, playedIds)

	// Filter: Same record as source
	filtered = filtered.filter((track) => track.record_id !== sourceRecordId)

	// Filter: Not the currently loaded track
	filtered = filtered.filter((track) => track.id !== sourceTrackId)

	// Score and sort
	const scored = filtered.map((track) =>
		scoreTrack(track, targetBpm, targetKey, sourceMode, pitchRange)
	)

	// Sort by score descending, limit results
	return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}
