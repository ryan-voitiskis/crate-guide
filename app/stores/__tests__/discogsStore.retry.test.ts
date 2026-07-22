import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import {
	createMockDiscogsRelease,
	createMockDiscogsReleaseFull,
	resetReleaseIdCounter
} from 'test/mocks/fixtures/discogs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscogsImportFailure } from '../../../shared/types/discogs'
import { discogsTransferStorageKey } from '../../utils/discogsTransferSnapshot'
import { useDiscogsStore } from '../discogsStore'
import {
	createDiscogsStoreHarness,
	createFailure,
	createMockFolder
} from './harness/discogsStoreHarness'

const mockToast = vi.hoisted(() => ({
	error: vi.fn(),
	info: vi.fn(),
	success: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({ toast: mockToast }))

const harness = createDiscogsStoreHarness()
const mockUserStore = harness.userStore
const mockRecordsStore = harness.recordsStore
const mockTracksStore = harness.tracksStore
const mockDiscogsApi = harness.discogsApi
const mockSessionStorage = harness.sessionStorage

function createTransferSnapshot(userId: string, successful = 0) {
	return JSON.stringify({
		version: 1,
		userId,
		status: 'completed',
		mode: 'import',
		results: { successful, skipped: [], failed: [] },
		retrySummary: null
	})
}

function snapshotOwner(userId: string): string {
	return JSON.stringify([
		userId,
		`cloud:account:${encodeURIComponent(userId)}`,
		'cloud-supabase'
	])
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, reject, resolve }
}

const mockFilterOutExistingReleases = vi.fn()
const mockFetchReleaseDetails = vi.fn()
const mockImportFetchedReleases = vi.fn()

vi.stubGlobal('filterOutExistingReleases', mockFilterOutExistingReleases)
vi.stubGlobal('fetchReleaseDetails', mockFetchReleaseDetails)
vi.stubGlobal('importFetchedReleases', mockImportFetchedReleases)

describe('discogsStore retry and recovery', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetReleaseIdCounter()
		setActivePinia(createPinia())

		harness.reset()
	})

	describe('retryFailedReleases', () => {
		beforeEach(() => {
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [],
				failed: [],
				cancelled: false
			})
			mockImportFetchedReleases.mockResolvedValue({
				successful: 0,
				failed: []
			})
		})

		it('refetches only retryable failed release ids and merges recovered results', async () => {
			const store = useDiscogsStore()
			const nonRetryable = createFailure({
				releaseId: 2,
				label: 'Deleted release',
				code: 'discogs_not_found',
				retryable: false,
				attempts: 1
			})
			store.importResults = {
				successful: 179,
				skipped: [],
				failed: [createFailure({ releaseId: 1 }), nonRetryable]
			}
			store.transferStatus = 'completed'
			mockFetchReleaseDetails.mockResolvedValueOnce({
				releases: [createMockDiscogsReleaseFull({ id: 1 })],
				failed: [],
				cancelled: false
			})
			mockImportFetchedReleases.mockResolvedValueOnce({
				successful: 1,
				failed: []
			})

			await store.retryFailedReleases()

			expect(mockFetchReleaseDetails).toHaveBeenCalledWith(
				[{ id: 1, label: 'Failed release' }],
				expect.any(Function),
				expect.any(Function),
				expect.objectContaining({ onAttemptStatus: expect.any(Function) })
			)
			expect(store.importResults.successful).toBe(180)
			expect(store.importResults.failed).toEqual([nonRetryable])
			expect(store.retrySummary).toEqual({
				attempted: 1,
				recovered: 1,
				remaining: 1
			})
			expect(store.transferMode).toBe('retry')
			expect(store.transferStatus).toBe('completed')
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledWith({
				fresh: true
			})
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledWith({
				fresh: true
			})
		})

		it('replaces attempted failures while preserving unrelated failures', async () => {
			const store = useDiscogsStore()
			const unrelated = createFailure({
				releaseId: 2,
				label: 'Other failure',
				retryable: false,
				code: 'discogs_not_found',
				attempts: 1
			})
			const replacement = createFailure({
				releaseId: 1,
				error: 'Discogs is still unavailable.'
			})
			store.importResults = {
				successful: 10,
				skipped: [],
				failed: [createFailure({ releaseId: 1 }), unrelated]
			}
			mockFetchReleaseDetails.mockResolvedValueOnce({
				releases: [],
				failed: [replacement],
				cancelled: false
			})

			await store.retryFailedReleases()

			expect(store.importResults.failed).toEqual([unrelated, replacement])
			expect(store.retrySummary).toEqual({
				attempted: 1,
				recovered: 0,
				remaining: 2
			})
		})

		it('keeps provider cancellation and retry accounting explicit', async () => {
			const store = useDiscogsStore()
			const replacement = createFailure({
				releaseId: 1,
				error: 'Discogs is still unavailable.'
			})
			store.importResults = {
				successful: 4,
				skipped: [{ label: 'Already imported' }],
				failed: [createFailure({ releaseId: 1 })]
			}
			mockFetchReleaseDetails.mockResolvedValueOnce({
				releases: [],
				failed: [replacement],
				cancelled: true
			})

			await store.retryFailedReleases()

			expect(store.transferStatus).toBe('cancelled')
			expect(store.importResults).toEqual({
				successful: 4,
				skipped: [{ label: 'Already imported' }],
				failed: [replacement]
			})
			expect(store.retrySummary).toEqual({
				attempted: 1,
				recovered: 0,
				remaining: 1
			})
			expect(store.showImportProgressDialog).toBe(false)
			expect(mockImportFetchedReleases).not.toHaveBeenCalled()
		})

		it('does not start a second retry while the first is active', async () => {
			const store = useDiscogsStore()
			store.importResults = {
				successful: 0,
				skipped: [],
				failed: [createFailure({ releaseId: 1 })]
			}
			const fetchDeferred = createDeferred<{
				releases: unknown[]
				failed: DiscogsImportFailure[]
				cancelled: boolean
			}>()
			mockFetchReleaseDetails.mockReturnValueOnce(fetchDeferred.promise)
			const previousResults = store.importResults

			const firstRetry = store.retryFailedReleases()
			expect(store.isImporting).toBe(true)
			expect(store.importResults).toBe(previousResults)
			await store.retryFailedReleases()

			expect(mockFetchReleaseDetails).toHaveBeenCalledOnce()
			fetchDeferred.resolve({ releases: [], failed: [], cancelled: false })
			await firstRetry
		})

		it('does nothing when no record-level failure is retryable', async () => {
			const store = useDiscogsStore()
			store.importResults = {
				successful: 0,
				skipped: [],
				failed: [
					createFailure({
						releaseId: null,
						stage: 'pipeline',
						retryable: false
					})
				]
			}

			await store.retryFailedReleases()

			expect(mockFetchReleaseDetails).not.toHaveBeenCalled()
			expect(store.canRetryFailed).toBe(false)
		})
	})

	describe('transfer snapshot', () => {
		it('clears only the explicit outgoing account snapshot on replacement', async () => {
			const outgoingOwner = snapshotOwner('test-user-id')
			const incomingOwner = snapshotOwner('new-user-id')
			window.sessionStorage.setItem(
				discogsTransferStorageKey(outgoingOwner),
				createTransferSnapshot(outgoingOwner, 1)
			)
			window.sessionStorage.setItem(
				discogsTransferStorageKey(incomingOwner),
				createTransferSnapshot(incomingOwner, 2)
			)
			const store = useDiscogsStore()
			expect(store.importResults.successful).toBe(1)

			mockUserStore.supaUser = { id: 'new-user-id' }
			mockUserStore.profile = {
				id: 'new-user-id',
				discogs_username: 'new-user'
			}
			store.resetAccountState('test-user-id')
			setActivePinia(createPinia())
			const restoredStore = useDiscogsStore()

			expect(
				window.sessionStorage.getItem(discogsTransferStorageKey(outgoingOwner))
			).toBeNull()
			expect(
				window.sessionStorage.getItem(discogsTransferStorageKey(incomingOwner))
			).not.toBeNull()
			expect(restoredStore.importResults.successful).toBe(2)
		})

		it('resets in-memory state even when outgoing snapshot removal throws', () => {
			const store = useDiscogsStore()
			store.transferStatus = 'completed'
			const removeItem = mockSessionStorage.removeItem
			mockSessionStorage.removeItem = () => {
				throw new Error('storage unavailable')
			}
			try {
				expect(() => store.resetAccountState('test-user-id')).not.toThrow()
				expect(store.transferStatus).toBe('idle')
			} finally {
				mockSessionStorage.removeItem = removeItem
			}
		})

		it('keeps terminal in-memory state when snapshot persistence throws', async () => {
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [],
				skipped: [{ label: 'Already imported' }]
			})
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [],
				failed: [],
				cancelled: false
			})
			mockImportFetchedReleases.mockResolvedValue({
				successful: 0,
				failed: []
			})
			const setItem = mockSessionStorage.setItem
			mockSessionStorage.setItem = () => {
				throw new Error('storage unavailable')
			}
			try {
				const store = useDiscogsStore()
				store.releasesToImport = [
					{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
				]

				await expect(store.importSelectedReleases()).resolves.toBeUndefined()

				expect(store.transferStatus).toBe('completed')
				expect(store.importResults.skipped).toEqual([
					{ label: 'Already imported' }
				])
				expect(window.sessionStorage.length).toBe(0)
			} finally {
				mockSessionStorage.setItem = setItem
			}
		})

		it('restores sanitized completed results for the same user until dismissed', async () => {
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [
					{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
				],
				skipped: []
			})
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [],
				failed: [createFailure({ releaseId: 1 })],
				cancelled: false
			})
			mockImportFetchedReleases.mockResolvedValue({
				successful: 0,
				failed: []
			})
			const firstStore = useDiscogsStore()
			firstStore.releasesToImport = [
				{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
			]

			await firstStore.importSelectedReleases()
			expect(window.sessionStorage.length).toBe(1)

			setActivePinia(createPinia())
			const restoredStore = useDiscogsStore()
			expect(restoredStore.transferStatus).toBe('completed')
			expect(restoredStore.importResults.failed).toEqual([
				createFailure({ releaseId: 1 })
			])

			restoredStore.dismissTransferMonitor()
			expect(window.sessionStorage.length).toBe(0)
		})

		it('discards persisted failures with malformed correlation ids', () => {
			window.sessionStorage.setItem(
				'crate-guide:discogs-transfer:test-user-id',
				JSON.stringify({
					version: 1,
					userId: 'test-user-id',
					status: 'completed',
					mode: 'import',
					results: {
						successful: 0,
						skipped: [],
						failed: [createFailure({ requestId: 'not-a-safe-request-id' })]
					},
					retrySummary: null
				})
			)

			const store = useDiscogsStore()

			expect(store.transferStatus).toBe('idle')
			expect(store.importResults.failed).toEqual([])
			expect(window.sessionStorage.length).toBe(0)
		})
	})

	describe('watcher - showGetFoldersDialog', () => {
		it('fetches folders when dialog opens and folders are empty', async () => {
			const store = useDiscogsStore()
			mockDiscogsApi.getFolders.mockResolvedValue({ folders: [] })

			store.showGetFoldersDialog = true
			await nextTick()

			expect(mockDiscogsApi.getFolders).toHaveBeenCalled()
		})

		it('does not fetch folders when dialog opens but folders exist', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ name: 'Existing', count: 10 })]
			mockDiscogsApi.getFolders.mockResolvedValue({ folders: [] })

			store.showGetFoldersDialog = true
			await nextTick()

			expect(mockDiscogsApi.getFolders).not.toHaveBeenCalled()
		})
	})
})
