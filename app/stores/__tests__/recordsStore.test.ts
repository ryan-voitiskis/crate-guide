import { createPinia, setActivePinia } from 'pinia'
import {
	createMockRecord,
	createMockRecordWithArtists,
	createMockRecordWithLabels,
	resetRecordIdCounter
} from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useRecordsStore } from '../recordsStore'

// Mock dependencies
const mockUserStore: {
	supaUser: { id: string } | null
	resolveAuthenticatedUserId: ReturnType<typeof vi.fn>
} = {
	supaUser: { id: 'test-user-id' },
	resolveAuthenticatedUserId: vi.fn()
}

// Create a chainable mock query builder
function createMockQueryBuilder() {
	const builder = {
		select: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
	return builder
}

let mockQueryBuilder = createMockQueryBuilder()

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder),
	rpc: vi.fn().mockResolvedValue({ data: null, error: null })
}

const mockCratesStore = {
	crates: [] as Array<{ id: string; name: string; records: string[] }>
}

const mockTracksStore = {
	tracks: [] as ReturnType<typeof createMockTrack>[],
	fetchAllTracks: vi.fn()
}

// Stub globals before importing the store
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)
vi.stubGlobal('useCratesStore', () => mockCratesStore)
vi.stubGlobal('useTracksStore', () => mockTracksStore)

