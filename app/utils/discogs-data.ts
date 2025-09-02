const TITLE_SUFFIXABLE_ROLES = [
	'mix',
	'remix',
	're-mix',
	're-edit',
	'edit',
	'dub',
	'version'
]

const POSITION_RX = /^[A-Z]\d{1,2}$/
const POSITION_RX_ALPHA = /^[A-Z]{1,20}$/ // some discogs position in format "AA", "AAA" etc.

export function normalizeArtist(artist: string): string {
	return artist?.trim().replace(/ \(\d{1,3}\)$/, '') || ''
}

export function parseDuration(duration: string): number | null {
	if (!duration) return null

	const match = duration.match(/(\d+):(\d+)/)
	if (match) {
		const minutes = parseInt(match[1]!)
		const seconds = parseInt(match[2]!)
		return (minutes * 60 + seconds) * 1000
	}
	return null
}

export function transformReleaseArtists(artists: any[]) {
	return artists.map((a: any) => ({
		discogs_id: a.id,
		name: normalizeArtist(a.name),
		role: a.roll || null
	}))
}

export function transformReleaseLabels(labels: any[]) {
	return (
		labels?.map((label: any) => ({
			discogs_id: label.id,
			name: label.name?.trim().replace(/ \(\d{1,3}\)$/, '') || '',
			catno: label.catno?.trim() || '',
			entity_type: label.entity_type || '',
			thumbnail_url: label.thumbnail_url || ''
		})) || []
	)
}

export function transformReleaseTracks(release: DiscogsReleaseFull) {
	return (
		release.tracklist?.map((track: any) => {
			const extraArtists = track.extraartists || []
			const extraArtistsSuffixable = extraArtists.find((ea: any) =>
				TITLE_SUFFIXABLE_ROLES.includes(ea.role?.toLowerCase())
			)

			// Build title with suffix if applicable
			let title = track.title?.trim() || 'Untitled'
			if (extraArtistsSuffixable && !title.endsWith(')')) {
				title = `${title} (${normalizeArtist(extraArtistsSuffixable.name)} ${extraArtistsSuffixable.role})`
			}

			// Build track artists array
			const trackArtists =
				track.artists?.map((a: any) => ({
					discogs_id: a.id,
					name: normalizeArtist(a.name),
					role: a.role || null
				})) || []

			// If track has no artists, inherit from record artists
			const finalTrackArtists =
				trackArtists.length > 0
					? trackArtists
					: release.artists.map((a: any) => ({
							discogs_id: a.id,
							name: normalizeArtist(a.name),
							role: a.role || null
						}))

			// Build extraartists array
			const trackExtraArtists = extraArtists.map((ea: any) => ({
				discogs_id: ea.id || null,
				name: normalizeArtist(ea.name),
				role: ea.role || null
			}))

			// Process position
			let position = null
			if (track.position) {
				if (POSITION_RX.test(track.position)) position = track.position
				else if (POSITION_RX_ALPHA.test(track.position))
					position = track.position[0] + track.position.length.toString()
			}

			return {
				title,
				artists: finalTrackArtists,
				extraartists: trackExtraArtists,
				position,
				duration: parseDuration(track.duration) || null,
				bpm: null, // To be fetched from elsewhere later
				rpm: release.formats?.[0]?.descriptions?.toString().includes('45')
					? 45
					: 33,
				key: null,
				mode: null,
				genres: release.styles || [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true
			}
		}) || []
	)
}

export function transformRelease(release: DiscogsReleaseFull, userId: string) {
	return {
		user_id: userId,
		discogs_id: release.id,
		title: release.title.trim(),
		artists: transformReleaseArtists(release.artists),
		labels: transformReleaseLabels(release.labels),
		year: release.year || null,
		cover:
			release.images?.find((img: any) => img.type === 'primary')
				?.resource_url ||
			release.images?.[0]?.resource_url ||
			null,
		tracks: transformReleaseTracks(release)
	}
}
