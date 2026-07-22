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

describe('cratesStore membership', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setActivePinia(createPinia())

		mockQueryBuilder = harness.reset()
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
})
