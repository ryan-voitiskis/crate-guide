import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import {
	BEATPORT_SCRAPING_DISABLED_MESSAGE,
	BEATPORT_SCRAPING_DISABLED_STATUS,
	type BeatportTrackData,
	type SearchTrackParams
} from '../../../shared/types/beatport'
import { getClientIp } from '../../utils/getClientIp'

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

const RATE_LIMIT_WINDOW_MS = 1000
const RATE_LIMIT_MAX_REQUESTS = 1
const BEATPORT_REQUEST_TIMEOUT_MS = 10_000
const BEATPORT_CHALLENGE_MESSAGE = 'Beatport returned anti-bot challenge'

function isBeatportScrapingEnabled(): boolean {
	return false
}

export default defineEventHandler(async (event) => {
	const user = await serverSupabaseUser(event)

	if (!user) {
		throw createError({
			statusCode: 401,
			statusMessage: 'Authentication required'
		})
	}

	if (!isBeatportScrapingEnabled()) {
		throw createError({
			statusCode: BEATPORT_SCRAPING_DISABLED_STATUS,
			statusMessage: BEATPORT_SCRAPING_DISABLED_MESSAGE
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
	const rateLimitKeys: string[] = []

	if (typeof user.id === 'string' && user.id.length > 0) {
		rateLimitKeys.push(`beatport:user:${user.id}`)
	}

	if (typeof clientIp === 'string' && clientIp.length > 0) {
		rateLimitKeys.push(`beatport:ip:${clientIp}`)
	}

	if (rateLimitKeys.length === 0) {
		rateLimitKeys.push('beatport:user:unknown')
	}

	const supabase = await serverSupabaseClient(event)
	const { data: allowed, error: rateLimitError } = await supabase.rpc(
		'check_rate_limit',
		{
			rate_keys: rateLimitKeys,
			max_requests: RATE_LIMIT_MAX_REQUESTS,
			window_ms: RATE_LIMIT_WINDOW_MS
		}
	)
	if (rateLimitError) {
		throw createError({
			statusCode: 500,
			statusMessage: 'Rate limit check failed'
		})
	}
	if (!allowed) {
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
			const statusBody =
				response.status === 403 ? await response.text().catch(() => '') : ''
			if (isBeatportChallengeResponse(statusBody)) {
				throw createError({
					statusCode: 503,
					statusMessage: BEATPORT_CHALLENGE_MESSAGE
				})
			}

			throw createError({
				statusCode: response.status,
				statusMessage: `Beatport returned ${response.status}`
			})
		}

		const html = await response.text()
		if (isBeatportChallengeResponse(html)) {
			throw createError({
				statusCode: 503,
				statusMessage: BEATPORT_CHALLENGE_MESSAGE
			})
		}

		const trackData = extractTrackDataFromHTML(html, { artist, title })

		if (!trackData) {
			return {
				success: false,
				code: 'NO_MATCH',
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

		if (isBeatportStatusError(error)) {
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

function isAbortError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false
	}

	return (
		error.name === 'AbortError' || error.message.toLowerCase().includes('abort')
	)
}

function isBeatportStatusError(
	error: unknown
): error is Error & { statusCode: number } {
	if (!(error instanceof Error)) {
		return false
	}

	return (
		typeof (error as { statusCode?: unknown }).statusCode === 'number' &&
		error.message.startsWith('Beatport returned ')
	)
}

function isBeatportChallengeResponse(html: string): boolean {
	return (
		html.includes('challenges.cloudflare.com') ||
		html.includes('cf_chl') ||
		html.includes('Just a moment...') ||
		html.includes('Enable JavaScript and cookies to continue')
	)
}

function extractTrackDataFromHTML(
	html: string,
	{ artist, title }: SearchTrackParams
): BeatportTrackData | null {
	try {
		const nextDataMatch = html.match(
			/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
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
	} catch (e) {
		console.error('Failed to extract track data from Beatport HTML:', e)
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
