import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
const mockUserStore = {
	supaUser: { id: 'test-user-id' }
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

// Import after mocking
import { useCratesStore } from '../cratesStore'

// Helper to create mock crate
function createMockCrate(overrides?: Partial<{
	id: string
	name: string
	description: string | null
	color: string | null
	records: string[]
	user_id: string
	created_at: string
	updated_at: string
}>) {
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
		it('does nothing when user is not signed in', async () => {
			mockUserStore.supaUser = null as any
			const store = useCratesStore()

			await store.fetchAllCrates()

			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
		})

		it('sets isLoadingCrates during fetch', async () => {
			const store = useCratesStore()
			mockQueryBuilder.order.mockResolvedValue({ data: [], error: null })

			const fetchPromise = store.fetchAllCrates()
			expect(store.isLoadingCrates).toBe(true)

			await fetchPromise
			expect(store.isLoadingCrates).toBe(false)
		})

		it('populates crates from response', async () => {
			const store = useCratesStore()
			const mockData = [createMockCrate({ id: 'crate-1' }), createMockCrate({ id: 'crate-2' })]
			mockQueryBuilder.order.mockResolvedValue({ data: mockData, error: null })

			await store.fetchAllCrates()

			expect(store.crates.length).toBe(2)
		})

		it('handles fetch error gracefully', async () => {
			const store = useCratesStore()
			mockQueryBuilder.order.mockResolvedValue({
				data: null,
				error: new Error('Database error')
			})

			await store.fetchAllCrates()

			expect(store.crates).toEqual([])
			expect(store.isLoadingCrates).toBe(false)
		})
	})

	describe('createCrate', () => {
		it('returns null when user is not signed in', async () => {
			mockUserStore.supaUser = null as any
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
			mockQueryBuilder.single.mockResolvedValue({ data: createdCrate, error: null })

			const result = await store.createCrate({
				name: 'New Crate',
				description: null,
				color: null,
				records: []
			})

			expect(result?.id).toBe('new-crate')
			expect(store.crates[0].id).toBe('new-crate')
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

			const result = await store.updateCrate('non-existent', { name: 'Updated' })

			expect(result).toBeNull()
		})

		it('performs optimistic update', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', name: 'Original' })]

			const updatePromise = store.updateCrate('crate-1', { name: 'Updated' })

			expect(store.crates[0].name).toBe('Updated')

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

			expect(store.crates[0].name).toBe('Original')
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
			store.crates = [createMockCrate({ id: 'crate-1' }), createMockCrate({ id: 'crate-2' })]

			const deletePromise = store.deleteCrate('crate-1')

			expect(store.crates.length).toBe(1)
			expect(store.crates[0].id).toBe('crate-2')

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
			expect(store.crates[0].id).toBe('crate-1')
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

			const result = await store.removeRecordFromCrate('non-existent', 'record-1')

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
			store.crates = [createMockCrate({ id: 'crate-1', records: ['record-1', 'record-2'] })]
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

	describe('getCratesByIds', () => {
		it('returns empty array when no IDs match', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1' })]

			const result = store.getCratesByIds(['crate-2', 'crate-3'])

			expect(result).toEqual([])
		})

		it('returns all matching crates', () => {
			const store = useCratesStore()
			store.crates = [
				createMockCrate({ id: 'crate-1' }),
				createMockCrate({ id: 'crate-2' }),
				createMockCrate({ id: 'crate-3' })
			]

			const result = store.getCratesByIds(['crate-1', 'crate-3'])

			expect(result.length).toBe(2)
		})
	})

	describe('getCrateRecords', () => {
		it('returns empty array when crate not found', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1' })]

			const result = store.getCrateRecords('non-existent')

			expect(result).toEqual([])
		})

		it('returns record IDs for crate', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: ['record-1', 'record-2'] })]

			const result = store.getCrateRecords('crate-1')

			expect(result).toEqual(['record-1', 'record-2'])
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

	describe('searchCrates', () => {
		it('returns all crates for empty query', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate(), createMockCrate()]

			const result = store.searchCrates('')

			expect(result.length).toBe(2)
		})

		it('returns all crates for whitespace-only query', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate(), createMockCrate()]

			const result = store.searchCrates('   ')

			expect(result.length).toBe(2)
		})

		it('searches in crate name (case-insensitive)', () => {
			const store = useCratesStore()
			store.crates = [
				createMockCrate({ id: 'match', name: 'House Music' }),
				createMockCrate({ id: 'no-match', name: 'Techno' })
			]

			const result = store.searchCrates('house')

			expect(result.length).toBe(1)
			expect(result[0].id).toBe('match')
		})
	})

	describe('getCrateStats', () => {
		it('returns zero count for non-existent crate', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1' })]

			const result = store.getCrateStats('non-existent')

			expect(result.recordCount).toBe(0)
			expect(result.isEmpty).toBe(true)
		})

		it('returns correct stats for crate', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: ['r1', 'r2', 'r3'] })]

			const result = store.getCrateStats('crate-1')

			expect(result.recordCount).toBe(3)
			expect(result.isEmpty).toBe(false)
		})

		it('returns isEmpty true for empty crate', () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', records: [] })]

			const result = store.getCrateStats('crate-1')

			expect(result.isEmpty).toBe(true)
		})
	})

	describe('duplicateCrate', () => {
		it('returns null when original crate not found', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1' })]

			const result = store.duplicateCrate('non-existent')

			expect(result).toBeNull()
		})

		it('creates copy with default name', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', name: 'Original', records: ['r1'] })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockCrate({ id: 'copy', name: 'Original (Copy)' }),
				error: null
			})

			await store.duplicateCrate('crate-1')

			expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'Original (Copy)'
				})
			)
		})

		it('creates copy with custom name', async () => {
			const store = useCratesStore()
			store.crates = [createMockCrate({ id: 'crate-1', name: 'Original' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockCrate({ id: 'copy', name: 'Custom Name' }),
				error: null
			})

			await store.duplicateCrate('crate-1', 'Custom Name')

			expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'Custom Name'
				})
			)
		})

		it('copies records from original crate', async () => {
			const store = useCratesStore()
			store.crates = [
				createMockCrate({ id: 'crate-1', name: 'Original', records: ['r1', 'r2'] })
			]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockCrate({ id: 'copy', records: ['r1', 'r2'] }),
				error: null
			})

			await store.duplicateCrate('crate-1')

			expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					records: ['r1', 'r2']
				})
			)
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
