import type { Database } from '~/../../shared/types/database'
import type { DiscogsArtistDb, DiscogsLabelDb } from '~/../../shared/types/discogs'

type Record = Database['public']['Tables']['records']['Row']

let recordIdCounter = 0

export function createMockRecord(overrides?: Partial<Record>): Record {
	recordIdCounter++
	const id = overrides?.id ?? `record-${recordIdCounter}`

	return {
		id,
		user_id: 'test-user-id',
		title: `Test Record ${recordIdCounter}`,
		artists: [{ discogs_id: 1, name: 'Test Artist', role: null }],
		labels: [{ discogs_id: 1, name: 'Test Label', catno: 'TEST001' }],
		year: 2024,
		cover: 'https://example.com/cover.jpg',
		discogs_id: recordIdCounter,
		discogs_release_url: `https://discogs.com/release/${recordIdCounter}`,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	}
}

export function createMockRecordWithArtists(
	artists: DiscogsArtistDb[],
	overrides?: Partial<Record>
): Record {
	return createMockRecord({ artists, ...overrides })
}

export function createMockRecordWithLabels(
	labels: DiscogsLabelDb[],
	overrides?: Partial<Record>
): Record {
	return createMockRecord({ labels, ...overrides })
}

// Predefined records for common test scenarios
export const mockRecords = {
	basicRecord: () =>
		createMockRecord({
			id: 'basic-record',
			title: 'Basic Record',
			artists: [{ discogs_id: 1, name: 'Artist One' }],
			labels: [{ discogs_id: 1, name: 'Label One', catno: 'LAB001' }]
		}),

	multiArtistRecord: () =>
		createMockRecord({
			id: 'multi-artist-record',
			title: 'Multi Artist Record',
			artists: [
				{ discogs_id: 1, name: 'Artist One' },
				{ discogs_id: 2, name: 'Artist Two' },
				{ discogs_id: 3, name: 'Artist Three' }
			]
		}),

	multiLabelRecord: () =>
		createMockRecord({
			id: 'multi-label-record',
			title: 'Multi Label Record',
			labels: [
				{ discogs_id: 1, name: 'Label One', catno: 'LAB001' },
				{ discogs_id: 2, name: 'Label Two', catno: 'LAB002' }
			]
		}),

	noCoverRecord: () =>
		createMockRecord({
			id: 'no-cover-record',
			title: 'No Cover Record',
			cover: null
		}),

	noDiscogsIdRecord: () =>
		createMockRecord({
			id: 'no-discogs-record',
			title: 'No Discogs ID Record',
			discogs_id: null,
			discogs_release_url: null
		})
}

// Reset counter between test files
export function resetRecordIdCounter() {
	recordIdCounter = 0
}
