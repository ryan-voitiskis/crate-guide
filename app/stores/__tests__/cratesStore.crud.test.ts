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

describe('cratesStore CRUD', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setActivePinia(createPinia())

		mockQueryBuilder = harness.reset()
	})

	describe('createCrate', () => {
		it('returns null when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useCratesStore()

			const result = await store.createCrate({
				name: 'New Crate',
				description: null,
				color: null
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
				color: null
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
				color: null
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
				color: null
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
					color: row.color
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
				color: null
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
							color: createdWhilePending.color
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
})
