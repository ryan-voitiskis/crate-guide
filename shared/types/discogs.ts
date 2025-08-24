interface DiscogsFolder {
	id: number
	name: string
	count: number
	resource_url: string
}

interface DiscogsFoldersResponse {
	folders: DiscogsFolder[]
}

interface DiscogsFormat {
	name: string
	qty: number
	descriptions: string[]
}

interface DiscogsLabel {
	id: number
	name: string
	catno: string
	entity_type: string
	resource_url: string
}

interface DiscogsArtist {
	id: number
	name: string
	join: string
	resource_url: string
	anv: string
	tracks: string
	role: string
}

interface DiscogsImage {
	height: number
	width: number
	resource_url: string
	type: string
}

interface DiscogsExtraArtist {
	name: string
	role: string
}

interface DiscogsTrack {
	duration: string
	position: string
	artists?: DiscogsArtist[]
	title: string
	type_: string
	extraartists: DiscogsExtraArtist[]
}

interface DiscogsRelease {
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

interface DiscogsReleaseToFilter extends DiscogsRelease {
	selected: boolean
}

interface DiscogsFolderResponse {
	pagination: {
		page: number
		pages: number
		per_page: number
		items: number
	}
	releases: DiscogsRelease[]
}

interface DiscogsReleaseFull {
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

export type {
	DiscogsFolder,
	DiscogsFoldersResponse,
	DiscogsFormat,
	DiscogsLabel,
	DiscogsArtist,
	DiscogsImage,
	DiscogsTrack,
	DiscogsRelease,
	DiscogsReleaseToFilter,
	DiscogsFolderResponse,
	DiscogsReleaseFull,
	DiscogsExtraArtist
}
