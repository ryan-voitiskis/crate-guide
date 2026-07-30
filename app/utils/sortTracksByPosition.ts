import type { LibraryTrack } from '~~/shared/types/library'

export function sortTracksByPosition(tracks: LibraryTrack[]): LibraryTrack[] {
	return [...tracks].sort((a, b) => {
		if (!a.position && !b.position) return 0
		if (!a.position) return 1
		if (!b.position) return -1

		return a.position.localeCompare(b.position, undefined, {
			numeric: true,
			sensitivity: 'base'
		})
	})
}
