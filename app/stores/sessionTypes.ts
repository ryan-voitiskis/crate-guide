import type { LibraryTrack } from '~~/shared/types/library'

export interface SessionDeck {
	loadedTrack: LibraryTrack | null
	rpm: 33 | 45
	/** Normalized -100..100 control mapped through the user's pitch range. */
	pitch: number
	faderPosition: number
	faderSliding: boolean
	isPlaying: boolean
}
