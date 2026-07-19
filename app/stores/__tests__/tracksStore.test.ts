import { createPinia, setActivePinia } from 'pinia'
import {
	createMockTrack,
	createMockTrackWithArtists,
	createMockTrackWithBpm,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useTracksStore } from '../tracksStore'

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
		is: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue({ data: [], error: null }),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
	return builder
}

let mockQueryBuilder = createMockQueryBuilder()

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder)
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

function createMockOwnedTrack(
	overrides?: Parameters<typeof createMockTrack>[0],
	userId = 'test-user-id'
) {
	return {
		...createMockTrack(overrides),
		user_id: userId
	}
}

function createTrackInput(title = 'Synthetic create') {
	return {
		record_id: 'record-1',
		title,
		artists: [],
		extraartists: [],
		position: 'A1',
		duration: 180000,
		bpm: 128,
		rpm: 33 as const,
		key: 0,
		mode: 0,
		genres: [],
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true,
		beatport_data: null
	}
}

// Stub globals before importing the store
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)

describe('tracksStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockToast.success.mockClear()
		mockToast.error.mockClear()
		resetTrackIdCounter()
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
		it('starts with empty tracks array', () => {
			const store = useTracksStore()
			expect(store.tracks).toEqual([])
		})

		it('starts with loading states as false', () => {
			const store = useTracksStore()
			expect(store.isLoadingTracks).toBe(false)
			expect(store.isCreatingTrack).toBe(false)
			expect(store.isUpdatingTrack).toBe(false)
		})
	})

	describe('computed properties', () => {
		it('tracksCount returns correct count', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack(), createMockTrack(), createMockTrack()]

			expect(store.tracksCount).toBe(3)
		})

		it('hasTracks returns false when empty', () => {
			const store = useTracksStore()
			expect(store.hasTracks).toBe(false)
		})

		it('hasTracks returns true when tracks exist', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack()]

			expect(store.hasTracks).toBe(true)
		})

		it('playableTracks filters out non-playable tracks', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'playable-1', playable: true }),
				createMockTrack({ id: 'non-playable', playable: false }),
				createMockTrack({ id: 'playable-2', playable: true })
			]

			const playable = store.playableTracks
			expect(playable.length).toBe(2)
			expect(playable.map((t) => t.id)).toEqual(['playable-1', 'playable-2'])
		})
	})

	describe('fetchAllTracks', () => {
		it('returns false and preserves tracks when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useTracksStore()
			const existingTrack = createMockTrack({ id: 'existing-track' })
			store.tracks = [existingTrack]

			const result = await store.fetchAllTracks()

			expect(result).toBe(false)
			expect(store.tracks).toEqual([existingTrack])
			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
			expect(store.isLoadingTracks).toBe(false)
		})

		it('returns true for a successful empty response and resets loading', async () => {
			const store = useTracksStore()
			mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null })

			const fetchPromise = store.fetchAllTracks()
			expect(store.isLoadingTracks).toBe(true)

			await expect(fetchPromise).resolves.toBe(true)
			expect(store.tracks).toEqual([])
			expect(store.isLoadingTracks).toBe(false)
		})

		it('returns true and populates tracks from a non-empty response', async () => {
			const store = useTracksStore()
			const mockData = [
				{
					...createMockTrack({
						id: 'track-2',
						created_at: '2026-07-12T00:00:00.000001Z'
					}),
					user_id: 'test-user-id'
				},
				{
					...createMockTrack({
						id: 'track-1',
						created_at: '2026-07-12T00:00:00.000002Z'
					}),
					future_scalar: 'preserved',
					user_id: 'test-user-id'
				}
			]
			mockQueryBuilder.limit.mockResolvedValue({ data: mockData, error: null })

			const result = await store.fetchAllTracks()

			expect(result).toBe(true)
			expect(store.tracks.length).toBe(2)
			expect(store.tracks[0]!.id).toBe('track-1')
			expect(store.tracks[0]).not.toHaveProperty('user_id')
			expect(store.tracks[0]).toHaveProperty('future_scalar', 'preserved')
		})

		it('keeps tracks empty when a cleared fetch resolves successfully', async () => {
			const oldResult = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			mockQueryBuilder.limit.mockReturnValueOnce(oldResult.promise)
			const store = useTracksStore()

			const oldFetch = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			store.clearTracks()
			expect(store.isLoadingTracks).toBe(false)

			oldResult.resolve({
				data: [createMockOwnedTrack({ id: 'old-track' })],
				error: null
			})
			await expect(oldFetch).resolves.toBe(false)
			expect(store.tracks).toEqual([])
			expect(store.isLoadingTracks).toBe(false)
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
			const store = useTracksStore()

			try {
				const oldFetch = store.fetchAllTracks()
				await vi.waitFor(() =>
					expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
				)
				store.clearTracks()
				oldResult.resolve({
					data: null,
					error: new Error('Old request failed')
				})

				await expect(oldFetch).resolves.toBe(false)
				expect(consoleError).not.toHaveBeenCalledWith(
					'Failed to fetch tracks:',
					expect.anything()
				)
				expect(mockToast.error).not.toHaveBeenCalled()
			} finally {
				consoleError.mockRestore()
			}
		})

		it('keeps only replacement-account tracks when its fetch wins', async () => {
			const oldResult = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			const newResult = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			mockQueryBuilder.limit
				.mockReturnValueOnce(oldResult.promise)
				.mockReturnValueOnce(newResult.promise)
			const store = useTracksStore()

			const oldFetch = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			store.clearTracks()
			mockUserStore.supaUser = { id: 'user-b' }
			const newFetch = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)

			newResult.resolve({
				data: [createMockOwnedTrack({ id: 'new-track' }, 'user-b')],
				error: null
			})
			await expect(newFetch).resolves.toBe(true)
			oldResult.resolve({
				data: [createMockOwnedTrack({ id: 'old-track' })],
				error: null
			})
			await expect(oldFetch).resolves.toBe(false)

			expect(store.tracks.map((track) => track.id)).toEqual(['new-track'])
			expect(store.isLoadingTracks).toBe(false)
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('does not let an old finally clear the replacement fetch slot', async () => {
			const oldResult = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			const newResult = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			mockQueryBuilder.limit
				.mockReturnValueOnce(oldResult.promise)
				.mockReturnValueOnce(newResult.promise)
			const store = useTracksStore()

			const oldFetch = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			store.clearTracks()
			mockUserStore.supaUser = { id: 'user-b' }
			const newFetch = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)

			oldResult.resolve({ data: [], error: null })
			await expect(oldFetch).resolves.toBe(false)
			expect(store.isLoadingTracks).toBe(true)
			const concurrentFetch = store.fetchAllTracks()
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)

			newResult.resolve({ data: [], error: null })
			await expect(Promise.all([newFetch, concurrentFetch])).resolves.toEqual([
				true,
				true
			])
			expect(store.isLoadingTracks).toBe(false)
		})

		it('does not commit a partial paginated fetch invalidated between pages', async () => {
			const secondPage = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) =>
						createMockOwnedTrack({
							id: `old-track-${String(1000 - index).padStart(4, '0')}`
						})
					),
					error: null
				})
				.mockReturnValueOnce(secondPage.promise)
			const store = useTracksStore()

			const oldFetch = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)
			store.clearTracks()
			secondPage.resolve({
				data: [createMockOwnedTrack({ id: 'old-track-0000' })],
				error: null
			})

			await expect(oldFetch).resolves.toBe(false)
			expect(store.tracks).toEqual([])
			expect(store.isLoadingTracks).toBe(false)
		})

		it('loads 1001 owned tracks with stable ordering and exact keyset pages', async () => {
			const store = useTracksStore()
			const firstPage = Array.from({ length: 1000 }, (_, index) => ({
				...createMockTrack({
					id: `track-${String(1001 - index).padStart(4, '0')}`,
					created_at: '2026-07-12T00:00:00.000Z'
				}),
				user_id: 'test-user-id'
			}))
			const secondPage = [
				{
					...createMockTrack({
						id: 'track-0001',
						created_at: '2026-07-12T00:00:00.000Z'
					}),
					user_id: 'test-user-id'
				}
			]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({ data: firstPage, error: null })
				.mockResolvedValueOnce({ data: secondPage, error: null })

			await expect(store.fetchAllTracks()).resolves.toBe(true)

			expect(store.tracks.map((track) => track.id)).toEqual([
				...firstPage.map((track) => track.id),
				'track-0001'
			])
			expect(mockQueryBuilder.select).toHaveBeenCalledTimes(2)
			expect(mockQueryBuilder.select).toHaveBeenNthCalledWith(1, '*')
			expect(mockQueryBuilder.select).toHaveBeenNthCalledWith(2, '*')
			expect(mockQueryBuilder.eq).toHaveBeenCalledTimes(2)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				1,
				'user_id',
				'test-user-id'
			)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				2,
				'user_id',
				'test-user-id'
			)
			expect(mockQueryBuilder.order.mock.calls).toEqual([
				['id', { ascending: false }],
				['id', { ascending: false }]
			])
			expect(mockQueryBuilder.lt.mock.calls).toEqual([['id', 'track-0002']])
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])
		})

		it('restores exact timestamp presentation order after ID traversal', async () => {
			const store = useTracksStore()
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					createMockOwnedTrack({
						id: 'track-z-invalid',
						created_at: 'invalid'
					}),
					createMockOwnedTrack({ id: 'track-y-null', created_at: null }),
					createMockOwnedTrack({
						id: 'track-x-tie',
						created_at: '2026-07-19T14:00:00.123456+10:00'
					}),
					createMockOwnedTrack({
						id: 'track-w-newest',
						created_at: '2026-07-19T04:00:00.123457Z'
					}),
					createMockOwnedTrack({
						id: 'track-v-tie',
						created_at: '2026-07-18 20:00:00.123456-08:00'
					}),
					createMockOwnedTrack({
						id: 'track-u-older',
						created_at: '2026-07-19T04:00:00.123455Z'
					})
				],
				error: null
			})

			await expect(store.fetchAllTracks()).resolves.toBe(true)

			expect(store.tracks.map(({ id }) => id)).toEqual([
				'track-w-newest',
				'track-x-tie',
				'track-v-tie',
				'track-u-older',
				'track-z-invalid',
				'track-y-null'
			])
		})

		it('fails closed before replacing state when any page has another owner', async () => {
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			const store = useTracksStore()
			const existingTrack = createMockTrack({ id: 'existing-track' })
			store.tracks = [existingTrack]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) =>
						createMockOwnedTrack({
							id: `track-${String(1000 - index).padStart(4, '0')}`
						})
					),
					error: null
				})
				.mockResolvedValueOnce({
					data: [
						createMockOwnedTrack(
							{ id: 'unexpected-owner-track' },
							'other-user-id'
						)
					],
					error: null
				})

			try {
				await expect(store.fetchAllTracks()).resolves.toBe(false)

				expect(store.tracks).toEqual([existingTrack])
				expect(mockToast.error).toHaveBeenCalledOnce()
				expect(mockToast.error).toHaveBeenCalledWith('Error fetching tracks.')
				expect(JSON.stringify(mockToast.error.mock.calls)).not.toContain(
					'other-user-id'
				)
			} finally {
				consoleError.mockRestore()
			}
		})

		it('preserves prior tracks when a later page fails', async () => {
			const store = useTracksStore()
			const existingTrack = createMockTrack({ id: 'existing-track' })
			store.tracks = [existingTrack]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) => ({
						...createMockTrack({
							id: `track-${String(1000 - index).padStart(4, '0')}`
						}),
						user_id: 'test-user-id'
					})),
					error: null
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Second page failed')
				})

			await expect(store.fetchAllTracks()).resolves.toBe(false)
			expect(store.tracks).toEqual([existingTrack])
			expect(mockQueryBuilder.lt).toHaveBeenCalledWith('id', 'track-0001')
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])
		})

		it('preserves and deduplicates same-account creates on both sides of the cursor', async () => {
			const fetchResponse = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			const firstPage = Array.from({ length: 1000 }, (_, index) =>
				createMockOwnedTrack({
					id: `track-m-${String(1000 - index).padStart(4, '0')}`,
					created_at: '2026-07-12T00:00:00.000001Z'
				})
			)
			mockQueryBuilder.limit
				.mockResolvedValueOnce({ data: firstPage, error: null })
				.mockReturnValueOnce(fetchResponse.promise)
			const createdAboveCursor = createMockTrack({
				id: 'track-z-created-locally',
				created_at: '2026-07-12T00:00:00.000004Z'
			})
			const createdBelowCursor = createMockTrack({
				id: 'track-a-local',
				created_at: '2026-07-12T00:00:00.000003Z'
			})
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: { ...createdAboveCursor, user_id: 'test-user-id' },
					error: null
				})
				.mockResolvedValueOnce({
					data: { ...createdBelowCursor, user_id: 'test-user-id' },
					error: null
				})
			const store = useTracksStore()
			const createInput = {
				record_id: 'record-1',
				title: 'Created during fetch',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 128,
				rpm: 33,
				key: 0,
				mode: 0,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null
			}

			const fetchPromise = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)
			await expect(store.createTrack(createInput)).resolves.toMatchObject({
				id: 'track-z-created-locally'
			})
			await expect(store.createTrack(createInput)).resolves.toMatchObject({
				id: 'track-a-local'
			})

			fetchResponse.resolve({
				data: [
					createMockOwnedTrack({
						id: 'track-a-local',
						title: 'Authoritative fetched copy',
						created_at: '2026-07-12T00:00:00.000003Z'
					}),
					createMockOwnedTrack({
						id: 'track-a-fetched',
						created_at: '2026-07-12T00:00:00.000001Z'
					})
				],
				error: null
			})
			await expect(fetchPromise).resolves.toBe(true)

			const ids = store.tracks.map(({ id }) => id)
			expect(ids.slice(0, 2)).toEqual([
				'track-z-created-locally',
				'track-a-local'
			])
			expect(ids).toContain('track-a-fetched')
			expect(ids.filter((id) => id === 'track-a-local')).toHaveLength(1)
			expect(store.tracks.find(({ id }) => id === 'track-a-local')?.title).toBe(
				'Authoritative fetched copy'
			)
		})

		it('aggregates invalid nested JSON into one redacted warning', async () => {
			const privateValue = 'SYNTHETIC_PRIVATE_VALUE'
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useTracksStore()
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					{
						...createMockTrack({ id: 'track-invalid-json' }),
						artists: [{ name: privateValue, discogs_id: Infinity }],
						audio_features: {
							version: 2,
							privateValue
						},
						user_id: 'test-user-id'
					}
				],
				error: null
			})

			try {
				await expect(store.fetchAllTracks()).resolves.toBe(true)

				expect(store.tracks[0]!.artists).toEqual([])
				expect(store.tracks[0]!.audio_features).toBeNull()
				expect(store.tracks[0]).not.toHaveProperty('user_id')
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(consoleWarn).toHaveBeenCalledWith(
					'Invalid saved data was reset to safe defaults',
					[
						{
							entity: 'track',
							id: 'track-invalid-json',
							field: 'artists'
						},
						{
							entity: 'track',
							id: 'track-invalid-json',
							field: 'audio_features'
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

		it('preserves audio_features from response mapping', async () => {
			const store = useTracksStore()
			const audioFeatures = {
				version: 1 as const,
				updatedAt: '2026-07-09T00:00:00.000Z',
				applied: {
					bpm: {
						source: 'rekordboxXml' as const,
						appliedAt: '2026-07-09T00:00:00.000Z'
					},
					keyMode: null
				},
				match: {
					confidence: 'high' as const,
					score: 100,
					reasons: ['Title match'],
					warnings: []
				},
				sources: {}
			}
			const mockData = [
				{
					...createMockTrack({ id: 'track-1', audio_features: audioFeatures }),
					user_id: 'test-user-id'
				}
			]
			mockQueryBuilder.limit.mockResolvedValue({ data: mockData, error: null })

			await store.fetchAllTracks()

			expect(store.tracks[0]!.audio_features).toEqual(audioFeatures)
		})

		it('returns false, preserves tracks on query failure, and can retry', async () => {
			const store = useTracksStore()
			const existingTrack = createMockTrack({ id: 'existing-track' })
			store.tracks = [existingTrack]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Database error')
				})
				.mockResolvedValueOnce({ data: [], error: null })

			await expect(store.fetchAllTracks()).resolves.toBe(false)

			expect(store.tracks).toEqual([existingTrack])
			expect(store.isLoadingTracks).toBe(false)

			await expect(store.fetchAllTracks()).resolves.toBe(true)
			expect(store.tracks).toEqual([])
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('shares one operation between concurrent callers and starts fresh later', async () => {
			const store = useTracksStore()
			let resolveQuery!: (value: { data: Track[]; error: null }) => void
			const queryResult = new Promise<{ data: Track[]; error: null }>(
				(resolve) => {
					resolveQuery = resolve
				}
			)
			mockQueryBuilder.limit.mockReturnValue(queryResult)

			const firstFetch = store.fetchAllTracks()
			const concurrentFetch = store.fetchAllTracks()
			expect(store.isLoadingTracks).toBe(true)

			resolveQuery({ data: [], error: null })
			await expect(Promise.all([firstFetch, concurrentFetch])).resolves.toEqual(
				[true, true]
			)
			expect(mockUserStore.resolveAuthenticatedUserId).toHaveBeenCalledOnce()
			expect(mockSupabaseClient.from).toHaveBeenCalledOnce()
			expect(store.isLoadingTracks).toBe(false)

			mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null })
			await expect(store.fetchAllTracks()).resolves.toBe(true)
			expect(mockUserStore.resolveAuthenticatedUserId).toHaveBeenCalledTimes(2)
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})
	})

	describe('createTrack', () => {
		it('returns null when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = useTracksStore()

			const result = await store.createTrack({
				record_id: 'record-1',
				title: 'New Track',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 128,
				rpm: 33,
				key: 0,
				mode: 0,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null
			})

			expect(result).toBeNull()
		})

		it('adds created track to local state', async () => {
			const store = useTracksStore()
			const newTrackData = {
				record_id: 'record-1',
				title: 'New Track',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 128,
				rpm: 33,
				key: 0,
				mode: 0,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null
			}
			const createdTrack = createMockTrack({
				...newTrackData,
				id: 'new-track-id'
			})
			mockQueryBuilder.single.mockResolvedValue({
				data: { ...createdTrack, user_id: 'test-user-id' },
				error: null
			})

			const result = await store.createTrack(newTrackData)

			expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
				expect.objectContaining({ beatport_data: null })
			)
			expect(result?.id).toBe('new-track-id')
			expect(store.tracks[0]!.id).toBe('new-track-id')
			expect(result).not.toHaveProperty('user_id')
			expect(store.tracks[0]).not.toHaveProperty('user_id')
			expect(mockQueryBuilder.insert.mock.calls[0]![0]).toHaveProperty(
				'user_id',
				'test-user-id'
			)
		})

		it('decodes the created track response before assignment', async () => {
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useTracksStore()
			mockQueryBuilder.single.mockResolvedValue({
				data: {
					...createMockTrack({ id: 'new-track-id' }),
					genres: ['valid', 7],
					user_id: 'test-user-id'
				},
				error: null
			})

			try {
				const result = await store.createTrack({
					record_id: 'record-1',
					title: 'New Track',
					artists: [],
					extraartists: [],
					position: 'A1',
					duration: 0,
					bpm: 0,
					rpm: 33,
					key: 0,
					mode: 0,
					genres: [],
					time_signature_upper: null,
					time_signature_lower: null,
					playable: true,
					beatport_data: null
				})

				expect(result?.genres).toEqual([])
				expect(store.tracks[0]!.genres).toEqual([])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledOnce()
			} finally {
				consoleWarn.mockRestore()
			}
		})

		it('serializes legacy Beatport data in create payloads', async () => {
			const store = useTracksStore()
			const beatportData = {
				accessed: 1783832400000,
				url: 'https://www.beatport.com/track/legacy-track/123',
				genre: 'Deep House',
				bpm: 124,
				key: 'A Minor',
				img: 'https://example.test/legacy-track.jpg'
			}
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockOwnedTrack({ beatport_data: beatportData }),
				error: null
			})

			await store.createTrack({
				record_id: 'record-1',
				title: 'Legacy Track',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 124,
				rpm: 33,
				key: 9,
				mode: 0,
				genres: ['Deep House'],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: beatportData
			})

			expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
				expect.objectContaining({ beatport_data: beatportData })
			)
		})

		it('sets isCreatingTrack during creation', async () => {
			const store = useTracksStore()
			const response = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValue(response.promise)

			const createPromise = store.createTrack({
				record_id: 'record-1',
				title: 'New Track',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 128,
				rpm: 33,
				key: 0,
				mode: 0,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null
			})

			await vi.waitFor(() => expect(store.isCreatingTrack).toBe(true))
			response.resolve({ data: createMockOwnedTrack(), error: null })
			await createPromise
			expect(store.isCreatingTrack).toBe(false)
		})

		it('returns null on creation error', async () => {
			const store = useTracksStore()
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Creation failed')
			})

			const result = await store.createTrack({
				record_id: 'record-1',
				title: 'New Track',
				artists: [],
				extraartists: [],
				position: 'A1',
				duration: 180000,
				bpm: 128,
				rpm: 33,
				key: 0,
				mode: 0,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null
			})

			expect(result).toBeNull()
		})
	})

	describe('updateTrack', () => {
		it('returns null when track not found', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'existing-track' })]

			const result = await store.updateTrack('non-existent', {
				title: 'Updated'
			})

			expect(result).toBeNull()
		})

		it('performs optimistic update', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', title: 'Original' })]
			const response = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValue(response.promise)

			// Start update but don't await yet
			const updatePromise = store.updateTrack('track-1', { title: 'Updated' })

			// Track should be optimistically updated
			await vi.waitFor(() => expect(store.tracks[0]!.title).toBe('Updated'))

			response.resolve({
				data: createMockOwnedTrack({ id: 'track-1', title: 'Updated' }),
				error: null
			})

			await updatePromise
		})

		it('reverts on update error', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', title: 'Original' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Update failed')
			})

			await store.updateTrack('track-1', { title: 'Updated' })

			// Should revert to original
			expect(store.tracks[0]!.title).toBe('Original')
		})

		it('updates with server response on success', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', title: 'Original' })]
			const serverResponse = createMockTrack({
				id: 'track-1',
				title: 'Updated',
				updated_at: '2024-01-01T00:00:00Z'
			})
			mockQueryBuilder.single.mockResolvedValue({
				data: { ...serverResponse, user_id: 'test-user-id' },
				error: null
			})

			const result = await store.updateTrack('track-1', { title: 'Updated' })

			expect(store.tracks[0]!.updated_at).toBe('2024-01-01T00:00:00Z')
			expect(result).not.toHaveProperty('user_id')
			expect(store.tracks[0]).not.toHaveProperty('user_id')
			expect(mockQueryBuilder.update.mock.calls[0]![0]).not.toHaveProperty(
				'user_id'
			)
		})

		it('decodes the updated track response before assignment', async () => {
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: {
					...createMockTrack({ id: 'track-1' }),
					beatport_data: {
						searched: false,
						notFound: true,
						searchedAt: 0
					},
					user_id: 'test-user-id'
				},
				error: null
			})

			try {
				const result = await store.updateTrack('track-1', { title: 'Updated' })

				expect(result?.beatport_data).toBeNull()
				expect(store.tracks[0]!.beatport_data).toBeNull()
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledOnce()
			} finally {
				consoleWarn.mockRestore()
			}
		})

		it('sets isUpdatingTrack during update', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]
			const response = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValue(response.promise)

			const updatePromise = store.updateTrack('track-1', { title: 'Updated' })
			await vi.waitFor(() => expect(store.isUpdatingTrack).toBe(true))

			response.resolve({
				data: createMockOwnedTrack({ id: 'track-1' }),
				error: null
			})
			await updatePromise
			expect(store.isUpdatingTrack).toBe(false)
		})

		it('serializes audio_features in update payloads', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockOwnedTrack({ id: 'track-1' }),
				error: null
			})

			await store.updateTrack('track-1', {
				audio_features: {
					version: 1,
					updatedAt: '2026-07-09T00:00:00.000Z',
					applied: {
						bpm: null,
						keyMode: null
					},
					match: {
						confidence: 'manual',
						score: 0,
						reasons: [],
						warnings: []
					},
					sources: {}
				}
			})

			expect(mockQueryBuilder.update).toHaveBeenCalledWith(
				expect.objectContaining({
					audio_features: expect.objectContaining({
						version: 1,
						updatedAt: '2026-07-09T00:00:00.000Z'
					})
				})
			)
		})

		it('serializes legacy Beatport not-found markers in update payloads', async () => {
			const store = useTracksStore()
			const beatportNotFound = {
				searched: true,
				notFound: true,
				searchedAt: 1783832400000
			}
			store.tracks = [createMockTrack({ id: 'track-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockOwnedTrack({
					id: 'track-1',
					beatport_data: beatportNotFound
				}),
				error: null
			})

			await store.updateTrack('track-1', {
				beatport_data: beatportNotFound
			})

			expect(mockQueryBuilder.update).toHaveBeenCalledWith(
				expect.objectContaining({ beatport_data: beatportNotFound })
			)
		})
	})

	describe('updateTracksBatch', () => {
		it('returns per-row results and suppresses per-row toasts', async () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1', title: 'Original 1' }),
				createMockTrack({ id: 'track-2', title: 'Original 2' })
			]
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: createMockOwnedTrack({ id: 'track-1', title: 'Updated 1' }),
					error: null
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Update failed')
				})

			const progress: number[] = []
			const outcome = await store.updateTracksBatch(
				[
					{
						id: 'track-1',
						updates: { title: 'Updated 1' },
						preconditions: {
							bpmMustBeNull: true,
							keyModeMustBeNull: true
						}
					},
					{ id: 'track-2', updates: { title: 'Updated 2' } }
				],
				{
					onProgress: (completed) => progress.push(completed)
				}
			)

			expect(outcome.cancelled).toBe(false)
			expect(outcome.results).toMatchObject([
				{ id: 'track-1', success: true, error: null },
				{ id: 'track-2', success: false, error: 'Update failed' }
			])
			expect(progress).toEqual([1, 2])
			expect(store.tracks[0]!.title).toBe('Updated 1')
			expect(store.tracks[1]!.title).toBe('Original 2')
			expect(mockQueryBuilder.is).toHaveBeenCalledWith('bpm', null)
			expect(mockQueryBuilder.is).toHaveBeenCalledWith('key', null)
			expect(mockQueryBuilder.is).toHaveBeenCalledWith('mode', null)
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
		})
	})

	describe('deleteTrack', () => {
		it('returns false when track not found', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'existing-track' })]

			const result = await store.deleteTrack('non-existent')

			expect(result).toBe(false)
		})

		it('performs optimistic delete', async () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1' }),
				createMockTrack({ id: 'track-2' })
			]

			const response = createDeferred<{
				data: { id: string; user_id: string }
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValue(response.promise)
			// Start delete but don't await
			const deletePromise = store.deleteTrack('track-1')

			// Track should be optimistically removed
			await vi.waitFor(() => expect(store.tracks.length).toBe(1))
			expect(store.tracks[0]!.id).toBe('track-2')

			response.resolve({
				data: { id: 'track-1', user_id: 'test-user-id' },
				error: null
			})
			await deletePromise
		})

		it('reverts on delete error', async () => {
			const store = useTracksStore()
			const track1 = createMockTrack({ id: 'track-1' })
			const track2 = createMockTrack({ id: 'track-2' })
			store.tracks = [track1, track2]
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Delete failed')
			})

			await store.deleteTrack('track-1')

			// Should revert deletion
			expect(store.tracks.length).toBe(2)
			expect(store.tracks.map((track) => track.id)).toContain('track-1')
		})

		it('returns true on successful delete', async () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'track-1', user_id: 'test-user-id' },
				error: null
			})

			const result = await store.deleteTrack('track-1')

			expect(result).toBe(true)
			expect(store.tracks.length).toBe(0)
		})
	})

	describe('account-safe mutation reconciliation', () => {
		it('keeps create activity active until the last concurrent create settles', async () => {
			const first = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			const second = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			mockQueryBuilder.single
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(second.promise)
			const store = useTracksStore()

			const firstCreate = store.createTrack(createTrackInput('First'))
			const secondCreate = store.createTrack(createTrackInput('Second'))
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledTimes(2)
			)
			expect(store.isCreatingTrack).toBe(true)

			first.resolve({
				data: createMockOwnedTrack({ id: 'created-first' }),
				error: null
			})
			await firstCreate
			expect(store.isCreatingTrack).toBe(true)

			second.resolve({
				data: createMockOwnedTrack({ id: 'created-second' }),
				error: null
			})
			await secondCreate
			expect(store.isCreatingTrack).toBe(false)
		})

		it('keeps update activity active across a concurrent update and batch', async () => {
			const first = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			const second = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			mockQueryBuilder.single
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(second.promise)
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1' }),
				createMockTrack({ id: 'track-2' })
			]

			const update = store.updateTrack('track-1', { title: 'Update' })
			const batch = store.updateTracksBatch([
				{ id: 'track-2', updates: { title: 'Batch' } }
			])
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledTimes(2)
			)
			expect(store.isUpdatingTrack).toBe(true)

			second.resolve({
				data: createMockOwnedTrack({ id: 'track-2', title: 'Batch' }),
				error: null
			})
			await batch
			expect(store.isUpdatingTrack).toBe(true)
			first.resolve({
				data: createMockOwnedTrack({ id: 'track-1', title: 'Update' }),
				error: null
			})
			await update
			expect(store.isUpdatingTrack).toBe(false)
		})

		it.each([
			['success', null],
			['failure', new Error('Older update failed')]
		] as const)(
			'serializes an older %s update before a newer success',
			async (_label, firstError) => {
				const first = createDeferred<{
					data: ReturnType<typeof createMockOwnedTrack> | null
					error: Error | null
				}>()
				mockQueryBuilder.single
					.mockReturnValueOnce(first.promise)
					.mockResolvedValueOnce({
						data: createMockOwnedTrack({
							id: 'track-1',
							title: 'Newest server value'
						}),
						error: null
					})
				const store = useTracksStore()
				store.tracks = [createMockTrack({ id: 'track-1', title: 'Original' })]

				const older = store.updateTrack('track-1', {
					title: 'Older optimistic'
				})
				const newer = store.updateTrack('track-1', {
					title: 'Newer optimistic'
				})
				await vi.waitFor(() =>
					expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
				)
				first.resolve({
					data: firstError
						? null
						: createMockOwnedTrack({
								id: 'track-1',
								title: 'Older server value'
							}),
					error: firstError
				})
				await vi.waitFor(() =>
					expect(mockQueryBuilder.single).toHaveBeenCalledTimes(2)
				)
				await Promise.all([older, newer])

				expect(store.tracks[0]!.title).toBe('Newest server value')
			}
		)

		it.each([
			[false, false, 'Original'],
			[false, true, null],
			[true, false, 'Updated on server'],
			[true, true, null]
		] as const)(
			'serializes update(%s) then delete(%s)',
			async (updateSucceeds, deleteSucceeds, expectedTitle) => {
				const first = createDeferred<{
					data: ReturnType<typeof createMockOwnedTrack> | null
					error: Error | null
				}>()
				mockQueryBuilder.single
					.mockReturnValueOnce(first.promise)
					.mockResolvedValueOnce(
						deleteSucceeds
							? {
									data: {
										id: 'track-1',
										user_id: 'test-user-id'
									},
									error: null
								}
							: { data: null, error: new Error('Delete failed') }
					)
				const store = useTracksStore()
				store.tracks = [createMockTrack({ id: 'track-1', title: 'Original' })]

				const update = store.updateTrack('track-1', {
					title: 'Updated optimistic'
				})
				const deletion = store.deleteTrack('track-1')
				await vi.waitFor(() =>
					expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
				)
				first.resolve(
					updateSucceeds
						? {
								data: createMockOwnedTrack({
									id: 'track-1',
									title: 'Updated on server'
								}),
								error: null
							}
						: { data: null, error: new Error('Update failed') }
				)
				await vi.waitFor(() =>
					expect(mockQueryBuilder.single).toHaveBeenCalledTimes(2)
				)
				await Promise.all([update, deletion])

				const reconciled = store.getTrackById('track-1')
				if (expectedTitle === null) expect(reconciled).toBeUndefined()
				else expect(reconciled?.title).toBe(expectedTitle)
			}
		)

		it.each([
			[true, false, null],
			[false, false, 'Original'],
			[false, true, 'Updated after rollback']
		] as const)(
			'serializes delete(%s) then update(%s)',
			async (deleteSucceeds, updateSucceeds, expectedTitle) => {
				const deletionResponse = createDeferred<{
					data: { id: string; user_id: string } | null
					error: Error | null
				}>()
				mockQueryBuilder.single.mockReturnValueOnce(deletionResponse.promise)
				if (!deleteSucceeds) {
					mockQueryBuilder.single.mockResolvedValueOnce(
						updateSucceeds
							? {
									data: createMockOwnedTrack({
										id: 'track-1',
										title: 'Updated after rollback'
									}),
									error: null
								}
							: { data: null, error: new Error('Update failed') }
					)
				}
				const store = useTracksStore()
				store.tracks = [createMockTrack({ id: 'track-1', title: 'Original' })]

				const deletion = store.deleteTrack('track-1')
				const update = store.updateTrack('track-1', {
					title: 'Queued update'
				})
				await vi.waitFor(() =>
					expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
				)
				deletionResponse.resolve(
					deleteSucceeds
						? {
								data: { id: 'track-1', user_id: 'test-user-id' },
								error: null
							}
						: { data: null, error: new Error('Delete failed') }
				)
				if (!deleteSucceeds) {
					await vi.waitFor(() =>
						expect(mockQueryBuilder.single).toHaveBeenCalledTimes(2)
					)
				}
				await Promise.all([deletion, update])

				if (expectedTitle === null) {
					expect(store.getTrackById('track-1')).toBeUndefined()
					expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
				} else {
					expect(store.getTrackById('track-1')?.title).toBe(expectedTitle)
				}
			}
		)

		it('does not dispatch queued old-account row work after reset', async () => {
			const first = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(first.promise)
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', title: 'Account A' })]

			const update = store.updateTrack('track-1', { title: 'Old update' })
			const queuedDelete = store.deleteTrack('track-1')
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			)
			store.clearTracks()
			mockUserStore.supaUser = { id: 'user-b' }
			store.tracks = [createMockTrack({ id: 'track-b', title: 'Account B' })]
			first.resolve({
				data: createMockOwnedTrack({ id: 'track-1' }),
				error: null
			})

			await Promise.all([update, queuedDelete])
			expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			expect(store.tracks.map((track) => track.id)).toEqual(['track-b'])
			expect(mockToast.success).not.toHaveBeenCalled()
		})

		it('removes a row reintroduced while its owned delete is pending', async () => {
			const response = createDeferred<{
				data: { id: string; user_id: string }
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(response.promise)
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]

			const deletion = store.deleteTrack('track-1')
			await vi.waitFor(() =>
				expect(store.getTrackById('track-1')).toBeUndefined()
			)
			store.tracks = [
				createMockTrack({ id: 'track-1', title: 'Concurrent fetched copy' })
			]
			response.resolve({
				data: { id: 'track-1', user_id: 'test-user-id' },
				error: null
			})

			await expect(deletion).resolves.toBe(true)
			expect(store.getTrackById('track-1')).toBeUndefined()
		})

		it('cancels a stale batch before progress or its next dispatch', async () => {
			const first = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(first.promise)
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1' }),
				createMockTrack({ id: 'track-2' })
			]
			const progress = vi.fn()

			const batch = store.updateTracksBatch(
				[
					{ id: 'track-1', updates: { title: 'First' } },
					{ id: 'track-2', updates: { title: 'Second' } }
				],
				{ onProgress: progress }
			)
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			)
			store.clearTracks()
			mockUserStore.supaUser = { id: 'user-b' }
			store.tracks = [createMockTrack({ id: 'track-b' })]
			first.resolve({
				data: createMockOwnedTrack({ id: 'track-1' }),
				error: null
			})

			await expect(batch).resolves.toEqual({ results: [], cancelled: true })
			expect(progress).not.toHaveBeenCalled()
			expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			expect(store.tracks.map((track) => track.id)).toEqual(['track-b'])
			expect(store.isUpdatingTrack).toBe(false)
		})

		it.each([
			['create', true],
			['create', false],
			['update', true],
			['update', false],
			['delete', true],
			['delete', false]
		] as const)(
			'isolates a stale %s %s response from the replacement account',
			async (operation, succeeds) => {
				const response = createDeferred<{
					data: unknown
					error: Error | null
				}>()
				mockQueryBuilder.single.mockReturnValueOnce(response.promise)
				const store = useTracksStore()
				store.tracks = [createMockTrack({ id: 'track-a' })]

				const mutation =
					operation === 'create'
						? store.createTrack(createTrackInput())
						: operation === 'update'
							? store.updateTrack('track-a', { title: 'Old update' })
							: store.deleteTrack('track-a')
				await vi.waitFor(() =>
					expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
				)
				store.clearTracks()
				mockUserStore.supaUser = { id: 'user-b' }
				store.tracks = [createMockTrack({ id: 'track-b' })]
				response.resolve({
					data: succeeds
						? operation === 'delete'
							? { id: 'track-a', user_id: 'test-user-id' }
							: createMockOwnedTrack({ id: 'track-a' })
						: null,
					error: succeeds ? null : new Error('Old account failure')
				})

				await mutation
				expect(store.tracks.map((track) => track.id)).toEqual(['track-b'])
				expect(store.isCreatingTrack).toBe(false)
				expect(store.isUpdatingTrack).toBe(false)
				expect(mockToast.success).not.toHaveBeenCalled()
				expect(mockToast.error).not.toHaveBeenCalled()
			}
		)

		it('does not let a stale create clear replacement-account activity', async () => {
			const oldResponse = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			const replacementResponse = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			mockQueryBuilder.single
				.mockReturnValueOnce(oldResponse.promise)
				.mockReturnValueOnce(replacementResponse.promise)
			const store = useTracksStore()

			const oldCreate = store.createTrack(createTrackInput('Account A'))
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			)
			store.clearTracks()
			mockUserStore.supaUser = { id: 'user-b' }
			const replacementCreate = store.createTrack(createTrackInput('Account B'))
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledTimes(2)
			)
			oldResponse.resolve({
				data: createMockOwnedTrack({ id: 'track-a' }),
				error: null
			})
			await oldCreate
			expect(store.isCreatingTrack).toBe(true)

			replacementResponse.resolve({
				data: createMockOwnedTrack({ id: 'track-b' }, 'user-b'),
				error: null
			})
			await replacementCreate
			expect(store.isCreatingTrack).toBe(false)
			expect(store.tracks.map((track) => track.id)).toEqual(['track-b'])
			expect(mockToast.success).toHaveBeenCalledOnce()
		})

		it('cannot merge a stale account-A create into an active account-B fetch', async () => {
			const oldCreateResponse = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			const replacementFetchResponse = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(oldCreateResponse.promise)
			mockQueryBuilder.limit.mockReturnValueOnce(
				replacementFetchResponse.promise
			)
			const store = useTracksStore()

			const oldCreate = store.createTrack(createTrackInput('Account A'))
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			)
			store.clearTracks()
			mockUserStore.supaUser = { id: 'user-b' }
			const replacementFetch = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)

			oldCreateResponse.resolve({
				data: createMockOwnedTrack({ id: 'track-a' }),
				error: null
			})
			await oldCreate
			replacementFetchResponse.resolve({
				data: [createMockOwnedTrack({ id: 'track-b' }, 'user-b')],
				error: null
			})
			await replacementFetch

			expect(store.tracks.map((track) => track.id)).toEqual(['track-b'])
			expect(mockToast.success).not.toHaveBeenCalled()
		})

		it('fails closed when identity switches before mutation dispatch', async () => {
			const identity = createDeferred<string>()
			mockUserStore.resolveAuthenticatedUserId.mockReturnValueOnce(
				identity.promise
			)
			const store = useTracksStore()

			const creation = store.createTrack(createTrackInput())
			mockUserStore.supaUser = { id: 'user-b' }
			identity.resolve('test-user-id')

			await expect(creation).resolves.toBeNull()
			expect(mockQueryBuilder.insert).not.toHaveBeenCalled()
			expect(store.tracks).toEqual([])
		})

		it('re-finds the requested row after deferred identity confirmation', async () => {
			const confirmation = createDeferred<string>()
			mockUserStore.resolveAuthenticatedUserId
				.mockResolvedValueOnce('test-user-id')
				.mockReturnValueOnce(confirmation.promise)
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: createMockOwnedTrack({
					id: 'track-target',
					title: 'Server target'
				}),
				error: null
			})
			const store = useTracksStore()
			const target = createMockTrack({
				id: 'track-target',
				title: 'Original target'
			})
			const other = createMockTrack({
				id: 'track-other',
				title: 'Unrelated row'
			})
			store.tracks = [target, other]

			const update = store.updateTrack('track-target', {
				title: 'Optimistic target'
			})
			await vi.waitFor(() =>
				expect(mockUserStore.resolveAuthenticatedUserId).toHaveBeenCalledTimes(
					2
				)
			)
			store.tracks = [other, target]
			confirmation.resolve('test-user-id')
			await update

			expect(store.getTrackById('track-target')?.title).toBe('Server target')
			expect(store.getTrackById('track-other')?.title).toBe('Unrelated row')
			expect(mockQueryBuilder.eq.mock.calls).toContainEqual([
				'id',
				'track-target'
			])
		})

		it('pins mutation transports to the captured owner and validates affected rows', async () => {
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: createMockOwnedTrack({ id: 'created' }),
					error: null
				})
				.mockResolvedValueOnce({
					data: createMockOwnedTrack({ id: 'created', title: 'Updated' }),
					error: null
				})
				.mockResolvedValueOnce({
					data: { id: 'created', user_id: 'test-user-id' },
					error: null
				})
			const store = useTracksStore()

			await store.createTrack(createTrackInput())
			await store.updateTrack('created', { title: 'Updated' })
			await store.deleteTrack('created')

			expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
				expect.objectContaining({ user_id: 'test-user-id' })
			)
			expect(mockQueryBuilder.eq.mock.calls).toEqual([
				['id', 'created'],
				['user_id', 'test-user-id'],
				['id', 'created'],
				['user_id', 'test-user-id']
			])
			expect(mockQueryBuilder.select).toHaveBeenLastCalledWith('id, user_id')
		})

		it('rejects mismatched owners and zero-row deletes without leaking success', async () => {
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: createMockOwnedTrack({ id: 'wrong-create' }, 'user-b'),
					error: null
				})
				.mockResolvedValueOnce({
					data: createMockOwnedTrack({ id: 'track-1' }, 'user-b'),
					error: null
				})
				.mockResolvedValueOnce({ data: null, error: null })
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', title: 'Original' })]

			try {
				await expect(store.createTrack(createTrackInput())).resolves.toBeNull()
				await expect(
					store.updateTrack('track-1', { title: 'Optimistic' })
				).resolves.toBeNull()
				await expect(store.deleteTrack('track-1')).resolves.toBe(false)

				expect(store.getTrackById('track-1')?.title).toBe('Original')
				expect(store.getTrackById('wrong-create')).toBeUndefined()
				expect(mockToast.success).not.toHaveBeenCalled()
			} finally {
				consoleError.mockRestore()
			}
		})
	})

	describe('getTrackById', () => {
		it('returns undefined when track not found', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]

			const result = store.getTrackById('non-existent')

			expect(result).toBeUndefined()
		})

		it('returns track when found', () => {
			const store = useTracksStore()
			const track = createMockTrack({ id: 'track-1', title: 'Found Track' })
			store.tracks = [track]

			const result = store.getTrackById('track-1')

			expect(result?.title).toBe('Found Track')
		})

		it('rebuilds the index after replacement, additions, removals, and reset', () => {
			const store = useTracksStore()
			const original = createMockTrack({ id: 'track-1', title: 'Original' })
			store.tracks = [original]

			expect(store.getTrackById('track-1')?.title).toBe('Original')

			const replacement = createMockTrack({
				id: 'track-1',
				title: 'Replacement'
			})
			store.tracks = [replacement]
			expect(store.getTrackById('track-1')?.title).toBe('Replacement')

			const added = createMockTrack({ id: 'track-2' })
			store.tracks.push(added)
			expect(store.getTrackById('track-2')?.id).toBe(added.id)

			store.tracks.splice(0, 1)
			expect(store.getTrackById('track-1')).toBeUndefined()

			store.clearTracks()
			expect(store.getTrackById('track-2')).toBeUndefined()
		})
	})

	describe('getTracksByRecordId', () => {
		it('returns empty array when no tracks match', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack({ record_id: 'record-1' })]

			const result = store.getTracksByRecordId('record-2')

			expect(result).toEqual([])
		})

		it('returns all tracks for a record', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1', record_id: 'record-1' }),
				createMockTrack({ id: 'track-2', record_id: 'record-1' }),
				createMockTrack({ id: 'track-3', record_id: 'record-2' })
			]

			const result = store.getTracksByRecordId('record-1')

			expect(result.length).toBe(2)
			expect(result.map((t) => t.id)).toEqual(['track-1', 'track-2'])
		})

		it('rebuilds grouped indexes after replacement, mutation, and reset', () => {
			const store = useTracksStore()
			const first = createMockTrack({
				id: 'track-1',
				record_id: 'record-1'
			})
			const second = createMockTrack({
				id: 'track-2',
				record_id: 'record-1'
			})
			store.tracks = [first, second]

			expect(store.getTracksByRecordId('record-1')).toEqual([first, second])

			const replacement = createMockTrack({
				id: 'track-3',
				record_id: 'record-2'
			})
			store.tracks = [replacement]
			expect(store.getTracksByRecordId('record-1')).toEqual([])
			expect(store.getTracksByRecordId('record-2')).toEqual([replacement])

			const added = createMockTrack({
				id: 'track-4',
				record_id: 'record-2'
			})
			store.tracks.push(added)
			expect(store.getTracksByRecordId('record-2')).toEqual([
				replacement,
				added
			])

			store.tracks.splice(0, 1)
			expect(store.getTracksByRecordId('record-2')).toEqual([added])

			store.clearTracks()
			expect(store.getTracksByRecordId('record-2')).toEqual([])
		})
	})

	describe('searchTracks', () => {
		it('returns all tracks for empty query', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack(), createMockTrack()]

			const result = store.searchTracks('')

			expect(result.length).toBe(2)
		})

		it('returns all tracks for whitespace-only query', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack(), createMockTrack()]

			const result = store.searchTracks('   ')

			expect(result.length).toBe(2)
		})

		it('searches in title (case-insensitive)', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'match', title: 'Funky Groove' }),
				createMockTrack({ id: 'no-match', title: 'Techno Beat' })
			]

			const result = store.searchTracks('funky')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('searches in artists', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithArtists(
					[{ discogs_id: 1, name: 'Daft Punk', role: null }],
					{ id: 'match' }
				),
				createMockTrackWithArtists(
					[{ discogs_id: 2, name: 'Chemical Brothers', role: null }],
					{ id: 'no-match' }
				)
			]

			const result = store.searchTracks('daft')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('searches in extraartists', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({
					id: 'match',
					extraartists: [{ discogs_id: 1, name: 'DJ Premier', role: 'Remix' }]
				}),
				createMockTrack({
					id: 'no-match',
					extraartists: []
				})
			]

			const result = store.searchTracks('premier')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('searches in genres', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'match', genres: ['Deep House', 'Techno'] }),
				createMockTrack({ id: 'no-match', genres: ['Drum and Bass'] })
			]

			const result = store.searchTracks('house')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('searches in position', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'match', position: 'B2' }),
				createMockTrack({ id: 'no-match', position: 'A1' })
			]

			const result = store.searchTracks('B2')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('searches in BPM', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrackWithBpm(128, { id: 'match' }),
				createMockTrackWithBpm(130, { id: 'no-match' })
			]

			const result = store.searchTracks('128')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('match')
		})

		it('handles tracks with null position', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({
					id: 'no-position',
					position: null as unknown as string
				}),
				createMockTrack({ id: 'with-position', position: 'A1' })
			]

			const result = store.searchTracks('A1')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('with-position')
		})

		it('handles tracks with null BPM', () => {
			const store = useTracksStore()
			store.tracks = [
				createMockTrack({ id: 'no-bpm', bpm: null }),
				createMockTrackWithBpm(128, { id: 'with-bpm' })
			]

			const result = store.searchTracks('128')

			expect(result.length).toBe(1)
			expect(result[0]!.id).toBe('with-bpm')
		})
	})

	describe('clearTracks', () => {
		it('empties the tracks array', () => {
			const store = useTracksStore()
			store.tracks = [createMockTrack(), createMockTrack()]

			store.clearTracks()

			expect(store.tracks).toEqual([])
		})
	})

	describe('removeTracksByRecordId', () => {
		it('removes matching tracks and preserves unrelated tracks', () => {
			const store = useTracksStore()
			const matchingTrack = createMockTrack({
				id: 'matching-track',
				record_id: 'record-1'
			})
			const unrelatedTrack = createMockTrack({
				id: 'unrelated-track',
				record_id: 'record-2',
				title: 'Keep me'
			})
			store.tracks = [matchingTrack, unrelatedTrack]
			const originalTracks = store.tracks

			store.removeTracksByRecordId('record-1')

			expect(store.tracks).not.toBe(originalTracks)
			expect(store.tracks).toEqual([unrelatedTrack])
		})
	})
})
