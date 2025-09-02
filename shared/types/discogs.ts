export type DiscogsFolder = {
	id: number
	name: string
	count: number
	resource_url: string
}

export type DiscogsFoldersResponse = {
	folders: DiscogsFolder[]
}

export type DiscogsFormat = {
	name: string
	qty: number
	descriptions: string[]
}

export type DiscogsLabel = {
	id: number
	name: string
	catno: string
	entity_type: string
	entity_type_name: string
	resource_url: string
	thumbnail_url?: string
}

// Simplified version for database storage
export type DiscogsLabelDb = {
	discogs_id?: number
	name: string
	catno?: string
	entity_type?: string
	thumbnail_url?: string
}

export type DiscogsArtist = {
	id: number
	name: string
	join: string
	resource_url: string
	anv: string
	tracks: string
	role: string
}

// Simplified version for database storage
export type DiscogsArtistDb = {
	discogs_id?: number
	name: string
	role?: string | null
}

export type DiscogsImage = {
	height: number
	width: number
	resource_url: string
	type: string
}

export type DiscogsTrack = {
	duration: string
	position: string
	artists?: DiscogsArtist[]
	title: string
	type_: string
	extraartists: DiscogsArtist[]
}

export type DiscogsRelease = {
	id: number
	basic_information: {
		id: number
		title: string
		year: number
		thumb: string
		cover_image: string
		formats: DiscogsFormat[]
		labels: DiscogsLabel[]
		artists: DiscogsArtist[]
		genre: string[]
		styles: string[]
	}
}

export type DiscogsReleaseToFilter = DiscogsRelease & {
	selected: boolean
}

export type DiscogsFolderResponse = {
	pagination: {
		page: number
		pages: number
		per_page: number
		items: number
	}
	releases: DiscogsRelease[]
}

export type DiscogsReleaseFull = {
	id: number
	title: string
	formats: DiscogsFormat[]
	labels: DiscogsLabel[]
	artists: DiscogsArtist[]
	images: DiscogsImage[]
	tracklist: DiscogsTrack[]
	genre?: string[]
	styles?: string[]
	year: number
}
