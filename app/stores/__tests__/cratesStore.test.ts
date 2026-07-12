import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useCratesStore } from '../cratesStore'

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
	from: vi.fn(() => mockQueryBuilder)
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
		created_at: string
		updated_at: string
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
			mockQueryBuilder.order.mockResolvedValue({ data: [], error: null })

			const fetchPromise = store.fetchAllCrates()
			expect(store.isLoadingCrates).toBe(true)

			await expect(fetchPromise).resolves.toBe(true)
			expect(store.crates).toEqual([])
			expect(store.isLoadingCrates).toBe(false)
		})

		it('returns true and populates crates from a non-empty response', async () => {
			const store = useCratesStore()
			const mockData = [
				createMockCrate({ id: 'crate-1' }),
				createMockCrate({ id: 'crate-2' })
			]
			mockQueryBuilder.order.mockResolvedValue({ data: mockData, error: null })

			const result = await store.fetchAllCrates()

			expect(result).toBe(true)
			expect(store.crates.length).toBe(2)
		})

		it('returns false, preserves crates on query failure, and can retry', async () => {
			const store = useCratesStore()
			const existingCrate = createMockCrate({ id: 'existing-crate' })
			store.crates = [existingCrate]
			mockQueryBuilder.order
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
			mockQueryBuilder.order.mockReturnValue(queryResult)

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

			mockQueryBuilder.order.mockResolvedValue({ data: [], error: null })
			await expect(store.fetchAllCrates()).resolves.toBe(true)
			expect(mockUserStore.resolveAuthenticatedUserId).toHaveBeenCalledTimes(2)
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
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
			const crate1 = createMockCrate({ id: 'crate-1' })
			const crate2 = createMockCrate({ id: 'crate-2' })
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
	})

	describe('addRecordToCrate', () => {
		it('returns false when crate not found', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1' })]

			const result = await store.addRecordToCrate('non-existent', 'record-1')

			expect(result).toBe(false)
		})

		it('returns false when record already in crate', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: ['record-1'] })]

			const result = await store.addRecordToCrate('crate-1', 'record-1')

			expect(result).toBe(false)
		})

		it('adds record to crate on success', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockCrate({ id: 'crate-1', records: ['record-1'] }),
				error: null
			})

			const result = await store.addRecordToCrate('crate-1', 'record-1')

			expect(result).toBe(true)
		})

		it('respects silent option', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: ['record-1'] })]

			// Should not throw despite record already existing
			const result = await store.addRecordToCrate('crate-1', 'record-1', {
				silent: true
			})

			expect(result).toBe(false)
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

		it('returns false when record not in crate', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const result = await store.removeRecordFromCrate('crate-1', 'record-1')

			expect(result).toBe(false)
		})

		it('removes record from crate on success', async () => {
			const store = useCratesStore()
			store.crates = [
				createMockCrate({ id: 'crate-1', records: ['record-1', 'record-2'] })
			]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockCrate({ id: 'crate-1', records: ['record-2'] }),
				error: null
			})

			const result = await store.removeRecordFromCrate('crate-1', 'record-1')

			expect(result).toBe(true)
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
	})

	describe('clearCrates', () => {
		it('empties crates array', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate(), createMockCrate()]

			store.clearCrates()

			expect(store.crates).toEqual([])
		})
	})
})
