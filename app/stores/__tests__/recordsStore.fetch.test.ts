import { createMockRecord } from 'test/mocks/fixtures/records'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createDeferred,
	createRecordsStore,
	mockQueryBuilder,
	mockSupabaseClient,
	mockToast,
	mockUserStore,
	resetRecordsStoreHarness
} from './recordsStoreTestHarness'

describe('recordsStore fetch and reconciliation', () => {
	beforeEach(resetRecordsStoreHarness)
	afterEach(() => vi.useRealTimers())

	describe('initial state', () => {
		it('starts with empty records array', () => {
			const store = createRecordsStore()
			expect(store.records).toEqual([])
		})

		it('starts with all loading states as false', () => {
			const store = createRecordsStore()
			expect(store.isLoadingRecords).toBe(false)
			expect(store.isCreatingRecord).toBe(false)
			expect(store.isUpdatingRecord).toBe(false)
			expect(store.isUpdatingCover).toBe(false)
			expect(store.isDeletingRecord).toBe(false)
		})

		it('starts with empty search state', () => {
			const store = createRecordsStore()
			expect(store.searchQuery).toBe('')
			expect(store.searchResults).toEqual([])
			expect(store.isSearching).toBe(false)
		})
	})

	describe('computed properties', () => {
		it('recordsCount returns correct count', () => {
			const store = createRecordsStore()
			store.records = [
				createMockRecord(),
				createMockRecord(),
				createMockRecord()
			]

			expect(store.recordsCount).toBe(3)
		})

		it('hasRecords returns false when empty', () => {
			const store = createRecordsStore()
			expect(store.hasRecords).toBe(false)
		})

		it('hasRecords returns true when records exist', () => {
			const store = createRecordsStore()
			store.records = [createMockRecord()]

			expect(store.hasRecords).toBe(true)
		})

		it('hasSearchQuery returns false for empty query', () => {
			const store = createRecordsStore()
			expect(store.hasSearchQuery).toBe(false)
		})

		it('hasSearchQuery returns false for whitespace-only query', async () => {
			const store = createRecordsStore()
			await store.performSearch('   ')
			expect(store.hasSearchQuery).toBe(false)
		})

		it('hasSearchQuery returns true when query exists', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ title: 'Test' })]
			await store.performSearch('test')
			expect(store.hasSearchQuery).toBe(true)
		})

		it('hasSearchResults returns false when no results', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ title: 'House' })]
			await store.performSearch('techno')
			expect(store.hasSearchResults).toBe(false)
		})

		it('hasSearchResults returns true when results exist', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ title: 'House Music' })]
			await store.performSearch('house')
			expect(store.hasSearchResults).toBe(true)
		})

		it('resultsCount returns correct count', async () => {
			const store = createRecordsStore()
			store.records = [
				createMockRecord({ title: 'House 1' }),
				createMockRecord({ title: 'House 2' }),
				createMockRecord({ title: 'Techno' })
			]
			await store.performSearch('house')
			expect(store.resultsCount).toBe(2)
		})

		it('displayedRecords returns all records when no search', () => {
			const store = createRecordsStore()
			const records = [createMockRecord(), createMockRecord()]
			store.records = records

			expect(store.displayedRecords).toEqual(records)
		})

		it('displayedRecords returns search results when searching', async () => {
			const store = createRecordsStore()
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
		it('returns false and preserves records when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = createRecordsStore()
			const existingRecord = createMockRecord({ id: 'existing-record' })
			store.records = [existingRecord]

			const result = await store.fetchAllRecords()

			expect(result).toBe(false)
			expect(store.records).toEqual([existingRecord])
			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
			expect(store.isLoadingRecords).toBe(false)
		})

		it('returns true for a successful empty response and resets loading', async () => {
			const store = createRecordsStore()
			mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null })

			const fetchPromise = store.fetchAllRecords()
			expect(store.isLoadingRecords).toBe(true)

			await expect(fetchPromise).resolves.toBe(true)
			expect(store.records).toEqual([])
			expect(store.isLoadingRecords).toBe(false)
		})

		it('returns true and populates records from a non-empty response', async () => {
			const store = createRecordsStore()
			const mockData = [
				createMockRecord({
					id: 'record-2',
					created_at: '2026-07-12T00:00:00.000001Z'
				}),
				createMockRecord({
					id: 'record-1',
					created_at: '2026-07-12T00:00:00.000002Z'
				})
			]
			mockQueryBuilder.limit.mockResolvedValue({ data: mockData, error: null })

			const result = await store.fetchAllRecords()

			expect(result).toBe(true)
			expect(store.records.length).toBe(2)
			expect(store.records[0]!.id).toBe('record-1')
		})

		it('keeps records empty when a cleared fetch resolves successfully', async () => {
			const oldResult = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			mockQueryBuilder.limit.mockReturnValueOnce(oldResult.promise)
			const store = createRecordsStore()

			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			store.clearRecords()
			expect(store.isLoadingRecords).toBe(false)

			oldResult.resolve({
				data: [createMockRecord({ id: 'old-record' })],
				error: null
			})
			await expect(oldFetch).resolves.toBe(false)
			expect(store.records).toEqual([])
			expect(store.isLoadingRecords).toBe(false)
		})

		it('silences a cleared fetch error', async () => {
			const oldResult = createDeferred<{
				data: null
				error: Error
			}>()
			mockQueryBuilder.limit.mockReturnValueOnce(oldResult.promise)
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			const store = createRecordsStore()

			try {
				const oldFetch = store.fetchAllRecords()
				await vi.waitFor(() =>
					expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
				)
				store.clearRecords()
				oldResult.resolve({
					data: null,
					error: new Error('Old request failed')
				})

				await expect(oldFetch).resolves.toBe(false)
				expect(consoleError).not.toHaveBeenCalledWith(
					'Failed to fetch records:',
					expect.anything()
				)
				expect(mockToast.error).not.toHaveBeenCalled()
			} finally {
				consoleError.mockRestore()
			}
		})

		it('keeps only replacement-account records when its fetch wins', async () => {
			const oldResult = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			const newResult = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			mockQueryBuilder.limit
				.mockReturnValueOnce(oldResult.promise)
				.mockReturnValueOnce(newResult.promise)
			const store = createRecordsStore()

			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			store.clearRecords()
			mockUserStore.supaUser = { id: 'user-b' }
			const newFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)

			newResult.resolve({
				data: [createMockRecord({ id: 'new-record', user_id: 'user-b' })],
				error: null
			})
			await expect(newFetch).resolves.toBe(true)
			oldResult.resolve({
				data: [createMockRecord({ id: 'old-record' })],
				error: null
			})
			await expect(oldFetch).resolves.toBe(false)

			expect(store.records.map((record) => record.id)).toEqual(['new-record'])
			expect(store.isLoadingRecords).toBe(false)
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('does not let an old finally clear the replacement fetch slot', async () => {
			const oldResult = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			const newResult = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			mockQueryBuilder.limit
				.mockReturnValueOnce(oldResult.promise)
				.mockReturnValueOnce(newResult.promise)
			const store = createRecordsStore()

			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			store.clearRecords()
			mockUserStore.supaUser = { id: 'user-b' }
			const newFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)

			oldResult.resolve({ data: [], error: null })
			await expect(oldFetch).resolves.toBe(false)
			expect(store.isLoadingRecords).toBe(true)
			const concurrentFetch = store.fetchAllRecords()
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)

			newResult.resolve({ data: [], error: null })
			await expect(Promise.all([newFetch, concurrentFetch])).resolves.toEqual([
				true,
				true
			])
			expect(store.isLoadingRecords).toBe(false)
		})

		it('does not commit a partial paginated fetch invalidated between pages', async () => {
			const secondPage = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) =>
						createMockRecord({
							id: `old-record-${String(1000 - index).padStart(4, '0')}`
						})
					),
					error: null
				})
				.mockReturnValueOnce(secondPage.promise)
			const store = createRecordsStore()

			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)
			store.clearRecords()
			secondPage.resolve({
				data: [createMockRecord({ id: 'old-record-0000' })],
				error: null
			})

			await expect(oldFetch).resolves.toBe(false)
			expect(store.records).toEqual([])
			expect(store.isLoadingRecords).toBe(false)
		})

		it('loads 1001 records with stable ordering and exact keyset pages', async () => {
			const store = createRecordsStore()
			const firstPage = Array.from({ length: 1000 }, (_, index) =>
				createMockRecord({
					id: `record-${String(1001 - index).padStart(4, '0')}`,
					created_at: '2026-07-12T00:00:00.000Z'
				})
			)
			const secondPage = [
				createMockRecord({
					id: 'record-0001',
					created_at: '2026-07-12T00:00:00.000Z'
				})
			]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({ data: firstPage, error: null })
				.mockResolvedValueOnce({ data: secondPage, error: null })

			await expect(store.fetchAllRecords()).resolves.toBe(true)

			expect(store.records.map((record) => record.id)).toEqual([
				...firstPage.map((record) => record.id),
				'record-0001'
			])
			expect(mockQueryBuilder.order.mock.calls).toEqual([
				['id', { ascending: false }],
				['id', { ascending: false }]
			])
			expect(mockQueryBuilder.lt.mock.calls).toEqual([['id', 'record-0002']])
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])
		})

		it('restores exact timestamp presentation order after ID traversal', async () => {
			const store = createRecordsStore()
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					createMockRecord({
						id: 'record-z-invalid',
						created_at: 'invalid'
					}),
					createMockRecord({ id: 'record-y-null', created_at: null }),
					createMockRecord({
						id: 'record-x-tie',
						created_at: '2026-07-19T14:00:00.123456+10:00'
					}),
					createMockRecord({
						id: 'record-w-newest',
						created_at: '2026-07-19T04:00:00.123457Z'
					}),
					createMockRecord({
						id: 'record-v-tie',
						created_at: '2026-07-18 20:00:00.123456-08:00'
					}),
					createMockRecord({
						id: 'record-u-older',
						created_at: '2026-07-19T04:00:00.123455Z'
					})
				],
				error: null
			})

			await expect(store.fetchAllRecords()).resolves.toBe(true)

			expect(store.records.map(({ id }) => id)).toEqual([
				'record-w-newest',
				'record-x-tie',
				'record-v-tie',
				'record-u-older',
				'record-z-invalid',
				'record-y-null'
			])
		})

		it('preserves prior records when a later page fails', async () => {
			const store = createRecordsStore()
			const existingRecord = createMockRecord({ id: 'existing-record' })
			store.records = [existingRecord]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) =>
						createMockRecord({
							id: `record-${String(1000 - index).padStart(4, '0')}`
						})
					),
					error: null
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Second page failed')
				})

			await expect(store.fetchAllRecords()).resolves.toBe(false)
			expect(store.records).toEqual([existingRecord])
			expect(mockQueryBuilder.lt).toHaveBeenCalledWith('id', 'record-0001')
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])
		})

		it('aggregates malformed JSON fallbacks into one redacted warning', async () => {
			const privateValue = 'SYNTHETIC_PRIVATE_VALUE'
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = createRecordsStore()
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					createMockRecord({
						id: 'record-invalid-labels',
						labels: [{ name: privateValue, discogs_id: Number.NaN }]
					}),
					createMockRecord({
						id: 'record-invalid-artists',
						artists: [
							{
								name: privateValue,
								discogs_id: Infinity
							}
						]
					})
				],
				error: null
			})

			try {
				await expect(store.fetchAllRecords()).resolves.toBe(true)

				expect(store.records[0]!.labels).toEqual([])
				expect(store.records[1]!.artists).toEqual([])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(consoleWarn).toHaveBeenCalledWith(
					'Invalid saved data was reset to safe defaults',
					[
						{
							entity: 'record',
							id: 'record-invalid-labels',
							field: 'labels'
						},
						{
							entity: 'record',
							id: 'record-invalid-artists',
							field: 'artists'
						}
					]
				)
				expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain(
					privateValue
				)
				expect(mockToast.warning).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledWith(
					'Some saved data was reset to safe defaults.'
				)
			} finally {
				consoleWarn.mockRestore()
			}
		})

		it('returns false, preserves records on query failure, and can retry', async () => {
			const store = createRecordsStore()
			const existingRecord = createMockRecord({ id: 'existing-record' })
			store.records = [existingRecord]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Database error')
				})
				.mockResolvedValueOnce({ data: [], error: null })

			await expect(store.fetchAllRecords()).resolves.toBe(false)

			expect(store.records).toEqual([existingRecord])
			expect(store.isLoadingRecords).toBe(false)

			await expect(store.fetchAllRecords()).resolves.toBe(true)
			expect(store.records).toEqual([])
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('shares one operation between concurrent callers and starts fresh later', async () => {
			const store = createRecordsStore()
			let resolveQuery!: (value: {
				data: DatabaseRecord[]
				error: null
			}) => void
			const queryResult = new Promise<{ data: DatabaseRecord[]; error: null }>(
				(resolve) => {
					resolveQuery = resolve
				}
			)
			mockQueryBuilder.limit.mockReturnValue(queryResult)

			const firstFetch = store.fetchAllRecords()
			const concurrentFetch = store.fetchAllRecords()
			expect(store.isLoadingRecords).toBe(true)

			resolveQuery({ data: [], error: null })
			await expect(Promise.all([firstFetch, concurrentFetch])).resolves.toEqual(
				[true, true]
			)
			expect(mockUserStore.resolveAuthenticatedUserId).toHaveBeenCalledOnce()
			expect(mockSupabaseClient.from).toHaveBeenCalledOnce()
			expect(store.isLoadingRecords).toBe(false)

			mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null })
			await expect(store.fetchAllRecords()).resolves.toBe(true)
			expect(mockUserStore.resolveAuthenticatedUserId).toHaveBeenCalledTimes(2)
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('waits for an older traversal and coalesces simultaneous fresh callers', async () => {
			const oldResponse = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			const freshResponse = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			mockQueryBuilder.limit
				.mockReturnValueOnce(oldResponse.promise)
				.mockReturnValueOnce(freshResponse.promise)
			const store = createRecordsStore()

			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			const firstFresh = store.fetchAllRecords({ fresh: true })
			const secondFresh = store.fetchAllRecords({ fresh: true })
			expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()

			oldResponse.resolve({ data: [], error: null })
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)
			freshResponse.resolve({ data: [], error: null })

			await expect(
				Promise.all([oldFetch, firstFresh, secondFresh])
			).resolves.toEqual([true, true, true])
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})
	})
})
