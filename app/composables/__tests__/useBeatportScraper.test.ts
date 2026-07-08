import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	BEATPORT_SCRAPING_DISABLED_MESSAGE,
	BEATPORT_SCRAPING_DISABLED_STATUS
} from '../../../shared/types/beatport'

const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

const { useBeatportScraper, BeatportScraperError } =
	await import('../useBeatportScraper')

describe('useBeatportScraper', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('fails with the disabled message without calling the Beatport endpoint', async () => {
		const { searchTracks } = useBeatportScraper()

		await expect(
			searchTracks({ artist: 'Test Artist', title: 'Track' })
		).rejects.toMatchObject({
			name: 'BeatportScraperError',
			message: BEATPORT_SCRAPING_DISABLED_MESSAGE,
			type: 'api',
			statusCode: BEATPORT_SCRAPING_DISABLED_STATUS
		})
		await expect(
			searchTracks({ artist: 'Test Artist', title: 'Track' })
		).rejects.toBeInstanceOf(BeatportScraperError)
		expect(mockFetch).not.toHaveBeenCalled()
	})
})
