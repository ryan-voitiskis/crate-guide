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

describe('cratesStore queries and local cleanup', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setActivePinia(createPinia())

		mockQueryBuilder = harness.reset()
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

			store.removeRecordFromCrates('record-1', ['crate-1'])

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
			['removeRecordFromCrates', ['record-2']],
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

				const affectedBeforeMembership =
					store.getCrateIdsAffectedByRecordRemoval('record-1')
				const addPromise = store.addRecordToCrate('crate-1', 'record-1')
				if (cleanupAction === 'removeRecordFromCrates') {
					store.removeRecordFromCrates('record-1', affectedBeforeMembership)
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

		it('cleans same-record membership completed after the removal snapshot', async () => {
			const store = useCratesStore()
			const crate = createMockCrate({ id: 'crate-1', records: [] })
			store.crates = [crate]
			const affectedBeforeMembership =
				store.getCrateIdsAffectedByRecordRemoval('record-1')
			mockSupabaseClient.rpc.mockResolvedValue({
				data: createMockCrate({
					...crate,
					records: ['record-1'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})

			await expect(store.addRecordToCrate('crate-1', 'record-1')).resolves.toBe(
				true
			)
			store.removeRecordFromCrates('record-1', affectedBeforeMembership)

			expect(affectedBeforeMembership).toEqual([])
			expect(store.getCrateById('crate-1')?.records).toEqual([])
		})

		it('publishes an unrelated membership response across record cleanup', async () => {
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			const store = useCratesStore()
			const affectedCrate = createMockCrate({
				id: 'crate-affected',
				records: ['record-deleted']
			})
			const unrelatedCrate = createMockCrate({
				id: 'crate-unrelated',
				records: []
			})
			store.crates = [affectedCrate, unrelatedCrate]

			const addPromise = store.addRecordToCrate(
				unrelatedCrate.id,
				'record-unrelated'
			)
			store.removeRecordFromCrates('record-deleted', [affectedCrate.id])
			membershipResponse.resolve({
				data: createMockCrate({
					...unrelatedCrate,
					records: ['record-unrelated'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})

			await expect(addPromise).resolves.toBe(true)
			expect(store.getCrateById(affectedCrate.id)?.records).toEqual([])
			expect(store.getCrateById(unrelatedCrate.id)?.records).toEqual([
				'record-unrelated'
			])
			expect(store.getCrateById(unrelatedCrate.id)).not.toBe(unrelatedCrate)
			expect(mockToast.success).toHaveBeenCalledWith('Record added to crate.')
		})

		it('publishes a different-record response on the cleaned crate', async () => {
			const membershipResponse = createDeferred<{
				data: ReturnType<typeof createMockCrate>
				error: null
			}>()
			mockSupabaseClient.rpc.mockReturnValue(membershipResponse.promise)
			const store = useCratesStore()
			const crate = createMockCrate({
				id: 'crate-1',
				records: ['record-deleted']
			})
			store.crates = [crate]

			const addPromise = store.addRecordToCrate(crate.id, 'record-unrelated')
			store.removeRecordFromCrates('record-deleted', [crate.id])
			membershipResponse.resolve({
				data: createMockCrate({
					...crate,
					records: ['record-deleted', 'record-unrelated'],
					updated_at: '2026-07-19T04:00:00.000002Z'
				}),
				error: null
			})

			await expect(addPromise).resolves.toBe(true)
			expect(store.getCrateById(crate.id)?.records).toEqual([
				'record-unrelated'
			])
			expect(mockToast.success).toHaveBeenCalledWith('Record added to crate.')
		})

		it.each([
			['removeRecordFromCrates', ['record-2']],
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
				if (cleanupAction === 'removeRecordFromCrates') {
					store.removeRecordFromCrates('record-1', ['crate-1'])
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
			store.removeRecordFromCrates('record-1', ['crate-1'])

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
			store.removeRecordFromCrates('record-1', ['crate-1'])

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
				color: null
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
