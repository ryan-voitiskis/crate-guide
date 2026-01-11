/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { searchBeatportTrack } from './scraper'

// Mock global $fetch that Nuxt auto-imports
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Sample HTML response from Beatport search
const createBeatportSearchHTML = (
	tracks: Array<{
		artist: string
		title: string
		remix?: string
		bpm?: number
		key?: string
		genre?: string
		img?: string
		href?: string
	}>
) => {
	const trackRows = tracks
		.map(
			(track, index) => `
		<div data-testid="tracks-table-row">
			<img src="${track.img || `https://example.com/img${index}.jpg`}" />
			<a href="${track.href || `/track/test-track-${index}/12345`}">
				<div class="Tables-shared-style__ReleaseName-sc-74ae448d-5">
					${track.title}${track.remix ? `<span>${track.remix}</span>` : ''}
				</div>
			</a>
			<div class="ArtistNames-sc-f2e950a1-0">
				<a href="/artist/test/123" title="${track.artist}">${track.artist}</a>
			</div>
			<div class="cell bpm">
				<a href="/genre/house/123" title="${track.genre || 'House'}">${track.genre || 'House'}</a>
				<div>${track.bpm || 128} BPM - ${track.key || 'A Minor'}</div>
			</div>
		</div>
	`
		)
		.join('')

	return `<html><body>${trackRows}</body></html>`
}

describe('searchBeatportTrack', () => {
	beforeEach(() => {
		mockFetch.mockReset()
	})

	it('returns null when $fetch throws', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		mockFetch.mockRejectedValueOnce(new Error('Network error'))

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track'
		})

		expect(result).toBeNull()
		expect(consoleSpy).toHaveBeenCalledWith(
			'Failed to search Beatport:',
			expect.any(Error)
		)
		consoleSpy.mockRestore()
	})

	it('returns null when no matching tracks found', async () => {
		const html = createBeatportSearchHTML([
			{ artist: 'Other Artist', title: 'Other Track', bpm: 128, key: 'C Major' }
		])
		mockFetch.mockResolvedValueOnce(html)

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track'
		})

		expect(result).toBeNull()
	})

	it('returns track data when exact match found', async () => {
		const html = createBeatportSearchHTML([
			{
				artist: 'Test Artist',
				title: 'Test Track',
				bpm: 128,
				key: 'A Minor',
				genre: 'Deep House',
				img: 'https://example.com/cover.jpg',
				href: '/track/test-track/12345'
			}
		])
		mockFetch.mockResolvedValueOnce(html)

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track'
		})

		expect(result).not.toBeNull()
		expect(result?.bpm).toBe(128)
		expect(result?.key).toBe('A Minor')
		expect(result?.genre).toBe('Deep House')
		expect(result?.url).toBe('https://www.beatport.com/track/test-track/12345')
		expect(result?.accessed).toBeDefined()
	})

	it('matches case-insensitively for artist', async () => {
		const html = createBeatportSearchHTML([
			{ artist: 'TEST ARTIST', title: 'Test Track', bpm: 130, key: 'B Minor' }
		])
		mockFetch.mockResolvedValueOnce(html)

		const result = await searchBeatportTrack({
			artist: 'test artist',
			title: 'Test Track'
		})

		expect(result).not.toBeNull()
		expect(result?.bpm).toBe(130)
	})

	it('matches when search title is contained in track title', async () => {
		const html = createBeatportSearchHTML([
			{
				artist: 'Test Artist',
				title: 'Test Track',
				remix: 'DJ Remix',
				bpm: 125,
				key: 'C Minor'
			}
		])
		mockFetch.mockResolvedValueOnce(html)

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track'
		})

		expect(result).not.toBeNull()
	})

	it('matches when track title is contained in search title', async () => {
		const html = createBeatportSearchHTML([
			{ artist: 'Test Artist', title: 'Track', bpm: 126, key: 'D Minor' }
		])
		mockFetch.mockResolvedValueOnce(html)

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track Extended'
		})

		expect(result).not.toBeNull()
	})

	it('returns first matching track from multiple results', async () => {
		const html = createBeatportSearchHTML([
			{ artist: 'Other Artist', title: 'Other Track', bpm: 120, key: 'E Minor' },
			{
				artist: 'Test Artist',
				title: 'Test Track',
				bpm: 128,
				key: 'A Minor',
				href: '/track/first-match/111'
			},
			{
				artist: 'Test Artist',
				title: 'Test Track',
				bpm: 130,
				key: 'B Minor',
				href: '/track/second-match/222'
			}
		])
		mockFetch.mockResolvedValueOnce(html)

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track'
		})

		expect(result?.bpm).toBe(128) // First match
		expect(result?.url).toContain('first-match')
	})

	it('skips "Original Mix" in remix info', async () => {
		const html = createBeatportSearchHTML([
			{
				artist: 'Test Artist',
				title: 'Test Track',
				remix: 'Original Mix',
				bpm: 128,
				key: 'A Minor'
			}
		])
		mockFetch.mockResolvedValueOnce(html)

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track'
		})

		expect(result).not.toBeNull()
	})

	it('encodes search query correctly', async () => {
		mockFetch.mockResolvedValueOnce('<html><body></body></html>')

		await searchBeatportTrack({
			artist: 'Artist & Friends',
			title: 'Track (Remix)'
		})

		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining(
				encodeURIComponent('Artist & Friends Track (Remix)')
			)
		)
	})
})

describe('parseBeatportHTML edge cases', () => {
	beforeEach(() => {
		mockFetch.mockReset()
	})

	it('handles empty HTML', async () => {
		mockFetch.mockResolvedValueOnce('<html><body></body></html>')

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track'
		})

		expect(result).toBeNull()
	})

	it('handles malformed HTML gracefully', async () => {
		mockFetch.mockResolvedValueOnce('<html><body><div>incomplete')

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track'
		})

		expect(result).toBeNull()
	})

	it('handles missing BPM/key element', async () => {
		const html = `
			<html><body>
				<div data-testid="tracks-table-row">
					<a href="/track/test/123">
						<div class="Tables-shared-style__ReleaseName-sc-74ae448d-5">Test Track</div>
					</a>
					<div class="ArtistNames-sc-f2e950a1-0">
						<a href="/artist/test/123" title="Test Artist">Test Artist</a>
					</div>
				</div>
			</body></html>
		`
		mockFetch.mockResolvedValueOnce(html)

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track'
		})

		expect(result).not.toBeNull()
		expect(result?.bpm).toBeNull()
		expect(result?.key).toBe('')
	})

	it('handles floating point BPM', async () => {
		const html = createBeatportSearchHTML([
			{ artist: 'Test Artist', title: 'Test Track', bpm: 127.5, key: 'A Minor' }
		])
		mockFetch.mockResolvedValueOnce(html)

		const result = await searchBeatportTrack({
			artist: 'Test Artist',
			title: 'Test Track'
		})

		expect(result?.bpm).toBe(127.5)
	})
})
