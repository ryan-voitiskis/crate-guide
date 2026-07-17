import {
	createMockDiscogsRelease,
	createMockDiscogsReleaseFull
} from 'test/mocks/fixtures/discogs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscogsApiError } from '../../utils/discogs-errors'

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

function expectedInvocation(body: Record<string, unknown>, attempt = 1) {
	return {
		body: {
			...body,
			request_context: {
				request_id: expect.any(String),
				attempt
			}
		},
		timeout: 20_000
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

	describe('getFolders', () => {
		it('invokes dispatcher with the folders endpoint', async () => {
			mockInvoke.mockResolvedValue({
				data: { folders: [] },
				error: null
			})

			const { getFolders } = useDiscogsApi()
			await getFolders()

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				...expectedInvocation({ endpoint: 'folders' })
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

		it('surfaces structured dispatcher errors without losing retry metadata', async () => {
			const requestId = crypto.randomUUID()
			mockInvoke.mockResolvedValue({
				data: null,
				error: { name: 'FunctionsHttpError' },
				response: Response.json(
					{
						error: 'Discogs is receiving too many requests. Retrying shortly.',
						code: 'discogs_rate_limited',
						retryable: true,
						request_id: requestId,
						retry_after_ms: 3000
					},
					{ status: 429 }
				)
			})

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toMatchObject({
				code: 'discogs_rate_limited',
				retryable: true,
				status: 429,
				retryAfterMs: 3000,
				requestId
			})
		})

		it('rejects malformed correlation ids in function error payloads', async () => {
			mockInvoke.mockResolvedValue({
				data: null,
				error: { name: 'FunctionsHttpError' },
				response: Response.json(
					{
						error: 'Spoofed upstream message.',
						code: 'discogs_rate_limited',
						retryable: true,
						request_id: 'not-a-safe-request-id'
					},
					{ status: 429 }
				)
			})

			const { getFolders } = useDiscogsApi()

			await getFolders().catch((error: unknown) => {
				expect(error).toMatchObject({
					message: 'Discogs is receiving too many requests. Retrying shortly.',
					code: 'discogs_rate_limited',
					retryable: true
				})
				expect(error).not.toMatchObject({
					message: 'Spoofed upstream message.',
					requestId: 'not-a-safe-request-id'
				})
			})
		})

		it('does not surface unstructured function error text', async () => {
			mockInvoke.mockResolvedValue({
				data: null,
				error: { message: 'private relay details' }
			})

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toMatchObject({
				message: 'Could not reach Discogs. Check your connection.',
				code: 'discogs_transport',
				retryable: true
			})
		})

		it('sanitizes invoke rejection errors', async () => {
			mockInvoke.mockRejectedValue(new Error('private network details'))

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toMatchObject({
				message: 'Could not reach Discogs. Check your connection.',
				code: 'discogs_transport'
			})
		})

		it('classifies client-side invocation timeouts as retryable', async () => {
			mockInvoke.mockResolvedValue({
				data: null,
				error: {
					name: 'FunctionsFetchError',
					context: { name: 'AbortError' }
				}
			})

			const { getFolders } = useDiscogsApi()

			await expect(getFolders()).rejects.toMatchObject({
				message: 'The Discogs request timed out.',
				code: 'discogs_timeout',
				retryable: true
			})
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

			expect(mockInvoke).toHaveBeenCalledWith(
				'authenticated-discogs-request',
				expectedInvocation({
					endpoint: 'folder_releases',
					folder_id: 0,
					page: 1,
					per_page: 100
				})
			)
		})

		it('invokes dispatcher with custom pagination', async () => {
			mockInvoke.mockResolvedValue({
				data: validFolderReleasesResponse,
				error: null
			})

			const { getFolderReleases } = useDiscogsApi()
			await getFolderReleases(1, 3, 50)

			expect(mockInvoke).toHaveBeenCalledWith(
				'authenticated-discogs-request',
				expectedInvocation({
					endpoint: 'folder_releases',
					folder_id: 1,
					page: 3,
					per_page: 50
				})
			)
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

			expect(mockInvoke).toHaveBeenCalledWith(
				'authenticated-discogs-request',
				expectedInvocation({ endpoint: 'release', release_id: 12345 })
			)
			expect(result).toEqual(mockRelease)
		})

		it('forwards a stable request id and attempt number for retries', async () => {
			const mockRelease = createMockDiscogsReleaseFull({ id: 12345 })
			const requestId = crypto.randomUUID()
			mockInvoke.mockResolvedValue({ data: mockRelease, error: null })

			const { getRelease } = useDiscogsApi()
			await getRelease(12345, { requestId, attempt: 2 })

			expect(mockInvoke).toHaveBeenCalledWith('authenticated-discogs-request', {
				body: {
					endpoint: 'release',
					release_id: 12345,
					request_context: {
						request_id: requestId,
						attempt: 2
					}
				},
				timeout: 20_000
			})
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
			await getRelease(12345).catch((error: unknown) => {
				expect(error).toBeInstanceOf(DiscogsApiError)
				expect(error).toMatchObject({
					code: 'invalid_upstream_response',
					retryable: false
				})
			})
		})
	})
})
