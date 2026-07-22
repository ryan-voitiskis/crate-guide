import type { Track } from '~~/shared/types/supabase'

export interface SessionDeck {
	loadedTrack: Track | null
	rpm: 33 | 45
	/** Normalized -100..100 control mapped through the user's pitch range. */
	pitch: number
	faderPosition: number
	faderSliding: boolean
	isPlaying: boolean
}
