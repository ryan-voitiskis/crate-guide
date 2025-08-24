// Types for Discogs API responses

export interface DiscogsFolder {
	id: number
	name: string
	count: number
	resource_url?: string
}

export interface DiscogsArtist {
	name: string
	anv?: string
	join?: string
	role?: string
	tracks?: string
	id?: number
	resource_url?: string
}

export interface DiscogsLabel {
	name: string
	catno: string
	entity_type?: string
	entity_type_name?: string
	id?: number
	resource_url?: string
}

export interface DiscogsImage {
	type: 'primary' | 'secondary'
	uri?: string
	resource_url: string
	uri150?: string
	width?: number
	height?: number
}

export interface DiscogsFormat {
	name?: string
	qty?: string
	descriptions?: string[]
	text?: string
}

// Basic release info from collection/folder endpoint
export interface DiscogsRelease {
	id: number
	instance_id?: number
	date_added?: string
	rating?: number
	basic_information: {
		id: number
		title: string
		year: number
		resource_url: string
		thumb: string
		cover_image: string
		formats: DiscogsFormat[]
		labels: DiscogsLabel[]
		artists: DiscogsArtist[]
		genres?: string[]
		styles?: string[]
	}
	folder_id?: number
	notes?: string
}

// Release with selection flag for import UI
export interface DiscogsReleaseToFilter extends DiscogsRelease {
	selected: boolean
}

// Extra artist info on tracks
export interface DiscogsExtraArtist {
	name: string
	anv?: string
	join?: string
	role: string
	tracks?: string
	id?: number
	resource_url?: string
}

// Track from full release details
export interface DiscogsTrack {
	position: string
	type_?: 'track' | 'heading' | 'index'
	title: string
	duration: string
	artists?: DiscogsArtist[]
	extraartists?: DiscogsExtraArtist[]
}

// Full release details from releases endpoint
export interface DiscogsReleaseFull {
	id: number
	status?: string
	year: number
	resource_url?: string
	uri?: string
	artists: DiscogsArtist[]
	artists_sort?: string
	labels: DiscogsLabel[]
	series?: any[]
	companies?: any[]
	formats: DiscogsFormat[]
	data_quality?: string
	community?: {
		have: number
		want: number
		rating: {
			count: number
			average: number
		}
		submitter?: {
			username: string
			resource_url: string
		}
		contributors?: Array<{
			username: string
			resource_url: string
		}>
		data_quality?: string
		status?: string
	}
	format_quantity?: number
	date_added?: string
	date_changed?: string
	num_for_sale?: number
	lowest_price?: number
	master_id?: number
	master_url?: string
	title: string
	country?: string
	released?: string
	notes?: string
	released_formatted?: string
	identifiers?: Array<{
		type: string
		value: string
		description?: string
	}>
	videos?: Array<{
		uri: string
		title: string
		description: string
		duration: number
		embed: boolean
	}>
	genres?: string[]
	styles?: string[]
	tracklist: DiscogsTrack[]
	extraartists?: DiscogsExtraArtist[]
	images: DiscogsImage[]
	thumb?: string
}

// Folder response with pagination
export interface DiscogsFolderResponse {
	pagination: {
		page: number
		pages: number
		per_page: number
		items: number
		urls: {
			last?: string
			next?: string
			prev?: string
			first?: string
		}
	}
	releases: DiscogsRelease[]
}

// Helper type guards
export function isError(error: unknown): error is Error {
	return error instanceof Error
}
