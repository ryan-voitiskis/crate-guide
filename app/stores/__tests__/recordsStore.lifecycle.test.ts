import {
	createMockRecord as createMockDatabaseRecord,
	createMockLibraryRecord as createMockRecord,
	createMockLibraryRecordWithArtists as createMockRecordWithArtists,
	createMockLibraryRecordWithLabels as createMockRecordWithLabels
} from 'test/mocks/fixtures/records'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createRecordsStore,
	mockQueryBuilder,
	resetRecordsStoreHarness
} from './recordsStoreTestHarness'

describe('recordsStore account lifecycle and queries', () => {
	beforeEach(resetRecordsStoreHarness)
	afterEach(() => vi.useRealTimers())

	describe('getRecordById', () => {
		it('returns undefined when record not found', () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]

			const result = store.getRecordById('non-existent')

			expect(result).toBeUndefined()
		})

		it('returns record when found', () => {
			const store = createRecordsStore()
			const record = createMockRecord({ id: 'record-1', title: 'Found Record' })
			store.records = [record]

			const result = store.getRecordById('record-1')

			expect(result?.title).toBe('Found Record')
		})

		it('rebuilds the index after replacement, additions, removals, and reset', () => {
			const store = createRecordsStore()
			const original = createMockRecord({
				id: 'record-1',
				title: 'Original'
			})
			store.records = [original]

			expect(store.getRecordById('record-1')?.title).toBe('Original')

			const replacement = createMockRecord({
				id: 'record-1',
				title: 'Replacement'
			})
			store.records = [replacement]
			expect(store.getRecordById('record-1')?.title).toBe('Replacement')

			const added = createMockRecord({ id: 'record-2' })
			store.records.push(added)
			expect(store.getRecordById('record-2')?.id).toBe(added.id)

			store.records.splice(0, 1)
			expect(store.getRecordById('record-1')).toBeUndefined()

			store.clearRecords()
			expect(store.getRecordById('record-2')).toBeUndefined()
		})
	})

	describe('getRecordsByIds', () => {
		it('returns empty array when no IDs match', () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]

			const result = store.getRecordsByIds(['record-2', 'record-3'])

			expect(result).toEqual([])
		})

		it('omits missing IDs and preserves requested order', () => {
			const store = createRecordsStore()
			store.records = [
				createMockRecord({ id: 'record-1' }),
				createMockRecord({ id: 'record-2' }),
				createMockRecord({ id: 'record-3' })
			]

			const result = store.getRecordsByIds([
				'record-3',
				'missing',
				'record-1',
				'record-2'
			])

			expect(result.map((record) => record.id)).toEqual([
				'record-3',
				'record-1',
				'record-2'
			])
		})
	})

	describe('performSearch', () => {
		it('clears results for empty query', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord()]

			await store.performSearch('')

			expect(store.searchResults).toEqual([])
		})

		it('clears results for whitespace-only query', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord()]

			await store.performSearch('   ')

			expect(store.searchResults).toEqual([])
		})

		it('sets searchQuery', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord()]

			await store.performSearch('test')

			expect(store.searchQuery).toBe('test')
		})

		it('searches in title (case-insensitive)', async () => {
			const store = createRecordsStore()
			store.records = [
				createMockRecord({ id: 'match', title: 'Deep House EP' }),
				createMockRecord({ id: 'no-match', title: 'Techno Vibes' })
			]

			await store.performSearch('house')

			expect(store.searchResults.length).toBe(1)
			expect(store.searchResults[0]!.id).toBe('match')
		})

		it('searches in artists', async () => {
			const store = createRecordsStore()
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
			const store = createRecordsStore()
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

		it('normalizes the query and searches catalogue numbers', async () => {
			const store = createRecordsStore()
			store.records = [
				createMockRecordWithLabels(
					[{ discogs_id: 1, name: 'Defected Records', catno: 'DEF001' }],
					{ id: 'match' }
				)
			]

			await store.performSearch('  dEf001  ')

			expect(store.searchQuery).toBe('def001')
			expect(store.searchResults.map(({ id }) => id)).toEqual(['match'])
		})

		it('searches in year', async () => {
			const store = createRecordsStore()
			store.records = [
				createMockRecord({ id: 'match', year: 2024 }),
				createMockRecord({ id: 'no-match', year: 2020 })
			]

			await store.performSearch('2024')

			expect(store.searchResults.length).toBe(1)
			expect(store.searchResults[0]!.id).toBe('match')
		})

		it('handles records with null year', async () => {
			const store = createRecordsStore()
			store.records = [
				createMockRecord({ id: 'no-year', year: null }),
				createMockRecord({ id: 'with-year', year: 2024 })
			]

			await store.performSearch('2024')

			expect(store.searchResults.length).toBe(1)
			expect(store.searchResults[0]!.id).toBe('with-year')
		})

		it('sets isSearching during search', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord()]

			// Since the search is synchronous, we can't really test the loading state
			// But we verify it's false after search completes
			await store.performSearch('test')

			expect(store.isSearching).toBe(false)
		})

		it('derives an active result set after update and delete', async () => {
			const created = createMockRecord({
				id: 'record-1',
				title: 'Deep House'
			})
			const noLongerMatching = createMockDatabaseRecord({
				id: 'record-1',
				title: 'Ambient'
			})
			const matchingAgain = createMockDatabaseRecord({
				id: 'record-1',
				title: 'House Again'
			})
			mockQueryBuilder.single
				.mockResolvedValueOnce({ data: noLongerMatching, error: null })
				.mockResolvedValueOnce({ data: matchingAgain, error: null })
			const store = createRecordsStore()
			store.records = [created]
			await store.performSearch('house')

			expect(store.searchResults.map(({ id }) => id)).toEqual(['record-1'])

			await store.updateRecord('record-1', { title: 'Ambient' })
			expect(store.searchResults).toEqual([])

			await store.updateRecord('record-1', { title: 'House Again' })
			expect(store.searchResults.map(({ id }) => id)).toEqual(['record-1'])

			await store.removeRecordFromCollection('record-1')
			expect(store.searchResults).toEqual([])
		})
	})

	describe('clearSearch', () => {
		it('clears searchQuery', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ title: 'Test' })]
			await store.performSearch('test')

			store.clearSearch()

			expect(store.searchQuery).toBe('')
		})

		it('clears searchResults', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ title: 'Test' })]
			await store.performSearch('test')

			store.clearSearch()

			expect(store.searchResults).toEqual([])
		})
	})

	describe('clearRecords', () => {
		it('empties records array', () => {
			const store = createRecordsStore()
			store.records = [createMockRecord(), createMockRecord()]

			store.clearRecords()

			expect(store.records).toEqual([])
		})

		it('clears search state', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ title: 'Test' })]
			await store.performSearch('test')

			store.clearRecords()

			expect(store.searchQuery).toBe('')
			expect(store.searchResults).toEqual([])
		})

		it('clears all mutation activity and stale finalizers cannot relight it', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]
			const operations = [
				store.updateRecord('record-1', { title: 'Updated' }),
				store.updateRecordWithCover('record-1', {}, { type: 'remove' }),
				store.removeRecordFromCollection('record-1')
			]
			expect(store.isCreatingRecord).toBe(false)
			expect(store.isUpdatingRecord).toBe(true)
			expect(store.isUpdatingCover).toBe(true)
			expect(store.isDeletingRecord).toBe(true)

			store.clearRecords()
			expect(store.isCreatingRecord).toBe(false)
			expect(store.isUpdatingRecord).toBe(false)
			expect(store.isUpdatingCover).toBe(false)
			expect(store.isDeletingRecord).toBe(false)

			await Promise.all(operations)
			expect(store.isCreatingRecord).toBe(false)
			expect(store.isUpdatingRecord).toBe(false)
			expect(store.isUpdatingCover).toBe(false)
			expect(store.isDeletingRecord).toBe(false)
		})
	})
})
