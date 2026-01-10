interface BeatportTrackData {
	accessed: number
	url: string
	genre: string
	bpm: number | null
	key: string
	img: string
}

interface SearchTrackParams {
	artist: string
	title: string
}

interface BeatportTrackJSON {
	track_id: number
	track_name: string
	artists: Array<{
		artist_id: number
		artist_name: string
		artist_type_name: string
	}>
	bpm: number
	key_name: string
	genre: Array<{
		genre_id: number
		genre_name: string
	}>
	release: {
		release_id: number
		release_name: string
		release_image_uri: string
		release_image_dynamic_uri: string
	}
	track_image_uri?: string
	track_image_dynamic_uri?: string
}

export default defineEventHandler(async (event) => {
	const query = getQuery(event)
	const q = query.q as string
	const artist = query.artist as string
	const title = query.title as string

	if (!q) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Query parameter "q" is required'
		})
	}

	if (!artist || !title) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Artist and title parameters are required for matching'
		})
	}

	try {
		const response = await fetch(
			`https://www.beatport.com/search/tracks?q=${encodeURIComponent(q)}`,
			{
				headers: {
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
					Accept:
						'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
					'Accept-Language': 'en-US,en;q=0.5',
					'Accept-Encoding': 'gzip, deflate, br',
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache'
				}
			}
		)

		if (!response.ok) {
			throw createError({
				statusCode: response.status,
				statusMessage: `Beatport returned ${response.status}`
			})
		}

		const html = await response.text()
		const trackData = extractTrackDataFromHTML(html, { artist, title })

		if (!trackData) {
			return {
				success: false,
				error: 'No matching track found'
			}
		}

		return {
			success: true,
			data: trackData
		}
	} catch {
		throw createError({
			statusCode: 500,
			statusMessage: 'Failed to fetch from Beatport'
		})
	}
})

function extractTrackDataFromHTML(
	html: string,
	{ artist, title }: SearchTrackParams
): BeatportTrackData | null {
	try {
		const nextDataMatch = html.match(
			/__NEXT_DATA__" type="application\/json">(.+?)<\/script>/
		)
		if (!nextDataMatch || !nextDataMatch[1]) return null

		const nextData = JSON.parse(nextDataMatch[1])
		const tracks: BeatportTrackJSON[] =
			nextData?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data
				?.data

		if (!tracks || !Array.isArray(tracks)) return null
		for (const track of tracks) {
			if (isTrackMatch(track, { artist, title })) {
				return convertToTrackData(track)
			}
		}

		return null
	} catch {
		return null
	}
}

function convertToTrackData(track: BeatportTrackJSON): BeatportTrackData {
	return {
		accessed: Date.now(),
		url: `https://www.beatport.com/track/${track.track_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${track.track_id}`,
		genre: track.genre?.[0]?.genre_name || '',
		bpm: track.bpm || null,
		key: track.key_name || '',
		img: track.track_image_uri || track.release?.release_image_uri || ''
	}
}

function isTrackMatch(
	track: BeatportTrackJSON,
	searchParams: SearchTrackParams
): boolean {
	const { artist, title } = searchParams

	const artistMatch = track.artists.some(
		(a) => a.artist_name.toLowerCase() === artist.toLowerCase()
	)

	const trackTitle = track.track_name.toLowerCase()
	const searchTitle = title.toLowerCase()
	const titleMatch =
		trackTitle.includes(searchTitle) || searchTitle.includes(trackTitle)

	return artistMatch && titleMatch
}
