import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	type BatchRpcArgs,
	createAudioFeatures,
	createBatchRpcData,
	createBatchUpdate,
	createDeferred,
	createMockOwnedTrack,
	createTrackInput,
	createTracksStore,
	mockQueryBuilder,
	mockSupabaseClient,
	mockToast,
	mockUserStore,
	resetTracksStoreHarness
} from './tracksStoreTestHarness'

describe('tracksStore account lifecycle and mutation reconciliation', () => {
	beforeEach(resetTracksStoreHarness)

	describe('initial state', () => {
		it('starts with empty tracks array', () => {
			const store = createTracksStore()
			expect(store.tracks).toEqual([])
		})

		it('starts with loading states as false', () => {
			const store = createTracksStore()
			expect(store.isLoadingTracks).toBe(false)
			expect(store.isCreatingTrack).toBe(false)
			expect(store.isUpdatingTrack).toBe(false)
		})
	})

	describe('account-safe mutation reconciliation', () => {
		it('preserves a committed update over an older fetch response', async () => {
			const oldFetchResponse = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			const original = createMockTrack({ id: 'track-1', title: 'Original' })
			const updated = createMockOwnedTrack({
				id: 'track-1',
				title: 'Updated on server'
			})
			mockQueryBuilder.limit.mockReturnValueOnce(oldFetchResponse.promise)
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: updated,
				error: null
			})
			const store = createTracksStore()
			store.tracks = [original]
			const oldFetch = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)

			await expect(
				store.updateTrack('track-1', { title: 'Updated on server' })
			).resolves.toMatchObject({ title: 'Updated on server' })
			oldFetchResponse.resolve({
				data: [createMockOwnedTrack({ id: 'track-1', title: 'Original' })],
				error: null
			})
			await expect(oldFetch).resolves.toBe(true)

			expect(store.getTrackById('track-1')?.title).toBe('Updated on server')
		})

		it('does not resurrect a committed delete from an older fetch', async () => {
			const oldFetchResponse = createDeferred<{
				data: Array<ReturnType<typeof createMockOwnedTrack>>
				error: null
			}>()
			const deletedTrack = createMockTrack({ id: 'track-1' })
			mockQueryBuilder.limit.mockReturnValueOnce(oldFetchResponse.promise)
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: { id: 'track-1', user_id: 'test-user-id' },
				error: null
			})
			const store = createTracksStore()
			store.tracks = [deletedTrack]
			const oldFetch = store.fetchAllTracks()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)

			await expect(store.deleteTrack('track-1')).resolves.toBe(true)
			oldFetchResponse.resolve({
				data: [createMockOwnedTrack({ id: 'track-1' })],
				error: null
			})
			await expect(oldFetch).resolves.toBe(true)

			expect(store.getTrackById('track-1')).toBeUndefined()
		})

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
			const store = createTracksStore()

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
				data: unknown
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(first.promise)
			let batchArgs!: BatchRpcArgs
			mockSupabaseClient.rpc.mockImplementationOnce(
				(_name, args: BatchRpcArgs) => {
					batchArgs = args
					return second.promise
				}
			)
			const store = createTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1' }),
				createMockTrack({ id: 'track-2', bpm: null })
			]

			const update = store.updateTrack('track-1', { title: 'Update' })
			const batch = store.updateTracksBatch([
				createBatchUpdate('track-2', {
					bpm: 128,
					audio_features: createAudioFeatures()
				})
			])
			await vi.waitFor(() =>
				expect(mockSupabaseClient.rpc).toHaveBeenCalledOnce()
			)
			expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			expect(store.isUpdatingTrack).toBe(true)

			second.resolve({
				data: createBatchRpcData(batchArgs, (item) => ({
					status: 'updated',
					track: createMockOwnedTrack({ id: item.track_id, bpm: 128 })
				})),
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
				const store = createTracksStore()
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
				const store = createTracksStore()
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
				const store = createTracksStore()
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
			const store = createTracksStore()
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
			const store = createTracksStore()
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
				data: unknown
				error: null
			}>()
			let batchArgs!: BatchRpcArgs
			mockSupabaseClient.rpc.mockImplementationOnce(
				(_name, args: BatchRpcArgs) => {
					batchArgs = args
					return first.promise
				}
			)
			const store = createTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1', bpm: null }),
				createMockTrack({ id: 'track-2', bpm: null })
			]
			const progress = vi.fn()

			const batch = store.updateTracksBatch(
				[createBatchUpdate('track-1'), createBatchUpdate('track-2')],
				{ onProgress: progress }
			)
			await vi.waitFor(() =>
				expect(mockSupabaseClient.rpc).toHaveBeenCalledOnce()
			)
			store.clearTracks()
			mockUserStore.supaUser = { id: 'user-b' }
			store.tracks = [createMockTrack({ id: 'track-b' })]
			first.resolve({
				data: createBatchRpcData(batchArgs, (item) => ({
					status: 'updated',
					track: createMockOwnedTrack({ id: item.track_id })
				})),
				error: null
			})

			await expect(batch).resolves.toMatchObject({
				cancelled: true,
				requiresReview: false,
				results: [
					{ status: 'unattempted', issue: { code: 'account_replaced' } },
					{ status: 'unattempted', issue: { code: 'account_replaced' } }
				]
			})
			expect(progress).not.toHaveBeenCalled()
			expect(mockSupabaseClient.rpc).toHaveBeenCalledOnce()
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
				const store = createTracksStore()
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
			const store = createTracksStore()

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
			const store = createTracksStore()

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
			const store = createTracksStore()

			const creation = store.createTrack(createTrackInput())
			store.clearTracks()
			mockUserStore.supaUser = { id: 'user-b' }

			await expect(creation).resolves.toBeNull()
			expect(mockQueryBuilder.insert).not.toHaveBeenCalled()
			expect(store.tracks).toEqual([])
		})

		it('re-finds the requested row after a deferred repository response', async () => {
			const response = createDeferred<{
				data: ReturnType<typeof createMockOwnedTrack>
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(response.promise)
			const store = createTracksStore()
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
				expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			)
			store.tracks = [other, target]
			response.resolve({
				data: createMockOwnedTrack({
					id: 'track-target',
					title: 'Server target'
				}),
				error: null
			})
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
			const store = createTracksStore()

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
			const store = createTracksStore()
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

	describe('clearTracks', () => {
		it('empties the tracks array', () => {
			const store = createTracksStore()
			store.tracks = [createMockTrack(), createMockTrack()]

			store.clearTracks()

			expect(store.tracks).toEqual([])
		})
	})

	describe('removeTracksByRecordId', () => {
		it('removes matching tracks and preserves unrelated tracks', () => {
			const store = createTracksStore()
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
