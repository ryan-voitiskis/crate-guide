import type { Track } from './supabase.ts'

/**
 * Aggregated history for one ordered track pair (A then B) across saved sets.
 */
export interface TransitionPairStats {
	plays: number
	ratedCount: number
	ratingSum: number
	averageRating: number | null // null when the pair was never rated
	lastPlayedAt: number // epoch ms of the most recent play of the pair
}

export interface ScoredTrack extends Track {
	score: number | null
	scoreBasis: 'tempo-and-harmony' | 'tempo' | 'harmony' | 'none'
	tempoScore: number | null
	harmonyScore: number | null
	pitchAdjustment: number | null // -1 to 1 representing pitch shift needed
	keyCombination: number // index of keyCombinations or -1
	transitionHistory: TransitionPairStats | null // source track then this track
	historyBonus: number // ranking-only adjustment; never folded into score
}
