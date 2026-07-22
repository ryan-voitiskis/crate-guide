import type {
	LibraryCrate,
	LibraryDataset,
	LibraryRecord,
	LibrarySavedSet,
	LibraryTrack
} from '../../shared/types/library'

export const BROWSER_LIBRARY_SCALE = {
	coverBytes: 2 * 1024 * 1024,
	crates: 20,
	records: 1_000,
	savedSets: 20,
	tracks: 10_000
} as const

export const BROWSER_LIBRARY_FIXTURE_TIMESTAMP = '2026-07-22T00:00:00.000Z'

export type BrowserLibraryScaleFixture = {
	managedCoverAssetIds: string[]
	snapshot: LibraryDataset
	workspace: {
		contentRevision: number
		id: string
		name: string
		repositoryRevision: number
	}
}

function padded(prefix: string, index: number, width = 5) {
	return `${prefix}-${String(index).padStart(width, '0')}`
}

function createRecord(index: number): LibraryRecord {
	const id = padded('record', index)
	const isManagedCover = index % 100 === 0
	return {
		artists: [
			{
				discogs_id: index + 10_000,
				name: `Artist ${String(index % 211).padStart(3, '0')}`,
				role: null
			}
		],
		cover: isManagedCover
			? {
					kind: 'browser',
					assetId: `${id}/cover.webp`,
					fallbackUrl: null
				}
			: { kind: 'none' },
		created_at: BROWSER_LIBRARY_FIXTURE_TIMESTAMP,
		discogs_id: index + 1,
		discogs_release_url: `https://www.discogs.com/release/${index + 1}`,
		id,
		labels: [
			{
				catno: `CAT-${String(index).padStart(5, '0')}`,
				discogs_id: index + 20_000,
				name: `Label ${String(index % 89).padStart(2, '0')}`
			}
		],
		title: `Release ${String(index).padStart(5, '0')}`,
		updated_at: BROWSER_LIBRARY_FIXTURE_TIMESTAMP,
		year: 1980 + (index % 46)
	}
}

function createTrack(
	index: number,
	records: readonly LibraryRecord[]
): LibraryTrack {
	const record = records[index % records.length]!
	return {
		artists: record.artists.map((artist) => ({ ...artist })),
		audio_features: null,
		beatport_data: null,
		bpm: 112 + (index % 400) / 10,
		created_at: BROWSER_LIBRARY_FIXTURE_TIMESTAMP,
		duration: 150_000 + (index % 180) * 1_000,
		extraartists: [],
		genres: [`Genre ${index % 12}`],
		id: padded('track', index),
		key: index % 12,
		mode: index % 2,
		playable: index % 19 !== 0,
		position: `${String.fromCharCode(65 + (index % 4))}${(index % 5) + 1}`,
		record_id: record.id,
		rpm: index % 5 === 0 ? 45 : 33,
		time_signature_lower: null,
		time_signature_upper: null,
		title: `Track ${String(index).padStart(5, '0')}`,
		updated_at: BROWSER_LIBRARY_FIXTURE_TIMESTAMP
	}
}

function createCrates(records: readonly LibraryRecord[]): LibraryCrate[] {
	const recordsPerCrate = Math.ceil(
		records.length / BROWSER_LIBRARY_SCALE.crates
	)
	return Array.from({ length: BROWSER_LIBRARY_SCALE.crates }, (_, index) => ({
		color: index % 2 === 0 ? '#334155' : null,
		created_at: BROWSER_LIBRARY_FIXTURE_TIMESTAMP,
		description: `Deterministic crate ${index}`,
		id: padded('crate', index, 3),
		name: `Crate ${String(index).padStart(3, '0')}`,
		records: records
			.slice(index * recordsPerCrate, (index + 1) * recordsPerCrate)
			.map((record) => record.id),
		updated_at: BROWSER_LIBRARY_FIXTURE_TIMESTAMP
	}))
}

function createSavedSets(tracks: readonly LibraryTrack[]): LibrarySavedSet[] {
	return Array.from(
		{ length: BROWSER_LIBRARY_SCALE.savedSets },
		(_, index) => ({
			created_at: BROWSER_LIBRARY_FIXTURE_TIMESTAMP,
			id: padded('set', index, 3),
			name: `Set ${String(index).padStart(3, '0')}`,
			played_tracks: tracks
				.slice(index * 25, index * 25 + 25)
				.map((track, trackIndex) => ({
					adjusted_bpm: track.bpm,
					artist_display: track.artists.map((artist) => artist.name).join(', '),
					time_added:
						Date.parse(BROWSER_LIBRARY_FIXTURE_TIMESTAMP) + trackIndex,
					track_id: track.id,
					track_title: track.title,
					transition_rating: trackIndex % 6 === 0 ? null : (trackIndex % 5) + 1
				})),
			updated_at: BROWSER_LIBRARY_FIXTURE_TIMESTAMP
		})
	)
}

export function createBrowserLibraryScaleFixture(): BrowserLibraryScaleFixture {
	const records = Array.from(
		{ length: BROWSER_LIBRARY_SCALE.records },
		(_, index) => createRecord(index)
	)
	const tracks = Array.from(
		{ length: BROWSER_LIBRARY_SCALE.tracks },
		(_, index) => createTrack(index, records)
	)
	const crates = createCrates(records)
	const snapshot: LibraryDataset = {
		crates,
		preferences: {
			key_format: 'camelot',
			list_layout: 'compact',
			selected_crate: crates[0]!.id,
			turntable_pitch_range: 8,
			turntable_theme: 'black',
			ui_theme: 'dark'
		},
		records,
		savedSets: createSavedSets(tracks),
		tracks
	}

	return {
		managedCoverAssetIds: records.flatMap((record) =>
			record.cover.kind === 'browser' ? [record.cover.assetId] : []
		),
		snapshot,
		workspace: {
			contentRevision: 0,
			id: 'browser-workspace-performance',
			name: 'Performance library',
			repositoryRevision: 0
		}
	}
}

export function createDeterministicCoverBlob(
	assetId: string,
	size = BROWSER_LIBRARY_SCALE.coverBytes
): Blob {
	if (!Number.isSafeInteger(size) || size < 12)
		throw new Error(
			'Cover fixture size must be an integer of at least 12 bytes.'
		)
	let seed = 0
	for (const character of assetId)
		seed = (seed * 31 + character.charCodeAt(0)) & 0xff
	const bytes = new Uint8Array(size)
	for (let index = 0; index < bytes.length; index += 1)
		bytes[index] = (seed + index * 17) & 0xff
	bytes.set([0x52, 0x49, 0x46, 0x46], 0)
	bytes.set([0x57, 0x45, 0x42, 0x50], 8)
	return new Blob([bytes], { type: 'image/webp' })
}
