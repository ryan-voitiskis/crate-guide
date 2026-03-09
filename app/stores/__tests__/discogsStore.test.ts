import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import {
	createMockDiscogsRelease,
	resetReleaseIdCounter
} from 'test/mocks/fixtures/discogs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useDiscogsStore } from '../discogsStore'

// Mock dependencies
const mockUserStore = {
	profile: { id: 'test-user-id', discogs_username: 'testuser' }
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

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder)
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
		mockUserStore.profile = { id: 'test-user-id', discogs_username: 'testuser' }
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
	})

	describe('disconnectDiscogs', () => {
		it('sets isDisconnecting during operation', async () => {
			const store = useDiscogsStore()
			mockQueryBuilder.select.mockResolvedValue({
				data: [{ ...mockUserStore.profile, discogs_username: null }],
				error: null
			})

			const disconnectPromise = store.disconnectDiscogs()
			expect(store.isDisconnecting).toBe(true)

			await disconnectPromise
			expect(store.isDisconnecting).toBe(false)
		})

		it('updates profile to clear Discogs data', async () => {
			const store = useDiscogsStore()
			mockQueryBuilder.select.mockResolvedValue({
				data: [{ ...mockUserStore.profile, discogs_username: null }],
				error: null
			})

			await store.disconnectDiscogs()

			expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles')
			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				discogs_username: null,
				discogs_request_token: null,
				discogs_request_secret: null,
				discogs_access_token: null,
				discogs_access_secret: null,
				discogs_avatar_url: null
			})
		})

		it('updates user profile on success', async () => {
			const store = useDiscogsStore()
			const updatedProfile = {
				...mockUserStore.profile,
				discogs_username: null
			}
			mockQueryBuilder.select.mockResolvedValue({
				data: [updatedProfile],
				error: null
			})

			await store.disconnectDiscogs()

			expect(mockUserStore.profile).toEqual(updatedProfile)
		})

		it('handles database errors gracefully', async () => {
			const store = useDiscogsStore()
			mockQueryBuilder.select.mockResolvedValue({
				data: null,
				error: new Error('Database error')
			})

			await store.disconnectDiscogs()

			expect(store.isDisconnecting).toBe(false)
		})

		it('handles exceptions gracefully', async () => {
			const store = useDiscogsStore()
			mockQueryBuilder.select.mockRejectedValue(new Error('Network error'))

			await store.disconnectDiscogs()

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
			expect(mockImportFetchedReleases).not.toHaveBeenCalled()
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

			try {
				await store.importSelectedReleases()
			} catch {
				// Ignore error
			}

			expect(store.isImporting).toBe(false)
			expect(store.importProgress).toBe(0)
			expect(store.importPhase).toBeNull()
			expect(store.releaseBeingImported).toBeNull()
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
