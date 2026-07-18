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
	qty: string
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
	thumbnail_url?: string
}

// Simplified version for database storage
export type DiscogsArtistDb = {
	discogs_id?: number
	name: string
	role?: string | null
}

export type DiscogsImage = {
	type: string
	uri: string
	resource_url: string
	uri150: string
	width: number
	height: number
}

export type DiscogsTrack = {
	duration: string
	position: string
	title: string
	type_: string
	artists?: DiscogsArtist[]
	extraartists?: DiscogsArtist[]
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
		genres: string[]
		styles: string[]
	}
}

export type DiscogsReleaseToFilter = DiscogsRelease & {
	selected: boolean
	alreadyImported?: boolean
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

export type DiscogsErrorCode =
	| 'database_write_failed'
	| 'discogs_connection_required'
	| 'discogs_not_found'
	| 'discogs_rate_limited'
	| 'discogs_request_rejected'
	| 'discogs_timeout'
	| 'discogs_transport'
	| 'discogs_unavailable'
	| 'internal_error'
	| 'invalid_request'
	| 'invalid_upstream_response'
	| 'unknown_error'

export type DiscogsFailureStage = 'fetch' | 'pipeline' | 'save'

export type DiscogsImportFailure = {
	releaseId: number | null
	label: string
	error: string
	code: DiscogsErrorCode
	stage: DiscogsFailureStage
	retryable: boolean
	attempts: number
	requestId?: string
}

export type DiscogsImportResults = {
	successful: number
	skipped: Array<{ label: string }>
	failed: DiscogsImportFailure[]
}

export type DiscogsRequestContext = {
	requestId: string
	attempt: number
}

export type DiscogsRetrySummary = {
	attempted: number
	recovered: number
	remaining: number
}

export type DiscogsRetryStatus = {
	current: number
	total: number
	label: string
	attempt: number
	maxAttempts: number
	waitingMs: number | null
}

export type DiscogsReleaseFull = {
	id: number
	status: string
	year: number
	resource_url: string
	uri: string
	title: string
	country?: string | null
	released?: string
	released_formatted?: string
	estimated_weight?: number
	notes?: string
	data_quality: string | null
	master_id?: number
	master_url?: string
	thumb: string
	artists: DiscogsArtist[]
	artists_sort: string
	labels: DiscogsLabel[]
	series: unknown[]
	companies: DiscogsLabel[]
	formats: DiscogsFormat[]
	images: DiscogsImage[]
	tracklist: DiscogsTrack[]
	extraartists?: DiscogsArtist[]
	genres?: string[]
	styles?: string[]
	videos?: Array<{
		uri: string
		title: string
		description: string
		duration: number
		embed: boolean
	}>
	identifiers?: Array<{
		type: string
		value: string
		description?: string
	}>
	community?: {
		have: number
		want: number
		rating: {
			count: number
			average: number
		}
		submitter: {
			username: string
			resource_url: string
		}
		contributors: Array<{
			username: string
			resource_url: string
		}>
		data_quality: string | null
		status: string
	}
	format_quantity?: number
	date_added?: string
	date_changed?: string
	num_for_sale?: number
	lowest_price?: number | null
	blocked_from_sale?: boolean
	is_offensive?: boolean
}

export function isDiscogsFolder(obj: unknown): obj is DiscogsFolder {
	if (typeof obj !== 'object' || obj === null) return false
	const folder = obj as Record<string, unknown>
	return (
		typeof folder.id === 'number' &&
		typeof folder.name === 'string' &&
		typeof folder.count === 'number' &&
		typeof folder.resource_url === 'string'
	)
}

export function isDiscogsFoldersResponse(
	obj: unknown
): obj is DiscogsFoldersResponse {
	if (typeof obj !== 'object' || obj === null) return false
	const response = obj as Record<string, unknown>
	return (
		Array.isArray(response.folders) && response.folders.every(isDiscogsFolder)
	)
}

export function isDiscogsFormat(obj: unknown): obj is DiscogsFormat {
	if (typeof obj !== 'object' || obj === null) return false
	const format = obj as Record<string, unknown>
	return (
		typeof format.name === 'string' &&
		typeof format.qty === 'string' &&
		Array.isArray(format.descriptions) &&
		format.descriptions.every((desc: unknown) => typeof desc === 'string')
	)
}

export function isDiscogsLabel(obj: unknown): obj is DiscogsLabel {
	if (typeof obj !== 'object' || obj === null) return false
	const label = obj as Record<string, unknown>
	return (
		typeof label.id === 'number' &&
		typeof label.name === 'string' &&
		typeof label.catno === 'string' &&
		typeof label.entity_type === 'string' &&
		typeof label.entity_type_name === 'string' &&
		typeof label.resource_url === 'string' &&
		(label.thumbnail_url === undefined ||
			typeof label.thumbnail_url === 'string')
	)
}

export function isDiscogsLabelDb(obj: unknown): obj is DiscogsLabelDb {
	if (typeof obj !== 'object' || obj === null) return false
	const label = obj as Record<string, unknown>
	return (
		typeof label.name === 'string' &&
		(label.discogs_id === undefined ||
			(typeof label.discogs_id === 'number' &&
				Number.isFinite(label.discogs_id))) &&
		(label.catno === undefined || typeof label.catno === 'string') &&
		(label.entity_type === undefined ||
			typeof label.entity_type === 'string') &&
		(label.thumbnail_url === undefined ||
			typeof label.thumbnail_url === 'string')
	)
}

export function isDiscogsArtist(obj: unknown): obj is DiscogsArtist {
	if (typeof obj !== 'object' || obj === null) return false
	const artist = obj as Record<string, unknown>
	return (
		typeof artist.id === 'number' &&
		typeof artist.name === 'string' &&
		typeof artist.join === 'string' &&
		typeof artist.resource_url === 'string' &&
		typeof artist.anv === 'string' &&
		typeof artist.tracks === 'string' &&
		typeof artist.role === 'string' &&
		(artist.thumbnail_url === undefined ||
			typeof artist.thumbnail_url === 'string')
	)
}

export function isDiscogsArtistDb(obj: unknown): obj is DiscogsArtistDb {
	if (typeof obj !== 'object' || obj === null) return false
	const artist = obj as Record<string, unknown>
	return (
		typeof artist.name === 'string' &&
		artist.name.trim() !== '' &&
		(artist.discogs_id === undefined ||
			(typeof artist.discogs_id === 'number' &&
				Number.isFinite(artist.discogs_id))) &&
		(artist.role === undefined ||
			artist.role === null ||
			typeof artist.role === 'string')
	)
}

export function isDiscogsImage(obj: unknown): obj is DiscogsImage {
	if (typeof obj !== 'object' || obj === null) return false
	const image = obj as Record<string, unknown>
	return (
		typeof image.type === 'string' &&
		typeof image.uri === 'string' &&
		typeof image.resource_url === 'string' &&
		typeof image.uri150 === 'string' &&
		typeof image.width === 'number' &&
		typeof image.height === 'number'
	)
}

export function isDiscogsTrack(obj: unknown): obj is DiscogsTrack {
	if (typeof obj !== 'object' || obj === null) return false
	const track = obj as Record<string, unknown>
	return (
		typeof track.duration === 'string' &&
		typeof track.position === 'string' &&
		typeof track.title === 'string' &&
		typeof track.type_ === 'string' &&
		(track.artists === undefined ||
			(Array.isArray(track.artists) && track.artists.every(isDiscogsArtist))) &&
		(track.extraartists === undefined ||
			(Array.isArray(track.extraartists) &&
				track.extraartists.every(isDiscogsArtist)))
	)
}

export function isDiscogsRelease(obj: unknown): obj is DiscogsRelease {
	if (typeof obj !== 'object' || obj === null) return false
	const release = obj as Record<string, unknown>

	if (
		typeof release.id !== 'number' ||
		typeof release.basic_information !== 'object' ||
		release.basic_information === null
	) {
		return false
	}

	const basicInfo = release.basic_information as Record<string, unknown>
	return (
		typeof basicInfo.id === 'number' &&
		typeof basicInfo.title === 'string' &&
		typeof basicInfo.year === 'number' &&
		typeof basicInfo.thumb === 'string' &&
		typeof basicInfo.cover_image === 'string' &&
		Array.isArray(basicInfo.formats) &&
		basicInfo.formats.every(isDiscogsFormat) &&
		Array.isArray(basicInfo.labels) &&
		basicInfo.labels.every(isDiscogsLabel) &&
		Array.isArray(basicInfo.artists) &&
		basicInfo.artists.every(isDiscogsArtist) &&
		Array.isArray(basicInfo.genres) &&
		basicInfo.genres.every((genre: unknown) => typeof genre === 'string') &&
		Array.isArray(basicInfo.styles) &&
		basicInfo.styles.every((style: unknown) => typeof style === 'string')
	)
}

export function isDiscogsReleaseToFilter(
	obj: unknown
): obj is DiscogsReleaseToFilter {
	if (!isDiscogsRelease(obj)) return false
	const release = obj as Record<string, unknown>
	return typeof release.selected === 'boolean'
}

export function isDiscogsFolderResponse(
	obj: unknown
): obj is DiscogsFolderResponse {
	if (typeof obj !== 'object' || obj === null) return false
	const response = obj as Record<string, unknown>

	if (typeof response.pagination !== 'object' || response.pagination === null) {
		return false
	}

	const pagination = response.pagination as Record<string, unknown>
	return (
		typeof pagination.page === 'number' &&
		typeof pagination.pages === 'number' &&
		typeof pagination.per_page === 'number' &&
		typeof pagination.items === 'number' &&
		Array.isArray(response.releases) &&
		response.releases.every(isDiscogsRelease)
	)
}

export function isDiscogsReleaseFull(obj: unknown): obj is DiscogsReleaseFull {
	if (typeof obj !== 'object' || obj === null) return false
	const release = obj as Record<string, unknown>
	return (
		typeof release.id === 'number' &&
		typeof release.status === 'string' &&
		typeof release.year === 'number' &&
		typeof release.resource_url === 'string' &&
		typeof release.uri === 'string' &&
		typeof release.title === 'string' &&
		(typeof release.data_quality === 'string' ||
			release.data_quality === null) &&
		typeof release.thumb === 'string' &&
		typeof release.artists_sort === 'string' &&
		Array.isArray(release.artists) &&
		release.artists.every(isDiscogsArtist) &&
		Array.isArray(release.labels) &&
		release.labels.every(isDiscogsLabel) &&
		Array.isArray(release.series) &&
		Array.isArray(release.companies) &&
		release.companies.every(isDiscogsLabel) &&
		Array.isArray(release.formats) &&
		release.formats.every(isDiscogsFormat) &&
		Array.isArray(release.images) &&
		release.images.every(isDiscogsImage) &&
		Array.isArray(release.tracklist) &&
		release.tracklist.every(isDiscogsTrack) &&
		(release.country === undefined ||
			release.country === null ||
			typeof release.country === 'string') &&
		(release.released === undefined || typeof release.released === 'string') &&
		(release.released_formatted === undefined ||
			typeof release.released_formatted === 'string') &&
		(release.estimated_weight === undefined ||
			typeof release.estimated_weight === 'number') &&
		(release.notes === undefined || typeof release.notes === 'string') &&
		(release.master_id === undefined ||
			typeof release.master_id === 'number') &&
		(release.master_url === undefined ||
			typeof release.master_url === 'string') &&
		(release.extraartists === undefined ||
			(Array.isArray(release.extraartists) &&
				release.extraartists.every(isDiscogsArtist))) &&
		(release.genres === undefined ||
			(Array.isArray(release.genres) &&
				release.genres.every((genre: unknown) => typeof genre === 'string'))) &&
		(release.styles === undefined ||
			(Array.isArray(release.styles) &&
				release.styles.every((style: unknown) => typeof style === 'string'))) &&
		(release.videos === undefined || Array.isArray(release.videos)) &&
		(release.identifiers === undefined || Array.isArray(release.identifiers)) &&
		(release.community === undefined ||
			typeof release.community === 'object') &&
		(release.format_quantity === undefined ||
			typeof release.format_quantity === 'number') &&
		(release.date_added === undefined ||
			typeof release.date_added === 'string') &&
		(release.date_changed === undefined ||
			typeof release.date_changed === 'string') &&
		(release.num_for_sale === undefined ||
			typeof release.num_for_sale === 'number') &&
		(release.lowest_price === undefined ||
			release.lowest_price === null ||
			typeof release.lowest_price === 'number') &&
		(release.blocked_from_sale === undefined ||
			typeof release.blocked_from_sale === 'boolean') &&
		(release.is_offensive === undefined ||
			typeof release.is_offensive === 'boolean')
	)
}
