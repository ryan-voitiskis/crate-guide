import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

const { useBeatportScraper } = await import('../useBeatportScraper')

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
		mockFetch.mockResolvedValue({ success: false, error: 'No match' })

		const { searchTracks } = useBeatportScraper()
		await searchTracks({ artist: 'Artist & Friends', title: 'Track (Remix)' })

		const requestUrl = mockFetch.mock.calls[0]?.[0] as string
		expect(requestUrl).toContain('/api/beatport/search?')
		expect(requestUrl).toContain(
			`q=${encodeURIComponent('Artist & Friends Track (Remix)')}`
		)
		expect(requestUrl).toContain(`artist=${encodeURIComponent('Artist & Friends')}`)
		expect(requestUrl).toContain(`title=${encodeURIComponent('Track (Remix)')}`)
	})

	it('returns null when response is not successful', async () => {
		mockFetch.mockResolvedValue({ success: false, error: 'No match' })

		const { searchTracks } = useBeatportScraper()
		const result = await searchTracks({ artist: 'Missing', title: 'Track' })

		expect(result).toBeNull()
	})

	it('returns null when fetch throws', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		mockFetch.mockRejectedValue(new Error('Network error'))

		const { searchTracks } = useBeatportScraper()
		const result = await searchTracks({ artist: 'Test Artist', title: 'Track' })

		expect(result).toBeNull()
		expect(consoleSpy).toHaveBeenCalled()
		consoleSpy.mockRestore()
	})
})
