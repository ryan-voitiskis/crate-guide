import { createPinia, setActivePinia } from 'pinia'
import {
	createMockRecord,
	createMockRecordWithArtists,
	createMockRecordWithLabels,
	resetRecordIdCounter
} from 'test/mocks/fixtures/records'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markDemoWorkbenchPinia } from '~/utils/workbenchPinia'
// Import after mocking
import { COVER_CLEANUP_MAX_PAGES, useRecordsStore } from '../recordsStore'

const mockToast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: mockToast
}))

const mockProcessRecordCoverFile = vi.hoisted(() => vi.fn())

vi.mock('~/utils/recordCover', async (importOriginal) => ({
	...(await importOriginal<typeof import('~/utils/recordCover')>()),
	processRecordCoverFile: mockProcessRecordCoverFile
}))

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
		range: vi.fn().mockResolvedValue({ data: [], error: null }),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
	return builder
}

let mockQueryBuilder = createMockQueryBuilder()

const mockStorageBucket = {
	upload: vi.fn().mockResolvedValue({ data: null, error: null }),
	remove: vi.fn().mockResolvedValue({ data: null, error: null })
}

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder),
	rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
	functions: {
		invoke: vi.fn().mockResolvedValue({ data: null, error: null })
	},
	storage: {
		from: vi.fn(() => mockStorageBucket)
	}
}

