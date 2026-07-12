export function sortTracksByPosition(tracks: Track[]): Track[] {
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
