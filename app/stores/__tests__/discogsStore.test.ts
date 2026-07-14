import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import {
	createMockDiscogsRelease,
	resetReleaseIdCounter
} from 'test/mocks/fixtures/discogs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useDiscogsStore } from '../discogsStore'

const mockToast = vi.hoisted(() => ({
	error: vi.fn(),
	info: vi.fn(),
	success: vi.fn()
}))

vi.mock('vue-sonner', () => ({ toast: mockToast }))

// Mock dependencies
const mockUserStore = {
	supaUser: { id: 'test-user-id' } as { id: string } | null,
	get supaUserId() {
		return this.supaUser?.id ?? null
	},
	profile: { id: 'test-user-id', discogs_username: 'testuser' } as {
		id: string
		discogs_username: string | null
	} | null,
	fetchProfile: vi.fn().mockResolvedValue(true)
}

const mockRecordsStore = {
	fetchAllRecords: vi.fn().mockResolvedValue(undefined)
}

const mockTracksStore = {
	fetchAllTracks: vi.fn().mockResolvedValue(undefined)
}

const mockDiscogsApi = {
	getFolders: vi.fn(),
	getFolderReleases: vi.fn(),
	getRelease: vi.fn()
}

type MockDiscogsFolder = {
	id: number
	name: string
	count: number
	resource_url: string
}

function createMockFolder(
	overrides: Partial<MockDiscogsFolder> = {}
): MockDiscogsFolder {
	return {
		id: 1,
		name: 'House',
		count: 50,
		resource_url: 'https://api.discogs.com/users/testuser/collection/folders/1',
		...overrides
	}
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

// Create a chainable mock query builder
function createMockQueryBuilder() {
	const builder = {
		select: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
	// Make the builder thenable for update operations
	builder.select.mockResolvedValue({
		data: [mockUserStore.profile],
		error: null
	})
	return builder
}

let mockQueryBuilder = createMockQueryBuilder()

const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder),
	rpc: mockRpc
}

// Mock utility functions
const mockFilterOutExistingReleases = vi.fn()
const mockFetchReleaseDetails = vi.fn()
const mockImportFetchedReleases = vi.fn()

// Mock isError utility (checks if value is an Error instance)
const isError = (e: unknown): e is Error => e instanceof Error

// Stub globals before importing the store
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useRecordsStore', () => mockRecordsStore)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useDiscogsApi', () => mockDiscogsApi)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)
vi.stubGlobal('filterOutExistingReleases', mockFilterOutExistingReleases)
vi.stubGlobal('fetchReleaseDetails', mockFetchReleaseDetails)
vi.stubGlobal('importFetchedReleases', mockImportFetchedReleases)
vi.stubGlobal('isError', isError)

