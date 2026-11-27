import type { LibraryTrack } from '~~/shared/types/library'

type CoverageTrack = Pick<LibraryTrack, 'bpm' | 'key' | 'mode'>

export type TrackAnalysisCoverage = Readonly<{
	total: number
	withBpm: number
	withKey: number
	withBpmAndKey: number
	missingBpm: number
	missingKey: number
	/** Tracks missing BPM, key, or both. */
	missingAnalysis: number
	/**
	 * Whole-number share of tracks with both BPM and key, floored so a library
	 * is never shown as 100% while any track is still missing a value.
	 */
	percentWithBpmAndKey: number
}>

/**
 * Summarises how much of a track list has BPM and key in one pass. A key
 * counts only when both the pitch class and the mode are set.
 */
export function summarizeTrackAnalysisCoverage(
	tracks: readonly CoverageTrack[]
): TrackAnalysisCoverage {
	let withBpm = 0
	let withKey = 0
	let withBpmAndKey = 0
	for (const track of tracks) {
		const hasBpm = track.bpm !== null
		const hasKey = track.key !== null && track.mode !== null
		if (hasBpm) withBpm += 1
		if (hasKey) withKey += 1
		if (hasBpm && hasKey) withBpmAndKey += 1
	}
	const total = tracks.length
	return {
		total,
		withBpm,
		withKey,
		withBpmAndKey,
		missingBpm: total - withBpm,
		missingKey: total - withKey,
		missingAnalysis: total - withBpmAndKey,
		percentWithBpmAndKey:
			// Integer maths first: (29 / 100) * 100 is 28.999… in floating point.
			total === 0 ? 0 : Math.floor((withBpmAndKey * 100) / total)
	}
}
