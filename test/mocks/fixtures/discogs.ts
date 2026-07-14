import type {
	DiscogsArtist,
	DiscogsFormat,
	DiscogsImage,
	DiscogsLabel,
	DiscogsRelease,
	DiscogsReleaseFull,
	DiscogsTrack
} from '~/../../shared/types/discogs'

let releaseIdCounter = 0

export function createMockDiscogsArtist(
	overrides?: Partial<DiscogsArtist>
): DiscogsArtist {
	return {
		id: 1,
		name: 'Test Artist',
		join: '',
		resource_url: 'https://api.discogs.com/artists/1',
		anv: '',
		tracks: '',
		role: '',
		...overrides
	}
}

export function createMockDiscogsLabel(
	overrides?: Partial<DiscogsLabel>
): DiscogsLabel {
	return {
		id: 1,
		name: 'Test Label',
		catno: 'TEST001',
		entity_type: '1',
		entity_type_name: 'Label',
		resource_url: 'https://api.discogs.com/labels/1',
		...overrides
	}
}

export function createMockDiscogsFormat(
	overrides?: Partial<DiscogsFormat>
): DiscogsFormat {
	return {
		name: 'Vinyl',
		qty: '1',
		descriptions: ['12"', '33 RPM'],
		...overrides
	}
}

export function createMockDiscogsImage(
	overrides?: Partial<DiscogsImage>
): DiscogsImage {
	return {
		type: 'primary',
		uri: 'https://example.com/image.jpg',
		resource_url: 'https://example.com/image.jpg',
		uri150: 'https://example.com/image-150.jpg',
		width: 600,
		height: 600,
		...overrides
	}
}

export function createMockDiscogsTrack(
	overrides?: Partial<DiscogsTrack>
): DiscogsTrack {
	return {
		duration: '5:30',
		position: 'A1',
		title: 'Test Track',
		type_: 'track',
		...overrides
	}
}

export function createMockDiscogsRelease(
	overrides?: Partial<DiscogsRelease>
): DiscogsRelease {
	releaseIdCounter++
	const id = overrides?.id ?? releaseIdCounter

	return {
		id,
		basic_information: {
			id,
			title: `Test Release ${id}`,
			year: 2024,
			thumb: 'https://example.com/thumb.jpg',
			cover_image: 'https://example.com/cover.jpg',
			formats: [createMockDiscogsFormat()],
			labels: [createMockDiscogsLabel()],
			artists: [createMockDiscogsArtist()],
			genres: ['Electronic'],
			styles: ['House'],
			...overrides?.basic_information
		},
		...overrides
	}
}

export function createMockDiscogsReleaseFull(
	overrides?: Partial<DiscogsReleaseFull>
): DiscogsReleaseFull {
	releaseIdCounter++
	const id = overrides?.id ?? releaseIdCounter

	return {
		id,
		status: 'Accepted',
		year: 2024,
		resource_url: `https://api.discogs.com/releases/${id}`,
		uri: `https://www.discogs.com/release/${id}`,
		title: `Test Release ${id}`,
		data_quality: 'Correct',
		thumb: 'https://example.com/thumb.jpg',
		artists: [createMockDiscogsArtist()],
		artists_sort: 'Test Artist',
		labels: [createMockDiscogsLabel()],
		series: [],
		companies: [],
		formats: [createMockDiscogsFormat()],
		images: [createMockDiscogsImage()],
		tracklist: [
			createMockDiscogsTrack({ position: 'A1', title: 'Track One' }),
			createMockDiscogsTrack({ position: 'A2', title: 'Track Two' }),
			createMockDiscogsTrack({ position: 'B1', title: 'Track Three' }),
			createMockDiscogsTrack({ position: 'B2', title: 'Track Four' })
		],
		styles: ['House', 'Deep House'],
		genres: ['Electronic'],
		...overrides
	}
}

// Predefined releases for common test scenarios
export const mockDiscogsReleases = {
	// Standard 4-track EP
	standardEp: () =>
		createMockDiscogsReleaseFull({
			id: 100,
			title: 'Standard EP',
			tracklist: [
				createMockDiscogsTrack({
					position: 'A1',
					title: 'Original Mix',
					duration: '6:30'
				}),
				createMockDiscogsTrack({
					position: 'A2',
					title: 'Dub Mix',
					duration: '5:45'
				}),
				createMockDiscogsTrack({
					position: 'B1',
					title: 'Remix',
					duration: '7:00'
				}),
				createMockDiscogsTrack({
					position: 'B2',
					title: 'Instrumental',
					duration: '6:15'
				})
			]
		}),

	// Release with track artists (various artists compilation)
	variousArtists: () =>
		createMockDiscogsReleaseFull({
			id: 101,
			title: 'Various Artists EP',
			artists: [createMockDiscogsArtist({ name: 'Various' })],
			tracklist: [
				createMockDiscogsTrack({
					position: 'A1',
					title: 'Track One',
					artists: [createMockDiscogsArtist({ name: 'Artist One' })]
				}),
				createMockDiscogsTrack({
					position: 'A2',
					title: 'Track Two',
					artists: [createMockDiscogsArtist({ name: 'Artist Two' })]
				})
			]
		}),

	// Release with extraartists (remixers)
	withRemixers: () =>
		createMockDiscogsReleaseFull({
			id: 102,
			title: 'Remix EP',
			tracklist: [
				createMockDiscogsTrack({
					position: 'A1',
					title: 'Original',
					duration: '6:00'
				}),
				createMockDiscogsTrack({
					position: 'A2',
					title: 'Track Name',
					duration: '7:00',
					extraartists: [
						createMockDiscogsArtist({ name: 'Remixer One', role: 'Remix' })
					]
				}),
				createMockDiscogsTrack({
					position: 'B1',
					title: 'Track Name',
					duration: '6:30',
					extraartists: [
						createMockDiscogsArtist({ name: 'Remixer Two', role: 'Re-Edit' })
					]
				})
			]
		}),

	// 45 RPM release
	rpm45: () =>
		createMockDiscogsReleaseFull({
			id: 103,
			title: '45 RPM Single',
			formats: [createMockDiscogsFormat({ descriptions: ['7"', '45 RPM'] })],
			tracklist: [
				createMockDiscogsTrack({ position: 'A', title: 'A Side' }),
				createMockDiscogsTrack({ position: 'B', title: 'B Side' })
			]
		}),

	// Release with disambiguation numbers in artist names
	disambiguatedArtists: () =>
		createMockDiscogsReleaseFull({
			id: 104,
			title: 'Disambiguation Test',
			artists: [
				createMockDiscogsArtist({ name: 'John Smith (2)' }),
				createMockDiscogsArtist({ name: 'The Artist (123)' })
			]
		}),

	// Release with no images
	noImages: () =>
		createMockDiscogsReleaseFull({
			id: 105,
			title: 'No Images Release',
			images: []
		}),

	// Release with secondary image only
	secondaryImageOnly: () =>
		createMockDiscogsReleaseFull({
			id: 106,
			title: 'Secondary Image Only',
			images: [createMockDiscogsImage({ type: 'secondary' })]
		})
}

// Reset counter between test files
export function resetReleaseIdCounter() {
	releaseIdCounter = 0
}