const mockTracksStore = {
	fetchAllTracks: vi.fn()
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

function cleanupResponse(processed = 0, removed = processed) {
	return {
		data: { processed, removed, deferred: 0 },
		error: null
	}
}

function expectCleanupInvocationsWithoutBodies(count: number) {
	expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledTimes(count)
	for (let callIndex = 1; callIndex <= count; callIndex += 1) {
		expect(mockSupabaseClient.functions.invoke).toHaveBeenNthCalledWith(
			callIndex,
			'cleanup-record-covers'
		)
	}
}

// Stub globals before importing the store
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)
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
		mockSupabaseClient.functions.invoke
			.mockReset()
			.mockResolvedValue(cleanupResponse())
		mockSupabaseClient.storage.from.mockReturnValue(mockStorageBucket)
		mockStorageBucket.upload.mockResolvedValue({ data: null, error: null })
		mockStorageBucket.remove.mockResolvedValue({ data: null, error: null })
		mockProcessRecordCoverFile.mockResolvedValue(
			new Blob(['processed-cover'], { type: 'image/webp' })
		)
		mockTracksStore.fetchAllTracks.mockResolvedValue(true)

		// Reset user store
		mockUserStore.supaUser = { id: 'test-user-id' }
		mockUserStore.resolveAuthenticatedUserId.mockImplementation(async () => {
			if (!mockUserStore.supaUser?.id) throw new Error('User not logged in.')
			return mockUserStore.supaUser.id
		})
	})

	afterEach(() => {
		vi.useRealTimers()
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
			expect(store.isUpdatingCover).toBe(false)
			expect(store.isDeletingRecord).toBe(false)
		})

		it('starts with empty search state', () => {
			const store = useRecordsStore()
			expect(store.searchQuery).toBe('')
			expect(store.searchResults).toEqual([])
			expect(store.isSearching).toBe(false)
		})
	})

	describe('updateRecordWithCover', () => {
		it('shares one full in-flight drain across concurrent callers', async () => {
			const store = useRecordsStore()
			const fullPage = createDeferred<ReturnType<typeof cleanupResponse>>()
			const finalPage = createDeferred<ReturnType<typeof cleanupResponse>>()
			mockSupabaseClient.functions.invoke
				.mockReturnValueOnce(fullPage.promise)
				.mockReturnValueOnce(finalPage.promise)

			const firstDrain = store.drainCoverCleanup()
			const concurrentDrain = store.drainCoverCleanup()

			await vi.waitFor(() => {
				expectCleanupInvocationsWithoutBodies(1)
			})
			fullPage.resolve(cleanupResponse(100))
			await vi.waitFor(() => {
				expectCleanupInvocationsWithoutBodies(2)
			})
			finalPage.resolve(cleanupResponse(1))

			await expect(Promise.all([firstDrain, concurrentDrain])).resolves.toEqual(
				[true, true]
			)
			expectCleanupInvocationsWithoutBodies(2)
		})

		it('drains a 101-job backlog across a full and short page', async () => {
			const store = useRecordsStore()
			mockSupabaseClient.functions.invoke
				.mockResolvedValueOnce(cleanupResponse(100))
				.mockResolvedValueOnce(cleanupResponse(1))

			await expect(store.drainCoverCleanup()).resolves.toBe(true)

			expectCleanupInvocationsWithoutBodies(2)
		})

		it('confirms an exact 100-job backlog with one empty page', async () => {
			const store = useRecordsStore()
			mockSupabaseClient.functions.invoke
				.mockResolvedValueOnce(cleanupResponse(100))
				.mockResolvedValueOnce(cleanupResponse())

			await expect(store.drainCoverCleanup()).resolves.toBe(true)

			expectCleanupInvocationsWithoutBodies(2)
		})

		it('stops after one short page', async () => {
			const store = useRecordsStore()
			mockSupabaseClient.functions.invoke.mockResolvedValueOnce(
				cleanupResponse(7, 4)
			)

			await expect(store.drainCoverCleanup()).resolves.toBe(true)

			expectCleanupInvocationsWithoutBodies(1)
		})

		it.each([
			null,
			{},
			{ processed: '1', removed: 1, deferred: 0 },
			{ processed: -1, removed: 0, deferred: 0 },
			{ processed: 101, removed: 0, deferred: 0 },
			{ processed: 1, removed: 2, deferred: 0 },
			{ processed: 1, removed: 1, deferred: 1 },
			{ processed: Number.MAX_SAFE_INTEGER + 1, removed: 0, deferred: 0 }
		])(
			'rejects malformed cleanup counts without exposing details: %j',
			async (data) => {
				vi.useFakeTimers()
				const store = useRecordsStore()
				mockSupabaseClient.functions.invoke.mockResolvedValue({
					data,
					error: null
				})

				const drain = store.drainCoverCleanup()
				await vi.runAllTimersAsync()

				await expect(drain).resolves.toBe(false)
				expectCleanupInvocationsWithoutBodies(3)
				expect(mockToast.warning).toHaveBeenCalledOnce()
			}
		)

		it('recovers from a transient page failure after the first backoff', async () => {
			vi.useFakeTimers()
			const store = useRecordsStore()
			mockSupabaseClient.functions.invoke
				.mockResolvedValueOnce({
					data: null,
					error: new Error('private failure')
				})
				.mockResolvedValueOnce(cleanupResponse(1))

			const drain = store.drainCoverCleanup()
			await vi.advanceTimersByTimeAsync(0)
			expectCleanupInvocationsWithoutBodies(1)
			await vi.advanceTimersByTimeAsync(249)
			expectCleanupInvocationsWithoutBodies(1)
			await vi.advanceTimersByTimeAsync(1)

			await expect(drain).resolves.toBe(true)
			expectCleanupInvocationsWithoutBodies(2)
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('warns once only after bounded retries are exhausted', async () => {
			vi.useFakeTimers()
			const store = useRecordsStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: new Error('private failure')
			})

			const drain = store.drainCoverCleanup()
			await vi.runAllTimersAsync()

			await expect(drain).resolves.toBe(false)
			expectCleanupInvocationsWithoutBodies(3)
			expect(mockToast.warning).toHaveBeenCalledOnce()
			expect(mockToast.warning).toHaveBeenCalledWith(
				'Some old cover files still need cleanup.'
			)
		})

		it('returns false when the separate client page cap is reached', async () => {
			const store = useRecordsStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue(
				cleanupResponse(100)
			)

			await expect(store.drainCoverCleanup()).resolves.toBe(false)

			expectCleanupInvocationsWithoutBodies(COVER_CLEANUP_MAX_PAGES)
			expect(mockToast.warning).toHaveBeenCalledOnce()
		})

		it('does not invoke cleanup while signed out', async () => {
			mockUserStore.supaUser = null
			const store = useRecordsStore()

			await expect(store.drainCoverCleanup()).resolves.toBe(false)

			expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled()
		})

		it('does not invoke cleanup from the demo workbench store', async () => {
			setActivePinia(markDemoWorkbenchPinia(createPinia()))
			const store = useRecordsStore()

			await expect(store.drainCoverCleanup()).resolves.toBe(true)

			expect(mockUserStore.resolveAuthenticatedUserId).not.toHaveBeenCalled()
			expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled()
		})

		it('cancels an in-flight page without stale retries or warnings on reset', async () => {
			const oldDrainResult =
				createDeferred<ReturnType<typeof cleanupResponse>>()
			mockSupabaseClient.functions.invoke.mockReturnValueOnce(
				oldDrainResult.promise
			)
			const store = useRecordsStore()
			const oldDrain = store.drainCoverCleanup()
			await vi.waitFor(() => {
				expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledOnce()
			})

			store.clearRecords()
			oldDrainResult.resolve(cleanupResponse(100))
			await expect(oldDrain).resolves.toBe(false)
			expectCleanupInvocationsWithoutBodies(1)
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('cancels retry backoff without another request or stale warning on reset', async () => {
			vi.useFakeTimers()
			const store = useRecordsStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: new Error('private failure')
			})

			const drain = store.drainCoverCleanup()
			await vi.advanceTimersByTimeAsync(0)
			expectCleanupInvocationsWithoutBodies(1)
			store.clearRecords()
			await vi.runAllTimersAsync()

			await expect(drain).resolves.toBe(false)
			expectCleanupInvocationsWithoutBodies(1)
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('uploads an immutable WebP path and persists it on the record', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1', cover: null })]
			mockQueryBuilder.single.mockImplementation(async () => {
				const uploadedPath = mockStorageBucket.upload.mock.calls[0]?.[0]
				return {
					data: createMockRecord({
						id: 'record-1',
						title: 'Updated',
						cover: null,
						cover_storage_path: uploadedPath
					}),
					error: null
				}
			})

			const file = { name: 'cover.png' } as File
			const result = await store.updateRecordWithCover(
				'record-1',
				{ title: 'Updated' },
				{
					type: 'upload',
					file,
					crop: { positionX: 40, positionY: 60 }
				}
			)

			expect(mockProcessRecordCoverFile).toHaveBeenCalledWith(file, {
				positionX: 40,
				positionY: 60
			})
			const [path, blob, options] = mockStorageBucket.upload.mock.calls[0]!
			expect(path).toMatch(/^test-user-id\/record-1\/[0-9a-f-]+\.webp$/)
			expect(blob.type).toBe('image/webp')
			expect(options).toMatchObject({
				cacheControl: '300',
				contentType: 'image/webp',
				upsert: false
			})
			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				title: 'Updated',
				cover_storage_path: path
			})
			expect(result?.cover_storage_path).toBe(path)
			expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
				'cleanup-record-covers'
			)
			expect(store.isUpdatingCover).toBe(false)
		})

		it('removes the new object when the database update fails', async () => {
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Update failed')
			})

			const result = await store.updateRecordWithCover(
				'record-1',
				{},
				{
					type: 'upload',
					file: { name: 'cover.png' } as File,
					crop: { positionX: 50, positionY: 50 }
				}
			)

			const uploadedPath = mockStorageBucket.upload.mock.calls[0]?.[0]
			expect(result).toBeNull()
			expect(mockStorageBucket.remove).toHaveBeenCalledWith([uploadedPath])
			expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled()
		})

		it('drains the durable queue after a successful replacement', async () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecord({
					id: 'record-1',
					cover_storage_path: 'test-user-id/record-1/old.webp'
				})
			]
			mockQueryBuilder.single.mockImplementation(async () => ({
				data: createMockRecord({
					id: 'record-1',
					cover_storage_path: mockStorageBucket.upload.mock.calls[0]?.[0]
				}),
				error: null
			}))

			await store.updateRecordWithCover(
				'record-1',
				{},
				{
					type: 'upload',
					file: { name: 'cover.png' } as File,
					crop: { positionX: 50, positionY: 50 }
				}
			)

			expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
				'cleanup-record-covers'
			)
			expect(mockStorageBucket.remove).not.toHaveBeenCalled()
		})

		it('clears the storage override before draining its queued object', async () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecord({
					id: 'record-1',
					cover: 'https://discogs.example/fallback.jpg',
					cover_storage_path: 'test-user-id/record-1/custom.webp'
				})
			]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockRecord({
					id: 'record-1',
					cover: 'https://discogs.example/fallback.jpg',
					cover_storage_path: null
				}),
				error: null
			})

			const result = await store.updateRecordWithCover(
				'record-1',
				{},
				{ type: 'remove' }
			)

			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				cover_storage_path: null
			})
			expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
				'cleanup-record-covers'
			)
			expect(mockStorageBucket.remove).not.toHaveBeenCalled()
			expect(result?.cover).toBe('https://discogs.example/fallback.jpg')
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
		it('returns false and preserves records when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useRecordsStore()
			const existingRecord = createMockRecord({ id: 'existing-record' })
			store.records = [existingRecord]

			const result = await store.fetchAllRecords()

			expect(result).toBe(false)
			expect(store.records).toEqual([existingRecord])
			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
			expect(store.isLoadingRecords).toBe(false)
		})

		it('returns true for a successful empty response and resets loading', async () => {
			const store = useRecordsStore()
			mockQueryBuilder.range.mockResolvedValue({ data: [], error: null })

			const fetchPromise = store.fetchAllRecords()
			expect(store.isLoadingRecords).toBe(true)

			await expect(fetchPromise).resolves.toBe(true)
			expect(store.records).toEqual([])
			expect(store.isLoadingRecords).toBe(false)
		})

		it('returns true and populates records from a non-empty response', async () => {
			const store = useRecordsStore()
			const mockData = [
				createMockRecord({ id: 'record-1' }),
				createMockRecord({ id: 'record-2' })
			]
			mockQueryBuilder.range.mockResolvedValue({ data: mockData, error: null })

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
			mockQueryBuilder.range.mockReturnValueOnce(oldResult.promise)
			const store = useRecordsStore()

			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.range).toHaveBeenCalledOnce()
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
			mockQueryBuilder.range.mockReturnValueOnce(oldResult.promise)
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			const store = useRecordsStore()

			try {
				const oldFetch = store.fetchAllRecords()
				await vi.waitFor(() =>
					expect(mockQueryBuilder.range).toHaveBeenCalledOnce()
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
			mockQueryBuilder.range
				.mockReturnValueOnce(oldResult.promise)
				.mockReturnValueOnce(newResult.promise)
			const store = useRecordsStore()

			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.range).toHaveBeenCalledOnce()
			)
			store.clearRecords()
			mockUserStore.supaUser = { id: 'user-b' }
			const newFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.range).toHaveBeenCalledTimes(2)
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
			mockQueryBuilder.range
				.mockReturnValueOnce(oldResult.promise)
				.mockReturnValueOnce(newResult.promise)
			const store = useRecordsStore()

			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.range).toHaveBeenCalledOnce()
			)
			store.clearRecords()
			mockUserStore.supaUser = { id: 'user-b' }
			const newFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.range).toHaveBeenCalledTimes(2)
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
			mockQueryBuilder.range
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) =>
						createMockRecord({ id: `old-record-${index}` })
					),
					error: null
				})
				.mockReturnValueOnce(secondPage.promise)
			const store = useRecordsStore()

			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.range).toHaveBeenCalledTimes(2)
			)
			store.clearRecords()
			secondPage.resolve({
				data: [createMockRecord({ id: 'old-record-final' })],
				error: null
			})

			await expect(oldFetch).resolves.toBe(false)
			expect(store.records).toEqual([])
			expect(store.isLoadingRecords).toBe(false)
		})

		it('loads 1001 records with stable ordering and exact page ranges', async () => {
			const store = useRecordsStore()
			const firstPage = Array.from({ length: 1000 }, (_, index) =>
				createMockRecord({ id: `record-${1001 - index}` })
			)
			const secondPage = [createMockRecord({ id: 'record-1' })]
			mockQueryBuilder.range
				.mockResolvedValueOnce({ data: firstPage, error: null })
				.mockResolvedValueOnce({ data: secondPage, error: null })

			await expect(store.fetchAllRecords()).resolves.toBe(true)

			expect(store.records.map((record) => record.id)).toEqual([
				...firstPage.map((record) => record.id),
				'record-1'
			])
			expect(mockQueryBuilder.order.mock.calls).toEqual([
				['created_at', { ascending: false }],
				['id', { ascending: false }],
				['created_at', { ascending: false }],
				['id', { ascending: false }]
			])
			expect(mockQueryBuilder.range.mock.calls).toEqual([
				[0, 999],
				[1000, 1999]
			])
		})

		it('preserves prior records when a later page fails', async () => {
			const store = useRecordsStore()
			const existingRecord = createMockRecord({ id: 'existing-record' })
			store.records = [existingRecord]
			mockQueryBuilder.range
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) =>
						createMockRecord({ id: `record-${index}` })
					),
					error: null
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Second page failed')
				})

			await expect(store.fetchAllRecords()).resolves.toBe(false)
			expect(store.records).toEqual([existingRecord])
			expect(mockQueryBuilder.range.mock.calls).toEqual([
				[0, 999],
				[1000, 1999]
			])
		})

		it('aggregates malformed JSON fallbacks into one redacted warning', async () => {
			const privateValue = 'SYNTHETIC_PRIVATE_VALUE'
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useRecordsStore()
			mockQueryBuilder.range.mockResolvedValue({
				data: [
					createMockRecord({
						id: 'record-invalid-artists',
						artists: [
							{
								name: privateValue,
								discogs_id: Infinity
							}
						]
					}),
					createMockRecord({
						id: 'record-invalid-labels',
						labels: [{ name: privateValue, discogs_id: Number.NaN }]
					})
				],
				error: null
			})

			try {
				await expect(store.fetchAllRecords()).resolves.toBe(true)

				expect(store.records[0]!.artists).toEqual([])
				expect(store.records[1]!.labels).toEqual([])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(consoleWarn).toHaveBeenCalledWith(
					'Invalid saved data was reset to safe defaults',
					[
						{
							entity: 'record',
							id: 'record-invalid-artists',
							field: 'artists'
						},
						{
							entity: 'record',
							id: 'record-invalid-labels',
							field: 'labels'
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
			const store = useRecordsStore()
			const existingRecord = createMockRecord({ id: 'existing-record' })
			store.records = [existingRecord]
			mockQueryBuilder.range
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
			const store = useRecordsStore()
			let resolveQuery!: (value: {
				data: DatabaseRecord[]
				error: null
			}) => void
			const queryResult = new Promise<{ data: DatabaseRecord[]; error: null }>(
				(resolve) => {
					resolveQuery = resolve
				}
			)
			mockQueryBuilder.range.mockReturnValue(queryResult)

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

			mockQueryBuilder.range.mockResolvedValue({ data: [], error: null })
			await expect(store.fetchAllRecords()).resolves.toBe(true)
			expect(mockUserStore.resolveAuthenticatedUserId).toHaveBeenCalledTimes(2)
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
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
			cover_storage_path: null,
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

		it('decodes the created record response before assignment', async () => {
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useRecordsStore()
			mockQueryBuilder.single.mockResolvedValue({
				data: { ...createMockRecord({ id: 'new-record-id' }), artists: null },
				error: null
			})

			try {
				const result = await store.createRecord(newRecordData)

				expect(result?.artists).toEqual([])
				expect(store.records[0]!.artists).toEqual([])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledOnce()
			} finally {
				consoleWarn.mockRestore()
			}
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
			mockQueryBuilder.range.mockResolvedValue({
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

		it('decodes the updated record response before assignment', async () => {
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: { ...createMockRecord({ id: 'record-1' }), labels: 'invalid' },
				error: null
			})

			try {
				const result = await store.updateRecord('record-1', {
					title: 'Updated'
				})

				expect(result?.labels).toEqual([])
				expect(store.records[0]!.labels).toEqual([])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledOnce()
			} finally {
				consoleWarn.mockRestore()
			}
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
		it('drains managed cover cleanup after the record is deleted', async () => {
			const store = useRecordsStore()
			store.records = [
				createMockRecord({
					id: 'record-1',
					cover_storage_path: 'test-user-id/record-1/custom.webp'
				})
			]
			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })

			const result = await store.deleteRecord('record-1')

			expect(result).toBe(true)
			expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
				'cleanup-record-covers'
			)
			expect(mockStorageBucket.remove).not.toHaveBeenCalled()
		})

		it('keeps a successful delete successful when queue draining fails', async () => {
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			try {
				const store = useRecordsStore()
				store.records = [createMockRecord({ id: 'record-1' })]
				mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })
				mockSupabaseClient.functions.invoke.mockResolvedValue({
					data: null,
					error: new Error('private cleanup failure')
				})

				await expect(store.deleteRecord('record-1')).resolves.toBe(true)

				expect(store.records).toEqual([])
				expect(mockToast.success).toHaveBeenCalledWith(
					'Record deleted successfully.'
				)
				expect(mockToast.warning).toHaveBeenCalledWith(
					'Some old cover files still need cleanup.'
				)
				expect(consoleError).toHaveBeenCalledWith(
					'Failed to drain record cover cleanup.'
				)
			} finally {
				consoleError.mockRestore()
			}
		})

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

		it('removes only record-owned local state on success', async () => {
			const store = useRecordsStore()
			const record = createMockRecord({ id: 'record-1', title: 'Record One' })
			store.records = [record, createMockRecord({ id: 'record-2' })]
			await store.performSearch('Record One')

			const result = await store.removeRecordFromCollection('record-1')

			expect(result).toBe(true)
			expect(store.records.map((item) => item.id)).toEqual(['record-2'])
			expect(store.searchResults).toEqual([])
			expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
				'cleanup-record-covers'
			)
		})

		it('keeps local state unchanged when the RPC fails', async () => {
			const store = useRecordsStore()
			const record = createMockRecord({ id: 'record-1' })
			store.records = [record]
			await store.performSearch(record.title)
			mockSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: new Error('Cleanup failed')
			})

			const result = await store.removeRecordFromCollection('record-1')

			expect(result).toBe(false)
			expect(store.records).toEqual([record])
			expect(store.searchResults).toEqual([record])
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

		it('rebuilds the index after replacement, additions, removals, and reset', () => {
			const store = useRecordsStore()
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
			const store = useRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]

			const result = store.getRecordsByIds(['record-2', 'record-3'])

			expect(result).toEqual([])
		})

		it('omits missing IDs and preserves requested order', () => {
			const store = useRecordsStore()
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
