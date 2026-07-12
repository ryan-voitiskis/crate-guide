import type { Track } from './supabase.ts'

export interface ScoredTrack extends Track {
	score: number
	tempoScore: number
	harmonyScore: number
	pitchAdjustment: number // -1 to 1 representing pitch shift needed
	keyCombination: number // index of keyCombinations or -1
}
