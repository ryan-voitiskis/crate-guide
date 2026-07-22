import { createPinia, setActivePinia } from 'pinia'
import {
	createMockLibraryRecord as createDomainRecord,
	createMockRecord
} from 'test/mocks/fixtures/records'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureDemoWorkbenchRuntime } from '~/composables/useWorkbench'
import { markDemoWorkbenchPinia } from '~/utils/workbenchPinia'
import {
	cleanupResponse,
	createDeferred,
	createRecordsStore,
	expectCleanupInvocationsWithoutBodies,
	getCoverCleanupMaxPages,
	mockBoundFunctionsInvoke,
	mockBoundRecordQuery,
	mockBoundSupabaseClient,
	mockCreateSupabaseClient,
	mockGlobalFunctionsInvoke,
	mockGlobalStorageBucket,
	mockProcessRecordCoverFile,
	mockQueryBuilder,
	mockStorageBucket,
	mockSupabaseClient,
	mockToast,
	mockUserStore,
	resetRecordsStoreHarness,
	timeoutAwareNeverSettlingInvoke
} from './recordsStoreTestHarness'

describe('recordsStore cover workflows', () => {
	beforeEach(resetRecordsStoreHarness)
	afterEach(() => vi.useRealTimers())

	describe('updateRecordWithCover', () => {
		it('shares one full in-flight drain across concurrent callers', async () => {
			const store = createRecordsStore()
			const fullPage = createDeferred<ReturnType<typeof cleanupResponse>>()
			const finalPage = createDeferred<ReturnType<typeof cleanupResponse>>()
			mockBoundFunctionsInvoke
				.mockReturnValueOnce(fullPage.promise)
				.mockReturnValueOnce(finalPage.promise)

			const firstDrain = store.drainCoverCleanup()
			const concurrentDrain = store.drainCoverCleanup()

			await vi.waitFor(() => {
				expectCleanupInvocationsWithoutBodies(1)
			})
			fullPage.resolve(cleanupResponse(100))
			await vi.waitFor(() => {
				expectCleanupInvocationsWithoutBodies(2)
			})
			finalPage.resolve(cleanupResponse(1))

			await expect(Promise.all([firstDrain, concurrentDrain])).resolves.toEqual(
				[true, true]
			)
			expectCleanupInvocationsWithoutBodies(2)
		})

		it('requires a request started after a fresh post-commit signal', async () => {
			const store = createRecordsStore()
			const oldEmptyPage = createDeferred<ReturnType<typeof cleanupResponse>>()
			const postCommitPage =
				createDeferred<ReturnType<typeof cleanupResponse>>()
			mockBoundFunctionsInvoke
				.mockReturnValueOnce(oldEmptyPage.promise)
				.mockReturnValueOnce(postCommitPage.promise)

			const backgroundDrain = store.drainCoverCleanup()
			await vi.waitFor(() => expectCleanupInvocationsWithoutBodies(1))
			const postCommitDrain = store.drainCoverCleanup({ fresh: true })
			let didPostCommitDrainSettle = false
			void postCommitDrain.then(() => {
				didPostCommitDrainSettle = true
			})

			oldEmptyPage.resolve(cleanupResponse())
			await vi.waitFor(() => expectCleanupInvocationsWithoutBodies(2))
			expect(didPostCommitDrainSettle).toBe(false)

			postCommitPage.resolve(cleanupResponse())
			await expect(
				Promise.all([backgroundDrain, postCommitDrain])
			).resolves.toEqual([true, true])
		})

		it('coalesces fresh signals through one request after the newest epoch', async () => {
			const store = createRecordsStore()
			const oldEmptyPage = createDeferred<ReturnType<typeof cleanupResponse>>()
			const newestEpochPage =
				createDeferred<ReturnType<typeof cleanupResponse>>()
			mockBoundFunctionsInvoke
				.mockReturnValueOnce(oldEmptyPage.promise)
				.mockReturnValueOnce(newestEpochPage.promise)

			const backgroundDrain = store.drainCoverCleanup()
			await vi.waitFor(() => expectCleanupInvocationsWithoutBodies(1))
			const firstMutationDrain = store.drainCoverCleanup({ fresh: true })
			const secondMutationDrain = store.drainCoverCleanup({ fresh: true })
			const thirdMutationDrain = store.drainCoverCleanup({ fresh: true })

			oldEmptyPage.resolve(cleanupResponse())
			await vi.waitFor(() => expectCleanupInvocationsWithoutBodies(2))
			newestEpochPage.resolve(cleanupResponse())

			await expect(
				Promise.all([
					backgroundDrain,
					firstMutationDrain,
					secondMutationDrain,
					thirdMutationDrain
				])
			).resolves.toEqual([true, true, true, true])
			expectCleanupInvocationsWithoutBodies(2)
		})

		it('drains a 101-job backlog across a full and short page', async () => {
			const store = createRecordsStore()
			mockBoundFunctionsInvoke
				.mockResolvedValueOnce(cleanupResponse(100))
				.mockResolvedValueOnce(cleanupResponse(1))

			await expect(store.drainCoverCleanup()).resolves.toBe(true)

			expectCleanupInvocationsWithoutBodies(2)
		})

		it('confirms an exact 100-job backlog with one empty page', async () => {
			const store = createRecordsStore()
			mockBoundFunctionsInvoke
				.mockResolvedValueOnce(cleanupResponse(100))
				.mockResolvedValueOnce(cleanupResponse())

			await expect(store.drainCoverCleanup()).resolves.toBe(true)

			expectCleanupInvocationsWithoutBodies(2)
		})

		it('stops after one short page', async () => {
			const store = createRecordsStore()
			mockBoundFunctionsInvoke.mockResolvedValueOnce(cleanupResponse(7, 4))

			await expect(store.drainCoverCleanup()).resolves.toBe(true)

			expectCleanupInvocationsWithoutBodies(1)
		})

		it.each([
			null,
			{},
			{ processed: '1', removed: 1, deferred: 0 },
			{ processed: -1, removed: 0, deferred: 0 },
			{ processed: 101, removed: 0, deferred: 0 },
			{ processed: 1, removed: 2, deferred: 0 },
			{ processed: 1, removed: 1, deferred: 1 },
			{ processed: Number.MAX_SAFE_INTEGER + 1, removed: 0, deferred: 0 }
		])(
			'rejects malformed cleanup counts without exposing details: %j',
			async (data) => {
				vi.useFakeTimers()
				const store = createRecordsStore()
				mockBoundFunctionsInvoke.mockResolvedValue({
					data,
					error: null
				})

				const drain = store.drainCoverCleanup()
				await vi.runAllTimersAsync()

				await expect(drain).resolves.toBe(false)
				expectCleanupInvocationsWithoutBodies(3)
				expect(mockToast.warning).toHaveBeenCalledOnce()
			}
		)

		it('recovers from a transient page failure after the first backoff', async () => {
			vi.useFakeTimers()
			const store = createRecordsStore()
			mockBoundFunctionsInvoke
				.mockResolvedValueOnce({
					data: null,
					error: new Error('private failure')
				})
				.mockResolvedValueOnce(cleanupResponse(1))

			const drain = store.drainCoverCleanup()
			await vi.advanceTimersByTimeAsync(0)
			expectCleanupInvocationsWithoutBodies(1)
			await vi.advanceTimersByTimeAsync(249)
			expectCleanupInvocationsWithoutBodies(1)
			await vi.advanceTimersByTimeAsync(1)

			await expect(drain).resolves.toBe(true)
			expectCleanupInvocationsWithoutBodies(2)
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('warns once only after bounded retries are exhausted', async () => {
			vi.useFakeTimers()
			const store = createRecordsStore()
			mockBoundFunctionsInvoke.mockResolvedValue({
				data: null,
				error: new Error('private failure')
			})

			const drain = store.drainCoverCleanup()
			await vi.runAllTimersAsync()

			await expect(drain).resolves.toBe(false)
			expectCleanupInvocationsWithoutBodies(3)
			expect(mockToast.warning).toHaveBeenCalledOnce()
			expect(mockToast.warning).toHaveBeenCalledWith(
				'Some old cover files still need cleanup.'
			)
		})

		it('keeps failed fresh work eligible for a later background retry', async () => {
			vi.useFakeTimers()
			const store = createRecordsStore()
			mockBoundFunctionsInvoke
				.mockResolvedValueOnce(cleanupResponse())
				.mockResolvedValueOnce({
					data: null,
					error: new Error('private failure')
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('private failure')
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('private failure')
				})
				.mockResolvedValueOnce(cleanupResponse())

			await expect(store.drainCoverCleanup()).resolves.toBe(true)
			const failedMutationDrain = store.drainCoverCleanup({ fresh: true })
			await vi.runAllTimersAsync()
			await expect(failedMutationDrain).resolves.toBe(false)

			await expect(store.drainCoverCleanup()).resolves.toBe(true)
			expectCleanupInvocationsWithoutBodies(5)
		})

		it('times out and retries hung invocations before releasing later work', async () => {
			vi.useFakeTimers()
			const store = createRecordsStore()
			mockBoundFunctionsInvoke.mockImplementation(
				timeoutAwareNeverSettlingInvoke
			)

			const timedOutDrain = store.drainCoverCleanup()
			await vi.runAllTimersAsync()

			await expect(timedOutDrain).resolves.toBe(false)
			expectCleanupInvocationsWithoutBodies(3)
			expect(mockToast.warning).toHaveBeenCalledOnce()

			mockBoundFunctionsInvoke.mockResolvedValue(cleanupResponse())
			await expect(store.drainCoverCleanup()).resolves.toBe(true)
			expectCleanupInvocationsWithoutBodies(4)
		})

		it('returns false when the separate client page cap is reached', async () => {
			const store = createRecordsStore()
			mockBoundFunctionsInvoke.mockResolvedValue(cleanupResponse(100))

			await expect(store.drainCoverCleanup()).resolves.toBe(false)

			expectCleanupInvocationsWithoutBodies(getCoverCleanupMaxPages())
			expect(mockToast.warning).toHaveBeenCalledOnce()
		})

		it('does not invoke cleanup while signed out', async () => {
			mockUserStore.supaUser = null
			const store = createRecordsStore()

			await expect(store.drainCoverCleanup()).resolves.toBe(false)

			expect(mockBoundFunctionsInvoke).not.toHaveBeenCalled()
		})

		it('does not invoke cleanup as B when the session changes during token capture', async () => {
			const session = createDeferred<{
				data: {
					session: {
						access_token: string
						user: { id: string }
					}
				}
				error: null
			}>()
			mockSupabaseClient.auth.getSession.mockReturnValueOnce(session.promise)
			const store = createRecordsStore()
			const drain = store.drainCoverCleanup()
			await vi.waitFor(() =>
				expect(mockSupabaseClient.auth.getSession).toHaveBeenCalledOnce()
			)

			mockUserStore.supaUser = { id: 'replacement-user-id' }
			session.resolve({
				data: {
					session: {
						access_token: 'token:replacement-user-id',
						user: { id: 'replacement-user-id' }
					}
				},
				error: null
			})

			await expect(drain).resolves.toBe(false)
			expect(mockCreateSupabaseClient).not.toHaveBeenCalled()
			expect(mockBoundFunctionsInvoke).not.toHaveBeenCalled()
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('keeps cleanup bound to A when B arrives during fixed-token lookup', async () => {
			const beginTokenLookup = createDeferred<undefined>()
			let accessToken: (() => Promise<string>) | undefined
			let observedToken: string | undefined
			mockCreateSupabaseClient.mockImplementationOnce(
				(_url, _key, options: { accessToken: () => Promise<string> }) => {
					accessToken = options.accessToken
					return mockBoundSupabaseClient
				}
			)
			mockBoundFunctionsInvoke.mockImplementationOnce(async () => {
				await beginTokenLookup.promise
				observedToken = await accessToken?.()
				return cleanupResponse()
			})
			const store = createRecordsStore()
			const drain = store.drainCoverCleanup()
			await vi.waitFor(() =>
				expect(mockBoundFunctionsInvoke).toHaveBeenCalledOnce()
			)

			mockUserStore.supaUser = { id: 'replacement-user-id' }
			beginTokenLookup.resolve(undefined)

			await expect(drain).resolves.toBe(false)
			expect(observedToken).toBe('token:test-user-id')
			expect(mockGlobalFunctionsInvoke).not.toHaveBeenCalled()
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('does not invoke cleanup from the demo workbench store', async () => {
			const pinia = markDemoWorkbenchPinia(createPinia())
			ensureDemoWorkbenchRuntime(pinia)
			setActivePinia(pinia)
			const store = createRecordsStore()

			await expect(store.drainCoverCleanup()).resolves.toBe(false)

			expect(mockUserStore.resolveAuthenticatedUserId).not.toHaveBeenCalled()
			expect(mockBoundFunctionsInvoke).not.toHaveBeenCalled()
		})

		it('cancels an in-flight page without stale retries or warnings on reset', async () => {
			const oldDrainResult =
				createDeferred<ReturnType<typeof cleanupResponse>>()
			mockBoundFunctionsInvoke.mockReturnValueOnce(oldDrainResult.promise)
			const store = createRecordsStore()
			const oldDrain = store.drainCoverCleanup()
			await vi.waitFor(() => {
				expect(mockBoundFunctionsInvoke).toHaveBeenCalledOnce()
			})

			store.clearRecords()
			oldDrainResult.resolve(cleanupResponse(100))
			await expect(oldDrain).resolves.toBe(false)
			expectCleanupInvocationsWithoutBodies(1)
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('aborts a hung request and lets a replacement account start immediately', async () => {
			const store = createRecordsStore()
			mockBoundFunctionsInvoke
				.mockImplementationOnce(timeoutAwareNeverSettlingInvoke)
				.mockResolvedValueOnce(cleanupResponse())

			const oldDrain = store.drainCoverCleanup()
			await vi.waitFor(() => expectCleanupInvocationsWithoutBodies(1))
			const oldSignal = mockBoundFunctionsInvoke.mock.calls[0]![1]
				.signal as AbortSignal

			store.clearRecords()
			mockUserStore.supaUser = { id: 'replacement-user-id' }
			const replacementDrain = store.drainCoverCleanup()

			await expect(oldDrain).resolves.toBe(false)
			await expect(replacementDrain).resolves.toBe(true)
			expectCleanupInvocationsWithoutBodies(2)
			const replacementSignal = mockBoundFunctionsInvoke.mock.calls[1]![1]
				.signal as AbortSignal
			expect(oldSignal.aborted).toBe(true)
			expect(replacementSignal).not.toBe(oldSignal)
			expect(replacementSignal.aborted).toBe(false)
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('cancels retry backoff without another request or stale warning on reset', async () => {
			vi.useFakeTimers()
			const store = createRecordsStore()
			mockBoundFunctionsInvoke.mockResolvedValue({
				data: null,
				error: new Error('private failure')
			})

			const drain = store.drainCoverCleanup()
			await vi.advanceTimersByTimeAsync(0)
			expectCleanupInvocationsWithoutBodies(1)
			store.clearRecords()
			await vi.runAllTimersAsync()

			await expect(drain).resolves.toBe(false)
			expectCleanupInvocationsWithoutBodies(1)
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('uploads an immutable WebP path and persists it on the record', async () => {
			const store = createRecordsStore()
			store.records = [
				createDomainRecord({ id: 'record-1', cover: { kind: 'none' } })
			]
			mockQueryBuilder.single.mockImplementation(async () => {
				const uploadedPath = mockStorageBucket.upload.mock.calls[0]?.[0]
				return {
					data: createMockRecord({
						id: 'record-1',
						title: 'Updated',
						cover: null,
						cover_storage_path: uploadedPath
					}),
					error: null
				}
			})

			const file = { name: 'cover.png' } as File
			const result = await store.updateRecordWithCover(
				'record-1',
				{ title: 'Updated' },
				{
					type: 'upload',
					file,
					crop: { positionX: 40, positionY: 60 }
				}
			)

			expect(mockProcessRecordCoverFile).toHaveBeenCalledWith(file, {
				positionX: 40,
				positionY: 60
			})
			const [path, blob, options] = mockStorageBucket.upload.mock.calls[0]!
			expect(path).toMatch(/^test-user-id\/record-1\/[0-9a-f-]+\.webp$/)
			expect(blob.type).toBe('image/webp')
			expect(options).toMatchObject({
				cacheControl: '300',
				contentType: 'image/webp',
				upsert: false
			})
			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				title: 'Updated',
				cover_storage_path: path
			})
			expect(result?.cover).toEqual({
				kind: 'cloud',
				assetId: path,
				fallbackUrl: null
			})
			expectCleanupInvocationsWithoutBodies(1)
			expect(store.isUpdatingCover).toBe(false)
		})

		it('compensates an A upload that succeeds after reset with only the fixed A client', async () => {
			const upload = createDeferred<{ data: null; error: null }>()
			mockStorageBucket.upload.mockReturnValueOnce(upload.promise)
			const store = createRecordsStore()
			store.records = [createDomainRecord({ id: 'record-1' })]

			const update = store.updateRecordWithCover(
				'record-1',
				{},
				{
					type: 'upload',
					file: { name: 'cover.png' } as File,
					crop: { positionX: 50, positionY: 50 }
				}
			)
			await vi.waitFor(() =>
				expect(mockStorageBucket.upload).toHaveBeenCalledOnce()
			)
			const uploadedPath = mockStorageBucket.upload.mock.calls[0]![0]

			store.clearRecords()
			mockUserStore.supaUser = { id: 'replacement-user-id' }
			store.records = [
				createDomainRecord({ id: 'record-b', title: 'Replacement record' })
			]
			upload.resolve({ data: null, error: null })

			await expect(update).resolves.toBeNull()
			expect(mockStorageBucket.remove).toHaveBeenCalledWith([uploadedPath])
			expect(mockQueryBuilder.update).not.toHaveBeenCalled()
			expect(mockSupabaseClient.storage.from).not.toHaveBeenCalled()
			expect(mockGlobalStorageBucket.remove).not.toHaveBeenCalled()
			expect(mockSupabaseClient.auth.getSession).toHaveBeenCalledOnce()
			expect(store.records.map((record) => record.id)).toEqual(['record-b'])
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('compensates an A upload rejection after reset without replacement feedback', async () => {
			const upload = createDeferred<{ data: null; error: null }>()
			mockStorageBucket.upload.mockReturnValueOnce(upload.promise)
			const store = createRecordsStore()
			store.records = [createDomainRecord({ id: 'record-1' })]

			const update = store.updateRecordWithCover(
				'record-1',
				{},
				{
					type: 'upload',
					file: { name: 'cover.png' } as File,
					crop: { positionX: 50, positionY: 50 }
				}
			)
			await vi.waitFor(() =>
				expect(mockStorageBucket.upload).toHaveBeenCalledOnce()
			)
			const uploadedPath = mockStorageBucket.upload.mock.calls[0]![0]

			store.clearRecords()
			mockUserStore.supaUser = { id: 'replacement-user-id' }
			store.records = [
				createDomainRecord({ id: 'record-b', title: 'Replacement record' })
			]
			upload.reject(new Error('ambiguous upload transport failure'))

			await expect(update).resolves.toBeNull()
			expect(mockStorageBucket.remove).toHaveBeenCalledWith([uploadedPath])
			expect(mockQueryBuilder.update).not.toHaveBeenCalled()
			expect(mockSupabaseClient.storage.from).not.toHaveBeenCalled()
			expect(mockGlobalStorageBucket.remove).not.toHaveBeenCalled()
			expect(mockSupabaseClient.auth.getSession).toHaveBeenCalledOnce()
			expect(store.records.map((record) => record.id)).toEqual(['record-b'])
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('preserves a stale submitted upload when A still references its exact path', async () => {
			const metadata = createDeferred<{
				data: DatabaseRecord
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(metadata.promise)
			const store = createRecordsStore()
			store.records = [createDomainRecord({ id: 'record-1' })]

			const update = store.updateRecordWithCover(
				'record-1',
				{},
				{
					type: 'upload',
					file: { name: 'cover.png' } as File,
					crop: { positionX: 50, positionY: 50 }
				}
			)
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			)
			const uploadedPath = mockStorageBucket.upload.mock.calls[0]![0]
			mockBoundRecordQuery.maybeSingle.mockResolvedValueOnce({
				data: { cover_storage_path: uploadedPath },
				error: null
			})

			store.clearRecords()
			mockUserStore.supaUser = { id: 'replacement-user-id' }
			store.records = [
				createDomainRecord({
					id: 'record-1',
					title: 'Replacement record'
				})
			]
			metadata.resolve({
				data: createMockRecord({
					id: 'record-1',
					cover_storage_path: uploadedPath
				}),
				error: null
			})

			await expect(update).resolves.toBeNull()
			expect(mockBoundSupabaseClient.from).toHaveBeenCalledWith('records')
			expect(mockBoundRecordQuery.select).toHaveBeenCalledWith(
				'cover_storage_path'
			)
			expect(mockBoundRecordQuery.eq.mock.calls).toEqual([
				['id', 'record-1'],
				['user_id', 'test-user-id']
			])
			expect(mockStorageBucket.remove).not.toHaveBeenCalled()
			expect(mockSupabaseClient.storage.from).not.toHaveBeenCalled()
			expect(store.records[0]!.title).toBe('Replacement record')
			expect(mockToast.success).not.toHaveBeenCalled()
		})

		it('removes a stale rejected metadata upload only after A no longer references it', async () => {
			const metadata = createDeferred<{
				data: DatabaseRecord
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(metadata.promise)
			const store = createRecordsStore()
			store.records = [createDomainRecord({ id: 'record-1' })]

			const update = store.updateRecordWithCover(
				'record-1',
				{},
				{
					type: 'upload',
					file: { name: 'cover.png' } as File,
					crop: { positionX: 50, positionY: 50 }
				}
			)
			await vi.waitFor(() =>
				expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
			)
			const uploadedPath = mockStorageBucket.upload.mock.calls[0]![0]
			mockBoundRecordQuery.maybeSingle.mockResolvedValueOnce({
				data: { cover_storage_path: 'test-user-id/record-1/older.webp' },
				error: null
			})

			store.clearRecords()
			mockUserStore.supaUser = { id: 'replacement-user-id' }
			store.records = [
				createDomainRecord({
					id: 'record-1',
					title: 'Replacement record'
				})
			]
			metadata.reject(new Error('ambiguous metadata transport failure'))

			await expect(update).resolves.toBeNull()
			expect(mockBoundSupabaseClient.from).toHaveBeenCalledWith('records')
			expect(mockStorageBucket.remove).toHaveBeenCalledWith([uploadedPath])
			expect(mockSupabaseClient.storage.from).not.toHaveBeenCalled()
			expect(store.records[0]!.title).toBe('Replacement record')
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('removes the new object when the database update fails', async () => {
			const store = createRecordsStore()
			store.records = [createDomainRecord({ id: 'record-1' })]
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Update failed')
			})

			const result = await store.updateRecordWithCover(
				'record-1',
				{},
				{
					type: 'upload',
					file: { name: 'cover.png' } as File,
					crop: { positionX: 50, positionY: 50 }
				}
			)

			const uploadedPath = mockStorageBucket.upload.mock.calls[0]?.[0]
			expect(result).toBeNull()
			expect(mockStorageBucket.remove).toHaveBeenCalledWith([uploadedPath])
			expect(mockBoundFunctionsInvoke).not.toHaveBeenCalled()
		})

		it('drains the durable queue after a successful replacement', async () => {
			const store = createRecordsStore()
			store.records = [
				createDomainRecord({
					id: 'record-1',
					cover: {
						kind: 'cloud',
						assetId: 'test-user-id/record-1/old.webp',
						fallbackUrl: null
					}
				})
			]
			mockQueryBuilder.single.mockImplementation(async () => ({
				data: createMockRecord({
					id: 'record-1',
					cover_storage_path: mockStorageBucket.upload.mock.calls[0]?.[0]
				}),
				error: null
			}))

			await store.updateRecordWithCover(
				'record-1',
				{},
				{
					type: 'upload',
					file: { name: 'cover.png' } as File,
					crop: { positionX: 50, positionY: 50 }
				}
			)

			expectCleanupInvocationsWithoutBodies(1)
			expect(mockStorageBucket.remove).not.toHaveBeenCalled()
		})

		it('clears the storage override before draining its queued object', async () => {
			const store = createRecordsStore()
			store.records = [
				createDomainRecord({
					id: 'record-1',
					cover: {
						kind: 'cloud',
						assetId: 'test-user-id/record-1/custom.webp',
						fallbackUrl: 'https://discogs.example/fallback.jpg'
					}
				})
			]
			mockQueryBuilder.single.mockResolvedValue({
				data: createMockRecord({
					id: 'record-1',
					cover: 'https://discogs.example/fallback.jpg',
					cover_storage_path: null
				}),
				error: null
			})

			const result = await store.updateRecordWithCover(
				'record-1',
				{},
				{ type: 'remove' }
			)

			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				cover_storage_path: null
			})
			expectCleanupInvocationsWithoutBodies(1)
			expect(mockStorageBucket.remove).not.toHaveBeenCalled()
			expect(result?.cover).toEqual({
				kind: 'external',
				url: 'https://discogs.example/fallback.jpg'
			})
		})

		it.each([
			{
				label: 'success',
				response: {
					data: createMockRecord({
						id: 'record-1',
						cover_storage_path: null
					}),
					error: null
				}
			},
			{
				label: 'failure',
				response: { data: null, error: new Error('A cover update failed') }
			}
		])(
			'does not let stale A cover-removal $label invoke B cleanup',
			async ({ response }) => {
				const metadata = createDeferred<typeof response>()
				mockQueryBuilder.single.mockReturnValueOnce(metadata.promise)
				const store = createRecordsStore()
				store.records = [
					createDomainRecord({
						id: 'record-1',
						cover: {
							kind: 'cloud',
							assetId: 'test-user-id/record-1/old.webp',
							fallbackUrl: null
						}
					})
				]
				const removal = store.updateRecordWithCover(
					'record-1',
					{},
					{ type: 'remove' }
				)
				await vi.waitFor(() =>
					expect(mockQueryBuilder.single).toHaveBeenCalledOnce()
				)

				store.clearRecords()
				mockUserStore.supaUser = { id: 'replacement-user-id' }
				store.records = [
					createDomainRecord({
						id: 'record-1',
						title: 'Replacement record',
						cover: {
							kind: 'cloud',
							assetId: 'replacement-user-id/record-1/b.webp',
							fallbackUrl: null
						}
					})
				]
				mockToast.success.mockClear()
				mockToast.error.mockClear()
				metadata.resolve(response)

				await expect(removal).resolves.toBeNull()
				expect(mockBoundFunctionsInvoke).not.toHaveBeenCalled()
				expect(store.records[0]!.cover).toEqual({
					kind: 'cloud',
					assetId: 'replacement-user-id/record-1/b.webp',
					fallbackUrl: null
				})
				expect(store.records[0]!.title).toBe('Replacement record')
				expect(mockToast.success).not.toHaveBeenCalled()
				expect(mockToast.error).not.toHaveBeenCalled()
			}
		)
	})
})
