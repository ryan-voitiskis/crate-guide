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
