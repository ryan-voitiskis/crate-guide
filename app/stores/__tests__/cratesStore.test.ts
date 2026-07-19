import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useCratesStore } from '../cratesStore'

const mockToast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: mockToast
}))

// Mock dependencies
const mockUserStore: {
	supaUser: { id: string } | null
	readonly supaUserId: string | null
	resolveAuthenticatedUserId: ReturnType<typeof vi.fn>
} = {
	supaUser: { id: 'test-user-id' },
	get supaUserId() {
		return this.supaUser?.id ?? null
	},
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
		lt: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue({ data: [], error: null }),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
	return builder
}

let mockQueryBuilder = createMockQueryBuilder()

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder),
	rpc: vi.fn()
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

// Stub globals before importing the store
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)

// Helper to create mock crate
function createMockCrate(
	overrides?: Partial<{
		id: string
		name: string
		description: string | null
		color: string | null
		records: string[]
		user_id: string
		created_at: string | null
		updated_at: string | null
	}>
) {
	return {
		id: `crate-${Math.random().toString(36).slice(2)}`,
		name: 'Test Crate',
		description: null,
		color: '#3B82F6',
		records: [],
		user_id: 'test-user-id',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	}
}

describe('cratesStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setActivePinia(createPinia())

		// Reset mock query builder
		mockQueryBuilder = createMockQueryBuilder()
		mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
		mockSupabaseClient.rpc.mockReset()

		// Reset user store
		mockUserStore.supaUser = { id: 'test-user-id' }
		mockUserStore.resolveAuthenticatedUserId.mockImplementation(async () => {
			if (!mockUserStore.supaUser?.id) throw new Error('User not logged in.')
			return mockUserStore.supaUser.id
		})
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
						color: createdRow.color,
						records: []
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

	describe('createCrate', () => {
		it('returns null when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useCratesStore()

			const result = await store.createCrate({
				name: 'New Crate',
				description: null,
				color: null,
				records: []
			})

			expect(result).toBeNull()
		})

		it('adds created crate to local state', async () => {
			const store = useCratesStore()
			const createdCrate = createMockCrate({ id: 'new-crate' })
			mockQueryBuilder.single.mockResolvedValue({
				data: createdCrate,
				error: null
			})

			const result = await store.createCrate({
				name: 'New Crate',
				description: null,
				color: null,
				records: []
			})

			expect(result?.id).toBe('new-crate')
			expect(store.crates[0]!.id).toBe('new-crate')
		})

		it('sets isCreatingCrate during creation', async () => {
			const store = useCratesStore()
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockCrate(),
				error: null
			})

			const createPromise = store.createCrate({
				name: 'New Crate',
				description: null,
				color: null,
				records: []
			})

			expect(store.isCreatingCrate).toBe(true)
			await createPromise
			expect(store.isCreatingCrate).toBe(false)
		})

		it('keeps create activity true until concurrent success and failure settle', async () => {
			const firstResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const secondResponse = createDeferred<{ data: null; error: Error }>()
			mockQueryBuilder.single
				.mockReturnValueOnce(firstResponse.promise)
				.mockReturnValueOnce(secondResponse.promise)
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			const store = useCratesStore()
			const crateData = {
				name: 'Concurrent crate',
				description: null,
				color: null,
				records: []
			}

			try {
				const firstCreate = store.createCrate(crateData)
				const secondCreate = store.createCrate(crateData)
				expect(store.isCreatingCrate).toBe(true)

				const createdCrate = createMockCrate({ id: 'created-first' })
				firstResponse.resolve({ data: createdCrate, error: null })
				await expect(firstCreate).resolves.toEqual(createdCrate)
				expect(store.isCreatingCrate).toBe(true)

				secondResponse.resolve({
					data: null,
					error: new Error('Second create failed')
				})
				await expect(secondCreate).resolves.toBeNull()
				expect(store.isCreatingCrate).toBe(false)
			} finally {
				consoleError.mockRestore()
			}
		})

		it('orders concurrent successful creates independently of response order', async () => {
			const responses = Array.from({ length: 5 }, () =>
				createDeferred<{
					data: ReturnType<typeof createMockCrate>
					error: null
				}>()
			)
			for (const response of responses) {
				mockQueryBuilder.single.mockReturnValueOnce(response.promise)
			}
			const store = useCratesStore()
			store.crates = [
				createMockCrate({
					id: 'crate-invalid-m',
					created_at: 'invalid-postgres-timestamp'
				})
			]
			const responseRows = [
				createMockCrate({
					id: 'crate-newest',
					created_at: '2026-07-19T04:00:00.123457Z'
				}),
				createMockCrate({
					id: 'crate-tied-z',
					created_at: '2026-07-19T14:00:00.123456+10:00'
				}),
				createMockCrate({
					id: 'crate-tied-a',
					created_at: '2026-07-18 20:00:00.123456-08:00'
				}),
				createMockCrate({ id: 'crate-null-z', created_at: null }),
				createMockCrate({ id: 'crate-null-a', created_at: null })
			]
			const createPromises = responseRows.map((row) =>
				store.createCrate({
					name: row.name,
					description: row.description,
					color: row.color,
					records: []
				})
			)

			for (let index = responses.length - 1; index >= 0; index -= 1) {
				responses[index]!.resolve({ data: responseRows[index]!, error: null })
				await expect(createPromises[index]).resolves.toEqual(
					responseRows[index]
				)
			}

			expect(store.crates.map(({ id }) => id)).toEqual([
				'crate-newest',
				'crate-tied-z',
				'crate-tied-a',
				'crate-null-z',
				'crate-null-a',
				'crate-invalid-m'
			])
			expect(store.isCreatingCrate).toBe(false)
		})

		it('returns null on creation error', async () => {
			const store = useCratesStore()
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Creation failed')
			})

			const result = await store.createCrate({
				name: 'New Crate',
				description: null,
				color: null,
				records: []
			})

			expect(result).toBeNull()
		})
	})

	describe('updateCrate', () => {
		it('returns null when crate not found', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'existing-crate' })]

			const result = await store.updateCrate('non-existent', {
				name: 'Updated'
			})

			expect(result).toBeNull()
		})

		it('performs optimistic update', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', name: 'Original' })]

			const updatePromise = store.updateCrate('crate-1', { name: 'Updated' })

			expect(store.crates[0]!.name).toBe('Updated')

			mockQueryBuilder.single.mockResolvedValue({
				data: createMockCrate({ id: 'crate-1', name: 'Updated' }),
				error: null
			})

			await updatePromise
		})

		it('reverts on update error', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', name: 'Original' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Update failed')
			})

			await store.updateCrate('crate-1', { name: 'Updated' })

			expect(store.crates[0]!.name).toBe('Original')
		})

		it('sets isUpdatingCrate during update', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockCrate({ id: 'crate-1' }),
				error: null
			})

			const updatePromise = store.updateCrate('crate-1', { name: 'Updated' })
			expect(store.isUpdatingCrate).toBe(true)

			await updatePromise
			expect(store.isUpdatingCrate).toBe(false)
		})

		it('keeps newer metadata when an older membership response finishes later', async () => {
			const metadataResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValue(metadataResponse.promise)
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			const store = useCratesStore()
			store.crates = [
				createMockCrate({ id: 'crate-1', name: 'Original', records: [] })
			]

			const addPromise = store.addRecordToCrate('crate-1', 'record-1')
			const metadataPromise = store.updateCrate('crate-1', { name: 'Updated' })
			const newerMetadataCrate = createMockCrate({
				id: 'crate-1',
				name: 'Updated',
				records: ['record-1'],
				updated_at: '2026-07-19T04:00:00.000003Z'
			})
			metadataResponse.resolve({ data: newerMetadataCrate, error: null })
			await expect(metadataPromise).resolves.toEqual(newerMetadataCrate)
			expect(store.isUpdatingCrate).toBe(true)

			membershipResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					name: 'Original',
					records: ['record-1'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})
			await expect(addPromise).resolves.toBe(true)

			expect(store.crates).toEqual([newerMetadataCrate])
			expect(store.isUpdatingCrate).toBe(false)
		})

		it('returns null when a fetch advances past a delayed metadata response', async () => {
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
				name: 'Delayed local'
			})

			const remoteV3 = createMockCrate({
				id: 'crate-1',
				name: 'Remote v3',
				updated_at: '2026-07-19T04:00:00.000003Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [remoteV3],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)

			metadataResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					name: 'Delayed local',
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})
			await expect(metadataPromise).resolves.toBeNull()
			expect(store.crates).toEqual([remoteV3])
			expect(store.isUpdatingCrate).toBe(false)
		})

		it('keeps update activity true when membership settles before metadata', async () => {
			const metadataResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValue(metadataResponse.promise)
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			const store = useCratesStore()
			store.crates = [
				createMockCrate({ id: 'crate-1', name: 'Original', records: [] })
			]

			const metadataPromise = store.updateCrate('crate-1', { name: 'Updated' })
			const addPromise = store.addRecordToCrate('crate-1', 'record-1')
			membershipResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					name: 'Original',
					records: ['record-1'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})
			await expect(addPromise).resolves.toBe(true)
			expect(store.crates[0]).toMatchObject({
				name: 'Updated',
				records: ['record-1']
			})
			expect(store.isUpdatingCrate).toBe(true)

			const finalMetadataCrate = createMockCrate({
				id: 'crate-1',
				name: 'Updated',
				records: ['record-1'],
				updated_at: '2026-07-19T04:00:00.000003Z'
			})
			metadataResponse.resolve({ data: finalMetadataCrate, error: null })
			await expect(metadataPromise).resolves.toEqual(finalMetadataCrate)

			expect(store.crates).toEqual([finalMetadataCrate])
			expect(store.isUpdatingCrate).toBe(false)
		})

		it('rolls back only owned metadata fields after concurrent membership succeeds', async () => {
			const metadataResponse = createDeferred<{ data: null; error: Error }>()
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValue(metadataResponse.promise)
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			const store = useCratesStore()
			store.crates = [
				createMockCrate({ id: 'crate-1', name: 'Original', records: [] })
			]

			try {
				const metadataPromise = store.updateCrate('crate-1', {
					name: 'Optimistic'
				})
				const addPromise = store.addRecordToCrate('crate-1', 'record-1')
				membershipResponse.resolve({
					data: createMockCrate({
						id: 'crate-1',
						name: 'Original',
						records: ['record-1'],
						updated_at: '2026-07-19T04:00:00.000002Z'
					}),
					error: null
				})
				await expect(addPromise).resolves.toBe(true)
				expect(store.crates[0]).toMatchObject({
					name: 'Optimistic',
					records: ['record-1']
				})

				metadataResponse.resolve({
					data: null,
					error: new Error('Metadata failed')
				})
				await expect(metadataPromise).resolves.toBeNull()

				expect(store.crates[0]).toMatchObject({
					name: 'Original',
					records: ['record-1']
				})
			} finally {
				consoleError.mockRestore()
			}
		})
	})

	describe('deleteCrate', () => {
		it('returns false when crate not found', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'existing-crate' })]

			const result = await store.deleteCrate('non-existent')

			expect(result).toBe(false)
		})

		it('performs optimistic delete', async () => {
			const store = useCratesStore()
			store.crates = [
				createMockCrate({ id: 'crate-1' }),
				createMockCrate({ id: 'crate-2' })
			]

			const deletePromise = store.deleteCrate('crate-1')

			expect(store.crates.length).toBe(1)
			expect(store.crates[0]!.id).toBe('crate-2')

			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })
			await deletePromise
		})

		it('reverts on delete error', async () => {
			const store = useCratesStore()
			const crate1 = createMockCrate({
				id: 'crate-1',
				created_at: '2026-07-19T04:00:00.000002Z'
			})
			const crate2 = createMockCrate({
				id: 'crate-2',
				created_at: '2026-07-19T04:00:00.000001Z'
			})
			store.crates = [crate1, crate2]
			mockQueryBuilder.eq.mockResolvedValue({
				data: null,
				error: new Error('Delete failed')
			})

			await store.deleteCrate('crate-1')

			expect(store.crates.length).toBe(2)
			expect(store.crates[0]!.id).toBe('crate-1')
		})

		it('sets isDeletingCrate during delete', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1' })]
			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })

			const deletePromise = store.deleteCrate('crate-1')
			expect(store.isDeletingCrate).toBe(true)

			await deletePromise
			expect(store.isDeletingCrate).toBe(false)
		})

		it('keeps delete activity true until concurrent success and failure settle', async () => {
			const firstResponse = createDeferred<{ data: null; error: null }>()
			const secondResponse = createDeferred<{ data: null; error: Error }>()
			mockQueryBuilder.eq
				.mockReturnValueOnce(firstResponse.promise)
				.mockReturnValueOnce(secondResponse.promise)
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			const store = useCratesStore()
			const firstCrate = createMockCrate({ id: 'crate-1' })
			const secondCrate = createMockCrate({ id: 'crate-2' })
			store.crates = [firstCrate, secondCrate]

			try {
				const firstDelete = store.deleteCrate('crate-1')
				const secondDelete = store.deleteCrate('crate-2')
				expect(store.isDeletingCrate).toBe(true)

				firstResponse.resolve({ data: null, error: null })
				await expect(firstDelete).resolves.toBe(true)
				expect(store.isDeletingCrate).toBe(true)

				secondResponse.resolve({
					data: null,
					error: new Error('Second delete failed')
				})
				await expect(secondDelete).resolves.toBe(false)
				expect(store.isDeletingCrate).toBe(false)
				expect(store.crates).toEqual([secondCrate])
			} finally {
				consoleError.mockRestore()
			}
		})

		it.each(['first-delete', 'second-delete'] as const)(
			'restores concurrent failed deletes in declared order when %s fails first',
			async (firstFailure) => {
				const firstResponse = createDeferred<{ data: null; error: Error }>()
				const secondResponse = createDeferred<{ data: null; error: Error }>()
				mockQueryBuilder.eq
					.mockReturnValueOnce(firstResponse.promise)
					.mockReturnValueOnce(secondResponse.promise)
				const consoleError = vi
					.spyOn(console, 'error')
					.mockImplementation(() => undefined)
				const store = useCratesStore()
				const crateA = createMockCrate({
					id: 'crate-a',
					created_at: '2026-07-19T04:00:00.000004Z'
				})
				const crateB = createMockCrate({
					id: 'crate-b',
					created_at: '2026-07-19T04:00:00.000003Z'
				})
				const crateC = createMockCrate({
					id: 'crate-c',
					created_at: '2026-07-19T04:00:00.000001Z'
				})
				const createdWhilePending = createMockCrate({
					id: 'crate-created',
					created_at: '2026-07-19T04:00:00.000002Z'
				})
				store.crates = [crateA, crateB, crateC]
				mockQueryBuilder.single.mockResolvedValue({
					data: createdWhilePending,
					error: null
				})

				try {
					const firstDelete = store.deleteCrate(crateA.id)
					const secondDelete = store.deleteCrate(crateB.id)
					await expect(
						store.createCrate({
							name: createdWhilePending.name,
							description: createdWhilePending.description,
							color: createdWhilePending.color,
							records: []
						})
					).resolves.toEqual(createdWhilePending)

					const failures = {
						'first-delete': {
							response: firstResponse,
							promise: firstDelete
						},
						'second-delete': {
							response: secondResponse,
							promise: secondDelete
						}
					}
					const secondFailure =
						firstFailure === 'first-delete' ? 'second-delete' : 'first-delete'

					failures[firstFailure].response.resolve({
						data: null,
						error: new Error(`${firstFailure} failed`)
					})
					await expect(failures[firstFailure].promise).resolves.toBe(false)
					failures[secondFailure].response.resolve({
						data: null,
						error: new Error(`${secondFailure} failed`)
					})
					await expect(failures[secondFailure].promise).resolves.toBe(false)

					expect(store.crates.map(({ id }) => id)).toEqual([
						'crate-a',
						'crate-b',
						'crate-created',
						'crate-c'
					])
					expect(store.isDeletingCrate).toBe(false)
				} finally {
					consoleError.mockRestore()
				}
			}
		)

		it('restores the pre-delete authoritative row when delete fails', async () => {
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const deleteResponse = createDeferred<{ data: null; error: Error }>()
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			mockQueryBuilder.eq.mockReturnValue(deleteResponse.promise)
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			try {
				const addPromise = store.addRecordToCrate('crate-1', 'record-1')
				const deletePromise = store.deleteCrate('crate-1')
				expect(store.crates).toEqual([])

				const newestCrate = createMockCrate({
					id: 'crate-1',
					records: ['record-1'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				})
				membershipResponse.resolve({ data: newestCrate, error: null })
				await expect(addPromise).resolves.toBe(false)
				expect(store.crates).toEqual([])

				deleteResponse.resolve({
					data: null,
					error: new Error('Delete failed')
				})
				await expect(deletePromise).resolves.toBe(false)

				expect(store.crates).toHaveLength(1)
				expect(store.crates[0]).toMatchObject({
					id: 'crate-1',
					records: []
				})
			} finally {
				consoleError.mockRestore()
			}
		})

		it('does not resurrect a successful delete from a late membership response', async () => {
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const deleteResponse = createDeferred<{ data: null; error: null }>()
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			mockQueryBuilder.eq.mockReturnValue(deleteResponse.promise)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const addPromise = store.addRecordToCrate('crate-1', 'record-1')
			const deletePromise = store.deleteCrate('crate-1')
			deleteResponse.resolve({ data: null, error: null })
			await expect(deletePromise).resolves.toBe(true)
			expect(store.crates).toEqual([])
			expect(store.isUpdatingCrate).toBe(true)

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
			expect(store.isUpdatingCrate).toBe(false)
			expect(mockToast.success.mock.calls).toEqual([
				['Crate deleted successfully.']
			])
		})

		it('does not resurrect a successful delete from a later fetch', async () => {
			const store = useCratesStore()
			const initialCrate = createMockCrate({
				id: 'crate-1',
				updated_at: '2026-07-19T04:00:00.000001Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [initialCrate],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)

			mockQueryBuilder.eq.mockResolvedValueOnce({ data: null, error: null })
			await expect(store.deleteCrate('crate-1')).resolves.toBe(true)
			expect(store.crates).toEqual([])

			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					createMockCrate({
						...initialCrate,
						updated_at: '2026-07-19T04:00:00.000002Z'
					})
				],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(store.crates).toEqual([])
		})

		it('does not resurrect a pending delete from an older fetch snapshot', async () => {
			const store = useCratesStore()
			const initialCrate = createMockCrate({
				id: 'crate-1',
				updated_at: '2026-07-19T04:00:00.000001Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [initialCrate],
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

			const deleteResponse = createDeferred<{ data: null; error: null }>()
			mockQueryBuilder.eq.mockReturnValue(deleteResponse.promise)
			const deletePromise = store.deleteCrate('crate-1')
			expect(store.crates).toEqual([])

			fetchResponse.resolve({ data: [initialCrate], error: null })
			await expect(fetchPromise).resolves.toBe(true)
			expect(store.crates).toEqual([])
			expect(store.isDeletingCrate).toBe(true)

			deleteResponse.resolve({ data: null, error: null })
			await expect(deletePromise).resolves.toBe(true)
			expect(store.crates).toEqual([])
			expect(store.isDeletingCrate).toBe(false)
		})

		it('keeps a delete rollback behind its revision boundary', async () => {
			const store = useCratesStore()
			const initialCrate = createMockCrate({
				id: 'crate-1',
				records: [],
				updated_at: '2026-07-19T04:00:00.000001Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [initialCrate],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)

			const fetchResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>[]
				error: null
			}>()
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const deleteResponse = createDeferred<{ data: null; error: Error }>()
			mockQueryBuilder.limit.mockReturnValue(fetchResponse.promise)
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			const fetchPromise = store.fetchAllCrates()
			const addPromise = store.addRecordToCrate('crate-1', 'record-1')
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)
			mockQueryBuilder.eq.mockReturnValue(deleteResponse.promise)
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)

			try {
				const deletePromise = store.deleteCrate('crate-1')
				deleteResponse.resolve({
					data: null,
					error: new Error('Delete failed')
				})
				await expect(deletePromise).resolves.toBe(false)
				expect(store.crates).toEqual([initialCrate])

				fetchResponse.resolve({
					data: [
						createMockCrate({
							id: 'crate-1',
							name: 'Stale fetch',
							updated_at: '2026-07-19T04:00:00.000002Z'
						})
					],
					error: null
				})
				await expect(fetchPromise).resolves.toBe(true)
				expect(store.crates).toEqual([initialCrate])

				membershipResponse.resolve({
					data: createMockCrate({
						id: 'crate-1',
						records: ['record-1'],
						updated_at: '2026-07-19T04:00:00.000003Z'
					}),
					error: null
				})
				await expect(addPromise).resolves.toBe(false)
				expect(store.crates).toEqual([initialCrate])
				expect(mockToast.success).not.toHaveBeenCalled()
			} finally {
				consoleError.mockRestore()
			}
		})

		it('rejects metadata that started before a failed delete boundary', async () => {
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
			const deleteResponse = createDeferred<{ data: null; error: Error }>()
			mockQueryBuilder.single.mockReturnValue(metadataResponse.promise)
			const metadataPromise = store.updateCrate('crate-1', { name: 'Pending' })
			mockQueryBuilder.eq.mockReturnValue(deleteResponse.promise)
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)

			try {
				const deletePromise = store.deleteCrate('crate-1')
				deleteResponse.resolve({
					data: null,
					error: new Error('Delete failed')
				})
				await expect(deletePromise).resolves.toBe(false)
				expect(store.crates).toEqual([initialCrate])

				metadataResponse.resolve({
					data: createMockCrate({
						id: 'crate-1',
						name: 'Pending',
						updated_at: '2026-07-19T04:00:00.000002Z'
					}),
					error: null
				})
				await expect(metadataPromise).resolves.toBeNull()
				expect(store.crates).toEqual([initialCrate])
				expect(store.isUpdatingCrate).toBe(false)
			} finally {
				consoleError.mockRestore()
			}
		})
	})

	describe('addRecordToCrate', () => {
		it('returns false when crate not found', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1' })]

			const result = await store.addRecordToCrate('non-existent', 'record-1')

			expect(result).toBe(false)
		})

		it('reconciles an idempotent add when the local record is already present', async () => {
			const store = useCratesStore()
			const serverCrate = createMockCrate({
				id: 'crate-1',
				records: ['record-1'],
				updated_at: '2026-07-19T04:00:00.000002Z'
			})
			store.crates = [createMockCrate({ id: 'crate-1', records: ['record-1'] })]
			mockSupabaseClient.rpc.mockResolvedValue({
				data: serverCrate,
				error: null
			})

			const result = await store.addRecordToCrate('crate-1', 'record-1')

			expect(result).toBe(true)
			expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
				'add_record_to_crate',
				{
					target_crate_id: 'crate-1',
					target_record_id: 'record-1'
				}
			)
			expect(store.crates).toEqual([serverCrate])
			expect(mockToast.info).toHaveBeenCalledWith(
				'Record is already in this crate.'
			)
		})

		it('adds record to crate on success', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]
			const serverCrate = createMockCrate({
				id: 'crate-1',
				name: 'Authoritative server crate',
				records: ['record-1'],
				updated_at: '2026-07-19T04:00:01.000Z'
			})
			mockSupabaseClient.rpc.mockResolvedValue({
				data: serverCrate,
				error: null
			})

			const result = await store.addRecordToCrate('crate-1', 'record-1')

			expect(result).toBe(true)
			expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
				'add_record_to_crate',
				{
					target_crate_id: 'crate-1',
					target_record_id: 'record-1'
				}
			)
			expect(store.crates[0]).toEqual(serverCrate)
			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
		})

		it('preserves local state when the add RPC fails', async () => {
			const store = useCratesStore()
			const localCrate = createMockCrate({ id: 'crate-1', records: [] })
			store.crates = [localCrate]
			mockSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: new Error('Add failed')
			})
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)

			try {
				await expect(
					store.addRecordToCrate('crate-1', 'record-1')
				).resolves.toBe(false)
				expect(store.crates).toEqual([localCrate])
				expect(mockToast.error).toHaveBeenCalledWith('Error updating crate.')
				expect(mockSupabaseClient.from).not.toHaveBeenCalled()
			} finally {
				consoleError.mockRestore()
			}
		})

		it('rejects a malformed authoritative add response', async () => {
			const store = useCratesStore()
			const localCrate = createMockCrate({ id: 'crate-1', records: [] })
			store.crates = [localCrate]
			mockSupabaseClient.rpc.mockResolvedValue({
				data: createMockCrate({
					id: 'crate-1',
					records: ['record-1'],
					updated_at: 'not-a-postgres-timestamp'
				}),
				error: null
			})
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)

			try {
				await expect(
					store.addRecordToCrate('crate-1', 'record-1')
				).resolves.toBe(false)
				expect(store.crates).toEqual([localCrate])
				expect(mockToast.error).toHaveBeenCalledWith('Error updating crate.')
			} finally {
				consoleError.mockRestore()
			}
		})

		it('rejects every malformed authoritative crate field class', async () => {
			const store = useCratesStore()
			const localCrate = createMockCrate({ id: 'crate-1', records: [] })
			store.crates = [localCrate]
			const validResponse = createMockCrate({
				id: 'crate-1',
				records: ['record-1'],
				created_at: '2026-07-19T04:00:00.000001Z',
				updated_at: '2026-07-19T04:00:00.000002Z'
			})
			const missingName = { ...validResponse } as Record<string, unknown>
			delete missingName.name
			const invalidResponses: unknown[] = [
				{ ...validResponse, id: 42 },
				{ ...validResponse, id: 'wrong-crate' },
				missingName,
				{ ...validResponse, user_id: 'other-user' },
				{ ...validResponse, description: 42 },
				{ ...validResponse, color: false },
				{ ...validResponse, records: [42] },
				{ ...validResponse, created_at: 42 },
				{ ...validResponse, updated_at: '2026-02-30T04:00:00Z' },
				{ ...validResponse, updated_at: '2026-07-19T04:00:00+14:01' }
			]
			for (const data of invalidResponses) {
				mockSupabaseClient.rpc.mockResolvedValueOnce({ data, error: null })
			}
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)

			try {
				for (let index = 0; index < invalidResponses.length; index += 1) {
					await expect(
						store.addRecordToCrate('crate-1', 'record-1')
					).resolves.toBe(false)
					expect(store.crates).toEqual([localCrate])
				}
				expect(mockToast.error).toHaveBeenCalledTimes(invalidResponses.length)
			} finally {
				consoleError.mockRestore()
			}
		})

		it('orders adjacent microseconds across equivalent timestamp offsets', async () => {
			const firstResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const secondResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc
				.mockReturnValueOnce(firstResponse.promise)
				.mockReturnValueOnce(secondResponse.promise)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const firstAdd = store.addRecordToCrate('crate-1', 'record-1')
			const secondAdd = store.addRecordToCrate('crate-1', 'record-2')
			const newestCrate = createMockCrate({
				id: 'crate-1',
				records: ['record-1', 'record-2'],
				created_at: '2026-07-19T14:00:00.123457+10:00',
				updated_at: '2026-07-19T14:00:00.123457+10:00'
			})
			secondResponse.resolve({ data: newestCrate, error: null })
			await expect(secondAdd).resolves.toBe(true)

			firstResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					records: ['record-1'],
					created_at: '2026-07-18 20:00:00.123456-08:00',
					updated_at: '2026-07-18 20:00:00.123456-08:00'
				}),
				error: null
			})
			await expect(firstAdd).resolves.toBe(true)

			expect(store.crates).toEqual([newestCrate])
		})

		it('keeps the newest authoritative row when responses resolve in reverse', async () => {
			const firstResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const secondResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc
				.mockReturnValueOnce(firstResponse.promise)
				.mockReturnValueOnce(secondResponse.promise)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const firstAdd = store.addRecordToCrate('crate-1', 'record-1')
			const secondAdd = store.addRecordToCrate('crate-1', 'record-2')
			const newestServerCrate = createMockCrate({
				id: 'crate-1',
				records: ['record-1', 'record-2'],
				updated_at: '2026-07-19T04:00:02.000Z'
			})
			secondResponse.resolve({ data: newestServerCrate, error: null })
			await expect(secondAdd).resolves.toBe(true)
			expect(store.isUpdatingCrate).toBe(true)

			firstResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					records: ['record-1'],
					updated_at: '2026-07-19T04:00:01.000Z'
				}),
				error: null
			})
			await expect(firstAdd).resolves.toBe(true)

			expect(store.crates).toEqual([newestServerCrate])
			expect(store.isUpdatingCrate).toBe(false)
			expect(mockSupabaseClient.rpc.mock.calls).toEqual([
				[
					'add_record_to_crate',
					{
						target_crate_id: 'crate-1',
						target_record_id: 'record-1'
					}
				],
				[
					'add_record_to_crate',
					{
						target_crate_id: 'crate-1',
						target_record_id: 'record-2'
					}
				]
			])
		})

		it('follows database order when it opposes request order within one millisecond', async () => {
			const firstResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const secondResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc
				.mockReturnValueOnce(firstResponse.promise)
				.mockReturnValueOnce(secondResponse.promise)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const firstAdd = store.addRecordToCrate('crate-1', 'record-1')
			const secondAdd = store.addRecordToCrate('crate-1', 'record-2')
			const earlierDatabaseRow = createMockCrate({
				id: 'crate-1',
				records: ['record-2'],
				updated_at: '2026-07-19T04:00:00.123456Z'
			})
			secondResponse.resolve({ data: earlierDatabaseRow, error: null })
			await expect(secondAdd).resolves.toBe(true)

			const finalDatabaseRow = createMockCrate({
				id: 'crate-1',
				records: ['record-2', 'record-1'],
				updated_at: '2026-07-19T04:00:00.123457Z'
			})
			firstResponse.resolve({ data: finalDatabaseRow, error: null })
			await expect(firstAdd).resolves.toBe(true)

			expect(store.crates).toEqual([finalDatabaseRow])
		})

		it('keeps the first observed row when server timestamps are equal', async () => {
			const firstResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const secondResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc
				.mockReturnValueOnce(firstResponse.promise)
				.mockReturnValueOnce(secondResponse.promise)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const firstAdd = store.addRecordToCrate('crate-1', 'record-1')
			const secondAdd = store.addRecordToCrate('crate-1', 'record-2')
			const firstObservedRow = createMockCrate({
				id: 'crate-1',
				records: ['record-1', 'record-2'],
				updated_at: '2026-07-19T04:00:00.123456Z'
			})
			firstResponse.resolve({ data: firstObservedRow, error: null })
			await expect(firstAdd).resolves.toBe(true)

			secondResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					records: ['record-2'],
					updated_at: '2026-07-19T04:00:00.123456Z'
				}),
				error: null
			})
			await expect(secondAdd).resolves.toBe(true)

			expect(store.crates).toEqual([firstObservedRow])
		})

		it('does not roll back a later success when an earlier RPC fails', async () => {
			const firstResponse = createDeferred<{
				data: null
				error: Error
			}>()
			const secondResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc
				.mockReturnValueOnce(firstResponse.promise)
				.mockReturnValueOnce(secondResponse.promise)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)

			try {
				const firstAdd = store.addRecordToCrate('crate-1', 'record-1')
				const secondAdd = store.addRecordToCrate('crate-1', 'record-2')
				const serverCrate = createMockCrate({
					id: 'crate-1',
					records: ['record-1', 'record-2'],
					updated_at: '2026-07-19T04:00:02.000Z'
				})
				secondResponse.resolve({ data: serverCrate, error: null })
				await expect(secondAdd).resolves.toBe(true)
				firstResponse.resolve({
					data: null,
					error: new Error('First add failed')
				})
				await expect(firstAdd).resolves.toBe(false)

				expect(store.crates).toEqual([serverCrate])
			} finally {
				consoleError.mockRestore()
			}
		})

		it('returns false when a fetched v3 removal supersedes delayed add v2', async () => {
			const store = useCratesStore()
			const initialCrate = createMockCrate({
				id: 'crate-1',
				records: [],
				updated_at: '2026-07-19T04:00:00.000001Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [initialCrate],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)

			const addResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc.mockReturnValue(addResponse.promise)
			const addPromise = store.addRecordToCrate('crate-1', 'record-1')

			const removedV3 = createMockCrate({
				id: 'crate-1',
				records: [],
				updated_at: '2026-07-19T04:00:00.000003Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [removedV3],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)

			addResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					records: ['record-1'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})
			await expect(addPromise).resolves.toBe(false)

			expect(store.crates).toEqual([removedV3])
			expect(store.isUpdatingCrate).toBe(false)
			expect(mockToast.success).not.toHaveBeenCalledWith(
				'Record added to crate.'
			)
		})

		it('respects silent option', async () => {
			const store = useCratesStore()
			const serverCrate = createMockCrate({
				id: 'crate-1',
				records: ['record-1'],
				updated_at: '2026-07-19T04:00:00.000002Z'
			})
			store.crates = [createMockCrate({ id: 'crate-1', records: ['record-1'] })]
			mockSupabaseClient.rpc.mockResolvedValue({
				data: serverCrate,
				error: null
			})

			const result = await store.addRecordToCrate('crate-1', 'record-1', {
				silent: true
			})

			expect(result).toBe(true)
			expect(store.crates).toEqual([serverCrate])
			expect(mockToast.info).not.toHaveBeenCalled()
			expect(mockToast.success).not.toHaveBeenCalled()
		})
	})

	describe('removeRecordFromCrate', () => {
		it('returns false when crate not found', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1' })]

			const result = await store.removeRecordFromCrate(
				'non-existent',
				'record-1'
			)

			expect(result).toBe(false)
		})

		it('reconciles an idempotent remove when the local record is absent', async () => {
			const store = useCratesStore()
			const serverCrate = createMockCrate({
				id: 'crate-1',
				records: [],
				updated_at: '2026-07-19T04:00:00.000002Z'
			})
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]
			mockSupabaseClient.rpc.mockResolvedValue({
				data: serverCrate,
				error: null
			})

			const result = await store.removeRecordFromCrate('crate-1', 'record-1')

			expect(result).toBe(true)
			expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
				'remove_record_from_crate',
				{
					target_crate_id: 'crate-1',
					target_record_id: 'record-1'
				}
			)
			expect(store.crates).toEqual([serverCrate])
			expect(mockToast.info).toHaveBeenCalledWith(
				'Record is not in this crate.'
			)
		})

		it('removes record from crate on success', async () => {
			const store = useCratesStore()
			store.crates = [
				createMockCrate({ id: 'crate-1', records: ['record-1', 'record-2'] })
			]
			const serverCrate = createMockCrate({
				id: 'crate-1',
				name: 'Authoritative server crate',
				records: ['record-2'],
				updated_at: '2026-07-19T04:00:01.000Z'
			})
			mockSupabaseClient.rpc.mockResolvedValue({
				data: serverCrate,
				error: null
			})

			const result = await store.removeRecordFromCrate('crate-1', 'record-1')

			expect(result).toBe(true)
			expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
				'remove_record_from_crate',
				{
					target_crate_id: 'crate-1',
					target_record_id: 'record-1'
				}
			)
			expect(store.crates[0]).toEqual(serverCrate)
			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
		})

		it('preserves local state when the remove RPC fails', async () => {
			const store = useCratesStore()
			const localCrate = createMockCrate({
				id: 'crate-1',
				records: ['record-1']
			})
			store.crates = [localCrate]
			mockSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: new Error('Remove failed')
			})
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)

			try {
				await expect(
					store.removeRecordFromCrate('crate-1', 'record-1')
				).resolves.toBe(false)
				expect(store.crates).toEqual([localCrate])
				expect(mockToast.error).toHaveBeenCalledWith('Error updating crate.')
				expect(mockSupabaseClient.from).not.toHaveBeenCalled()
			} finally {
				consoleError.mockRestore()
			}
		})

		it('returns false when a fetched v3 add supersedes delayed remove v2', async () => {
			const store = useCratesStore()
			const initialCrate = createMockCrate({
				id: 'crate-1',
				records: ['record-1'],
				updated_at: '2026-07-19T04:00:00.000001Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [initialCrate],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)

			const removeResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc.mockReturnValue(removeResponse.promise)
			const removePromise = store.removeRecordFromCrate('crate-1', 'record-1')

			const addedV3 = createMockCrate({
				id: 'crate-1',
				records: ['record-1'],
				updated_at: '2026-07-19T04:00:00.000003Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({ data: [addedV3], error: null })
			await expect(store.fetchAllCrates()).resolves.toBe(true)

			removeResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					records: [],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})
			await expect(removePromise).resolves.toBe(false)

			expect(store.crates).toEqual([addedV3])
			expect(store.isUpdatingCrate).toBe(false)
			expect(mockToast.info).not.toHaveBeenCalledWith(
				'Record is not in this crate.'
			)
		})
	})

	describe('getCrateById', () => {
		it('returns undefined when crate not found', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1' })]

			const result = store.getCrateById('non-existent')

			expect(result).toBeUndefined()
		})

		it('returns crate when found', () => {
			const store = useCratesStore()
			const crate = createMockCrate({ id: 'crate-1', name: 'Found Crate' })
			store.crates = [crate]

			const result = store.getCrateById('crate-1')

			expect(result?.name).toBe('Found Crate')
		})
	})

	describe('getCratesContainingRecord', () => {
		it('returns empty array when record not in any crate', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const result = store.getCratesContainingRecord('record-1')

			expect(result).toEqual([])
		})

		it('returns all crates containing record', () => {
			const store = useCratesStore()
			store.crates = [
				createMockCrate({ id: 'crate-1', records: ['record-1'] }),
				createMockCrate({ id: 'crate-2', records: ['record-1', 'record-2'] }),
				createMockCrate({ id: 'crate-3', records: ['record-2'] })
			]

			const result = store.getCratesContainingRecord('record-1')

			expect(result.length).toBe(2)
			expect(result.map((c) => c.id)).toEqual(['crate-1', 'crate-2'])
		})
	})

	describe('record cleanup', () => {
		it('removes a record from every crate while preserving crate metadata', () => {
			const store = useCratesStore()
			store.crates = [
				createMockCrate({
					id: 'crate-1',
					name: 'First',
					description: 'Keep this',
					records: ['record-1', 'record-2']
				}),
				createMockCrate({
					id: 'crate-2',
					name: 'Second',
					records: ['record-2']
				})
			]
			const originalCrates = store.crates

			store.removeRecordFromAllCrates('record-1')

			expect(store.crates).not.toBe(originalCrates)
			expect(store.crates.map((crate) => crate.records)).toEqual([
				['record-2'],
				['record-2']
			])
			expect(store.crates[0]).toMatchObject({
				id: 'crate-1',
				name: 'First',
				description: 'Keep this'
			})
		})

		it('empties every crate while preserving crate rows and metadata', () => {
			const store = useCratesStore()
			store.crates = [
				createMockCrate({
					id: 'crate-1',
					name: 'First',
					color: '#ffffff',
					records: ['record-1', 'record-2']
				}),
				createMockCrate({ id: 'crate-2', name: 'Second', records: [] })
			]

			store.clearAllCrateRecords()

			expect(store.crates).toHaveLength(2)
			expect(store.crates.map((crate) => crate.records)).toEqual([[], []])
			expect(store.crates[0]).toMatchObject({
				id: 'crate-1',
				name: 'First',
				color: '#ffffff'
			})
		})

		it.each([
			['removeRecordFromAllCrates', ['record-2']],
			['clearAllCrateRecords', []]
		] as const)(
			'%s is not undone by a delayed membership response',
			async (cleanupAction, expectedRecords) => {
				const membershipResponse = createDeferred<{
					data: ReturnType<typeof createMockCrate>
					error: null
				}>()
				mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
				const store = useCratesStore()
				store.crates = [
					createMockCrate({ id: 'crate-1', records: ['record-2'] })
				]

				const addPromise = store.addRecordToCrate('crate-1', 'record-1')
				if (cleanupAction === 'removeRecordFromAllCrates') {
					store.removeRecordFromAllCrates('record-1')
				} else {
					store.clearAllCrateRecords()
				}
				membershipResponse.resolve({
					data: createMockCrate({
						id: 'crate-1',
						records: ['record-2', 'record-1'],
						updated_at: '2026-07-19T04:00:00.000002Z'
					}),
					error: null
				})

				await expect(addPromise).resolves.toBe(false)
				expect(store.crates[0]!.records).toEqual(expectedRecords)
				expect(store.isUpdatingCrate).toBe(false)
				expect(mockToast.success).not.toHaveBeenCalled()
				expect(mockToast.error).not.toHaveBeenCalled()
			}
		)

		it.each([
			['removeRecordFromAllCrates', ['record-2']],
			['clearAllCrateRecords', []]
		] as const)(
			'%s preserves successful metadata without accepting stale records',
			async (cleanupAction, expectedRecords) => {
				const metadataResponse = createDeferred<{
					data: ReturnType<typeof createMockCrate>
					error: null
				}>()
				mockQueryBuilder.single.mockReturnValue(metadataResponse.promise)
				const store = useCratesStore()
				store.crates = [
					createMockCrate({
						id: 'crate-1',
						name: 'Original',
						records: ['record-1', 'record-2']
					})
				]

				const metadataPromise = store.updateCrate('crate-1', {
					name: 'Updated'
				})
				if (cleanupAction === 'removeRecordFromAllCrates') {
					store.removeRecordFromAllCrates('record-1')
				} else {
					store.clearAllCrateRecords()
				}
				const staleResponse = createMockCrate({
					id: 'crate-1',
					name: 'Updated',
					records: ['record-1', 'record-2'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				})
				metadataResponse.resolve({ data: staleResponse, error: null })

				await expect(metadataPromise).resolves.toEqual({
					...staleResponse,
					records: expectedRecords
				})
				expect(store.crates[0]).toMatchObject({
					name: 'Updated',
					records: expectedRecords
				})
				expect(store.isUpdatingCrate).toBe(false)
				expect(mockToast.error).not.toHaveBeenCalled()
			}
		)

		it('keeps v3 metadata over a delayed v2 post-cleanup fetch', async () => {
			const metadataResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const fetchResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>[]
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValue(metadataResponse.promise)
			const store = useCratesStore()
			store.crates = [
				createMockCrate({
					id: 'crate-1',
					name: 'Original',
					records: ['record-1', 'record-2'],
					updated_at: '2026-07-19T04:00:00.000001Z'
				})
			]

			const metadataPromise = store.updateCrate('crate-1', {
				name: 'Updated'
			})
			store.removeRecordFromAllCrates('record-1')

			const staleFetchCrate = createMockCrate({
				id: 'crate-1',
				name: 'Original',
				records: ['record-2'],
				updated_at: '2026-07-19T04:00:00.000002Z'
			})
			mockQueryBuilder.limit.mockReturnValue(fetchResponse.promise)
			const fetchPromise = store.fetchAllCrates()

			const metadataCrate = createMockCrate({
				id: 'crate-1',
				name: 'Updated',
				records: ['record-1', 'record-2'],
				updated_at: '2026-07-19T04:00:00.000003Z'
			})
			metadataResponse.resolve({ data: metadataCrate, error: null })
			await expect(metadataPromise).resolves.toEqual({
				...metadataCrate,
				records: ['record-2']
			})
			expect(store.crates[0]).toMatchObject({
				name: 'Updated',
				records: ['record-2']
			})

			fetchResponse.resolve({ data: [staleFetchCrate], error: null })
			await expect(fetchPromise).resolves.toBe(true)
			expect(store.crates).toHaveLength(1)
			expect(store.crates[0]).toMatchObject({
				name: 'Updated',
				records: ['record-2']
			})
		})

		it('rejects delayed v2 metadata before merging into a fetched v3 floor', async () => {
			const store = useCratesStore()
			const initialCrate = createMockCrate({
				id: 'crate-1',
				name: 'Initial',
				records: ['record-1', 'record-2'],
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
				name: 'Delayed local'
			})
			store.removeRecordFromAllCrates('record-1')

			const remoteV3 = createMockCrate({
				id: 'crate-1',
				name: 'Remote v3',
				records: ['record-2'],
				updated_at: '2026-07-19T04:00:00.000003Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [remoteV3],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(store.crates[0]).toMatchObject({
				name: 'Delayed local',
				records: ['record-2']
			})

			metadataResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					name: 'Delayed local',
					records: ['record-1', 'record-2'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})
			await expect(metadataPromise).resolves.toBeNull()
			expect(store.crates).toEqual([remoteV3])

			const equalV3 = createMockCrate({
				...remoteV3,
				name: 'Equal v3 must not repair anything'
			})
			mockQueryBuilder.limit.mockResolvedValue({ data: [equalV3], error: null })
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(store.crates).toEqual([remoteV3])

			const olderV2 = createMockCrate({
				...remoteV3,
				name: 'Older v2',
				updated_at: '2026-07-19T04:00:00.000002Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({ data: [olderV2], error: null })
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(store.crates).toEqual([remoteV3])

			const newerV4 = createMockCrate({
				...remoteV3,
				name: 'Newer v4',
				updated_at: '2026-07-19T04:00:00.000004Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({ data: [newerV4], error: null })
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(store.crates).toEqual([newerV4])
		})
	})

	describe('clearCrates', () => {
		it('empties crates array', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate(), createMockCrate()]

			store.clearCrates()

			expect(store.crates).toEqual([])
		})

		it('invalidates an old same-account RPC without affecting new update activity', async () => {
			const oldResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const newResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc
				.mockReturnValueOnce(oldResponse.promise)
				.mockReturnValueOnce(newResponse.promise)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const oldAdd = store.addRecordToCrate('crate-1', 'old-record')
			expect(store.isUpdatingCrate).toBe(true)
			store.clearCrates()
			expect(store.crates).toEqual([])
			expect(store.isUpdatingCrate).toBe(false)

			const reloadedCrate = createMockCrate({
				id: 'crate-1',
				records: [],
				updated_at: '2026-07-19T04:00:00.000003Z'
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [reloadedCrate],
				error: null
			})
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			const newAdd = store.addRecordToCrate('crate-1', 'new-record')
			expect(store.isUpdatingCrate).toBe(true)

			oldResponse.resolve({
				data: createMockCrate({
					id: 'crate-1',
					records: ['old-record'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})
			await expect(oldAdd).resolves.toBe(false)
			expect(store.crates).toEqual([reloadedCrate])
			expect(store.isUpdatingCrate).toBe(true)
			expect(mockToast.success).not.toHaveBeenCalled()

			const newestCrate = createMockCrate({
				id: 'crate-1',
				records: ['new-record'],
				updated_at: '2026-07-19T04:00:00.000004Z'
			})
			newResponse.resolve({ data: newestCrate, error: null })
			await expect(newAdd).resolves.toBe(true)

			expect(store.crates).toEqual([newestCrate])
			expect(store.isUpdatingCrate).toBe(false)
			expect(mockToast.success.mock.calls).toEqual([['Record added to crate.']])
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('does not let an old create finalizer clear replacement activity', async () => {
			const oldResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			const newResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockQueryBuilder.single
				.mockReturnValueOnce(oldResponse.promise)
				.mockReturnValueOnce(newResponse.promise)
			const store = useCratesStore()
			const crateData = {
				name: 'Created crate',
				description: null,
				color: null,
				records: []
			}

			const oldCreate = store.createCrate(crateData)
			expect(store.isCreatingCrate).toBe(true)
			store.clearCrates()
			expect(store.isCreatingCrate).toBe(false)

			const newCreate = store.createCrate(crateData)
			expect(store.isCreatingCrate).toBe(true)
			oldResponse.resolve({
				data: createMockCrate({ id: 'old-crate' }),
				error: null
			})
			await expect(oldCreate).resolves.toBeNull()
			expect(store.isCreatingCrate).toBe(true)
			expect(store.crates).toEqual([])

			const newCrate = createMockCrate({ id: 'new-crate' })
			newResponse.resolve({ data: newCrate, error: null })
			await expect(newCreate).resolves.toEqual(newCrate)
			expect(store.isCreatingCrate).toBe(false)
			expect(store.crates).toEqual([newCrate])
		})

		it('does not let an old delete finalizer clear replacement activity', async () => {
			const oldResponse = createDeferred<{ data: null; error: null }>()
			const newResponse = createDeferred<{ data: null; error: null }>()
			mockQueryBuilder.eq
				.mockReturnValueOnce(oldResponse.promise)
				.mockReturnValueOnce(newResponse.promise)
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'old-crate' })]

			const oldDelete = store.deleteCrate('old-crate')
			expect(store.isDeletingCrate).toBe(true)
			store.clearCrates()
			expect(store.isDeletingCrate).toBe(false)

			store.crates = [createMockCrate({ id: 'new-crate' })]
			const newDelete = store.deleteCrate('new-crate')
			expect(store.isDeletingCrate).toBe(true)
			oldResponse.resolve({ data: null, error: null })
			await expect(oldDelete).resolves.toBe(false)
			expect(store.isDeletingCrate).toBe(true)

			newResponse.resolve({ data: null, error: null })
			await expect(newDelete).resolves.toBe(true)
			expect(store.isDeletingCrate).toBe(false)
			expect(store.crates).toEqual([])
			expect(mockToast.success.mock.calls).toEqual([
				['Crate deleted successfully.']
			])
		})
	})
})