describe('recordsStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetRecordIdCounter()
		setActivePinia(createPinia())

		// Reset mock query builder
		mockQueryBuilder = createMockQueryBuilder()
		mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
		mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null })
		mockCratesStore.crates = []
		mockTracksStore.tracks = []
		mockTracksStore.fetchAllTracks.mockResolvedValue(undefined)

		// Reset user store
		mockUserStore.supaUser = { id: 'test-user-id' }
		mockUserStore.resolveAuthenticatedUserId.mockImplementation(async () => {
			if (!mockUserStore.supaUser?.id) throw new Error('User not logged in.')
			return mockUserStore.supaUser.id
		})
	})

	describe('initial state', () => {
		it('starts with empty records array', () => {
			const store = useRecordsStore()
			expect(store.records).toEqual([])
		})

		it('starts with all loading states as false', () => {
			const store = useRecordsStore()
			expect(store.isLoadingRecords).toBe(false)
			expect(store.isCreatingRecord).toBe(false)
			expect(store.isUpdatingRecord).toBe(false)
			expect(store.isDeletingRecord).toBe(false)
		})

		it('starts with empty search state', () => {
			const store = useRecordsStore()
			expect(store.searchQuery).toBe('')
			expect(store.searchResults).toEqual([])
			expect(store.isSearching).toBe(false)
		})
	})

	describe('computed properties', () => {
		it('recordsCount returns correct count', () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecord(),
				createMockRecord(),
				createMockRecord()
			]

			expect(store.recordsCount).toBe(3)
		})

		it('hasRecords returns false when empty', () => {
			const store = useRecordsStore()
			expect(store.hasRecords).toBe(false)
		})

		it('hasRecords returns true when records exist', () => {
			const store = useRecordsStore()
			store.records = [createMockRecord()]

			expect(store.hasRecords).toBe(true)
		})

		it('hasSearchQuery returns false for empty query', () => {
			const store = useRecordsStore()
			expect(store.hasSearchQuery).toBe(false)
		})

		it('hasSearchQuery returns false for whitespace-only query', async () => {
			const store = useRecordsStore()
			await store.performSearch('   ')
			expect(store.hasSearchQuery).toBe(false)
		})

		it('hasSearchQuery returns true when query exists', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ title: 'Test' })]
			await store.performSearch('test')
			expect(store.hasSearchQuery).toBe(true)
		})

		it('hasSearchResults returns false when no results', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ title: 'House' })]
			await store.performSearch('techno')
			expect(store.hasSearchResults).toBe(false)
		})

		it('hasSearchResults returns true when results exist', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ title: 'House Music' })]
			await store.performSearch('house')
			expect(store.hasSearchResults).toBe(true)
		})

		it('resultsCount returns correct count', async () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecord({ title: 'House 1' }),
				createMockRecord({ title: 'House 2' }),
				createMockRecord({ title: 'Techno' })
			]
			await store.performSearch('house')
			expect(store.resultsCount).toBe(2)
		})

		it('displayedRecords returns all records when no search', () => {
			const store = useRecordsStore()
			const records = [createMockRecord(), createMockRecord()]
			store.records = records

			expect(store.displayedRecords).toEqual(records)
		})

		it('displayedRecords returns search results when searching', async () => {
			const store = useRecordsStore()
			const houseRecord = createMockRecord({
				id: 'house',
				title: 'House Music'
			})
			store.records = [houseRecord, createMockRecord({ title: 'Techno' })]

			await store.performSearch('house')

			expect(store.displayedRecords).toEqual([houseRecord])
		})
	})

	describe('fetchAllRecords', () => {
		it('does nothing when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useRecordsStore()

			await store.fetchAllRecords()

			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
		})

		it('sets isLoadingRecords during fetch', async () => {
			const store = useRecordsStore()
			mockQueryBuilder.order.mockResolvedValue({ data: [], error: null })

			const fetchPromise = store.fetchAllRecords()
			expect(store.isLoadingRecords).toBe(true)

			await fetchPromise
			expect(store.isLoadingRecords).toBe(false)
		})

		it('populates records from response', async () => {
			const store = useRecordsStore()
			const mockData = [
				createMockRecord({ id: 'record-1' }),
				createMockRecord({ id: 'record-2' })
			]
			mockQueryBuilder.order.mockResolvedValue({ data: mockData, error: null })

			await store.fetchAllRecords()

			expect(store.records.length).toBe(2)
			expect(store.records[0]!.id).toBe('record-1')
		})

		it('handles fetch error gracefully', async () => {
			const store = useRecordsStore()
			mockQueryBuilder.order.mockResolvedValue({
				data: null,
				error: new Error('Database error')
			})

			await store.fetchAllRecords()

			expect(store.records).toEqual([])
			expect(store.isLoadingRecords).toBe(false)
		})
	})

	describe('createRecord', () => {
		const newRecordData = {
			user_id: 'test-user-id',
			title: 'New Record',
			artists: [{ discogs_id: 1, name: 'Artist', role: null }],
			labels: [{ discogs_id: 1, name: 'Label', catno: 'CAT001' }],
			year: 2024,
			cover: null,
			discogs_id: 123,
			discogs_release_url: 'https://discogs.com/release/123'
		}

		it('returns null when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useRecordsStore()

			const result = await store.createRecord(newRecordData)

			expect(result).toBeNull()
		})

		it('adds created record to local state', async () => {
			const store = useRecordsStore()
			const createdRecord = createMockRecord({
				...newRecordData,
				id: 'new-record-id'
			})
			mockQueryBuilder.single.mockResolvedValue({
				data: createdRecord,
				error: null
			})

			const result = await store.createRecord(newRecordData)

			expect(result?.id).toBe('new-record-id')
			expect(store.records[0]!.id).toBe('new-record-id')
		})

		it('sets isCreatingRecord during creation', async () => {
			const store = useRecordsStore()
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockRecord(),
				error: null
			})

			const createPromise = store.createRecord(newRecordData)
			expect(store.isCreatingRecord).toBe(true)

			await createPromise
			expect(store.isCreatingRecord).toBe(false)
		})

		it('returns null on creation error', async () => {
			const store = useRecordsStore()
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Creation failed')
			})

			const result = await store.createRecord(newRecordData)

			expect(result).toBeNull()
		})
	})

	describe('createRecordWithTracks', () => {
		it('returns null when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useRecordsStore()

			const result = await store.createRecordWithTracks({
				title: 'Manual Record',
				tracks: []
			})

			expect(result).toBeNull()
			expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()
		})

		it('imports a manual record with tracks and refreshes local data', async () => {
			const store = useRecordsStore()
			const createdRecord = createMockRecord({
				id: 'manual-record-id',
				title: 'Manual Record'
			})

			mockSupabaseClient.rpc.mockResolvedValue({
				data: {
					success: true,
					record_id: 'manual-record-id',
					tracks_inserted: 2
				},
				error: null
			})
			mockQueryBuilder.order.mockResolvedValue({
				data: [createdRecord],
				error: null
			})

			const result = await store.createRecordWithTracks({
				title: 'Manual Record',
				artistName: 'Manual Artist',
				labelName: 'Manual Label',
				catno: 'MAN-001',
				year: 2026,
				cover: 'https://example.com/cover.jpg',
				defaultGenres: ['House'],
				defaultRpm: 45,
				tracks: [
					{
						title: 'First Track',
						position: 'A1',
						duration: 180000,
						bpm: 128,
						key: 0,
						mode: 1
					},
					{
						title: 'Second Track',
						artistName: 'Other Artist',
						position: 'B1'
					}
				]
			})

			expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
				'import_record_with_tracks',
				{
					record: expect.objectContaining({
						user_id: 'test-user-id',
						title: 'Manual Record',
						artists: [{ name: 'Manual Artist', role: null }],
						labels: [{ name: 'Manual Label', catno: 'MAN-001' }],
						year: 2026,
						cover: 'https://example.com/cover.jpg'
					}),
					tracks: [
						expect.objectContaining({
							title: 'First Track',
							position: 'A1',
							artists: [{ name: 'Manual Artist', role: null }],
							genres: ['House'],
							rpm: 45
						}),
						expect.objectContaining({
							title: 'Second Track',
							position: 'B1',
							artists: [{ name: 'Other Artist', role: null }],
							genres: ['House'],
							rpm: 45
						})
					]
				}
			)
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalled()
			expect(result?.id).toBe('manual-record-id')
			expect(store.records[0]!.id).toBe('manual-record-id')
		})

		it('returns null on RPC error', async () => {
			const store = useRecordsStore()
			mockSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: new Error('Import failed')
			})

			const result = await store.createRecordWithTracks({
				title: 'Manual Record',
				tracks: []
			})

			expect(result).toBeNull()
		})
	})

	describe('updateRecord', () => {
		it('returns null when record not found', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'existing-record' })]

			const result = await store.updateRecord('non-existent', {
				title: 'Updated'
			})

			expect(result).toBeNull()
		})

		it('performs optimistic update', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1', title: 'Original' })]

			const updatePromise = store.updateRecord('record-1', { title: 'Updated' })

			// Record should be optimistically updated
			expect(store.records[0]!.title).toBe('Updated')

			mockQueryBuilder.single.mockResolvedValue({
				data: createMockRecord({ id: 'record-1', title: 'Updated' }),
				error: null
			})

			await updatePromise
		})

		it('reverts on update error', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1', title: 'Original' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Update failed')
			})

			await store.updateRecord('record-1', { title: 'Updated' })

			expect(store.records[0]!.title).toBe('Original')
		})

		it('updates with server response on success', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1', title: 'Original' })]
			const serverResponse = createMockRecord({
				id: 'record-1',
				title: 'Updated',
				updated_at: '2024-01-01T00:00:00Z'
			})
			mockQueryBuilder.single.mockResolvedValue({
				data: serverResponse,
				error: null
			})

			await store.updateRecord('record-1', { title: 'Updated' })

			expect(store.records[0]!.updated_at).toBe('2024-01-01T00:00:00Z')
		})

		it('sets isUpdatingRecord during update', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockRecord({ id: 'record-1' }),
				error: null
			})

			const updatePromise = store.updateRecord('record-1', { title: 'Updated' })
			expect(store.isUpdatingRecord).toBe(true)

			await updatePromise
			expect(store.isUpdatingRecord).toBe(false)
		})
	})

	describe('deleteRecord', () => {
		it('returns false when record not found', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'existing-record' })]

			const result = await store.deleteRecord('non-existent')

			expect(result).toBe(false)
		})

		it('performs optimistic delete', async () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecord({ id: 'record-1' }),
				createMockRecord({ id: 'record-2' })
			]

			const deletePromise = store.deleteRecord('record-1')

			expect(store.records.length).toBe(1)
			expect(store.records[0]!.id).toBe('record-2')

			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })
			await deletePromise
		})

		it('reverts on delete error', async () => {
			const store = useRecordsStore()
			const record1 = createMockRecord({ id: 'record-1' })
			const record2 = createMockRecord({ id: 'record-2' })
			store.records = [record1, record2]
			mockQueryBuilder.eq.mockResolvedValue({
				data: null,
				error: new Error('Delete failed')
			})

			await store.deleteRecord('record-1')

			expect(store.records.length).toBe(2)
			expect(store.records[0]!.id).toBe('record-1')
		})

		it('returns true on successful delete', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]
			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })

			const result = await store.deleteRecord('record-1')

			expect(result).toBe(true)
			expect(store.records.length).toBe(0)
		})

		it('sets isDeletingRecord during delete', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]
			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })

			const deletePromise = store.deleteRecord('record-1')
			expect(store.isDeletingRecord).toBe(true)

			await deletePromise
			expect(store.isDeletingRecord).toBe(false)
		})
	})

	describe('removeRecordFromCollection', () => {
		it('calls the transactional cleanup RPC', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]

			await store.removeRecordFromCollection('record-1')

			expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
				'remove_record_from_collection',
				{ target_record_id: 'record-1' }
			)
		})

		it('removes the record from local records, search results, tracks, and crates on success', async () => {
			const store = useRecordsStore()
			const record = createMockRecord({ id: 'record-1', title: 'Record One' })
			store.records = [record, createMockRecord({ id: 'record-2' })]
			await store.performSearch('Record One')
			mockTracksStore.tracks = [
				createMockTrack({ id: 'track-1', record_id: 'record-1' }),
				createMockTrack({ id: 'track-2', record_id: 'record-2' })
			]
			mockCratesStore.crates = [
				{ id: 'crate-1', name: 'Crate One', records: ['record-1', 'record-2'] },
				{ id: 'crate-2', name: 'Crate Two', records: ['record-1'] }
			]

			const result = await store.removeRecordFromCollection('record-1')

			expect(result).toBe(true)
			expect(store.records.map((item) => item.id)).toEqual(['record-2'])
			expect(store.searchResults).toEqual([])
			expect(mockTracksStore.tracks.map((track) => track.id)).toEqual([
				'track-2'
			])
			expect(mockCratesStore.crates[0]?.records).toEqual(['record-2'])
			expect(mockCratesStore.crates[1]?.records).toEqual([])
		})

		it('keeps local state unchanged when the RPC fails', async () => {
			const store = useRecordsStore()
			const record = createMockRecord({ id: 'record-1' })
			const crateSnapshot = {
				id: 'crate-1',
				name: 'Crate One',
				records: ['record-1', 'record-2']
			}
			const trackSnapshot = createMockTrack({
				id: 'track-1',
				record_id: 'record-1'
			})
			store.records = [record]
			await store.performSearch(record.title)
			mockTracksStore.tracks = [trackSnapshot]
			mockCratesStore.crates = [crateSnapshot]
			mockSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: new Error('Cleanup failed')
			})

			const result = await store.removeRecordFromCollection('record-1')

			expect(result).toBe(false)
			expect(store.records).toEqual([record])
			expect(store.searchResults).toEqual([record])
			expect(mockTracksStore.tracks).toEqual([trackSnapshot])
			expect(mockCratesStore.crates).toEqual([crateSnapshot])
		})
	})

	describe('getRecordById', () => {
		it('returns undefined when record not found', () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]

			const result = store.getRecordById('non-existent')

			expect(result).toBeUndefined()
		})

		it('returns record when found', () => {
			const store = useRecordsStore()
			const record = createMockRecord({ id: 'record-1', title: 'Found Record' })
			store.records = [record]

			const result = store.getRecordById('record-1')

			expect(result?.title).toBe('Found Record')
		})
	})

	describe('getRecordsByIds', () => {
		it('returns empty array when no IDs match', () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]

			const result = store.getRecordsByIds(['record-2', 'record-3'])

			expect(result).toEqual([])
		})

		it('returns all matching records', () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecord({ id: 'record-1' }),
				createMockRecord({ id: 'record-2' }),
				createMockRecord({ id: 'record-3' })
			]

			const result = store.getRecordsByIds(['record-1', 'record-3'])

			expect(result.length).toBe(2)
			expect(result.map((r) => r.id)).toEqual(['record-1', 'record-3'])
		})
	})

	describe('performSearch', () => {
		it('clears results for empty query', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord()]

			await store.performSearch('')

			expect(store.searchResults).toEqual([])
		})

		it('clears results for whitespace-only query', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord()]

			await store.performSearch('   ')

			expect(store.searchResults).toEqual([])
		})

		it('sets searchQuery', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord()]

			await store.performSearch('test')

			expect(store.searchQuery).toBe('test')
		})

		it('searches in title (case-insensitive)', async () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecord({ id: 'match', title: 'Deep House EP' }),
				createMockRecord({ id: 'no-match', title: 'Techno Vibes' })
			]

			await store.performSearch('house')

			expect(store.searchResults.length).toBe(1)
			expect(store.searchResults[0]!.id).toBe('match')
		})

		it('searches in artists', async () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecordWithArtists(
					[{ discogs_id: 1, name: 'Daft Punk', role: null }],
					{ id: 'match' }
				),
				createMockRecordWithArtists(
					[{ discogs_id: 2, name: 'Aphex Twin', role: null }],
					{ id: 'no-match' }
				)
			]

			await store.performSearch('daft')

			expect(store.searchResults.length).toBe(1)
			expect(store.searchResults[0]!.id).toBe('match')
		})

		it('searches in labels', async () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecordWithLabels(
					[{ discogs_id: 1, name: 'Defected Records', catno: 'DEF001' }],
					{ id: 'match' }
				),
				createMockRecordWithLabels(
					[{ discogs_id: 2, name: 'Warp Records', catno: 'WAR001' }],
					{ id: 'no-match' }
				)
			]

			await store.performSearch('defected')

			expect(store.searchResults.length).toBe(1)
			expect(store.searchResults[0]!.id).toBe('match')
		})

		it('searches in year', async () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecord({ id: 'match', year: 2024 }),
				createMockRecord({ id: 'no-match', year: 2020 })
			]

			await store.performSearch('2024')

			expect(store.searchResults.length).toBe(1)
			expect(store.searchResults[0]!.id).toBe('match')
		})

		it('handles records with null year', async () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecord({ id: 'no-year', year: null }),
				createMockRecord({ id: 'with-year', year: 2024 })
			]

			await store.performSearch('2024')

			expect(store.searchResults.length).toBe(1)
			expect(store.searchResults[0]!.id).toBe('with-year')
		})

		it('sets isSearching during search', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord()]

			// Since the search is synchronous, we can't really test the loading state
			// But we verify it's false after search completes
			await store.performSearch('test')

			expect(store.isSearching).toBe(false)
		})
	})

	describe('clearSearch', () => {
		it('clears searchQuery', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ title: 'Test' })]
			await store.performSearch('test')

			store.clearSearch()

			expect(store.searchQuery).toBe('')
		})

		it('clears searchResults', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ title: 'Test' })]
			await store.performSearch('test')

			store.clearSearch()

			expect(store.searchResults).toEqual([])
		})
	})

	describe('clearRecords', () => {
		it('empties records array', () => {
			const store = useRecordsStore()
			store.records = [createMockRecord(), createMockRecord()]

			store.clearRecords()

			expect(store.records).toEqual([])
		})

		it('clears search state', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ title: 'Test' })]
			await store.performSearch('test')

			store.clearRecords()

			expect(store.searchQuery).toBe('')
			expect(store.searchResults).toEqual([])
		})
	})
})
