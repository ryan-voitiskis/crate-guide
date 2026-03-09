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

interface BeatportResponse {
	success: boolean
	data?: BeatportTrackData
	error?: string
}

const BEATPORT_NO_MATCH_ERROR = 'No matching track found'

type BeatportScraperErrorType = 'api' | 'transport'

export class BeatportScraperError extends Error {
	readonly type: BeatportScraperErrorType
	readonly statusCode: number | null
	readonly originalError: unknown

	constructor(
		message: string,
		{
			type,
			statusCode = null,
			originalError
		}: {
			type: BeatportScraperErrorType
			statusCode?: number | null
			originalError: unknown
		}
	) {
		super(message)
		this.name = 'BeatportScraperError'
		this.type = type
		this.statusCode = statusCode
		this.originalError = originalError
	}
}

function isNoMatchResponse(response: BeatportResponse): boolean {
	return (
		response.success === false && response.error === BEATPORT_NO_MATCH_ERROR
	)
}

function getStatusCode(error: unknown): number | null {
	if (!error || typeof error !== 'object') return null

	const maybeError = error as {
		statusCode?: unknown
		status?: unknown
		response?: { status?: unknown }
	}

	if (typeof maybeError.statusCode === 'number') return maybeError.statusCode
	if (typeof maybeError.status === 'number') return maybeError.status
	if (typeof maybeError.response?.status === 'number') {
		return maybeError.response.status
	}

	return null
}

export function useBeatportScraper() {
	const searchTracks = async ({
		artist,
		title
	}: SearchTrackParams): Promise<BeatportTrackData | null> => {
		try {
			const query = `${artist} ${title}`
			const response = await $fetch<BeatportResponse>(
				`/api/beatport/search?q=${encodeURIComponent(query)}&artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`
			)

			if (response.success && response.data) {
				return response.data
			}

			if (isNoMatchResponse(response)) {
				return null
			}

			throw new BeatportScraperError(
				`Beatport API response failed: ${response.error ?? 'Unknown API error'}`,
				{
					type: 'api',
					originalError: response
				}
			)
		} catch (error) {
			if (error instanceof BeatportScraperError) {
				throw error
			}

			const statusCode = getStatusCode(error)
			const type: BeatportScraperErrorType =
				statusCode !== null ? 'api' : 'transport'
			const statusCodeMessage = statusCode !== null ? ` (${statusCode})` : ''

			throw new BeatportScraperError(
				`Failed to search Beatport${statusCodeMessage}`,
				{
					type,
					statusCode,
					originalError: error
				}
			)
		}
	}

	return {
		searchTracks
	}
}
