import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import {
	createMockDiscogsRelease,
	resetReleaseIdCounter
} from 'test/mocks/fixtures/discogs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscogsApiError } from '../../utils/discogs-errors'
import { getWorkbenchRuntime } from '../../utils/workbenchPinia'
import { useDiscogsStore } from '../discogsStore'
import {
	type MockDiscogsFolder,
	createDiscogsStoreHarness,
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
const mockDiscogsApi = harness.discogsApi
const mockSupabaseClient = harness.supabaseClient
const mockRpc = harness.rpc

function createDeferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, reject, resolve }
}

describe('discogsStore collection access', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetReleaseIdCounter()
		setActivePinia(createPinia())

		harness.reset()
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
			expect(store.folderError?.message).toBe(
				'Could not load your Discogs folders.'
			)
			expect(store.isLoadingFolders).toBe(false)
		})

		it('handles API errors gracefully', async () => {
			const store = useDiscogsStore()
			mockDiscogsApi.getFolders.mockRejectedValue(new Error('API Error'))

			await store.getFolders()

			expect(store.folders).toEqual([])
			expect(store.folderError?.message).toBe(
				'Could not load your Discogs folders.'
			)
			expect(store.isLoadingFolders).toBe(false)
		})

		it('preserves a safe typed error and request id for retry UI', async () => {
			const requestId = crypto.randomUUID()
			const store = useDiscogsStore()
			mockDiscogsApi.getFolders.mockRejectedValue(
				new DiscogsApiError('Discogs is temporarily unavailable.', {
					code: 'discogs_unavailable',
					requestId,
					retryable: true,
					status: 503
				})
			)

			await store.getFolders()

			expect(store.folderError).toEqual({
				message: 'Discogs is temporarily unavailable.',
				requestId
			})
			expect(mockToast.error).toHaveBeenCalledWith(
				'Discogs is temporarily unavailable.'
			)
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
		it('publishes only the newest same-account folder review by ID', async () => {
			const first = createDeferred<{
				releases: ReturnType<typeof createMockDiscogsRelease>[]
				pagination: { pages: number }
			}>()
			const second = createDeferred<{
				releases: ReturnType<typeof createMockDiscogsRelease>[]
				pagination: { pages: number }
			}>()
			mockDiscogsApi.getFolderReleases
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(second.promise)
			const store = useDiscogsStore()
			store.folders = [
				createMockFolder({ id: 1, name: 'Same name' }),
				createMockFolder({ id: 2, name: 'Same name' })
			]

			store.selectedFolder = '1'
			const firstReview = store.fetchFolderReleases()
			store.selectedFolder = '2'
			const secondReview = store.fetchFolderReleases()

			first.resolve({
				releases: [createMockDiscogsRelease({ id: 1 })],
				pagination: { pages: 1 }
			})
			await firstReview
			expect(store.releasesToImport).toEqual([])
			expect(store.isLoadingSelectedFolder).toBe(true)

			second.resolve({
				releases: [createMockDiscogsRelease({ id: 2 })],
				pagination: { pages: 1 }
			})
			await secondReview
			expect(store.releasesToImport).toEqual([
				expect.objectContaining({ id: 2 })
			])
			expect(store.isLoadingSelectedFolder).toBe(false)
			expect(mockToast.error).not.toHaveBeenCalled()
		})

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

		it('marks and deselects releases already present in the library', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder({ count: 2 })]
			store.selectedFolder = 'House'
			mockDiscogsApi.getFolderReleases.mockResolvedValue({
				releases: [
					createMockDiscogsRelease({ id: 1 }),
					createMockDiscogsRelease({ id: 2 })
				],
				pagination: { pages: 1 }
			})
			harness.queryBuilder.in.mockResolvedValueOnce({
				data: [{ discogs_id: 1 }],
				error: null
			})

			await store.fetchFolderReleases()

			expect(harness.queryBuilder.eq).toHaveBeenCalledWith(
				'user_id',
				'test-user-id'
			)
			expect(harness.queryBuilder.in).toHaveBeenCalledWith('discogs_id', [1, 2])
			expect(store.releasesToImport).toEqual([
				expect.objectContaining({
					id: 1,
					alreadyImported: true,
					selected: false
				}),
				expect.objectContaining({
					id: 2,
					alreadyImported: false,
					selected: true
				})
			])
		})

		it('keeps the manifest usable when its existing-record lookup fails', async () => {
			const store = useDiscogsStore()
			store.folders = [createMockFolder()]
			store.selectedFolder = 'House'
			mockDiscogsApi.getFolderReleases.mockResolvedValue({
				releases: [createMockDiscogsRelease({ id: 1 })],
				pagination: { pages: 1 }
			})
			harness.queryBuilder.in.mockRejectedValueOnce(
				new Error('Database offline')
			)

			await store.fetchFolderReleases()

			expect(store.releasesToImport[0]).toEqual(
				expect.objectContaining({ alreadyImported: false, selected: true })
			)
			expect(mockToast.warning).toHaveBeenCalledWith(
				'Could not compare this folder with your library. Existing records will still be skipped safely.'
			)
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
			const runtime = getWorkbenchRuntime(getActivePinia())
			if (!runtime) throw new Error('Expected the store workbench runtime.')
			const current = runtime.capture()
			runtime.replaceWorkspace(
				{
					...current.descriptor,
					id: 'cloud:account:new-user-id',
					repositoryRevision: 0
				},
				current.repositories
			)
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
})
