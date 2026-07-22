import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { resetTrackIdCounter } from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../sessionStore'
import {
	type SavedSetRow,
	createSavedSetRow,
	createSessionStoreHarness
} from './harness/sessionStoreHarness'

const mockToast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: mockToast
}))

const harness = createSessionStoreHarness()
const mockTracksStore = harness.tracksStore
const mockUserStore = harness.userStore
const mockSupabaseClient = harness.supabaseClient
let mockQueryBuilder = harness.queryBuilder

function createSavedSet(overrides: Partial<SavedSetRow> = {}) {
	return { ...createSavedSetRow(overrides), played_tracks: [] }
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, reject, resolve }
}

// Stub Nuxt composables (these are auto-imported in the store)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)

describe('sessionStore saved-set persistence', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetTrackIdCounter()
		setActivePinia(createPinia())

		mockQueryBuilder = harness.reset()
	})

	describe('saved-set persistence', () => {
		const firstEntry = {
			track_id: 'track-first',
			time_added: 0,
			adjusted_bpm: 0,
			transition_rating: 1
		}
		const secondEntry = {
			track_id: 'track-second',
			time_added: 1,
			adjusted_bpm: null,
			transition_rating: 5
		}

		it('coalesces concurrent loads into one transport chain and starts fresh later', async () => {
			const response = createDeferred<{ data: SavedSetRow[]; error: null }>()
			mockQueryBuilder.limit.mockReturnValueOnce(response.promise)
			const store = useSessionStore()

			const first = store.fetchSavedSets()
			const concurrent = store.fetchSavedSets()
			await vi.waitFor(() =>
				expect(mockSupabaseClient.from).toHaveBeenCalledOnce()
			)
			response.resolve({
				data: [createSavedSetRow({ id: 'set-from-first-chain' })],
				error: null
			})
			await Promise.all([first, concurrent])
			expect(store.savedSets.map((savedSet) => savedSet.id)).toEqual([
				'set-from-first-chain'
			])

			mockQueryBuilder.limit.mockResolvedValueOnce({ data: [], error: null })
			const later = store.fetchSavedSets()
			expect(later).not.toBe(first)
			await later
			expect(store.savedSets).toEqual([])
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('loads 1001 saved sets with stable ordering and exact keyset pages', async () => {
			const store = useSessionStore()
			const firstPage = Array.from({ length: 1000 }, (_, index) =>
				createSavedSetRow({
					id: `set-${String(1001 - index).padStart(4, '0')}`
				})
			)
			const secondPage = [createSavedSetRow({ id: 'set-0001' })]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({ data: firstPage, error: null })
				.mockResolvedValueOnce({ data: secondPage, error: null })

			await store.fetchSavedSets()

			expect(store.savedSets.map((set) => set.id)).toEqual([
				...firstPage.map((set) => set.id),
				'set-0001'
			])
			expect(mockQueryBuilder.order.mock.calls).toEqual([
				['id', { ascending: false }],
				['id', { ascending: false }]
			])
			expect(mockQueryBuilder.lt.mock.calls).toEqual([['id', 'set-0002']])
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])
		})

		it('restores exact timestamp presentation order after ID traversal', async () => {
			const store = useSessionStore()
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					createSavedSetRow({
						id: 'set-z-invalid',
						created_at: 'invalid'
					}),
					createSavedSetRow({ id: 'set-y-null', created_at: null }),
					createSavedSetRow({
						id: 'set-x-tie',
						created_at: '2026-07-19T14:00:00.123456+10:00'
					}),
					createSavedSetRow({
						id: 'set-w-newest',
						created_at: '2026-07-19T04:00:00.123457Z'
					}),
					createSavedSetRow({
						id: 'set-v-tie',
						created_at: '2026-07-18 20:00:00.123456-08:00'
					}),
					createSavedSetRow({
						id: 'set-u-older',
						created_at: '2026-07-19T04:00:00.123455Z'
					})
				],
				error: null
			})

			await store.fetchSavedSets()

			expect(store.savedSets.map(({ id }) => id)).toEqual([
				'set-w-newest',
				'set-x-tie',
				'set-v-tie',
				'set-u-older',
				'set-z-invalid',
				'set-y-null'
			])
		})

		it('preserves prior saved sets when a later page fails', async () => {
			const store = useSessionStore()
			const existingSet = createSavedSet({ id: 'existing-set' })
			store.savedSets = [existingSet]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) =>
						createSavedSetRow({
							id: `set-${String(1000 - index).padStart(4, '0')}`
						})
					),
					error: null
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Second page failed')
				})

			await store.fetchSavedSets()

			expect(store.savedSets).toEqual([existingSet])
			expect(mockQueryBuilder.lt).toHaveBeenCalledWith('id', 'set-0001')
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])
			expect(mockToast.error).toHaveBeenCalledWith('Failed to load saved sets')
		})

		it('preserves and deduplicates same-account saves on both sides of the cursor', async () => {
			const fetchResponse = createDeferred<{
				data: SavedSetRow[]
				error: null
			}>()
			const firstPage = Array.from({ length: 1000 }, (_, index) =>
				createSavedSetRow({
					id: `set-m-${String(1000 - index).padStart(4, '0')}`,
					created_at: '2026-07-12T00:00:00.000001Z'
				})
			)
			mockQueryBuilder.limit
				.mockResolvedValueOnce({ data: firstPage, error: null })
				.mockReturnValueOnce(fetchResponse.promise)
			const createdAboveCursor = createSavedSetRow({
				id: 'set-z-created-locally',
				created_at: '2026-07-12T00:00:00.000004Z',
				played_tracks: [firstEntry]
			})
			const createdBelowCursor = createSavedSetRow({
				id: 'set-a-local',
				created_at: '2026-07-12T00:00:00.000003Z',
				played_tracks: [firstEntry]
			})
			mockQueryBuilder.single
				.mockResolvedValueOnce({ data: createdAboveCursor, error: null })
				.mockResolvedValueOnce({ data: createdBelowCursor, error: null })
			const store = useSessionStore()
			store.currentSession = [firstEntry]

			const fetchPromise = store.fetchSavedSets()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)
			await expect(store.saveSession('Above cursor')).resolves.toEqual(
				createdAboveCursor
			)
			store.activeSetId = null
			await expect(store.saveSession('Below cursor')).resolves.toEqual(
				createdBelowCursor
			)

			fetchResponse.resolve({
				data: [
					createSavedSetRow({
						id: 'set-a-local',
						name: 'Authoritative fetched copy',
						created_at: '2026-07-12T00:00:00.000003Z'
					}),
					createSavedSetRow({
						id: 'set-a-fetched',
						created_at: '2026-07-12T00:00:00.000001Z'
					})
				],
				error: null
			})
			await fetchPromise

			const ids = store.savedSets.map(({ id }) => id)
			expect(ids.slice(0, 2)).toEqual(['set-z-created-locally', 'set-a-local'])
			expect(ids).toContain('set-a-fetched')
			expect(ids.filter((id) => id === 'set-a-local')).toHaveLength(1)
			expect(store.savedSets.find(({ id }) => id === 'set-a-local')?.name).toBe(
				'Synthetic set'
			)
		})

		it('preserves a post-snapshot update over a stale fetched row with the same ID', async () => {
			const fetchResponse = createDeferred<{
				data: SavedSetRow[]
				error: null
			}>()
			mockQueryBuilder.limit.mockReturnValueOnce(fetchResponse.promise)
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: createSavedSetRow({ id: 'set-existing', name: 'Local update' }),
				error: null
			})
			const store = useSessionStore()
			store.savedSets = [
				createSavedSet({ id: 'set-existing', name: 'Before update' })
			]
			store.activeSetId = 'set-existing'
			store.currentSession = [firstEntry]

			const fetchPromise = store.fetchSavedSets()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			await expect(store.saveSession('Local update')).resolves.toMatchObject({
				id: 'set-existing',
				name: 'Local update'
			})
			fetchResponse.resolve({
				data: [
					createSavedSetRow({
						id: 'set-existing',
						name: 'Stale fetched value'
					})
				],
				error: null
			})
			await fetchPromise

			expect(store.savedSets).toHaveLength(1)
			expect(store.savedSets[0]!.name).toBe('Local update')
		})

		it('preserves an autosave response over a stale overlapping fetch', async () => {
			vi.useFakeTimers()
			const fetchResponse = createDeferred<{
				data: SavedSetRow[]
				error: null
			}>()
			mockQueryBuilder.limit.mockReturnValueOnce(fetchResponse.promise)
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: createSavedSetRow({
					id: 'set-existing',
					name: 'Current set',
					played_tracks: [firstEntry]
				}),
				error: null
			})
			const store = useSessionStore()
			store.savedSets = [
				createSavedSet({ id: 'set-existing', name: 'Before autosave' })
			]
			store.activeSetId = 'set-existing'

			try {
				const fetchPromise = store.fetchSavedSets()
				store.currentSession = [firstEntry]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)
				expect(store.savedSets[0]!.played_tracks).toEqual([firstEntry])

				fetchResponse.resolve({
					data: [
						createSavedSetRow({
							id: 'set-existing',
							name: 'Stale fetched set',
							played_tracks: []
						})
					],
					error: null
				})
				await fetchPromise

				expect(store.savedSets).toHaveLength(1)
				expect(store.savedSets[0]).toMatchObject({
					name: 'Current set',
					played_tracks: [firstEntry]
				})
			} finally {
				vi.useRealTimers()
			}
		})

		it('does not assign revision provenance to a failed concurrent save', async () => {
			const fetchResponse = createDeferred<{
				data: SavedSetRow[]
				error: null
			}>()
			mockQueryBuilder.limit.mockReturnValueOnce(fetchResponse.promise)
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: null,
				error: new Error('Save failed')
			})
			const store = useSessionStore()
			store.savedSets = [
				createSavedSet({ id: 'set-existing', name: 'Before update' })
			]
			store.activeSetId = 'set-existing'
			store.currentSession = [firstEntry]

			const fetchPromise = store.fetchSavedSets()
			await expect(
				store.saveSession('Rejected local update')
			).resolves.toBeNull()
			fetchResponse.resolve({
				data: [
					createSavedSetRow({
						id: 'set-existing',
						name: 'Authoritative fetched value'
					})
				],
				error: null
			})
			await fetchPromise

			expect(store.savedSets[0]!.name).toBe('Authoritative fetched value')
		})

		it('tombstones a successful concurrent delete until authoritative absence', async () => {
			const staleFetch = createDeferred<{
				data: SavedSetRow[]
				error: null
			}>()
			const deletedRow = createSavedSetRow({ id: 'set-delete' })
			mockQueryBuilder.limit
				.mockReturnValueOnce(staleFetch.promise)
				.mockResolvedValueOnce({ data: [deletedRow], error: null })
				.mockResolvedValueOnce({ data: [], error: null })
				.mockResolvedValueOnce({ data: [deletedRow], error: null })
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: { id: 'set-delete', user_id: 'test-user-id' },
				error: null
			})
			const store = useSessionStore()
			store.savedSets = [createSavedSet({ id: 'set-delete' })]

			const fetchPromise = store.fetchSavedSets()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			await store.deleteSet('set-delete')
			staleFetch.resolve({ data: [], error: null })
			await fetchPromise
			expect(store.savedSets).toEqual([])

			await store.fetchSavedSets()
			expect(store.savedSets).toEqual([])
			await store.fetchSavedSets()
			expect(store.savedSets).toEqual([])
			await store.fetchSavedSets()
			expect(store.savedSets.map((savedSet) => savedSet.id)).toEqual([
				'set-delete'
			])
		})

		it('does not tombstone a failed concurrent delete', async () => {
			const fetchResponse = createDeferred<{
				data: SavedSetRow[]
				error: null
			}>()
			const fetchedRow = createSavedSetRow({
				id: 'set-delete',
				name: 'Still authoritative'
			})
			mockQueryBuilder.limit.mockReturnValueOnce(fetchResponse.promise)
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: null,
				error: new Error('Delete failed')
			})
			const store = useSessionStore()
			store.savedSets = [createSavedSet({ id: 'set-delete' })]

			const fetchPromise = store.fetchSavedSets()
			await store.deleteSet('set-delete')
			fetchResponse.resolve({ data: [fetchedRow], error: null })
			await fetchPromise

			expect(store.savedSets[0]!.name).toBe('Still authoritative')
		})

		it('fails closed on fetched and saved rows owned by another account', async () => {
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			mockQueryBuilder.limit.mockResolvedValueOnce({
				data: [createSavedSetRow({ id: 'wrong-fetch', user_id: 'user-b' })],
				error: null
			})
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: createSavedSetRow({ id: 'wrong-save', user_id: 'user-b' }),
				error: null
			})
			const store = useSessionStore()
			store.savedSets = [createSavedSet({ id: 'existing' })]
			store.currentSession = [firstEntry]

			try {
				await store.fetchSavedSets()
				expect(store.savedSets.map((savedSet) => savedSet.id)).toEqual([
					'existing'
				])
				await expect(store.saveSession('Wrong owner')).resolves.toBeNull()
				expect(store.savedSets.map((savedSet) => savedSet.id)).toEqual([
					'existing'
				])
			} finally {
				consoleError.mockRestore()
			}
		})

		it('decodes fetched sets, preserves mixed-entry order, and warns once', async () => {
			const privateValue = 'SYNTHETIC_PRIVATE_VALUE'
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useSessionStore()
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					createSavedSetRow({
						id: 'set-mixed-array',
						played_tracks: [
							firstEntry,
							{
								track_id: '',
								time_added: 2,
								adjusted_bpm: null,
								transition_rating: null,
								privateValue
							},
							secondEntry
						]
					}),
					createSavedSetRow({
						id: 'set-invalid-array',
						played_tracks: { privateValue }
					})
				],
				error: null
			})

			try {
				await store.fetchSavedSets()

				expect(store.savedSets[0]!.played_tracks).toEqual([
					firstEntry,
					secondEntry
				])
				expect(store.savedSets[1]!.played_tracks).toEqual([])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(consoleWarn).toHaveBeenCalledWith(
					'Invalid saved data was reset to safe defaults',
					[
						{
							entity: 'saved-set',
							id: 'set-mixed-array',
							field: 'played_tracks'
						},
						{
							entity: 'saved-set',
							id: 'set-invalid-array',
							field: 'played_tracks'
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

		it('decodes an updated save response before assignment', async () => {
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useSessionStore()
			store.activeSetId = 'set-update'
			store.currentSession = [firstEntry]
			mockQueryBuilder.single.mockResolvedValue({
				data: createSavedSetRow({
					id: 'set-update',
					played_tracks: 'invalid'
				}),
				error: null
			})

			try {
				const savedSet = await store.saveSession('Updated set')

				expect(savedSet?.played_tracks).toEqual([])
				expect(store.savedSets[0]!.played_tracks).toEqual([])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledOnce()
			} finally {
				consoleWarn.mockRestore()
			}
		})

		it('decodes an inserted save response and retains valid mixed entries', async () => {
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useSessionStore()
			store.currentSession = [firstEntry]
			mockQueryBuilder.single.mockResolvedValue({
				data: createSavedSetRow({
					id: 'set-insert',
					played_tracks: [
						firstEntry,
						{
							track_id: 'invalid',
							time_added: -1,
							adjusted_bpm: null,
							transition_rating: null
						},
						secondEntry
					]
				}),
				error: null
			})

			try {
				const savedSet = await store.saveSession('Inserted set')

				expect(savedSet?.played_tracks).toEqual([firstEntry, secondEntry])
				expect(store.savedSets[0]!.played_tracks).toEqual([
					firstEntry,
					secondEntry
				])
				expect(store.activeSetId).toBe('set-insert')
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledOnce()
			} finally {
				consoleWarn.mockRestore()
			}
		})
	})

	describe('clearSavedSetTracks', () => {
		it('empties played tracks while preserving set rows and metadata', () => {
			const store = useSessionStore()
			store.savedSets = [
				{
					...createSavedSetRow({ id: 'set-1', name: 'Keep this name' }),
					played_tracks: [
						{
							track_id: 'track-1',
							time_added: 10,
							adjusted_bpm: 128,
							transition_rating: 4
						}
					]
				},
				{
					...createSavedSetRow({ id: 'set-2', name: null }),
					played_tracks: []
				}
			]
			const originalSets = store.savedSets

			store.clearSavedSetTracks()

			expect(store.savedSets).not.toBe(originalSets)
			expect(store.savedSets).toHaveLength(2)
			expect(store.savedSets.map((set) => set.played_tracks)).toEqual([[], []])
			expect(store.savedSets[0]).toMatchObject({
				id: 'set-1',
				name: 'Keep this name'
			})
		})
	})
})
