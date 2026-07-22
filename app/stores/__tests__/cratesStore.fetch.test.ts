import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCratesStore } from '../cratesStore'
import {
	createCratesStoreHarness,
	createMockCrate
} from './harness/cratesStoreHarness'

const mockToast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: mockToast
}))

const harness = createCratesStoreHarness()
const mockUserStore = harness.userStore
const mockSupabaseClient = harness.supabaseClient
let mockQueryBuilder = harness.queryBuilder

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)

describe('cratesStore fetch and state', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setActivePinia(createPinia())

		mockQueryBuilder = harness.reset()
	})

	describe('initial state', () => {
		it('starts with empty crates array', () => {
			const store = useCratesStore()
			expect(store.crates).toEqual([])
		})

		it('starts with all loading states as false', () => {
			const store = useCratesStore()
			expect(store.isLoadingCrates).toBe(false)
			expect(store.isCreatingCrate).toBe(false)
			expect(store.isUpdatingCrate).toBe(false)
			expect(store.isDeletingCrate).toBe(false)
		})

		it('starts with null crateToDelete', () => {
			const store = useCratesStore()
			expect(store.crateToDelete).toBeNull()
		})
	})

	describe('computed properties', () => {
		it('cratesCount returns correct count', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate(), createMockCrate(), createMockCrate()]

			expect(store.cratesCount).toBe(3)
		})

		it('hasCrates returns false when empty', () => {
			const store = useCratesStore()
			expect(store.hasCrates).toBe(false)
		})

		it('hasCrates returns true when crates exist', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate()]

			expect(store.hasCrates).toBe(true)
		})
	})

	describe('fetchAllCrates', () => {
		it('returns false and preserves crates when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useCratesStore()
			const existingCrate = createMockCrate({ id: 'existing-crate' })
			store.crates = [existingCrate]

			const result = await store.fetchAllCrates()

			expect(result).toBe(false)
			expect(store.crates).toEqual([existingCrate])
			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
			expect(store.isLoadingCrates).toBe(false)
		})

		it('returns true for a successful empty response and resets loading', async () => {
			const store = useCratesStore()
			mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null })

			const fetchPromise = store.fetchAllCrates()
			expect(store.isLoadingCrates).toBe(true)

			await expect(fetchPromise).resolves.toBe(true)
			expect(store.crates).toEqual([])
			expect(store.isLoadingCrates).toBe(false)
		})

		it('returns true and populates crates from a non-empty response', async () => {
			const store = useCratesStore()
			const mockData = [
				createMockCrate({ id: 'crate-2' }),
				createMockCrate({ id: 'crate-1' })
			]
			mockQueryBuilder.limit.mockResolvedValue({ data: mockData, error: null })

			const result = await store.fetchAllCrates()

			expect(result).toBe(true)
			expect(store.crates.length).toBe(2)
		})

		it('accepts nullable metadata and timestamp fields from a full fetch', async () => {
			const store = useCratesStore()
			const nullableCrate = createMockCrate({
				id: 'nullable-crate',
				description: null,
				color: null,
				created_at: null,
				updated_at: null
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [nullableCrate],
				error: null
			})

			await expect(store.fetchAllCrates()).resolves.toBe(true)

			expect(store.crates).toEqual([nullableCrate])
		})

		it('validates every fetched row before committing the result set', async () => {
			const store = useCratesStore()
			const existingCrate = createMockCrate({ id: 'existing-crate' })
			store.crates = [existingCrate]
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					createMockCrate({ id: 'valid-crate' }),
					createMockCrate({ id: 'wrong-user-crate', user_id: 'other-user' })
				],
				error: null
			})
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)

			try {
				await expect(store.fetchAllCrates()).resolves.toBe(false)
				expect(store.crates).toEqual([existingCrate])
				expect(mockToast.error).toHaveBeenCalledWith('Error fetching crates.')
			} finally {
				consoleError.mockRestore()
			}
		})

		it('rejects duplicate fetch rows before seeding authoritative versions', async () => {
			const store = useCratesStore()
			const existingCrate = createMockCrate({ id: 'crate-1', records: [] })
			store.crates = [existingCrate]
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					createMockCrate({
						id: 'crate-1',
						name: 'Partial fetch row',
						records: ['wrong-record'],
						updated_at: '2026-07-19T04:00:00.000003Z'
					}),
					createMockCrate({
						id: 'crate-1',
						name: 'Duplicate fetch row',
						records: ['wrong-record'],
						updated_at: '2026-07-19T04:00:00.000004Z'
					})
				],
				error: null
			})
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)

			try {
				await expect(store.fetchAllCrates()).resolves.toBe(false)
				expect(store.crates).toEqual([existingCrate])

				const membershipCrate = createMockCrate({
					id: 'crate-1',
					name: 'Membership row',
					records: ['record-1'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				})
				mockSupabaseClient.rpc.mockResolvedValue({
					data: membershipCrate,
					error: null
				})
				await expect(
					store.addRecordToCrate('crate-1', 'record-1')
				).resolves.toBe(true)
				expect(store.crates).toEqual([membershipCrate])
			} finally {
				consoleError.mockRestore()
			}
		})

		it('does not let an older fetch replace a newer membership response', async () => {
			const fetchResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>[]
				error: null
			}>()
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockQueryBuilder.limit.mockReturnValue(fetchResponse.promise)
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const fetchPromise = store.fetchAllCrates()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			const addPromise = store.addRecordToCrate('crate-1', 'record-1')
			const newerMembershipCrate = createMockCrate({
				id: 'crate-1',
				records: ['record-1'],
				updated_at: '2026-07-19T04:00:00.000002Z'
			})
			membershipResponse.resolve({
				data: newerMembershipCrate,
				error: null
			})
			await expect(addPromise).resolves.toBe(true)

			fetchResponse.resolve({
				data: [
					createMockCrate({
						id: 'crate-1',
						records: [],
						updated_at: '2026-07-19T04:00:00.000001Z'
					})
				],
				error: null
			})
			await expect(fetchPromise).resolves.toBe(true)

			expect(store.crates).toEqual([newerMembershipCrate])
		})

		it('does not let an older membership response replace a newer fetch', async () => {
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const addPromise = store.addRecordToCrate('crate-1', 'record-1')
			const newerFetchedCrate = createMockCrate({
				id: 'crate-1',
				name: 'Fetched latest',
				records: ['record-1', 'record-2'],
				updated_at: '2026-07-19T04:00:00.000003Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [newerFetchedCrate],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)

			membershipResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					records: ['record-1'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})
			await expect(addPromise).resolves.toBe(true)

			expect(store.crates).toEqual([newerFetchedCrate])
		})

		it('treats a full-fetch removal as authoritative over pending membership', async () => {
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null })
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const addPromise = store.addRecordToCrate('crate-1', 'record-1')
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(store.crates).toEqual([])

			membershipResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					records: ['record-1'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})
			await expect(addPromise).resolves.toBe(false)

			expect(store.crates).toEqual([])
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('keeps crates empty when a cleared fetch resolves successfully', async () => {
			const oldResult = createDeferred<{
				data: Array<ReturnType<typeof createMockCrate>>
				error: null
			}>()
			mockQueryBuilder.limit.mockReturnValueOnce(oldResult.promise)
			const store = useCratesStore()

			const oldFetch = store.fetchAllCrates()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			store.clearCrates()
			expect(store.isLoadingCrates).toBe(false)

			oldResult.resolve({
				data: [createMockCrate({ id: 'old-crate' })],
				error: null
			})
			await expect(oldFetch).resolves.toBe(false)
			expect(store.crates).toEqual([])
			expect(store.isLoadingCrates).toBe(false)
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
			const store = useCratesStore()

			try {
				const oldFetch = store.fetchAllCrates()
				await vi.waitFor(() =>
					expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
				)
				store.clearCrates()
				oldResult.resolve({
					data: null,
					error: new Error('Old request failed')
				})

				await expect(oldFetch).resolves.toBe(false)
				expect(consoleError).not.toHaveBeenCalledWith(
					'Failed to fetch crates:',
					expect.anything()
				)
				expect(mockToast.error).not.toHaveBeenCalled()
			} finally {
				consoleError.mockRestore()
			}
		})

		it('keeps only replacement-account crates when its fetch wins', async () => {
			const oldResult = createDeferred<{
				data: Array<ReturnType<typeof createMockCrate>>
				error: null
			}>()
			const newResult = createDeferred<{
				data: Array<ReturnType<typeof createMockCrate>>
				error: null
			}>()
			mockQueryBuilder.limit
				.mockReturnValueOnce(oldResult.promise)
				.mockReturnValueOnce(newResult.promise)
			const store = useCratesStore()

			const oldFetch = store.fetchAllCrates()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			store.clearCrates()
			mockUserStore.supaUser = { id: 'user-b' }
			const newFetch = store.fetchAllCrates()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)

			newResult.resolve({
				data: [createMockCrate({ id: 'new-crate', user_id: 'user-b' })],
				error: null
			})
			await expect(newFetch).resolves.toBe(true)
			oldResult.resolve({
				data: [createMockCrate({ id: 'old-crate' })],
				error: null
			})
			await expect(oldFetch).resolves.toBe(false)

			expect(store.crates.map((crate) => crate.id)).toEqual(['new-crate'])
			expect(store.isLoadingCrates).toBe(false)
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('does not let an old finally clear the replacement fetch slot', async () => {
			const oldResult = createDeferred<{
				data: Array<ReturnType<typeof createMockCrate>>
				error: null
			}>()
			const newResult = createDeferred<{
				data: Array<ReturnType<typeof createMockCrate>>
				error: null
			}>()
			mockQueryBuilder.limit
				.mockReturnValueOnce(oldResult.promise)
				.mockReturnValueOnce(newResult.promise)
			const store = useCratesStore()

			const oldFetch = store.fetchAllCrates()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			store.clearCrates()
			mockUserStore.supaUser = { id: 'user-b' }
			const newFetch = store.fetchAllCrates()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)

			oldResult.resolve({ data: [], error: null })
			await expect(oldFetch).resolves.toBe(false)
			expect(store.isLoadingCrates).toBe(true)
			const concurrentFetch = store.fetchAllCrates()
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)

			newResult.resolve({ data: [], error: null })
			await expect(Promise.all([newFetch, concurrentFetch])).resolves.toEqual([
				true,
				true
			])
			expect(store.isLoadingCrates).toBe(false)
		})

		it('does not commit a partial paginated fetch invalidated between pages', async () => {
			const secondPage = createDeferred<{
				data: Array<ReturnType<typeof createMockCrate>>
				error: null
			}>()
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) =>
						createMockCrate({
							id: `old-crate-${String(1000 - index).padStart(4, '0')}`
						})
					),
					error: null
				})
				.mockReturnValueOnce(secondPage.promise)
			const store = useCratesStore()

			const oldFetch = store.fetchAllCrates()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)
			store.clearCrates()
			secondPage.resolve({
				data: [createMockCrate({ id: 'old-crate-0000' })],
				error: null
			})

			await expect(oldFetch).resolves.toBe(false)
			expect(store.crates).toEqual([])
			expect(store.isLoadingCrates).toBe(false)
		})

		it('loads 1001 crates with stable ordering and exact keyset pages', async () => {
			const store = useCratesStore()
			const firstPage = Array.from({ length: 1000 }, (_, index) =>
				createMockCrate({
					id: `crate-${String(1001 - index).padStart(4, '0')}`,
					created_at: '2026-07-12T00:00:00.000Z'
				})
			)
			const secondPage = [
				createMockCrate({
					id: 'crate-0001',
					created_at: '2026-07-12T00:00:00.000Z'
				})
			]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({ data: firstPage, error: null })
				.mockResolvedValueOnce({ data: secondPage, error: null })

			await expect(store.fetchAllCrates()).resolves.toBe(true)

			expect(store.crates.map((crate) => crate.id)).toEqual([
				...firstPage.map((crate) => crate.id),
				'crate-0001'
			])
			expect(mockQueryBuilder.order.mock.calls).toEqual([
				['id', { ascending: false }],
				['id', { ascending: false }]
			])
			expect(mockQueryBuilder.lt.mock.calls).toEqual([['id', 'crate-0002']])
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])
		})

		it('retains the original tail across a mutable traversal then reconciles an authoritative delete', async () => {
			const store = useCratesStore()
			const originalSnapshot = Array.from({ length: 1001 }, (_, index) =>
				createMockCrate({
					id: `crate-${String(1001 - index).padStart(4, '0')}`,
					created_at: '2026-07-12T00:00:00.000Z'
				})
			)
			const removedId = 'crate-0500'
			let backingCollection = [...originalSnapshot]
			let activeCursor: string | null = null
			let firstPageReturned = false
			mockQueryBuilder.order.mockImplementation(() => {
				activeCursor = null
				return mockQueryBuilder
			})
			mockQueryBuilder.lt.mockImplementation((_column, cursor: string) => {
				activeCursor = cursor
				return mockQueryBuilder
			})
			mockQueryBuilder.limit.mockImplementation(async (pageSize: number) => {
				const page = backingCollection
					.filter((crate) => activeCursor === null || crate.id < activeCursor)
					.slice(0, pageSize)
				if (!firstPageReturned) {
					firstPageReturned = true
					queueMicrotask(() => {
						backingCollection = backingCollection.filter(
							(crate) => crate.id !== removedId
						)
					})
				}
				return { data: page, error: null }
			})

			await expect(store.fetchAllCrates()).resolves.toBe(true)

			expect(store.crates.map((crate) => crate.id)).toEqual(
				originalSnapshot.map((crate) => crate.id)
			)
			expect(store.crates.at(-1)?.id).toBe('crate-0001')
			expect(mockQueryBuilder.lt.mock.calls).toEqual([['id', 'crate-0002']])
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])

			await expect(store.fetchAllCrates()).resolves.toBe(true)

			expect(store.crates).toHaveLength(1000)
			expect(new Set(store.crates.map((crate) => crate.id)).size).toBe(1000)
			expect(store.crates.map((crate) => crate.id)).toEqual(
				backingCollection.map((crate) => crate.id)
			)
			expect(store.crates.some((crate) => crate.id === removedId)).toBe(false)
			expect(store.crates.at(-1)?.id).toBe('crate-0001')
			expect(mockQueryBuilder.lt.mock.calls).toEqual([
				['id', 'crate-0002'],
				['id', 'crate-0001']
			])
			expect(mockQueryBuilder.limit.mock.calls).toEqual([
				[1000],
				[1000],
				[1000],
				[1000]
			])
		})

		it('restores exact timestamp presentation order after ID traversal', async () => {
			const store = useCratesStore()
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					createMockCrate({
						id: 'crate-z-invalid',
						created_at: 'invalid'
					}),
					createMockCrate({ id: 'crate-y-null', created_at: null }),
					createMockCrate({
						id: 'crate-x-tie',
						created_at: '2026-07-19T14:00:00.123456+10:00'
					}),
					createMockCrate({
						id: 'crate-w-newest',
						created_at: '2026-07-19T04:00:00.123457Z'
					}),
					createMockCrate({
						id: 'crate-v-tie',
						created_at: '2026-07-18 20:00:00.123456-08:00'
					}),
					createMockCrate({
						id: 'crate-u-older',
						created_at: '2026-07-19T04:00:00.123455Z'
					})
				],
				error: null
			})

			await expect(store.fetchAllCrates()).resolves.toBe(true)

			expect(store.crates.map(({ id }) => id)).toEqual([
				'crate-w-newest',
				'crate-x-tie',
				'crate-v-tie',
				'crate-u-older',
				'crate-z-invalid',
				'crate-y-null'
			])
		})

		it('preserves prior crates when a later page fails', async () => {
			const store = useCratesStore()
			const existingCrate = createMockCrate({ id: 'existing-crate' })
			store.crates = [existingCrate]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) =>
						createMockCrate({
							id: `crate-${String(1000 - index).padStart(4, '0')}`
						})
					),
					error: null
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Second page failed')
				})

			await expect(store.fetchAllCrates()).resolves.toBe(false)
			expect(store.crates).toEqual([existingCrate])
			expect(mockQueryBuilder.lt).toHaveBeenCalledWith('id', 'crate-0001')
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])
		})

		it('returns false, preserves crates on query failure, and can retry', async () => {
			const store = useCratesStore()
			const existingCrate = createMockCrate({ id: 'existing-crate' })
			store.crates = [existingCrate]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Database error')
				})
				.mockResolvedValueOnce({ data: [], error: null })

			await expect(store.fetchAllCrates()).resolves.toBe(false)

			expect(store.crates).toEqual([existingCrate])
			expect(store.isLoadingCrates).toBe(false)

			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(store.crates).toEqual([])
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('shares one operation between concurrent callers and starts fresh later', async () => {
			const store = useCratesStore()
			let resolveQuery!: (value: {
				data: ReturnType<typeof createMockCrate>[]
				error: null
			}) => void
			const queryResult = new Promise<{
				data: ReturnType<typeof createMockCrate>[]
				error: null
			}>((resolve) => {
				resolveQuery = resolve
			})
			mockQueryBuilder.limit.mockReturnValue(queryResult)

			const firstFetch = store.fetchAllCrates()
			const concurrentFetch = store.fetchAllCrates()
			expect(store.isLoadingCrates).toBe(true)

			resolveQuery({ data: [], error: null })
			await expect(Promise.all([firstFetch, concurrentFetch])).resolves.toEqual(
				[true, true]
			)
			expect(mockUserStore.resolveAuthenticatedUserId).toHaveBeenCalledOnce()
			expect(mockSupabaseClient.from).toHaveBeenCalledOnce()
			expect(store.isLoadingCrates).toBe(false)

			mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null })
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(mockUserStore.resolveAuthenticatedUserId).toHaveBeenCalledTimes(2)
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('merges crates created during fetch by timestamp and descending id', async () => {
			const store = useCratesStore()
			const baselineRows = [
				createMockCrate({
					id: 'crate-newest',
					created_at: '2026-07-19T04:00:00.000004Z'
				}),
				createMockCrate({
					id: 'crate-tied-b',
					created_at: '2026-07-19T04:00:00.000002Z'
				}),
				createMockCrate({
					id: 'crate-tied-a',
					created_at: '2026-07-19T04:00:00.000002Z'
				}),
				createMockCrate({ id: 'crate-null-z', created_at: null }),
				createMockCrate({ id: 'crate-null-a', created_at: null })
			]
			const baselineRowsById = [...baselineRows].sort((left, right) =>
				left.id > right.id ? -1 : 1
			)
			mockQueryBuilder.limit.mockResolvedValue({
				data: baselineRowsById,
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)

			const fetchResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>[]
				error: null
			}>()
			mockQueryBuilder.limit.mockReturnValue(fetchResponse.promise)
			const fetchPromise = store.fetchAllCrates()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)

			const createdRows = [
				createMockCrate({
					id: 'crate-middle',
					created_at: '2026-07-19T04:00:00.000003Z'
				}),
				createMockCrate({
					id: 'crate-tied-c',
					created_at: '2026-07-19T04:00:00.000002Z'
				}),
				createMockCrate({ id: 'crate-null-y', created_at: null })
			]
			for (const createdRow of createdRows) {
				mockQueryBuilder.single.mockResolvedValueOnce({
					data: createdRow,
					error: null
				})
				await expect(
					store.createCrate({
						name: createdRow.name,
						description: createdRow.description,
						color: createdRow.color
					})
				).resolves.toEqual(createdRow)
			}

			fetchResponse.resolve({ data: baselineRowsById, error: null })
			await expect(fetchPromise).resolves.toBe(true)
			expect(store.crates.map(({ id }) => id)).toEqual([
				'crate-newest',
				'crate-middle',
				'crate-tied-c',
				'crate-tied-b',
				'crate-tied-a',
				'crate-null-z',
				'crate-null-y',
				'crate-null-a'
			])
		})

		it('allows a crate omitted by one fetch to re-enter without accepting an older operation', async () => {
			const store = useCratesStore()
			const initialCrate = createMockCrate({
				id: 'crate-1',
				name: 'Initial',
				updated_at: '2026-07-19T04:00:00.000001Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [initialCrate],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)

			const metadataResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValue(metadataResponse.promise)
			const metadataPromise = store.updateCrate('crate-1', {
				name: 'Delayed metadata'
			})

			mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null })
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(store.crates).toEqual([])

			const restoredCrate = createMockCrate({
				id: 'crate-1',
				name: 'Restored v2',
				updated_at: '2026-07-19T04:00:00.000002Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [restoredCrate],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(store.crates).toEqual([restoredCrate])

			metadataResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					name: 'Delayed metadata',
					updated_at: '2026-07-19T04:00:00.000003Z'
				}),
				error: null
			})
			await expect(metadataPromise).resolves.toBeNull()
			expect(store.crates).toEqual([restoredCrate])
		})
	})
})
