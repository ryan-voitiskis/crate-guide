import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import {
	createMockDiscogsRelease,
	createMockDiscogsReleaseFull,
	resetReleaseIdCounter
} from 'test/mocks/fixtures/discogs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscogsImportFailure } from '../../../shared/types/discogs'
import { getWorkbenchRuntime } from '../../utils/workbenchPinia'
import { useDiscogsStore } from '../discogsStore'
import {
	createDiscogsStoreHarness,
	createFailure
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

describe('discogsStore import', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetReleaseIdCounter()
		setActivePinia(createPinia())

		harness.reset()
	})

	describe('cancelImport', () => {
		it('signals cancellation to in-flight imports', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]

			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [{ ...createMockDiscogsRelease(), selected: true }],
				skipped: []
			})

			let shouldCancel: (() => boolean) | undefined
			let resolveFetch: (value: {
				releases: unknown[]
				failed: DiscogsImportFailure[]
				cancelled: boolean
			}) => void

			mockFetchReleaseDetails.mockImplementation(
				(
					_releases: unknown[],
					_onProgress: unknown,
					isCancelled: () => boolean
				) => {
					shouldCancel = isCancelled
					return new Promise((resolve) => {
						resolveFetch = resolve
					})
				}
			)

			const importPromise = store.importSelectedReleases()
			await vi.waitFor(() => {
				expect(shouldCancel).toBeTypeOf('function')
			})

			store.cancelImport()
			expect(shouldCancel?.()).toBe(true)

			resolveFetch!({ releases: [], failed: [], cancelled: true })
			await importPromise

			expect(store.isImporting).toBe(false)
			expect(store.showImportProgressDialog).toBe(false)
			expect(mockImportFetchedReleases).not.toHaveBeenCalled()
		})
	})

	describe('importSelectedReleases', () => {
		beforeEach(() => {
			// Setup default mock returns
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [],
				skipped: []
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
		})

		it('does nothing when no releases are selected', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: false }
			]

			await store.importSelectedReleases()

			expect(mockFilterOutExistingReleases).not.toHaveBeenCalled()
		})

		it('reopens the active monitor instead of starting a second import', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			const fetchDeferred = createDeferred<{
				releases: unknown[]
				failed: DiscogsImportFailure[]
				cancelled: boolean
			}>()
			mockFetchReleaseDetails.mockReturnValueOnce(fetchDeferred.promise)

			const firstImport = store.importSelectedReleases()
			expect(store.isImporting).toBe(true)
			store.showImportProgressDialog = false
			store.showFilterDialog = true

			await store.importSelectedReleases()

			expect(mockFilterOutExistingReleases).toHaveBeenCalledOnce()
			expect(store.showFilterDialog).toBe(false)
			expect(store.showImportProgressDialog).toBe(true)

			fetchDeferred.resolve({ releases: [], failed: [], cancelled: false })
			await firstImport
		})

		it('opens import progress dialog', async () => {
			const store = useDiscogsStore()
			store.showFilterDialog = true
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]

			await store.importSelectedReleases()

			expect(store.showFilterDialog).toBe(false)
			expect(store.showImportProgressDialog).toBe(true)
		})

		it('sets isImporting during import', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]

			let wasImporting = false
			mockFilterOutExistingReleases.mockImplementation(() => {
				wasImporting = store.isImporting
				return { releasesToFetch: [], skipped: [] }
			})

			await store.importSelectedReleases()

			expect(wasImporting).toBe(true)
			expect(store.isImporting).toBe(false)
		})

		it('sets importPhase to fetching initially', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]

			let capturedPhase: string | null = null
			mockFilterOutExistingReleases.mockImplementation(() => {
				capturedPhase = store.importPhase
				return { releasesToFetch: [], skipped: [] }
			})

			await store.importSelectedReleases()

			expect(capturedPhase).toBe('fetching')
			expect(store.importPhase).toBeNull()
		})

		it('resets import progress at start', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			store.importProgress = 50

			await store.importSelectedReleases()

			// Progress should be 0 after completion
			expect(store.importProgress).toBe(0)
		})

		it('resets import results at start', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			store.importResults = { successful: 5, skipped: [], failed: [] }

			await store.importSelectedReleases()

			// After import with no actual releases, results should be reset
			expect(store.importResults.successful).toBe(0)
		})

		it('tracks skipped releases from existing duplicates', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [],
				skipped: [{ label: 'Already Imported EP' }]
			})

			await store.importSelectedReleases()

			expect(store.importResults.skipped).toEqual([
				{ label: 'Already Imported EP' }
			])
		})

		it('handles cancelled import', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [{ ...createMockDiscogsRelease(), selected: true }],
				skipped: []
			})
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [],
				failed: [],
				cancelled: true
			})

			await store.importSelectedReleases()

			expect(store.showImportProgressDialog).toBe(false)
			expect(store.transferStatus).toBe('cancelled')
			expect(store.transferTone).toBe('warning')
			expect(store.hasTransferActivity).toBe(true)
			expect(mockImportFetchedReleases).not.toHaveBeenCalled()

			store.openTransferMonitor()
			expect(store.showImportProgressDialog).toBe(true)
		})

		it('keeps save-boundary cancellation distinct from provider cancellation', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
			]
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [
					{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
				],
				skipped: []
			})
			mockFetchReleaseDetails.mockImplementationOnce(async () => {
				store.cancelImport()
				return {
					releases: [createMockDiscogsReleaseFull({ id: 1 })],
					failed: [],
					cancelled: false
				}
			})
			mockImportFetchedReleases.mockImplementationOnce(
				async (
					_releases: unknown[],
					_importExternal: unknown,
					shouldCancel: () => boolean
				) => {
					expect(shouldCancel()).toBe(true)
					return { successful: 0, failed: [] }
				}
			)

			await store.importSelectedReleases()

			expect(store.transferStatus).toBe('completed')
			expect(store.showImportProgressDialog).toBe(true)
			expect(mockToast.info).not.toHaveBeenCalled()
		})

		it('refreshes stores after successful import', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [{ ...createMockDiscogsRelease(), selected: true }],
				skipped: []
			})
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [{ id: 1, title: 'Test' }],
				failed: [],
				cancelled: false
			})
			mockImportFetchedReleases.mockResolvedValue({
				successful: 1,
				failed: []
			})

			await store.importSelectedReleases()

			expect(mockImportFetchedReleases).toHaveBeenCalledWith(
				expect.any(Array),
				expect.any(Function),
				expect.any(Function)
			)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledWith({
				fresh: true
			})
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledWith({
				fresh: true
			})
		})

		it('keeps a completed import distinct from a failed library refresh', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [{ ...createMockDiscogsRelease(), selected: true }],
				skipped: []
			})
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [{ id: 1, title: 'Test' }],
				failed: [],
				cancelled: false
			})
			mockImportFetchedReleases.mockResolvedValue({
				successful: 1,
				failed: []
			})
			mockRecordsStore.fetchAllRecords.mockResolvedValueOnce(false)

			await store.importSelectedReleases()

			expect(store.transferStatus).toBe('completed')
			expect(store.importResults.successful).toBe(1)
			expect(store.libraryRefreshFailed).toBe(true)
			expect(store.transferTone).toBe('warning')
			expect(store.transferLabel).toContain('refresh needed')
			expect(mockToast.warning).toHaveBeenCalledWith(
				'Discogs changes were saved, but your library could not be refreshed.'
			)
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('does not refresh stores when no imports succeed', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [],
				skipped: [{ label: 'All Skipped' }]
			})

			await store.importSelectedReleases()

			expect(mockRecordsStore.fetchAllRecords).not.toHaveBeenCalled()
			expect(mockTracksStore.fetchAllTracks).not.toHaveBeenCalled()
		})

		it('tracks failed imports', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [{ ...createMockDiscogsRelease(), selected: true }],
				skipped: []
			})
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [],
				failed: [
					createFailure({
						releaseId: 1,
						label: 'Failed Release',
						error: 'API timeout'
					})
				],
				cancelled: false
			})

			await store.importSelectedReleases()

			expect(store.importResults.failed).toContainEqual(
				createFailure({
					releaseId: 1,
					label: 'Failed Release',
					error: 'API timeout'
				})
			)
			expect(store.transferStatus).toBe('completed')
			expect(store.transferTone).toBe('warning')
		})

		it('accumulates failures from both fetch and import phases', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [{ ...createMockDiscogsRelease(), selected: true }],
				skipped: []
			})
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [{ id: 1, title: 'Test' }],
				failed: [
					createFailure({
						releaseId: 1,
						label: 'Fetch Failed',
						error: 'API error'
					})
				],
				cancelled: false
			})
			mockImportFetchedReleases.mockResolvedValue({
				successful: 0,
				failed: [
					createFailure({
						releaseId: 2,
						label: 'Import Failed',
						error: 'DB error',
						code: 'database_write_failed',
						stage: 'save',
						attempts: 1
					})
				]
			})

			await store.importSelectedReleases()

			expect(store.importResults.failed).toHaveLength(2)
			expect(store.importResults.failed).toContainEqual(
				createFailure({
					releaseId: 1,
					label: 'Fetch Failed',
					error: 'API error'
				})
			)
			expect(store.importResults.failed).toContainEqual(
				createFailure({
					releaseId: 2,
					label: 'Import Failed',
					error: 'DB error',
					code: 'database_write_failed',
					stage: 'save',
					attempts: 1
				})
			)
		})

		it('cleans up state in finally block', async () => {
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]
			mockFilterOutExistingReleases.mockRejectedValue(new Error('Unexpected'))

			await store.importSelectedReleases()

			expect(store.isImporting).toBe(false)
			expect(store.importProgress).toBe(0)
			expect(store.importPhase).toBeNull()
			expect(store.releaseBeingImported).toBeNull()
			expect(store.transferStatus).toBe('failed')
			expect(store.hasTransferActivity).toBe(true)
			expect(store.importResults.failed).toContainEqual({
				releaseId: null,
				label: 'Discogs import',
				error: 'The transfer stopped unexpectedly. Please try again.',
				code: 'internal_error',
				stage: 'pipeline',
				retryable: false,
				attempts: 1
			})
			expect(mockToast.error).toHaveBeenCalledWith(
				'Discogs import failed. Open Transfers for details.'
			)
		})

		it('does not persist or present an import invalidated by account reset', async () => {
			const detailsFetch = createDeferred<{
				releases: { id: number; title: string }[]
				failed: DiscogsImportFailure[]
				cancelled: boolean
			}>()
			let isCancelled: (() => boolean) | undefined
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [{ ...createMockDiscogsRelease(), selected: true }],
				skipped: []
			})
			mockFetchReleaseDetails.mockImplementation(
				(
					_releases: unknown[],
					_onProgress: unknown,
					shouldCancel: () => boolean
				) => {
					isCancelled = shouldCancel
					return detailsFetch.promise
				}
			)
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease(), selected: true }
			]

			const importPromise = store.importSelectedReleases()
			await vi.waitFor(() => {
				expect(mockFetchReleaseDetails).toHaveBeenCalledOnce()
			})
			store.resetAccountState()
			mockUserStore.supaUser = { id: 'new-user-id' }
			mockUserStore.profile = {
				id: 'new-user-id',
				discogs_username: 'newuser'
			}
			expect(isCancelled?.()).toBe(true)

			detailsFetch.resolve({
				releases: [{ id: 1, title: 'Old account release' }],
				failed: [],
				cancelled: false
			})
			await importPromise

			expect(mockImportFetchedReleases).not.toHaveBeenCalled()
			expect(mockRecordsStore.fetchAllRecords).not.toHaveBeenCalled()
			expect(mockTracksStore.fetchAllTracks).not.toHaveBeenCalled()
			expect(store.importResults).toEqual({
				successful: 0,
				skipped: [],
				failed: []
			})
			expect(store.showImportProgressDialog).toBe(false)
			expect(store.isImporting).toBe(false)
			expect(store.releaseBeingImported).toBeNull()
			expect(mockToast.error).not.toHaveBeenCalled()
			expect(mockToast.info).not.toHaveBeenCalled()
			expect(mockToast.success).not.toHaveBeenCalled()
		})

		it('does not publish committed results after account reset during save', async () => {
			const saveDeferred = createDeferred<{
				successful: number
				failed: DiscogsImportFailure[]
			}>()
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [
					{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
				],
				skipped: []
			})
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [createMockDiscogsReleaseFull({ id: 1 })],
				failed: [],
				cancelled: false
			})
			mockImportFetchedReleases.mockReturnValueOnce(saveDeferred.promise)
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
			]

			const importPromise = store.importSelectedReleases()
			await vi.waitFor(() => {
				expect(mockImportFetchedReleases).toHaveBeenCalledOnce()
			})
			store.resetAccountState('test-user-id')
			mockUserStore.supaUser = { id: 'new-user-id' }
			mockUserStore.profile = {
				id: 'new-user-id',
				discogs_username: 'newuser'
			}
			saveDeferred.resolve({ successful: 1, failed: [] })
			await importPromise

			expect(store.transferStatus).toBe('idle')
			expect(store.importResults).toEqual({
				successful: 0,
				skipped: [],
				failed: []
			})
			expect(mockRecordsStore.fetchAllRecords).not.toHaveBeenCalled()
			expect(mockTracksStore.fetchAllTracks).not.toHaveBeenCalled()
			expect(window.sessionStorage.length).toBe(0)
		})

		it('suppresses refresh, snapshot, and presentation after a workspace switch during save', async () => {
			const saveDeferred = createDeferred<{
				successful: number
				failed: DiscogsImportFailure[]
			}>()
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [
					{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
				],
				skipped: []
			})
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [createMockDiscogsReleaseFull({ id: 1 })],
				failed: [],
				cancelled: false
			})
			mockImportFetchedReleases.mockReturnValueOnce(saveDeferred.promise)
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
			]

			const importPromise = store.importSelectedReleases()
			await vi.waitFor(() => {
				expect(mockImportFetchedReleases).toHaveBeenCalledOnce()
			})
			const runtime = getWorkbenchRuntime(getActivePinia())
			if (!runtime) throw new Error('Expected the store workbench runtime.')
			const current = runtime.capture()
			runtime.replaceWorkspace(
				{
					...current.descriptor,
					id: 'browser:workspace-b',
					repositoryId: 'browser-repository-b',
					location: 'browser',
					displayLabel: 'Other Local library',
					repositoryRevision: 0
				},
				{ ...current.repositories, id: 'browser-repository-b' }
			)
			saveDeferred.resolve({ successful: 1, failed: [] })
			await importPromise

			expect(store.transferStatus).toBe('idle')
			expect(store.importResults).toEqual({
				successful: 0,
				skipped: [],
				failed: []
			})
			expect(mockRecordsStore.fetchAllRecords).not.toHaveBeenCalled()
			expect(mockTracksStore.fetchAllTracks).not.toHaveBeenCalled()
			expect(window.sessionStorage.length).toBe(0)
			expect(mockToast.error).not.toHaveBeenCalled()
			expect(mockToast.info).not.toHaveBeenCalled()
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('does not publish refresh completion after account reset', async () => {
			const recordsRefresh = createDeferred<boolean>()
			mockFilterOutExistingReleases.mockResolvedValue({
				releasesToFetch: [
					{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
				],
				skipped: []
			})
			mockFetchReleaseDetails.mockResolvedValue({
				releases: [createMockDiscogsReleaseFull({ id: 1 })],
				failed: [],
				cancelled: false
			})
			mockImportFetchedReleases.mockResolvedValue({
				successful: 1,
				failed: []
			})
			mockRecordsStore.fetchAllRecords.mockReturnValueOnce(
				recordsRefresh.promise
			)
			const store = useDiscogsStore()
			store.releasesToImport = [
				{ ...createMockDiscogsRelease({ id: 1 }), selected: true }
			]

			const importPromise = store.importSelectedReleases()
			await vi.waitFor(() => {
				expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledOnce()
			})
			store.resetAccountState('test-user-id')
			mockUserStore.supaUser = { id: 'new-user-id' }
			mockUserStore.profile = {
				id: 'new-user-id',
				discogs_username: 'newuser'
			}
			recordsRefresh.resolve(true)
			await importPromise

			expect(store.transferStatus).toBe('idle')
			expect(store.libraryRefreshFailed).toBe(false)
			expect(window.sessionStorage.length).toBe(0)
			expect(mockToast.warning).not.toHaveBeenCalled()
		})
	})
})
