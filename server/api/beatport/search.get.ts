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

interface RateLimitEntry {
	count: number
	resetAt: number
}

const RATE_LIMIT_WINDOW_MS = 1000
const RATE_LIMIT_MAX_REQUESTS = 1
const RATE_LIMIT_CLEANUP_INTERVAL_MS = RATE_LIMIT_WINDOW_MS
const BEATPORT_REQUEST_TIMEOUT_MS = 10_000
const rateLimitStore = new Map<string, RateLimitEntry>()
let lastRateLimitCleanupAt = 0

export default defineEventHandler(async (event) => {
	const user = await serverSupabaseUser(event)

	if (!user) {
		throw createError({
			statusCode: 401,
			statusMessage: 'Authentication required'
		})
	}

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

	const clientIp = getClientIp(event)
	const rateLimitKeys = new Set<string>()

	if (typeof user.id === 'string' && user.id.length > 0) {
		rateLimitKeys.add(`user:${user.id}`)
	}

	if (typeof clientIp === 'string' && clientIp.length > 0) {
		rateLimitKeys.add(`ip:${clientIp}`)
	}

	if (rateLimitKeys.size === 0) {
		rateLimitKeys.add('user:unknown')
	}

	if (isRateLimited(Array.from(rateLimitKeys))) {
		throw createError({
			statusCode: 429,
			statusMessage: 'Too many requests'
		})
	}

	const controller = new AbortController()
	const timeoutId = setTimeout(
		() => controller.abort(),
		BEATPORT_REQUEST_TIMEOUT_MS
	)
	const beatportHttpErrors = new WeakSet<Error>()

	try {
		const response = await fetch(
			`https://www.beatport.com/search/tracks?q=${encodeURIComponent(q)}`,
			{
				signal: controller.signal,
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
			const beatportHttpError = createError({
				statusCode: response.status,
				statusMessage: `Beatport returned ${response.status}`
			})
			if (beatportHttpError instanceof Error) {
				beatportHttpErrors.add(beatportHttpError)
			}
			throw beatportHttpError
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
	} catch (error) {
		if (isAbortError(error)) {
			throw createError({
				statusCode: 504,
				statusMessage: 'Beatport request timed out'
			})
		}

		if (error instanceof Error && beatportHttpErrors.has(error)) {
			throw error
		}

		throw createError({
			statusCode: 500,
			statusMessage: 'Failed to fetch from Beatport'
		})
	} finally {
		clearTimeout(timeoutId)
	}
})

function isRateLimited(keys: string[]): boolean {
	const now = Date.now()
	pruneExpiredRateLimitEntries(now)

	for (const key of keys) {
		const existingEntry = rateLimitStore.get(key)

		if (!existingEntry || existingEntry.resetAt <= now) {
			rateLimitStore.set(key, {
				count: 1,
				resetAt: now + RATE_LIMIT_WINDOW_MS
			})
			continue
		}

		existingEntry.count += 1
		if (existingEntry.count > RATE_LIMIT_MAX_REQUESTS) {
			return true
		}
	}

	return false
}

function pruneExpiredRateLimitEntries(now: number): void {
	if (now - lastRateLimitCleanupAt < RATE_LIMIT_CLEANUP_INTERVAL_MS) {
		return
	}

	for (const [key, entry] of rateLimitStore) {
		if (entry.resetAt <= now) {
			rateLimitStore.delete(key)
		}
	}

	lastRateLimitCleanupAt = now
}

function getClientIp(event: unknown): string | null {
	const request = (
		event as {
			node?: {
				req?: {
					headers?: Record<string, string | string[] | undefined>
					socket?: { remoteAddress?: string | null }
				}
			}
		}
	).node?.req
	const forwardedFor = request?.headers?.['x-forwarded-for']

	if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
		return forwardedFor.split(',')[0]?.trim() ?? null
	}

	if (Array.isArray(forwardedFor) && typeof forwardedFor[0] === 'string') {
		return forwardedFor[0]
	}

	const remoteAddress = request?.socket?.remoteAddress
	if (typeof remoteAddress === 'string' && remoteAddress.length > 0) {
		return remoteAddress
	}

	return null
}

function isAbortError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false
	}

	return (
		error.name === 'AbortError' || error.message.toLowerCase().includes('abort')
	)
}

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
