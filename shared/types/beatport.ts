export const BEATPORT_SCRAPING_DISABLED_MESSAGE =
	'Beatport scraping is disabled'
export const BEATPORT_SCRAPING_DISABLED_STATUS = 410

export interface BeatportTrackData {
	accessed: number
	url: string
	genre: string
	bpm: number | null
	key: string
	img: string
}

export interface BeatportNotFoundMarker {
	searched: boolean
	notFound: boolean
	searchedAt: number
}

export interface SearchTrackParams {
	artist: string
	title: string
}
