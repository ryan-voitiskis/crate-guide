import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	type BatchRpcArgs,
	createAudioFeatures,
	createBatchRpcData,
	createBatchUpdate,
	createDeferred,
	createMockOwnedTrack,
	createTracksStore,
	mockQueryBuilder,
	mockSupabaseClient,
	mockToast,
	mockUserStore,
	resetTracksStoreHarness
} from './tracksStoreTestHarness'

describe('tracksStore CRUD', () => {
	beforeEach(resetTracksStoreHarness)

	describe('createTrack', () => {
		it('returns null when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = createTracksStore()

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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
			store.tracks = [createMockTrack({ id: 'existing-track' })]

			const result = await store.updateTrack('non-existent', {
				title: 'Updated'
			})

			expect(result).toBeNull()
		})

		it('performs optimistic update', async () => {
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
		it('returns ordered mixed statuses, rolls back failures, and suppresses per-row toasts', async () => {
			const store = createTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1', bpm: null }),
				createMockTrack({ id: 'track-2', key: null, mode: null })
			]
			mockSupabaseClient.rpc.mockImplementationOnce(
				async (_name, args: BatchRpcArgs) => ({
					data: createBatchRpcData(args, (item, index) =>
						index === 0
							? {
									status: 'updated',
									track: createMockOwnedTrack({
										id: item.track_id,
										bpm: 128,
										audio_features: createAudioFeatures()
									})
								}
							: { status: 'stale', issueCode: 'stale_revision' }
					),
					error: null
				})
			)

			const progress: number[] = []
			const outcome = await store.updateTracksBatch(
				[
					createBatchUpdate('track-1', {
						bpm: 128,
						audio_features: createAudioFeatures()
					}),
					createBatchUpdate('track-2', {
						key: 9,
						mode: 0,
						audio_features: createAudioFeatures()
					})
				],
				{
					onProgress: (completed) => progress.push(completed)
				}
			)

			expect(outcome.cancelled).toBe(false)
			expect(outcome.results).toMatchObject([
				{ id: 'track-1', status: 'updated', success: true, error: null },
				{
					id: 'track-2',
					status: 'stale',
					success: false,
					issue: { code: 'stale_revision' }
				}
			])
			expect(outcome.requiresReview).toBe(true)
			expect(progress).toEqual([1, 2])
			expect(store.getTrackById('track-1')?.bpm).toBe(128)
			expect(store.getTrackById('track-2')?.key).toBeNull()
			expect(mockSupabaseClient.rpc).toHaveBeenCalledOnce()
			expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
				'persist_track_enrichment_batch',
				expect.objectContaining({
					p_operation_id: expect.any(String),
					p_operation_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
					p_items: expect.arrayContaining([
						expect.objectContaining({
							ordinal: 0,
							track_id: 'track-1',
							expected_updated_at: '2026-07-22T00:00:00.000Z'
						})
					])
				})
			)
			expect(mockQueryBuilder.update).not.toHaveBeenCalled()
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it.each([
			[1, 1],
			[99, 1],
			[100, 1],
			[101, 2],
			[500, 5]
		])(
			'persists %i ordered rows in %i bounded request(s)',
			async (rowCount, requestCount) => {
				const store = createTracksStore()
				store.tracks = Array.from({ length: rowCount }, (_, index) =>
					createMockTrack({ id: `track-${index}`, bpm: null })
				)
				mockSupabaseClient.rpc.mockImplementation(
					async (_name, args: BatchRpcArgs) => ({
						data: createBatchRpcData(args, (item) => ({
							status: 'updated',
							track: createMockOwnedTrack({
								id: item.track_id,
								bpm: 128,
								audio_features: createAudioFeatures()
							})
						})),
						error: null
					})
				)
				const progress = vi.fn()

				const outcome = await store.updateTracksBatch(
					Array.from({ length: rowCount }, (_, index) =>
						createBatchUpdate(`track-${index}`, {
							bpm: 128,
							audio_features: createAudioFeatures()
						})
					),
					{ onProgress: progress }
				)

				expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(requestCount)
				expect(
					mockSupabaseClient.rpc.mock.calls.map(
						([, args]) => (args as BatchRpcArgs).p_items.length
					)
				).toEqual(
					Array.from({ length: requestCount }, (_, requestIndex) =>
						Math.min(100, rowCount - requestIndex * 100)
					)
				)
				expect(outcome.results).toHaveLength(rowCount)
				expect(outcome.results.map((result) => result.id)).toEqual(
					Array.from({ length: rowCount }, (_, index) => `track-${index}`)
				)
				expect(
					outcome.results.every((result) => result.status === 'updated')
				).toBe(true)
				expect(progress).toHaveBeenCalledTimes(rowCount)
				expect(outcome).toMatchObject({
					cancelled: false,
					requiresReview: false
				})
			}
		)

		it('retries an ambiguous request with the same operation identity', async () => {
			const store = createTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', bpm: null })]
			let firstArgs: BatchRpcArgs | null = null
			mockSupabaseClient.rpc
				.mockImplementationOnce(async (_name, args: BatchRpcArgs) => {
					firstArgs = args
					return { data: null, error: new Error('Response lost') }
				})
				.mockImplementationOnce(async (_name, args: BatchRpcArgs) => ({
					data: createBatchRpcData(args, (item) => ({
						status: 'updated',
						track: createMockOwnedTrack({ id: item.track_id, bpm: 128 })
					})),
					error: null
				}))

			const outcome = await store.updateTracksBatch([
				createBatchUpdate('track-1', {
					bpm: 128,
					audio_features: createAudioFeatures()
				})
			])

			expect(outcome.results[0]).toMatchObject({ status: 'updated' })
			expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(2)
			expect(mockSupabaseClient.rpc.mock.calls[1]![1]).toEqual(firstArgs)
		})

		it('returns unknown, stops future chunks, and refreshes after two ambiguous responses', async () => {
			const store = createTracksStore()
			const sourceTracks = Array.from({ length: 101 }, (_, index) =>
				createMockTrack({ id: `track-${index}`, bpm: null })
			)
			store.tracks = sourceTracks
			mockQueryBuilder.limit.mockResolvedValueOnce({
				data: sourceTracks.map((track) => ({
					...track,
					user_id: 'test-user-id'
				})),
				error: null
			})
			mockSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: new Error('Network timeout')
			})
			const progress = vi.fn()

			const outcome = await store.updateTracksBatch(
				sourceTracks.map((track) => createBatchUpdate(track.id)),
				{ onProgress: progress }
			)

			expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(2)
			expect(mockSupabaseClient.rpc.mock.calls[1]![1]).toEqual(
				mockSupabaseClient.rpc.mock.calls[0]![1]
			)
			expect(
				outcome.results
					.slice(0, 100)
					.every((result) => result.status === 'unknown')
			).toBe(true)
			expect(outcome.results[100]).toMatchObject({
				status: 'unattempted',
				issue: { code: 'prior_chunk_unknown' }
			})
			expect(outcome.requiresReview).toBe(true)
			expect(progress).toHaveBeenCalledTimes(100)
			expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
		})

		it('treats a receipt-capacity rejection as definitive and stops future chunks', async () => {
			const store = createTracksStore()
			const sourceTracks = Array.from({ length: 101 }, (_, index) =>
				createMockTrack({ id: `track-${index}`, bpm: null })
			)
			store.tracks = sourceTracks
			mockSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: { code: '54000', message: 'Receipt capacity reached' }
			})
			const progress = vi.fn()

			const outcome = await store.updateTracksBatch(
				sourceTracks.map((track) => createBatchUpdate(track.id)),
				{ onProgress: progress }
			)

			expect(mockSupabaseClient.rpc).toHaveBeenCalledOnce()
			expect(
				outcome.results
					.slice(0, 100)
					.every((result) => result.status === 'invalid')
			).toBe(true)
			expect(
				outcome.results.every(
					(result) => result.issue?.code === 'receipt_capacity'
				)
			).toBe(true)
			expect(outcome.results[100]?.status).toBe('unattempted')
			expect(progress).toHaveBeenCalledTimes(100)
			expect(sourceTracks.every((track) => track.bpm === null)).toBe(true)
		})

		it('rejects duplicate IDs locally without an RPC', async () => {
			const store = createTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', bpm: null })]
			const progress = vi.fn()

			const outcome = await store.updateTracksBatch(
				[createBatchUpdate('track-1'), createBatchUpdate('track-1')],
				{ onProgress: progress }
			)

			expect(outcome.results).toMatchObject([
				{ status: 'invalid', issue: { code: 'duplicate_track_id' } },
				{ status: 'invalid', issue: { code: 'duplicate_track_id' } }
			])
			expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()
			expect(progress).toHaveBeenCalledTimes(2)
		})

		it('returns an empty ordered outcome without dispatching an RPC', async () => {
			const store = createTracksStore()

			await expect(store.updateTracksBatch([])).resolves.toEqual({
				results: [],
				cancelled: false,
				requiresReview: false
			})
			expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()
		})

		it('stops before a future chunk when the account changes after settled progress', async () => {
			const store = createTracksStore()
			const sourceTracks = Array.from({ length: 101 }, (_, index) =>
				createMockTrack({ id: `track-${index}`, bpm: null })
			)
			store.tracks = sourceTracks
			mockSupabaseClient.rpc.mockImplementationOnce(
				async (_name, args: BatchRpcArgs) => ({
					data: createBatchRpcData(args, (item) => ({
						status: 'updated',
						track: createMockOwnedTrack({ id: item.track_id, bpm: 128 })
					})),
					error: null
				})
			)

			const outcome = await store.updateTracksBatch(
				sourceTracks.map((track) => createBatchUpdate(track.id)),
				{
					onProgress: (completed) => {
						if (completed !== 100) return
						store.clearTracks()
						mockUserStore.supaUser = { id: 'user-b' }
						store.tracks = [createMockTrack({ id: 'track-b' })]
					}
				}
			)

			expect(mockSupabaseClient.rpc).toHaveBeenCalledOnce()
			expect(outcome.cancelled).toBe(true)
			expect(
				outcome.results
					.slice(0, 100)
					.every((result) => result.status === 'updated')
			).toBe(true)
			expect(outcome.results[100]).toMatchObject({
				status: 'unattempted',
				issue: { code: 'account_replaced' }
			})
			expect(store.tracks.map((track) => track.id)).toEqual(['track-b'])
		})

		it('serializes a same-track manual edit after the batch reconciliation', async () => {
			const response = createDeferred<{ data: unknown; error: null }>()
			let batchArgs!: BatchRpcArgs
			mockSupabaseClient.rpc.mockImplementationOnce(
				(_name, args: BatchRpcArgs) => {
					batchArgs = args
					return response.promise
				}
			)
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: createMockOwnedTrack({
					id: 'track-1',
					bpm: 128,
					title: 'Manual edit wins'
				}),
				error: null
			})
			const store = createTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1', bpm: null })]

			const batch = store.updateTracksBatch([
				createBatchUpdate('track-1', {
					bpm: 128,
					audio_features: createAudioFeatures()
				})
			])
			await vi.waitFor(() =>
				expect(mockSupabaseClient.rpc).toHaveBeenCalledOnce()
			)
			const manual = store.updateTrack('track-1', { title: 'Manual edit wins' })
			await Promise.resolve()
			expect(mockQueryBuilder.single).not.toHaveBeenCalled()

			response.resolve({
				data: createBatchRpcData(batchArgs, (item) => ({
					status: 'updated',
					track: createMockOwnedTrack({ id: item.track_id, bpm: 128 })
				})),
				error: null
			})
			await batch
			await manual

			expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			expect(store.getTrackById('track-1')).toMatchObject({
				bpm: 128,
				title: 'Manual edit wins'
			})
		})

		it('does not publish an updated row that fails ownership decoding', async () => {
			const original = createMockTrack({ id: 'track-1', bpm: null })
			const store = createTracksStore()
			store.tracks = [original]
			mockQueryBuilder.limit.mockResolvedValueOnce({
				data: [{ ...original, user_id: 'test-user-id' }],
				error: null
			})
			mockSupabaseClient.rpc.mockImplementationOnce(
				async (_name, args: BatchRpcArgs) => ({
					data: createBatchRpcData(args, (item) => ({
						status: 'updated',
						track: createMockOwnedTrack(
							{ id: item.track_id, bpm: 128 },
							'other-user'
						)
					})),
					error: null
				})
			)

			const outcome = await store.updateTracksBatch([
				createBatchUpdate('track-1')
			])

			expect(outcome.results[0]).toMatchObject({
				status: 'invalid',
				issue: { code: 'invalid_response' }
			})
			expect(outcome.requiresReview).toBe(true)
			expect(store.getTrackById('track-1')?.bpm).toBeNull()
			expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
		})
	})

	describe('deleteTrack', () => {
		it('returns false when track not found', async () => {
			const store = createTracksStore()
			store.tracks = [createMockTrack({ id: 'existing-track' })]

			const result = await store.deleteTrack('non-existent')

			expect(result).toBe(false)
		})

		it('performs optimistic delete', async () => {
			const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
})
