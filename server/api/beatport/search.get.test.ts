import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the event handler utilities before importing the handler
const mockGetQuery = vi.fn()
const mockCreateError = vi.fn(
	(options: { statusCode: number; statusMessage: string }) => {
		const error = new Error(options.statusMessage) as Error & {
			statusCode: number
		}
		error.statusCode = options.statusCode
		return error
	}
)

vi.stubGlobal('getQuery', mockGetQuery)
vi.stubGlobal('createError', mockCreateError)

const mockServerSupabaseUser = vi.fn()
vi.stubGlobal('serverSupabaseUser', mockServerSupabaseUser)

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock defineEventHandler to return the handler function directly
type MockEventHandler = (event: unknown) => unknown | Promise<unknown>
vi.stubGlobal(
	'defineEventHandler',
	<T extends MockEventHandler>(handler: T): T => handler
)

// Import the handler after mocks are set up
// We need to dynamically import to ensure mocks are in place
let handler: (event: unknown) => Promise<unknown>

describe('beatport/search API', () => {
	beforeEach(async () => {
		vi.resetModules()
		mockGetQuery.mockReset()
		mockCreateError.mockClear()
		mockFetch.mockReset()
		mockServerSupabaseUser.mockReset()
		mockServerSupabaseUser.mockResolvedValue({ id: 'user-123' })

		// Re-import handler to get fresh module with mocks
		const module = await import('./search.get')
		handler = module.default
	})

	describe('authentication', () => {
		it('returns 401 when user is not authenticated', async () => {
			mockServerSupabaseUser.mockResolvedValueOnce(null)

			await expect(handler({})).rejects.toMatchObject({
				statusCode: 401,
				message: 'Authentication required'
			})

			expect(mockFetch).not.toHaveBeenCalled()
		})
	})

	describe('query parameter validation', () => {
		it('returns 400 when query parameter "q" is missing', async () => {
			mockGetQuery.mockReturnValue({
				artist: 'Test Artist',
				title: 'Test Track'
			})

			await expect(handler({})).rejects.toMatchObject({
				statusCode: 400,
				message: 'Query parameter "q" is required'
			})
		})

		it('returns 400 when artist parameter is missing', async () => {
			mockGetQuery.mockReturnValue({ q: 'search term', title: 'Test Track' })

			await expect(handler({})).rejects.toMatchObject({
				statusCode: 400,
				message: 'Artist and title parameters are required for matching'
			})
		})

		it('returns 400 when title parameter is missing', async () => {
			mockGetQuery.mockReturnValue({ q: 'search term', artist: 'Test Artist' })

			await expect(handler({})).rejects.toMatchObject({
				statusCode: 400,
				message: 'Artist and title parameters are required for matching'
			})
		})
	})

	describe('__NEXT_DATA__ parsing', () => {
		const createBeatportResponse = (tracks: unknown[]) => {
			const nextData = {
				props: {
					pageProps: {
						dehydratedState: {
							queries: [
								{
									state: {
										data: {
											data: tracks
										}
									}
								}
							]
						}
					}
				}
			}
			return `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></head><body></body></html>`
		}

		it('parses __NEXT_DATA__ and returns matching track data', async () => {
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})

			const mockTrack = {
				track_id: 12345,
				track_name: 'Test Track',
				artists: [
					{
						artist_id: 1,
						artist_name: 'Test Artist',
						artist_type_name: 'Artist'
					}
				],
				bpm: 128,
				key_name: 'Am',
				genre: [{ genre_id: 1, genre_name: 'Deep House' }],
				release: {
					release_id: 999,
					release_name: 'Test EP',
					release_image_uri: 'https://example.com/release.jpg',
					release_image_dynamic_uri: 'https://example.com/release-dynamic.jpg'
				},
				track_image_uri: 'https://example.com/track.jpg'
			}

			const html = createBeatportResponse([mockTrack])
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			})

			const result = await handler({})

			expect(result).toMatchObject({
				success: true,
				data: {
					bpm: 128,
					key: 'Am',
					genre: 'Deep House',
					img: 'https://example.com/track.jpg'
				}
			})
			expect((result as { data: { url: string } }).data.url).toContain(
				'beatport.com/track'
			)
			expect(
				(result as { data: { accessed: number } }).data.accessed
			).toBeDefined()
		})

		it('returns success: false when no matching track found', async () => {
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})

			const mockTrack = {
				track_id: 12345,
				track_name: 'Different Track',
				artists: [
					{
						artist_id: 1,
						artist_name: 'Different Artist',
						artist_type_name: 'Artist'
					}
				],
				bpm: 130,
				key_name: 'Bm',
				genre: [{ genre_id: 1, genre_name: 'Tech House' }],
				release: {
					release_id: 888,
					release_name: 'Other EP',
					release_image_uri: 'https://example.com/other.jpg',
					release_image_dynamic_uri: 'https://example.com/other-dynamic.jpg'
				}
			}

			const html = createBeatportResponse([mockTrack])
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			})

			const result = await handler({})

			expect(result).toMatchObject({
				success: false,
				error: 'No matching track found'
			})
		})

		it('returns success: false when __NEXT_DATA__ is missing', async () => {
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})

			const html = '<html><head></head><body>No next data here</body></html>'
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			})

			const result = await handler({})

			expect(result).toMatchObject({
				success: false,
				error: 'No matching track found'
			})
		})

		it('returns success: false when __NEXT_DATA__ contains invalid JSON', async () => {
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})

			const html =
				'<html><head><script id="__NEXT_DATA__" type="application/json">{invalid json}</script></head><body></body></html>'
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			})

			const result = await handler({})

			expect(result).toMatchObject({
				success: false,
				error: 'No matching track found'
			})
		})

		it('uses release image when track image is not available', async () => {
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})

			const mockTrack = {
				track_id: 12345,
				track_name: 'Test Track',
				artists: [
					{
						artist_id: 1,
						artist_name: 'Test Artist',
						artist_type_name: 'Artist'
					}
				],
				bpm: 125,
				key_name: 'Cm',
				genre: [{ genre_id: 1, genre_name: 'House' }],
				release: {
					release_id: 999,
					release_name: 'Test EP',
					release_image_uri: 'https://example.com/release.jpg',
					release_image_dynamic_uri: 'https://example.com/release-dynamic.jpg'
				}
				// No track_image_uri
			}

			const html = createBeatportResponse([mockTrack])
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(html)
			})

			const result = await handler({})

			expect(result).toMatchObject({
				success: true,
				data: {
					img: 'https://example.com/release.jpg'
				}
			})
		})
	})

	describe('error handling', () => {
		it('throws 429 error when requests are throttled', async () => {
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})

			mockFetch.mockResolvedValue({
				ok: true,
				text: () => Promise.resolve('<html><body></body></html>')
			})

			await handler({})

			await expect(handler({})).rejects.toMatchObject({
				statusCode: 429,
				message: 'Too many requests'
			})

			expect(mockFetch).toHaveBeenCalledTimes(1)
		})

		it('throttles by shared IP even across different users', async () => {
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})
			mockServerSupabaseUser
				.mockResolvedValueOnce({ id: 'user-1' })
				.mockResolvedValueOnce({ id: 'user-2' })

			mockFetch.mockResolvedValue({
				ok: true,
				text: () => Promise.resolve('<html><body></body></html>')
			})

			const event = {
				node: {
					req: {
						headers: { 'x-forwarded-for': '203.0.113.5' },
						socket: { remoteAddress: '203.0.113.5' }
					}
				}
			}

			await handler(event)

			await expect(handler(event)).rejects.toMatchObject({
				statusCode: 429,
				message: 'Too many requests'
			})

			expect(mockFetch).toHaveBeenCalledTimes(1)
		})

		it('throws 504 error when Beatport request times out', async () => {
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})

			vi.useFakeTimers()

			mockFetch.mockImplementationOnce(
				(_url: string, options?: { signal?: AbortSignal }) =>
					new Promise((_resolve, reject) => {
						options?.signal?.addEventListener('abort', () => {
							const abortError = new Error('This operation was aborted')
							abortError.name = 'AbortError'
							reject(abortError)
						})
					})
			)

			try {
				const request = handler({})
				const timeoutExpectation = expect(request).rejects.toMatchObject({
					statusCode: 504,
					message: 'Beatport request timed out'
				})
				await vi.advanceTimersByTimeAsync(10_000)
				await timeoutExpectation
			} finally {
				vi.useRealTimers()
			}
		})

		it('throws 500 error when Beatport returns rate limit (429)', async () => {
			// Note: The endpoint's catch block converts all fetch-related errors to 500
			// A future improvement could preserve the original status code
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 429
			})

			await expect(handler({})).rejects.toMatchObject({
				statusCode: 500,
				message: 'Failed to fetch from Beatport'
			})
		})

		it('throws 500 error when fetch fails', async () => {
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})

			mockFetch.mockRejectedValueOnce(new Error('Network error'))

			await expect(handler({})).rejects.toMatchObject({
				statusCode: 500,
				message: 'Failed to fetch from Beatport'
			})
		})

		it('throws 500 error when Beatport returns 503', async () => {
			// Note: The endpoint's catch block converts all fetch-related errors to 500
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Test Track',
				artist: 'Test Artist',
				title: 'Test Track'
			})

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 503
			})

			await expect(handler({})).rejects.toMatchObject({
				statusCode: 500,
				message: 'Failed to fetch from Beatport'
			})
		})
	})

	describe('track matching', () => {
		const createBeatportResponse = (tracks: unknown[]) => {
			const nextData = {
				props: {
					pageProps: {
						dehydratedState: {
							queries: [
								{
									state: {
										data: {
											data: tracks
										}
									}
								}
							]
						}
					}
				}
			}
			return `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></head><body></body></html>`
		}

		it('matches case-insensitively for artist name', async () => {
			mockGetQuery.mockReturnValue({
				q: 'test artist test track',
				artist: 'TEST ARTIST',
				title: 'Test Track'
			})

			const mockTrack = {
				track_id: 12345,
				track_name: 'Test Track',
				artists: [
					{
						artist_id: 1,
						artist_name: 'test artist',
						artist_type_name: 'Artist'
					}
				],
				bpm: 128,
				key_name: 'Am',
				genre: [],
				release: { release_id: 1, release_name: 'EP', release_image_uri: '' }
			}

			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(createBeatportResponse([mockTrack]))
			})

			const result = await handler({})

			expect(result).toMatchObject({ success: true })
		})

		it('matches when search title is contained in track title', async () => {
			mockGetQuery.mockReturnValue({
				q: 'Test Artist Track',
				artist: 'Test Artist',
				title: 'Track'
			})

			const mockTrack = {
				track_id: 12345,
				track_name: 'Track (Extended Remix)',
				artists: [
					{
						artist_id: 1,
						artist_name: 'Test Artist',
						artist_type_name: 'Artist'
					}
				],
				bpm: 130,
				key_name: 'Bm',
				genre: [],
				release: { release_id: 1, release_name: 'EP', release_image_uri: '' }
			}

			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(createBeatportResponse([mockTrack]))
			})

			const result = await handler({})

			expect(result).toMatchObject({ success: true })
		})
	})
})
