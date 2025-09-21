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

			return null
		} catch (error) {
			console.error('Failed to search Beatport:', error)
			return null
		}
	}

	return {
		searchTracks
	}
}
