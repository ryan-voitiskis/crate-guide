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

	describe('makeDiscogsApiRequest', () => {
		it('invokes supabase function with correct params', async () => {
			mockInvoke.mockResolvedValue({ data: { test: true }, error: null })

			const { makeDiscogsApiRequest } = useDiscogsApi()
			await makeDiscogsApiRequest('GET', 'https://api.discogs.com/test')

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: JSON.stringify({
					httpMethod: 'GET',
					url: 'https://api.discogs.com/test'
				})
			})
		})

		it('includes additional params in request body', async () => {
			mockInvoke.mockResolvedValue({ data: {}, error: null })

			const { makeDiscogsApiRequest } = useDiscogsApi()
			await makeDiscogsApiRequest('GET', 'https://api.discogs.com/test', {
				page: 1,
				per_page: 50
			})

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: JSON.stringify({
					httpMethod: 'GET',
					url: 'https://api.discogs.com/test',
					page: 1,
					per_page: 50
				})
			})
		})

		it('returns data on success', async () => {
			const expectedData = { releases: [], pagination: {} }
			mockInvoke.mockResolvedValue({ data: expectedData, error: null })

			const { makeDiscogsApiRequest } = useDiscogsApi()
			const result = await makeDiscogsApiRequest(
				'GET',
				'https://api.discogs.com/test'
			)

			expect(result).toEqual(expectedData)
		})

		it('throws error with message when request fails', async () => {
			mockInvoke.mockResolvedValue({
				data: null,
				error: { message: 'Rate limit exceeded' }
			})

			const { makeDiscogsApiRequest } = useDiscogsApi()

			await expect(
				makeDiscogsApiRequest('GET', 'https://api.discogs.com/test')
			).rejects.toThrow('Rate limit exceeded')
		})

		it('throws error with toString when no message', async () => {
			mockInvoke.mockResolvedValue({
				data: null,
				error: { toString: () => 'Network error' }
			})

			const { makeDiscogsApiRequest } = useDiscogsApi()

			await expect(
				makeDiscogsApiRequest('GET', 'https://api.discogs.com/test')
			).rejects.toThrow('Network error')
		})

		it('throws object string when no error message available', async () => {
			// When error is an empty object, toString() returns '[object Object]'
			mockInvoke.mockResolvedValue({
				data: null,
				error: {}
			})

			const { makeDiscogsApiRequest } = useDiscogsApi()

			await expect(
				makeDiscogsApiRequest('GET', 'https://api.discogs.com/test')
			).rejects.toThrow('[object Object]')
		})
	})

	describe('getFolders', () => {
		it('calls correct endpoint with username', async () => {
			mockInvoke.mockResolvedValue({
				data: { folders: [] },
				error: null
			})

			const { getFolders } = useDiscogsApi()
			await getFolders()

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: JSON.stringify({
					httpMethod: 'GET',
					url: 'https://api.discogs.com/users/testuser/collection/folders'
				})
			})
		})

		it('throws error when no discogs username', async () => {
			mockUserStore.profile = { discogs_username: null }

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toThrow('Discogs username required.')
		})

		it('throws error when profile is null', async () => {
			mockUserStore.profile = null

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toThrow('Discogs username required.')
		})
	})

	describe('getFolderReleases', () => {
		it('calls correct endpoint with folder ID and default pagination', async () => {
			mockInvoke.mockResolvedValue({
				data: { releases: [] },
				error: null
			})

			const { getFolderReleases } = useDiscogsApi()
			await getFolderReleases(0)

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: JSON.stringify({
					httpMethod: 'GET',
					url: 'https://api.discogs.com/users/testuser/collection/folders/0/releases',
					page: 1,
					per_page: 100
				})
			})
		})

		it('includes custom pagination params', async () => {
			mockInvoke.mockResolvedValue({
				data: { releases: [] },
				error: null
			})

			const { getFolderReleases } = useDiscogsApi()
			await getFolderReleases(1, 3, 50)

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: JSON.stringify({
					httpMethod: 'GET',
					url: 'https://api.discogs.com/users/testuser/collection/folders/1/releases',
					page: 3,
					per_page: 50
				})
			})
		})

		it('throws error when no discogs username', async () => {
			mockUserStore.profile = { discogs_username: '' }

			const { getFolderReleases } = useDiscogsApi()

			await expect(getFolderReleases(0)).rejects.toThrow(
				'Discogs username required.'
			)
		})
	})

	describe('getRelease', () => {
		it('calls correct endpoint with release ID', async () => {
			const mockRelease = { id: 12345, title: 'Test Album' }
			mockInvoke.mockResolvedValue({
				data: mockRelease,
				error: null
			})

			const { getRelease } = useDiscogsApi()
			const result = await getRelease(12345)

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: JSON.stringify({
					httpMethod: 'GET',
					url: 'https://api.discogs.com/releases/12345'
				})
			})
			expect(result).toEqual(mockRelease)
		})

		it('does not require discogs username', async () => {
			mockUserStore.profile = { discogs_username: null }
			mockInvoke.mockResolvedValue({
				data: { id: 12345 },
				error: null
			})

			const { getRelease } = useDiscogsApi()
			const result = await getRelease(12345)

			expect(result).toEqual({ id: 12345 })
		})
	})
})
