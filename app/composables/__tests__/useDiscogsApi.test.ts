import {
	createMockDiscogsRelease,
	createMockDiscogsReleaseFull
} from 'test/mocks/fixtures/discogs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock supabase client
const mockInvoke = vi.fn()
const mockSupabase = {
	functions: {
		invoke: mockInvoke
	}
}

// Mock user store
type MockUserProfile = {
	discogs_username: string | null
}

const mockUserStore: {
	profile: MockUserProfile | null
} = {
	profile: {
		discogs_username: 'testuser'
	}
}

const validFolderReleasesResponse = {
	pagination: { page: 1, pages: 1, per_page: 100, items: 0 },
	releases: []
}

// Stub globals before importing composable
vi.stubGlobal('getSupabase', () => mockSupabase)
vi.stubGlobal('useUserStore', () => mockUserStore)

// Import after mocks
const { useDiscogsApi } = await import('../useDiscogsApi')

describe('useDiscogsApi', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockUserStore.profile = { discogs_username: 'testuser' }
	})

	describe('getFolders', () => {
		it('invokes dispatcher with the folders endpoint', async () => {
			mockInvoke.mockResolvedValue({
				data: { folders: [] },
				error: null
			})

			const { getFolders } = useDiscogsApi()
			await getFolders()

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: JSON.stringify({ endpoint: 'folders' })
			})
		})

		it('throws when no discogs username', async () => {
			mockUserStore.profile = { discogs_username: null }

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toThrow('Discogs username required.')
			expect(mockInvoke).not.toHaveBeenCalled()
		})

		it('throws when profile is null', async () => {
			mockUserStore.profile = null

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toThrow('Discogs username required.')
			expect(mockInvoke).not.toHaveBeenCalled()
		})

		it('surfaces dispatcher errors', async () => {
			mockInvoke.mockResolvedValue({
				data: null,
				error: { message: 'Rate limit exceeded' }
			})

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toThrow('Rate limit exceeded')
		})

		it('falls back to toString when error has no message', async () => {
			mockInvoke.mockResolvedValue({
				data: null,
				error: { toString: () => 'Network error' }
			})

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toThrow('Network error')
		})

		it('propagates invoke rejection errors', async () => {
			mockInvoke.mockRejectedValue(new Error('Network down'))

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toThrow('Network down')
		})

		it('rejects malformed folder responses', async () => {
			mockInvoke.mockResolvedValue({
				data: { folders: [{ id: 1 }] },
				error: null
			})

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toThrow(
				'Discogs returned an invalid folders response.'
			)
		})
	})

	describe('getFolderReleases', () => {
		it('invokes dispatcher with folder id and default pagination', async () => {
			mockInvoke.mockResolvedValue({
				data: validFolderReleasesResponse,
				error: null
			})

			const { getFolderReleases } = useDiscogsApi()
			await getFolderReleases(0)

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: JSON.stringify({
					endpoint: 'folder_releases',
					folder_id: 0,
					page: 1,
					per_page: 100
				})
			})
		})

		it('invokes dispatcher with custom pagination', async () => {
			mockInvoke.mockResolvedValue({
				data: validFolderReleasesResponse,
				error: null
			})

			const { getFolderReleases } = useDiscogsApi()
			await getFolderReleases(1, 3, 50)

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: JSON.stringify({
					endpoint: 'folder_releases',
					folder_id: 1,
					page: 3,
					per_page: 50
				})
			})
		})

		it('accepts the plural genres field returned by Discogs', async () => {
			const response = {
				pagination: { page: 1, pages: 1, per_page: 100, items: 1 },
				releases: [createMockDiscogsRelease()]
			}
			mockInvoke.mockResolvedValue({ data: response, error: null })

			const { getFolderReleases } = useDiscogsApi()

			await expect(getFolderReleases(0)).resolves.toEqual(response)
		})

		it('throws when no discogs username', async () => {
			mockUserStore.profile = { discogs_username: '' }

			const { getFolderReleases } = useDiscogsApi()

			await expect(getFolderReleases(0)).rejects.toThrow(
				'Discogs username required.'
			)
			expect(mockInvoke).not.toHaveBeenCalled()
		})

		it('rejects malformed folder release responses', async () => {
			mockInvoke.mockResolvedValue({
				data: { releases: [] },
				error: null
			})

			const { getFolderReleases } = useDiscogsApi()

			await expect(getFolderReleases(0)).rejects.toThrow(
				'Discogs returned an invalid folder releases response.'
			)
		})
	})

	describe('getRelease', () => {
		it('invokes dispatcher with release id', async () => {
			const mockRelease = createMockDiscogsReleaseFull({
				id: 12345,
				title: 'Test Album'
			})
			mockInvoke.mockResolvedValue({
				data: mockRelease,
				error: null
			})

			const { getRelease } = useDiscogsApi()
			const result = await getRelease(12345)

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: JSON.stringify({ endpoint: 'release', release_id: 12345 })
			})
			expect(result).toEqual(mockRelease)
		})

		it('does not require discogs username', async () => {
			mockUserStore.profile = { discogs_username: null }
			const mockRelease = createMockDiscogsReleaseFull({ id: 12345 })
			mockInvoke.mockResolvedValue({
				data: mockRelease,
				error: null
			})

			const { getRelease } = useDiscogsApi()
			const result = await getRelease(12345)

			expect(result).toEqual(mockRelease)
		})

		it('rejects malformed release responses', async () => {
			mockInvoke.mockResolvedValue({
				data: { id: 12345, title: 'Incomplete release' },
				error: null
			})

			const { getRelease } = useDiscogsApi()

			await expect(getRelease(12345)).rejects.toThrow(
				'Discogs returned an invalid release response.'
			)
		})
	})
})
