import type { Track } from './supabase.ts'

export interface ScoredTrack extends Track {
	score: number | null
	scoreBasis: 'tempo-and-harmony' | 'tempo' | 'harmony' | 'none'
	tempoScore: number | null
	harmonyScore: number | null
	pitchAdjustment: number | null // -1 to 1 representing pitch shift needed
	keyCombination: number // index of keyCombinations or -1
}
