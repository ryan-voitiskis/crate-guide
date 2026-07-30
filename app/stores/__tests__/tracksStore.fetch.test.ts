import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createDeferred,
	createMockOwnedTrack,
	createTracksStore,
	mockQueryBuilder,
	mockSupabaseClient,
	mockToast,
	mockUserStore,
	resetTracksStoreHarness
} from './tracksStoreTestHarness'

describe('tracksStore fetch and reconciliation', () => {
	beforeEach(resetTracksStoreHarness)

	describe('fetchAllTracks', () => {
		it('returns false and preserves tracks when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = createTracksStore()
			const existingTrack = createMockTrack({ id: 'existing-track' })
			store.tracks = [existingTrack]

			const result = await store.fetchAllTracks()

			expect(result).toBe(false)
			expect(store.tracks).toEqual([existingTrack])
			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
			expect(store.isLoadingTracks).toBe(false)
		})

		it('returns true for a successful empty response and resets loading', async () => {
			const store = createTracksStore()
			mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null })

			const fetchPromise = store.fetchAllTracks()
			expect(store.isLoadingTracks).toBe(true)

			await expect(fetchPromise).resolves.toBe(true)
			expect(store.tracks).toEqual([])
			expect(store.isLoadingTracks).toBe(false)
		})

		it('returns true and populates tracks from a non-empty response', async () => {
			const store = createTracksStore()
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
			const store = createTracksStore()

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
			const store = createTracksStore()

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
			const store = createTracksStore()

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
			const store = createTracksStore()

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
			const store = createTracksStore()

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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			expect(mockUserStore.resolveAuthenticatedUserId).not.toHaveBeenCalled()
			expect(mockSupabaseClient.from).toHaveBeenCalledOnce()
			expect(store.isLoadingTracks).toBe(false)

			mockQueryBuilder.limit.mockResolvedValue({ data: [], error: null })
			await expect(store.fetchAllTracks()).resolves.toBe(true)
			expect(mockUserStore.resolveAuthenticatedUserId).not.toHaveBeenCalled()
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('waits for an older traversal and coalesces simultaneous fresh callers', async () => {
			const oldResponse = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			const freshResponse = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			mockQueryBuilder.limit
				.mockReturnValueOnce(oldResponse.promise)
				.mockReturnValueOnce(freshResponse.promise)
			const store = createTracksStore()

			const oldFetch = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)
			const firstFresh = store.fetchAllTracks({ fresh: true })
			const secondFresh = store.fetchAllTracks({ fresh: true })
			expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()

			oldResponse.resolve({ data: [], error: null })
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)
			freshResponse.resolve({ data: [], error: null })

			await expect(
				Promise.all([oldFetch, firstFresh, secondFresh])
			).resolves.toEqual([true, true, true])
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})
	})
})