describe('discogsStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetReleaseIdCounter()
		setActivePinia(createPinia())

		// Reset mock query builder
		mockQueryBuilder = createMockQueryBuilder()
		mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)

		// Reset user store
		mockUserStore.supaUser = { id: 'test-user-id' }
		mockUserStore.profile = { id: 'test-user-id', discogs_username: 'testuser' }
		mockUserStore.fetchProfile.mockResolvedValue(true)

		// Reset rpc mock to default success
		mockRpc.mockResolvedValue({ data: null, error: null })
	})

	describe('initial state', () => {
		it('starts with empty folders array', () => {
			const store = useDiscogsStore()
			expect(store.folders).toEqual([])
		})

		it('starts with no selected folder', () => {
			const store = useDiscogsStore()
			expect(store.selectedFolder).toBeUndefined()
		})

		it('starts with empty releases to import', () => {
			const store = useDiscogsStore()
			expect(store.releasesToImport).toEqual([])
		})

		it('starts with all loading states as false', () => {
			const store = useDiscogsStore()
			expect(store.isLoadingFolders).toBe(false)
			expect(store.isLoadingSelectedFolder).toBe(false)
			expect(store.isDisconnecting).toBe(false)
			expect(store.isImporting).toBe(false)
		})

		it('starts with all dialogs closed', () => {
			const store = useDiscogsStore()
			expect(store.showFilterDialog).toBe(false)
			expect(store.showImportProgressDialog).toBe(false)
			expect(store.showGetFoldersDialog).toBe(false)
		})

		it('starts with import progress at 0', () => {
			const store = useDiscogsStore()
			expect(store.importProgress).toBe(0)
		})

		it('starts with null import phase', () => {
			const store = useDiscogsStore()
			expect(store.importPhase).toBeNull()
		})

		it('starts with empty import results', () => {
			const store = useDiscogsStore()
			expect(store.importResults).toEqual({
				successful: 0,
				skipped: [],
				failed: []
			})
		})

		it('starts without transfer activity', () => {
			const store = useDiscogsStore()
			expect(store.transferStatus).toBe('idle')
			expect(store.hasTransferActivity).toBe(false)
		})
	})

	describe('resetAccountState', () => {
		it('restores every account-owned field to its initial state', () => {
			const store = useDiscogsStore()
			const release = { ...createMockDiscogsRelease(), selected: true }
			store.folders = [createMockFolder()]
			store.selectedFolder = 'House'
			store.releasesToImport = [release]
			store.releaseBeingImported = release
			store.isLoadingFolders = true
			store.isLoadingSelectedFolder = true
			store.isDisconnecting = true
			store.showFilterDialog = true
			store.showImportProgressDialog = true
			store.showGetFoldersDialog = true
			store.importProgress = 65
			store.isImporting = true
			store.importPhase = 'saving'
			store.transferStatus = 'completed'
			store.importResults = {
				successful: 2,
				skipped: [{ label: 'Skipped' }],
				failed: [{ label: 'Failed', error: 'Old account error' }]
			}

			store.resetAccountState()

			expect(store.folders).toEqual([])
			expect(store.selectedFolder).toBeUndefined()
			expect(store.releasesToImport).toEqual([])
			expect(store.releaseBeingImported).toBeNull()
			expect(store.isLoadingFolders).toBe(false)
			expect(store.isLoadingSelectedFolder).toBe(false)
			expect(store.isDisconnecting).toBe(false)
			expect(store.showFilterDialog).toBe(false)
			expect(store.showImportProgressDialog).toBe(false)
			expect(store.showGetFoldersDialog).toBe(false)
			expect(store.importProgress).toBe(0)
			expect(store.isImporting).toBe(false)
			expect(store.importPhase).toBeNull()
			expect(store.transferStatus).toBe('idle')
			expect(store.hasTransferActivity).toBe(false)
			expect(store.importResults).toEqual({
				successful: 0,
				skipped: [],
				failed: []
			})
		})
	})

	describe('transfer monitor', () => {
		it('minimizes and reopens an active transfer without clearing it', () => {
			const store = useDiscogsStore()
			store.transferStatus = 'running'
			store.isImporting = true
			store.importPhase = 'fetching'
			store.importProgress = 42
			store.showImportProgressDialog = true

			store.minimizeTransferMonitor()

			expect(store.showImportProgressDialog).toBe(false)
			expect(store.isImporting).toBe(true)
			expect(store.hasTransferActivity).toBe(true)
			expect(store.transferLabel).toBe('Discogs · Fetching · 42%')

			store.openTransferMonitor()

			expect(store.showImportProgressDialog).toBe(true)
		})

		it('keeps active transfer status when dismissal is attempted', () => {
			const store = useDiscogsStore()
			store.transferStatus = 'running'
			store.isImporting = true
			store.showImportProgressDialog = true

			store.dismissTransferMonitor()

			expect(store.showImportProgressDialog).toBe(false)
			expect(store.transferStatus).toBe('running')
			expect(store.hasTransferActivity).toBe(true)
		})

		it('dismisses a finished transfer from the workspace', () => {
			const store = useDiscogsStore()
			store.transferStatus = 'completed'
			store.importResults = { successful: 7, skipped: [], failed: [] }

			expect(store.transferTone).toBe('success')
			expect(store.transferLabel).toBe('Discogs · 7 imported')

			store.dismissTransferMonitor()

			expect(store.transferStatus).toBe('idle')
			expect(store.hasTransferActivity).toBe(false)
		})
	})

	describe('getFolders', () => {
		it('sets isLoadingFolders during fetch', async () => {
			const store = useDiscogsStore()
			mockDiscogsApi.getFolders.mockResolvedValue({ folders: [] })

			const fetchPromise = store.getFolders()
			expect(store.isLoadingFolders).toBe(true)

			await fetchPromise
			expect(store.isLoadingFolders).toBe(false)
		})

		it('populates folders from response', async () => {
			const store = useDiscogsStore()
			const mockFolders = [
				{ id: 0, name: 'All', count: 100 },
				{ id: 1, name: 'House', count: 50 }
			]
			mockDiscogsApi.getFolders.mockResolvedValue({ folders: mockFolders })

			await store.getFolders()

			expect(store.folders).toEqual(mockFolders)
		})

		it('clears existing folders before fetching', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ id: 1, name: 'Old', count: 10 })]
			mockDiscogsApi.getFolders.mockResolvedValue({
				folders: [{ id: 2, name: 'New', count: 20 }]
			})

			await store.getFolders()

			expect(store.folders).toEqual([{ id: 2, name: 'New', count: 20 }])
		})

		it('handles missing folders in response', async () => {
			const store = useDiscogsStore()
			mockDiscogsApi.getFolders.mockResolvedValue({})

			await store.getFolders()

			expect(store.folders).toEqual([])
			expect(store.isLoadingFolders).toBe(false)
		})

		it('handles API errors gracefully', async () => {
			const store = useDiscogsStore()
			mockDiscogsApi.getFolders.mockRejectedValue(new Error('API Error'))

			await store.getFolders()

			expect(store.folders).toEqual([])
			expect(store.isLoadingFolders).toBe(false)
		})

		it('uses the owned profile identity during initial auth hydration', async () => {
			mockUserStore.supaUser = null
			const store = useDiscogsStore()
			mockDiscogsApi.getFolders.mockResolvedValue({
				folders: [createMockFolder()]
			})

			await store.getFolders()

			expect(mockDiscogsApi.getFolders).toHaveBeenCalledOnce()
			expect(store.folders).toHaveLength(1)
		})

		it('keeps newer account folders and loading state when old work settles', async () => {
			const oldFetch = createDeferred<{ folders: MockDiscogsFolder[] }>()
			const newFetch = createDeferred<{ folders: MockDiscogsFolder[] }>()
			mockDiscogsApi.getFolders
				.mockReturnValueOnce(oldFetch.promise)
				.mockReturnValueOnce(newFetch.promise)
			const store = useDiscogsStore()

			const oldPromise = store.getFolders()
			store.resetAccountState()
			mockUserStore.supaUser = { id: 'new-user-id' }
			mockUserStore.profile = {
				id: 'new-user-id',
				discogs_username: 'newuser'
			}
			const newPromise = store.getFolders()

			oldFetch.resolve({
				folders: [createMockFolder({ id: 1, name: 'Old account' })]
			})
			await oldPromise
			expect(store.folders).toEqual([])
			expect(store.isLoadingFolders).toBe(true)

			newFetch.resolve({
				folders: [createMockFolder({ id: 2, name: 'New account' })]
			})
			await newPromise
			expect(store.folders).toEqual([
				createMockFolder({ id: 2, name: 'New account' })
			])
			expect(store.isLoadingFolders).toBe(false)
			expect(mockToast.error).not.toHaveBeenCalled()
		})
	})

	describe('fetchFolderReleases', () => {
		it('does nothing when no folder is selected', async () => {
			const store = useDiscogsStore()
			store.selectedFolder = undefined

			await store.fetchFolderReleases()

			expect(mockDiscogsApi.getFolderReleases).not.toHaveBeenCalled()
		})

		it('does nothing when selected folder not found', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder()]
			store.selectedFolder = 'Techno'

			await store.fetchFolderReleases()

			expect(mockDiscogsApi.getFolderReleases).not.toHaveBeenCalled()
		})

		it('sets isLoadingSelectedFolder during fetch', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder()]
			store.selectedFolder = 'House'
			mockDiscogsApi.getFolderReleases.mockResolvedValue({
				releases: [],
				pagination: { pages: 1 }
			})

			const fetchPromise = store.fetchFolderReleases()
			expect(store.isLoadingSelectedFolder).toBe(true)

			await fetchPromise
			expect(store.isLoadingSelectedFolder).toBe(false)
		})

		it('fetches releases with correct folder ID', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ id: 42 })]
			store.selectedFolder = 'House'
			mockDiscogsApi.getFolderReleases.mockResolvedValue({
				releases: [],
				pagination: { pages: 1 }
			})

			await store.fetchFolderReleases()

			expect(mockDiscogsApi.getFolderReleases).toHaveBeenCalledWith(42, 1, 100)
		})

		it('populates releasesToImport with selected flag', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ count: 2 })]
			store.selectedFolder = 'House'
			const mockReleases = [
				createMockDiscogsRelease({ id: 1 }),
				createMockDiscogsRelease({ id: 2 })
			]
			mockDiscogsApi.getFolderReleases.mockResolvedValue({
				releases: mockReleases,
				pagination: { pages: 1 }
			})

			await store.fetchFolderReleases()

			expect(store.releasesToImport.length).toBe(2)
			expect(store.releasesToImport[0]!.selected).toBe(true)
			expect(store.releasesToImport[1]!.selected).toBe(true)
		})

		it('handles pagination - fetches all pages', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ count: 150 })]
			store.selectedFolder = 'House'

			mockDiscogsApi.getFolderReleases
				.mockResolvedValueOnce({
					releases: [createMockDiscogsRelease({ id: 1 })],
					pagination: { pages: 2 }
				})
				.mockResolvedValueOnce({
					releases: [createMockDiscogsRelease({ id: 2 })],
					pagination: { pages: 2 }
				})

			await store.fetchFolderReleases()

			expect(mockDiscogsApi.getFolderReleases).toHaveBeenCalledTimes(2)
			expect(mockDiscogsApi.getFolderReleases).toHaveBeenCalledWith(1, 1, 100)
			expect(mockDiscogsApi.getFolderReleases).toHaveBeenCalledWith(1, 2, 100)
			expect(store.releasesToImport.length).toBe(2)
		})

		it('opens filter dialog after successful fetch', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ count: 10 })]
			store.selectedFolder = 'House'
			store.showGetFoldersDialog = true
			mockDiscogsApi.getFolderReleases.mockResolvedValue({
				releases: [createMockDiscogsRelease()],
				pagination: { pages: 1 }
			})

			await store.fetchFolderReleases()

			expect(store.showGetFoldersDialog).toBe(false)
			expect(store.showFilterDialog).toBe(true)
		})

		it('handles missing releases in response', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ count: 10 })]
			store.selectedFolder = 'House'
			mockDiscogsApi.getFolderReleases.mockResolvedValue({
				pagination: { pages: 1 }
			})

			await store.fetchFolderReleases()

			expect(store.isLoadingSelectedFolder).toBe(false)
		})

		it('handles missing pagination in response', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ count: 10 })]
			store.selectedFolder = 'House'
			mockDiscogsApi.getFolderReleases.mockResolvedValue({
				releases: [createMockDiscogsRelease()]
			})

			await store.fetchFolderReleases()

			expect(store.isLoadingSelectedFolder).toBe(false)
		})

		it('handles API errors gracefully', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ count: 10 })]
			store.selectedFolder = 'House'
			mockDiscogsApi.getFolderReleases.mockRejectedValue(new Error('API Error'))

			await store.fetchFolderReleases()

			expect(store.isLoadingSelectedFolder).toBe(false)
		})

		it('keeps newer account releases and loading state when old work settles', async () => {
			const oldFetch = createDeferred<{
				releases: ReturnType<typeof createMockDiscogsRelease>[]
				pagination: { pages: number }
			}>()
			const newFetch = createDeferred<{
				releases: ReturnType<typeof createMockDiscogsRelease>[]
				pagination: { pages: number }
			}>()
			mockDiscogsApi.getFolderReleases
				.mockReturnValueOnce(oldFetch.promise)
				.mockReturnValueOnce(newFetch.promise)
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ id: 1, name: 'Old folder' })]
			store.selectedFolder = 'Old folder'

			const oldPromise = store.fetchFolderReleases()
			store.resetAccountState()
			mockUserStore.supaUser = { id: 'new-user-id' }
			mockUserStore.profile = {
				id: 'new-user-id',
				discogs_username: 'newuser'
			}
			store.folders = [createMockFolder({ id: 2, name: 'New folder' })]
			store.selectedFolder = 'New folder'
			const newPromise = store.fetchFolderReleases()

			oldFetch.resolve({
				releases: [createMockDiscogsRelease({ id: 1 })],
				pagination: { pages: 1 }
			})
			await oldPromise
			expect(store.releasesToImport).toEqual([])
			expect(store.isLoadingSelectedFolder).toBe(true)

			newFetch.resolve({
				releases: [createMockDiscogsRelease({ id: 2 })],
				pagination: { pages: 1 }
			})
			await newPromise
			expect(store.releasesToImport).toHaveLength(1)
			expect(store.releasesToImport[0]?.id).toBe(2)
			expect(store.isLoadingSelectedFolder).toBe(false)
			expect(store.showFilterDialog).toBe(true)
			expect(mockToast.error).not.toHaveBeenCalled()
		})
	})

	describe('disconnectDiscogs', () => {
		it('sets isDisconnecting during operation', async () => {
			const store = useDiscogsStore()

			const disconnectPromise = store.disconnectDiscogs()
			expect(store.isDisconnecting).toBe(true)

			await disconnectPromise
			expect(store.isDisconnecting).toBe(false)
		})

		it('calls the disconnect_discogs RPC and refreshes profile', async () => {
			const store = useDiscogsStore()

			await store.disconnectDiscogs()

			expect(mockRpc).toHaveBeenCalledWith('disconnect_discogs')
			expect(mockUserStore.fetchProfile).toHaveBeenCalledTimes(1)
		})

		it('does not touch the profiles table directly', async () => {
			const store = useDiscogsStore()

			await store.disconnectDiscogs()

			expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('profiles')
		})

		it('handles RPC errors gracefully', async () => {
			const store = useDiscogsStore()
			mockRpc.mockResolvedValueOnce({
				data: null,
				error: new Error('RPC failed')
			})

			await store.disconnectDiscogs()

			expect(store.isDisconnecting).toBe(false)
			expect(mockUserStore.fetchProfile).not.toHaveBeenCalled()
		})

		it('handles profile refresh failure gracefully', async () => {
			const store = useDiscogsStore()
			mockUserStore.fetchProfile.mockResolvedValueOnce(false)

			await store.disconnectDiscogs()

			expect(store.isDisconnecting).toBe(false)
		})

		it('handles exceptions gracefully', async () => {
			const store = useDiscogsStore()
			mockRpc.mockRejectedValueOnce(new Error('Network error'))

			await store.disconnectDiscogs()

			expect(store.isDisconnecting).toBe(false)
		})

		it('returns early when profile is not loaded', async () => {
			mockUserStore.profile = null
			const store = useDiscogsStore()

			await store.disconnectDiscogs()

			expect(mockRpc).not.toHaveBeenCalled()
			expect(store.isDisconnecting).toBe(false)
		})
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
				failed: { label: string; error: string }[]
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
			await Promise.resolve()

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
				'test-user-id',
				expect.any(Function)
			)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalled()
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalled()
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
				failed: [{ label: 'Failed Release', error: 'API timeout' }],
				cancelled: false
			})

			await store.importSelectedReleases()

			expect(store.importResults.failed).toContainEqual({
				label: 'Failed Release',
				error: 'API timeout'
			})
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
				failed: [{ label: 'Fetch Failed', error: 'API error' }],
				cancelled: false
			})
			mockImportFetchedReleases.mockResolvedValue({
				successful: 0,
				failed: [{ label: 'Import Failed', error: 'DB error' }]
			})

			await store.importSelectedReleases()

			expect(store.importResults.failed).toHaveLength(2)
			expect(store.importResults.failed).toContainEqual({
				label: 'Fetch Failed',
				error: 'API error'
			})
			expect(store.importResults.failed).toContainEqual({
				label: 'Import Failed',
				error: 'DB error'
			})
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
				label: 'Discogs import',
				error: 'The transfer stopped unexpectedly. Please try again.'
			})
			expect(mockToast.error).toHaveBeenCalledWith(
				'Discogs import failed. Open Transfers for details.'
			)
		})

		it('does not persist or present an import invalidated by account reset', async () => {
			const detailsFetch = createDeferred<{
				releases: { id: number; title: string }[]
				failed: { label: string; error: string }[]
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
