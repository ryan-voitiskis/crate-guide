import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

const { useBeatportScraper, BeatportScraperError } =
	await import('../useBeatportScraper')

describe('useBeatportScraper', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns track data on successful response', async () => {
		const beatportData = {
			accessed: Date.now(),
			url: 'https://www.beatport.com/track/test/123',
			genre: 'House',
			bpm: 128,
			key: 'A Minor',
			img: 'https://example.com/image.jpg'
		}
		mockFetch.mockResolvedValue({
			success: true,
			data: beatportData
		})

		const { searchTracks } = useBeatportScraper()
		const result = await searchTracks({ artist: 'Test Artist', title: 'Track' })

		expect(result).toEqual(beatportData)
	})

	it('passes encoded query and match params to endpoint', async () => {
		mockFetch.mockResolvedValue({
			success: false,
			error: 'No matching track found'
		})

		const { searchTracks } = useBeatportScraper()
		await searchTracks({ artist: 'Artist & Friends', title: 'Track (Remix)' })

		const requestUrl = mockFetch.mock.calls[0]?.[0] as string
		expect(requestUrl).toContain('/api/beatport/search?')
		expect(requestUrl).toContain(
			`q=${encodeURIComponent('Artist & Friends Track (Remix)')}`
		)
		expect(requestUrl).toContain(
			`artist=${encodeURIComponent('Artist & Friends')}`
		)
		expect(requestUrl).toContain(`title=${encodeURIComponent('Track (Remix)')}`)
	})

	it('returns null only for explicit no-match payload', async () => {
		mockFetch.mockResolvedValue({
			success: false,
			error: 'No matching track found'
		})

		const { searchTracks } = useBeatportScraper()
		const result = await searchTracks({ artist: 'Missing', title: 'Track' })

		expect(result).toBeNull()
	})

	it('throws typed error for unsuccessful non no-match payload', async () => {
		mockFetch.mockResolvedValue({ success: false, error: 'Too many requests' })

		const { searchTracks } = useBeatportScraper()
		await expect(
			searchTracks({ artist: 'Test Artist', title: 'Track' })
		).rejects.toMatchObject({
			name: 'BeatportScraperError',
			type: 'api'
		})
	})

	it('throws typed transport error when fetch throws without status', async () => {
		mockFetch.mockRejectedValue(new Error('Network error'))

		const { searchTracks } = useBeatportScraper()
		await expect(
			searchTracks({ artist: 'Test Artist', title: 'Track' })
		).rejects.toBeInstanceOf(BeatportScraperError)
		await expect(
			searchTracks({ artist: 'Test Artist', title: 'Track' })
		).rejects.toMatchObject({
			type: 'transport',
			statusCode: null
		})
	})

	it('throws typed api error when fetch throws with status', async () => {
		mockFetch.mockRejectedValue({
			statusCode: 429,
			message: 'Too many requests'
		})

		const { searchTracks } = useBeatportScraper()
		await expect(
			searchTracks({ artist: 'Test Artist', title: 'Track' })
		).rejects.toMatchObject({
			type: 'api',
			statusCode: 429
		})
	})
})
