import { createMockRecord } from 'test/mocks/fixtures/records'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	cleanupResponse,
	createDeferred,
	createRecordsStore,
	expectCleanupInvocationsWithoutBodies,
	mockBoundFunctionsInvoke,
	mockQueryBuilder,
	mockStorageBucket,
	mockSupabaseClient,
	mockToast,
	mockTracksStore,
	mockUserStore,
	resetRecordsStoreHarness,
	successfulRemovalResponse
} from './recordsStoreTestHarness'

describe('recordsStore CRUD', () => {
	beforeEach(resetRecordsStoreHarness)
	afterEach(() => vi.useRealTimers())

	describe('createRecordWithTracks', () => {
		it('returns null when user is not signed in', async () => {
			mockUserStore.supaUser = null
			const store = createRecordsStore()

			const result = await store.createRecordWithTracks({
				title: 'Manual Record',
				tracks: []
			})

			expect(result).toBeNull()
			expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()
		})

		it('imports a manual record with tracks and refreshes local data', async () => {
			const store = createRecordsStore()
			const createdRecord = createMockRecord({
				id: 'manual-record-id',
				title: 'Manual Record'
			})

			mockSupabaseClient.rpc.mockResolvedValue({
				data: {
					success: true,
					record_id: 'manual-record-id',
					tracks_inserted: 2
				},
				error: null
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: [createdRecord],
				error: null
			})

			const result = await store.createRecordWithTracks({
				title: 'Manual Record',
				artistName: 'Manual Artist',
				labelName: 'Manual Label',
				catno: 'MAN-001',
				year: 2026,
				cover: 'https://example.com/cover.jpg',
				defaultGenres: ['House'],
				defaultRpm: 45,
				tracks: [
					{
						title: 'First Track',
						position: 'A1',
						duration: 180000,
						bpm: 128,
						key: 0,
						mode: 1
					},
					{
						title: 'Second Track',
						artistName: 'Other Artist',
						position: 'B1'
					}
				]
			})

			expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
				'import_record_with_tracks',
				{
					record: expect.objectContaining({
						user_id: 'test-user-id',
						title: 'Manual Record',
						artists: [{ name: 'Manual Artist', role: null }],
						labels: [{ name: 'Manual Label', catno: 'MAN-001' }],
						year: 2026,
						cover: 'https://example.com/cover.jpg'
					}),
					tracks: [
						expect.objectContaining({
							title: 'First Track',
							position: 'A1',
							artists: [{ name: 'Manual Artist', role: null }],
							genres: ['House'],
							rpm: 45
						}),
						expect.objectContaining({
							title: 'Second Track',
							position: 'B1',
							artists: [{ name: 'Other Artist', role: null }],
							genres: ['House'],
							rpm: 45
						})
					]
				}
			)
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalled()
			expect(result?.id).toBe('manual-record-id')
			expect(store.records[0]!.id).toBe('manual-record-id')
		})

		it('starts a post-commit traversal after an older manual-create fetch', async () => {
			const oldResponse = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			const createdRecord = createMockRecord({
				id: 'manual-record-id',
				title: 'Authoritative manual record'
			})
			mockQueryBuilder.limit
				.mockReturnValueOnce(oldResponse.promise)
				.mockResolvedValueOnce({ data: [createdRecord], error: null })
			mockSupabaseClient.rpc.mockResolvedValue({
				data: {
					success: true,
					record_id: 'manual-record-id',
					tracks_inserted: 1
				},
				error: null
			})
			const store = createRecordsStore()
			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)

			const creation = store.createRecordWithTracks({
				title: 'Manual record',
				tracks: [{ title: 'Track' }]
			})
			await vi.waitFor(() =>
				expect(mockSupabaseClient.rpc).toHaveBeenCalledOnce()
			)
			expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()

			oldResponse.resolve({ data: [], error: null })
			await expect(oldFetch).resolves.toBe(true)
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)
			await expect(creation).resolves.toEqual(createdRecord)

			expect(store.records.filter(({ id }) => id === createdRecord.id)).toEqual(
				[createdRecord]
			)
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledWith({
				fresh: true
			})
		})

		it('returns committed manual creation when presentation refresh fails', async () => {
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			mockSupabaseClient.rpc.mockResolvedValue({
				data: {
					success: true,
					record_id: 'manual-record-id',
					tracks_inserted: 0
				},
				error: null
			})
			mockQueryBuilder.limit.mockResolvedValue({
				data: null,
				error: new Error('Refresh failed')
			})
			mockTracksStore.fetchAllTracks.mockResolvedValueOnce(false)
			const store = createRecordsStore()

			try {
				const result = await store.createRecordWithTracks({
					title: 'Manual record',
					tracks: []
				})

				expect(result).toMatchObject({
					id: 'manual-record-id',
					title: 'Manual record',
					user_id: 'test-user-id'
				})
				expect(store.getRecordById('manual-record-id')).toEqual(result)
				expect(mockToast.success).toHaveBeenCalledWith(
					'Record created successfully.'
				)
				expect(mockToast.warning).toHaveBeenCalledWith(
					'Record created, but your library could not be fully refreshed.'
				)
				expect(mockToast.error).not.toHaveBeenCalledWith(
					'Error creating record.'
				)
			} finally {
				consoleError.mockRestore()
			}
		})

		it('returns null on RPC error', async () => {
			const store = createRecordsStore()
			mockSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: new Error('Import failed')
			})

			const result = await store.createRecordWithTracks({
				title: 'Manual Record',
				tracks: []
			})

			expect(result).toBeNull()
		})

		it('does not start replacement-account fetches after stale manual creation', async () => {
			const accountAImport = createDeferred<{
				data: {
					record_id: string
					success: true
					tracks_inserted: number
				}
				error: null
			}>()
			mockSupabaseClient.rpc.mockReturnValueOnce(accountAImport.promise)
			const store = createRecordsStore()
			const creation = store.createRecordWithTracks({
				title: 'Account A record',
				tracks: [{ title: 'Account A track' }]
			})
			await vi.waitFor(() =>
				expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
					'import_record_with_tracks',
					expect.anything()
				)
			)

			store.clearRecords()
			mockUserStore.supaUser = { id: 'replacement-user-id' }
			store.records = [
				createMockRecord({ id: 'record-b', user_id: 'replacement-user-id' })
			]
			accountAImport.resolve({
				data: {
					record_id: 'record-a',
					success: true,
					tracks_inserted: 1
				},
				error: null
			})

			await expect(creation).resolves.toBeNull()
			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
			expect(mockTracksStore.fetchAllTracks).not.toHaveBeenCalled()
			expect(store.records.map((record) => record.id)).toEqual(['record-b'])
			expect(mockToast.success).not.toHaveBeenCalled()
		})
	})

	describe('updateRecord', () => {
		it('returns null when record not found', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'existing-record' })]

			const result = await store.updateRecord('non-existent', {
				title: 'Updated'
			})

			expect(result).toBeNull()
		})

		it('performs optimistic update', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1', title: 'Original' })]

			const updatePromise = store.updateRecord('record-1', { title: 'Updated' })

			// Record should be optimistically updated
			expect(store.records[0]!.title).toBe('Updated')

			mockQueryBuilder.single.mockResolvedValue({
				data: createMockRecord({ id: 'record-1', title: 'Updated' }),
				error: null
			})

			await updatePromise
		})

		it('reverts on update error', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1', title: 'Original' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Update failed')
			})

			await store.updateRecord('record-1', { title: 'Updated' })

			expect(store.records[0]!.title).toBe('Original')
		})

		it('updates with server response on success', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1', title: 'Original' })]
			const serverResponse = createMockRecord({
				id: 'record-1',
				title: 'Updated',
				updated_at: '2024-01-01T00:00:00Z'
			})
			mockQueryBuilder.single.mockResolvedValue({
				data: serverResponse,
				error: null
			})

			await store.updateRecord('record-1', { title: 'Updated' })

			expect(store.records[0]!.updated_at).toBe('2024-01-01T00:00:00Z')
		})

		it('decodes the updated record response before assignment', async () => {
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: { ...createMockRecord({ id: 'record-1' }), labels: 'invalid' },
				error: null
			})

			try {
				const result = await store.updateRecord('record-1', {
					title: 'Updated'
				})

				expect(result?.labels).toEqual([])
				expect(store.records[0]!.labels).toEqual([])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledOnce()
			} finally {
				consoleWarn.mockRestore()
			}
		})

		it('sets isUpdatingRecord during update', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockRecord({ id: 'record-1' }),
				error: null
			})

			const updatePromise = store.updateRecord('record-1', { title: 'Updated' })
			expect(store.isUpdatingRecord).toBe(true)

			await updatePromise
			expect(store.isUpdatingRecord).toBe(false)
		})

		it.each([
			{
				label: 'success',
				response: createMockRecord({
					id: 'record-target',
					title: 'Server target'
				}),
				expectedTitle: 'Server target'
			},
			{
				label: 'failure',
				response: null,
				expectedTitle: 'Original target'
			}
		])(
			're-finds a reordered record before $label commit or rollback',
			async ({ response, expectedTitle }) => {
				const serverResponse = createDeferred<{
					data: DatabaseRecord | null
					error: Error | null
				}>()
				mockQueryBuilder.single.mockReturnValueOnce(serverResponse.promise)
				const consoleError = vi
					.spyOn(console, 'error')
					.mockImplementation(() => undefined)
				const store = createRecordsStore()
				const target = createMockRecord({
					id: 'record-target',
					title: 'Original target'
				})
				const unrelated = createMockRecord({
					id: 'record-unrelated',
					title: 'Unrelated'
				})
				store.records = [target, unrelated]

				try {
					const update = store.updateRecord('record-target', {
						title: 'Optimistic target'
					})
					const optimisticTarget = store.getRecordById('record-target')!
					store.records = [unrelated, optimisticTarget]
					await vi.waitFor(() =>
						expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
					)

					serverResponse.resolve({
						data: response,
						error: response ? null : new Error('Update failed')
					})
					await update

					expect(store.records.map(({ id }) => id)).toEqual([
						'record-unrelated',
						'record-target'
					])
					expect(store.getRecordById('record-target')?.title).toBe(
						expectedTitle
					)
					expect(store.getRecordById('record-unrelated')?.title).toBe(
						'Unrelated'
					)
				} finally {
					consoleError.mockRestore()
				}
			}
		)

		it('preserves a committed update over an older fetch response', async () => {
			const oldFetchResponse = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			const original = createMockRecord({
				id: 'record-1',
				title: 'Original'
			})
			const updated = createMockRecord({
				id: 'record-1',
				title: 'Updated on server'
			})
			mockQueryBuilder.limit.mockReturnValueOnce(oldFetchResponse.promise)
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: updated,
				error: null
			})
			const store = createRecordsStore()
			store.records = [original]
			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)

			await expect(
				store.updateRecord('record-1', { title: 'Updated on server' })
			).resolves.toEqual(updated)
			oldFetchResponse.resolve({ data: [original], error: null })
			await expect(oldFetch).resolves.toBe(true)

			expect(store.getRecordById('record-1')).toEqual(updated)
		})

		it('serializes same-record updates in submission order', async () => {
			const firstResponse = createDeferred<{
				data: DatabaseRecord
				error: null
			}>()
			mockQueryBuilder.single
				.mockReturnValueOnce(firstResponse.promise)
				.mockResolvedValueOnce({
					data: createMockRecord({
						id: 'record-1',
						title: 'Second server update'
					}),
					error: null
				})
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1', title: 'Original' })]

			const first = store.updateRecord('record-1', { title: 'First update' })
			const second = store.updateRecord('record-1', { title: 'Second update' })
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			)
			firstResponse.resolve({
				data: createMockRecord({
					id: 'record-1',
					title: 'First server update'
				}),
				error: null
			})
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledTimes(2)
			)
			await Promise.all([first, second])

			expect(store.getRecordById('record-1')?.title).toBe(
				'Second server update'
			)
		})

		it('runs a same-record collection removal only after its update settles', async () => {
			const updateResponse = createDeferred<{
				data: DatabaseRecord
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(updateResponse.promise)
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1', title: 'Original' })]

			const update = store.updateRecord('record-1', { title: 'Updated' })
			const deletion = store.removeRecordFromCollection('record-1')
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			)
			expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()

			updateResponse.resolve({
				data: createMockRecord({ id: 'record-1', title: 'Updated' }),
				error: null
			})
			await vi.waitFor(() =>
				expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
					'remove_record_from_collection',
					{ target_record_id: 'record-1' }
				)
			)
			await expect(Promise.all([update, deletion])).resolves.toEqual([
				expect.objectContaining({ title: 'Updated' }),
				true
			])
			expect(store.getRecordById('record-1')).toBeUndefined()
		})

		it.each([
			{
				label: 'success',
				response: {
					data: createMockRecord({ id: 'record-1', title: 'A response' }),
					error: null
				}
			},
			{
				label: 'failure',
				response: { data: null, error: new Error('A update failed') }
			}
		])(
			'does not let stale A update $label replace or roll back B',
			async ({ response }) => {
				const accountAUpdate = createDeferred<typeof response>()
				mockQueryBuilder.single.mockReturnValueOnce(accountAUpdate.promise)
				const store = createRecordsStore()
				store.records = [
					createMockRecord({ id: 'record-1', title: 'Account A' })
				]
				const update = store.updateRecord('record-1', { title: 'A optimistic' })
				expect(store.records[0]!.title).toBe('A optimistic')
				await vi.waitFor(() =>
					expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
				)

				store.clearRecords()
				mockUserStore.supaUser = { id: 'replacement-user-id' }
				store.records = [
					createMockRecord({
						id: 'record-1',
						title: 'Account B',
						user_id: 'replacement-user-id'
					})
				]
				mockToast.success.mockClear()
				mockToast.error.mockClear()
				accountAUpdate.resolve(response)

				await expect(update).resolves.toBeNull()
				expect(store.records[0]!.title).toBe('Account B')
				expect(mockToast.success).not.toHaveBeenCalled()
				expect(mockToast.error).not.toHaveBeenCalled()
			}
		)
	})

	describe('record removal lifecycle', () => {
		it('waits for cleanup begun after the committed removal epoch', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]
			const oldEmptyPage = createDeferred<ReturnType<typeof cleanupResponse>>()
			const postDeletePage =
				createDeferred<ReturnType<typeof cleanupResponse>>()
			mockBoundFunctionsInvoke
				.mockReturnValueOnce(oldEmptyPage.promise)
				.mockReturnValueOnce(postDeletePage.promise)

			const backgroundDrain = store.drainCoverCleanup()
			await vi.waitFor(() => expectCleanupInvocationsWithoutBodies(1))
			const deletion = store.removeRecordFromCollection('record-1')
			let didDeletionSettle = false
			void deletion.then(() => {
				didDeletionSettle = true
			})
			await vi.waitFor(() =>
				expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
					'remove_record_from_collection',
					{ target_record_id: 'record-1' }
				)
			)

			oldEmptyPage.resolve(cleanupResponse())
			await vi.waitFor(() => expectCleanupInvocationsWithoutBodies(2))
			expect(didDeletionSettle).toBe(false)

			postDeletePage.resolve(cleanupResponse())
			await expect(deletion).resolves.toBe(true)
			await expect(backgroundDrain).resolves.toBe(true)
		})

		it('drains managed cover cleanup after the record is removed', async () => {
			const store = createRecordsStore()
			store.records = [
				createMockRecord({
					id: 'record-1',
					cover_storage_path: 'test-user-id/record-1/custom.webp'
				})
			]
			const result = await store.removeRecordFromCollection('record-1')

			expect(result).toBe(true)
			expectCleanupInvocationsWithoutBodies(1)
			expect(mockStorageBucket.remove).not.toHaveBeenCalled()
		})

		it('keeps a successful removal successful when queue draining fails', async () => {
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			try {
				const store = createRecordsStore()
				store.records = [createMockRecord({ id: 'record-1' })]
				mockBoundFunctionsInvoke.mockResolvedValue({
					data: null,
					error: new Error('private cleanup failure')
				})

				await expect(
					store.removeRecordFromCollection('record-1')
				).resolves.toBe(true)

				expect(store.records).toEqual([])
				expect(mockToast.success).toHaveBeenCalledWith(
					'Record removed from collection'
				)
				expect(mockToast.warning).toHaveBeenCalledWith(
					'Some old cover files still need cleanup.'
				)
				expect(consoleError).toHaveBeenCalledWith(
					'Failed to drain record cover cleanup.'
				)
			} finally {
				consoleError.mockRestore()
			}
		})

		it('returns false when the server cannot find the record', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'existing-record' })]
			mockSupabaseClient.rpc.mockResolvedValueOnce({
				data: null,
				error: new Error('Record not found')
			})

			const result = await store.removeRecordFromCollection('non-existent')

			expect(result).toBe(false)
		})

		it('waits for the committed RPC before removing local state', async () => {
			const store = createRecordsStore()
			store.records = [
				createMockRecord({ id: 'record-1' }),
				createMockRecord({ id: 'record-2' })
			]
			const removalResponse =
				createDeferred<ReturnType<typeof successfulRemovalResponse>>()
			mockSupabaseClient.rpc.mockReturnValueOnce(removalResponse.promise)

			const removal = store.removeRecordFromCollection('record-1')
			await vi.waitFor(() =>
				expect(mockSupabaseClient.rpc).toHaveBeenCalledOnce()
			)

			expect(store.records.map((record) => record.id)).toEqual([
				'record-1',
				'record-2'
			])

			removalResponse.resolve(successfulRemovalResponse('record-1'))
			await expect(removal).resolves.toBe(true)
			expect(store.records.map((record) => record.id)).toEqual(['record-2'])
		})

		it('keeps local state unchanged on removal error', async () => {
			const store = createRecordsStore()
			const record1 = createMockRecord({ id: 'record-1' })
			const record2 = createMockRecord({ id: 'record-2' })
			store.records = [record1, record2]
			mockSupabaseClient.rpc.mockResolvedValueOnce({
				data: null,
				error: new Error('Removal failed')
			})

			await expect(store.removeRecordFromCollection('record-1')).resolves.toBe(
				false
			)

			expect(store.records.length).toBe(2)
			expect(store.records[0]!.id).toBe('record-1')
		})

		it('returns true on successful removal', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]
			const result = await store.removeRecordFromCollection('record-1')

			expect(result).toBe(true)
			expect(store.records.length).toBe(0)
		})

		it('does not resurrect a committed removal from an older fetch', async () => {
			const oldFetchResponse = createDeferred<{
				data: DatabaseRecord[]
				error: null
			}>()
			const deletedRecord = createMockRecord({ id: 'record-1' })
			mockQueryBuilder.limit.mockReturnValueOnce(oldFetchResponse.promise)
			const store = createRecordsStore()
			store.records = [deletedRecord]
			const oldFetch = store.fetchAllRecords()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledOnce()
			)

			await expect(store.removeRecordFromCollection('record-1')).resolves.toBe(
				true
			)
			oldFetchResponse.resolve({ data: [deletedRecord], error: null })
			await expect(oldFetch).resolves.toBe(true)

			expect(store.getRecordById('record-1')).toBeUndefined()
		})

		it('sets isDeletingRecord during removal', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]

			const removalPromise = store.removeRecordFromCollection('record-1')
			expect(store.isDeletingRecord).toBe(true)

			await removalPromise
			expect(store.isDeletingRecord).toBe(false)
		})
	})

	describe('removeRecordFromCollection', () => {
		it('calls the transactional cleanup RPC', async () => {
			const store = createRecordsStore()
			store.records = [createMockRecord({ id: 'record-1' })]

			await store.removeRecordFromCollection('record-1')

			expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
				'remove_record_from_collection',
				{ target_record_id: 'record-1' }
			)
		})

		it('removes only record-owned local state on success', async () => {
			const store = createRecordsStore()
			const record = createMockRecord({ id: 'record-1', title: 'Record One' })
			store.records = [record, createMockRecord({ id: 'record-2' })]
			await store.performSearch('Record One')

			const result = await store.removeRecordFromCollection('record-1')

			expect(result).toBe(true)
			expect(store.records.map((item) => item.id)).toEqual(['record-2'])
			expect(store.searchResults).toEqual([])
			expectCleanupInvocationsWithoutBodies(1)
		})

		it('keeps local state unchanged when the RPC fails', async () => {
			const store = createRecordsStore()
			const record = createMockRecord({ id: 'record-1' })
			store.records = [record]
			await store.performSearch(record.title)
			mockSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: new Error('Cleanup failed')
			})

			const result = await store.removeRecordFromCollection('record-1')

			expect(result).toBe(false)
			expect(store.records).toEqual([record])
			expect(store.searchResults).toEqual([record])
		})

		it.each([
			{ label: 'null', data: null },
			{
				label: 'unsuccessful',
				data: { success: false, record_id: 'record-1' }
			},
			{
				label: 'wrong record',
				data: { success: true, record_id: 'record-2' }
			}
		])(
			'keeps local state unchanged for a $label success payload',
			async ({ data }) => {
				const store = createRecordsStore()
				const record = createMockRecord({ id: 'record-1' })
				store.records = [record]
				mockSupabaseClient.rpc.mockResolvedValueOnce({ data, error: null })

				await expect(
					store.removeRecordFromCollection('record-1')
				).resolves.toBe(false)

				expect(store.records).toEqual([record])
				expect(mockBoundFunctionsInvoke).not.toHaveBeenCalled()
			}
		)

		it.each([
			{ label: 'success', response: successfulRemovalResponse('record-1') },
			{
				label: 'failure',
				response: { data: null, error: new Error('A removal failed') }
			}
		])(
			'does not let stale A collection-removal $label mutate or clean B',
			async ({ response }) => {
				const accountARemoval = createDeferred<typeof response>()
				mockSupabaseClient.rpc.mockReturnValueOnce(accountARemoval.promise)
				const store = createRecordsStore()
				store.records = [createMockRecord({ id: 'record-1' })]
				const removal = store.removeRecordFromCollection('record-1')
				await vi.waitFor(() =>
					expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
						'remove_record_from_collection',
						{ target_record_id: 'record-1' }
					)
				)

				store.clearRecords()
				mockUserStore.supaUser = { id: 'replacement-user-id' }
				store.records = [
					createMockRecord({
						id: 'record-1',
						title: 'Account B',
						user_id: 'replacement-user-id'
					})
				]
				mockToast.success.mockClear()
				mockToast.error.mockClear()
				accountARemoval.resolve(response)

				await expect(removal).resolves.toBe(false)
				expect(store.records).toHaveLength(1)
				expect(store.records[0]!.title).toBe('Account B')
				expect(mockBoundFunctionsInvoke).not.toHaveBeenCalled()
				expect(mockToast.success).not.toHaveBeenCalled()
				expect(mockToast.error).not.toHaveBeenCalled()
			}
		)
	})
})
