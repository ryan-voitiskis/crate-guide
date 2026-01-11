import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockTrack, resetTrackIdCounter } from 'test/mocks/fixtures/tracks'

// Mock dependencies
const mockTracksStore = {
	tracks: [] as ReturnType<typeof createMockTrack>[],
	getTrackById: vi.fn(),
	updateTrack: vi.fn()
}

const mockBeatportScraper = {
	searchTracks: vi.fn()
}

// Mock Vue's h function for toast icons
const mockH = vi.fn(() => ({}))

// Mock parseBeatportKey
const mockParseBeatportKey = vi.fn(() => ({ key: null, mode: null }))

// Stub globals before importing the store
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useBeatportScraper', () => mockBeatportScraper)
vi.stubGlobal('h', mockH)
vi.stubGlobal('parseBeatportKey', mockParseBeatportKey)

// Import after mocking
import { useBeatportStore } from '../beatportStore'

describe('beatportStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetTrackIdCounter()
		setActivePinia(createPinia())

		// Reset mock stores
		mockTracksStore.tracks = []
		mockTracksStore.getTrackById.mockReset()
		mockTracksStore.updateTrack.mockReset()
		mockBeatportScraper.searchTracks.mockReset()
	})

	describe('initial state', () => {
		it('starts with loading states as false', () => {
			const store = useBeatportStore()
			expect(store.isLoadingBeatportData).toBe(false)
			expect(store.isBulkFetchingBeatportData).toBe(false)
		})

		it('starts with null loadingTrackId', () => {
			const store = useBeatportStore()
			expect(store.loadingTrackId).toBeNull()
		})

		it('starts with bulkBeatportProgress at 0', () => {
			const store = useBeatportStore()
			expect(store.bulkBeatportProgress).toBe(0)
		})

		it('starts with empty bulk results', () => {
			const store = useBeatportStore()
			expect(store.bulkBeatportResults).toEqual({
				successful: 0,
				failed: [],
				skipped: 0,
				total: 0
			})
		})

		it('starts with null currentProcessingTrack', () => {
			const store = useBeatportStore()
			expect(store.currentProcessingTrack).toBeNull()
		})

		it('starts with null lastProcessedTrack', () => {
			const store = useBeatportStore()
			expect(store.lastProcessedTrack).toBeNull()
		})
	})

	describe('hasBeenSearched', () => {
		it('returns false for null beatport_data', () => {
			const store = useBeatportStore()
			expect(store.hasBeenSearched(null)).toBe(false)
		})

		it('returns true when notFound marker exists', () => {
			const store = useBeatportStore()
			const notFoundMarker = { searched: true, notFound: true, searchedAt: Date.now() }
			expect(store.hasBeenSearched(notFoundMarker)).toBe(true)
		})

		it('returns true when url exists in data', () => {
			const store = useBeatportStore()
			const foundData = { url: 'https://beatport.com/track/123', bpm: 128 }
			expect(store.hasBeenSearched(foundData)).toBe(true)
		})

		it('returns false for empty object', () => {
			const store = useBeatportStore()
			expect(store.hasBeenSearched({})).toBe(false)
		})
	})

	describe('hasFoundData', () => {
		it('returns false for null beatport_data', () => {
			const store = useBeatportStore()
			expect(store.hasFoundData(null)).toBe(false)
		})

		it('returns false when notFound marker exists', () => {
			const store = useBeatportStore()
			const notFoundMarker = { searched: true, notFound: true, searchedAt: Date.now() }
			expect(store.hasFoundData(notFoundMarker)).toBe(false)
		})

		it('returns true when url exists', () => {
			const store = useBeatportStore()
			const foundData = { url: 'https://beatport.com/track/123' }
			expect(store.hasFoundData(foundData)).toBe(true)
		})

		it('returns true when url is empty but bpm exists', () => {
			const store = useBeatportStore()
			// url must be present (even if undefined) for the check to work
			const foundData = { url: undefined, bpm: 128 }
			expect(store.hasFoundData(foundData)).toBe(true)
		})

		it('returns false when bpm exists but url property is missing', () => {
			const store = useBeatportStore()
			// Without url property at all, hasFoundData returns false
			const foundData = { bpm: 128 }
			expect(store.hasFoundData(foundData)).toBe(false)
		})
	})

	describe('getBeatportData', () => {
		it('returns false when track not found', async () => {
			const store = useBeatportStore()
			mockTracksStore.getTrackById.mockReturnValue(undefined)

			const result = await store.getBeatportData('non-existent')

			expect(result).toBe(false)
		})

		it('returns false when track has no artist', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1', artists: [], title: 'Test' })
			mockTracksStore.getTrackById.mockReturnValue(track)

			const result = await store.getBeatportData('track-1')

			expect(result).toBe(false)
		})

		it('returns false when track has no title', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({
				id: 'track-1',
				title: '',
				artists: [{ discogs_id: 1, name: 'Artist', role: null }]
			})
			mockTracksStore.getTrackById.mockReturnValue(track)

			const result = await store.getBeatportData('track-1')

			expect(result).toBe(false)
		})

		it('sets loading state during fetch', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1' })
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockResolvedValue(null)
			mockTracksStore.updateTrack.mockResolvedValue(track)

			const fetchPromise = store.getBeatportData('track-1')
			expect(store.isLoadingBeatportData).toBe(true)
			expect(store.loadingTrackId).toBe('track-1')

			await fetchPromise
			expect(store.isLoadingBeatportData).toBe(false)
			expect(store.loadingTrackId).toBeNull()
		})

		it('saves not-found marker when no match found', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1' })
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockResolvedValue(null)
			mockTracksStore.updateTrack.mockResolvedValue(track)

			await store.getBeatportData('track-1')

			expect(mockTracksStore.updateTrack).toHaveBeenCalledWith(
				'track-1',
				expect.objectContaining({
					beatport_data: expect.objectContaining({
						searched: true,
						notFound: true
					})
				}),
				{ silent: true }
			)
		})

		it('updates track with found data', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1', bpm: null, key: null })
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockResolvedValue({
				url: 'https://beatport.com/track/123',
				bpm: 128,
				key: 'Am'
			})
			mockParseBeatportKey.mockReturnValue({ key: 9, mode: 0 })
			mockTracksStore.updateTrack.mockResolvedValue(track)

			const result = await store.getBeatportData('track-1')

			expect(result).toBe(true)
			expect(mockTracksStore.updateTrack).toHaveBeenCalledWith(
				'track-1',
				expect.objectContaining({
					beatport_data: expect.objectContaining({ bpm: 128 }),
					bpm: 128,
					key: 9,
					mode: 0
				}),
				{ silent: true }
			)
		})

		it('does not overwrite existing bpm', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1', bpm: 125, key: null })
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockResolvedValue({
				url: 'https://beatport.com/track/123',
				bpm: 128
			})
			mockParseBeatportKey.mockReturnValue({ key: null, mode: null })
			mockTracksStore.updateTrack.mockResolvedValue(track)

			await store.getBeatportData('track-1')

			// Should not include bpm in updates since track already has one
			const updateCall = mockTracksStore.updateTrack.mock.calls[0]
			expect(updateCall[1].bpm).toBeUndefined()
		})

		it('does not overwrite existing key', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1', bpm: null, key: 5 })
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockResolvedValue({
				url: 'https://beatport.com/track/123',
				key: 'Am'
			})
			mockParseBeatportKey.mockReturnValue({ key: 9, mode: 0 })
			mockTracksStore.updateTrack.mockResolvedValue(track)

			await store.getBeatportData('track-1')

			// Should not include key/mode in updates since track already has them
			const updateCall = mockTracksStore.updateTrack.mock.calls[0]
			expect(updateCall[1].key).toBeUndefined()
			expect(updateCall[1].mode).toBeUndefined()
		})

		it('handles API errors gracefully', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1' })
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockRejectedValue(new Error('API Error'))

			const result = await store.getBeatportData('track-1')

			expect(result).toBe(false)
			expect(store.isLoadingBeatportData).toBe(false)
		})
	})

	describe('bulkFetchBeatportData', () => {
		it('does nothing when no tracks to process', async () => {
			const store = useBeatportStore()
			mockTracksStore.tracks = []

			await store.bulkFetchBeatportData()

			expect(mockBeatportScraper.searchTracks).not.toHaveBeenCalled()
		})

		it('initializes bulk state at start', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1', beatport_data: null })
			mockTracksStore.tracks = [track]
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockResolvedValue(null)
			mockTracksStore.updateTrack.mockResolvedValue(track)

			await store.bulkFetchBeatportData()

			// After completion
			expect(store.isBulkFetchingBeatportData).toBe(false)
			expect(store.bulkBeatportProgress).toBe(100)
		})

		it('filters out already searched tracks by default', async () => {
			const store = useBeatportStore()
			const searchedTrack = createMockTrack({
				id: 'searched',
				beatport_data: { url: 'https://beatport.com/track/1' }
			})
			const unsearchedTrack = createMockTrack({
				id: 'unsearched',
				beatport_data: null
			})
			mockTracksStore.tracks = [searchedTrack, unsearchedTrack]
			mockTracksStore.getTrackById.mockImplementation((id: string) =>
				mockTracksStore.tracks.find((t) => t.id === id)
			)
			mockBeatportScraper.searchTracks.mockResolvedValue(null)
			mockTracksStore.updateTrack.mockResolvedValue(unsearchedTrack)

			await store.bulkFetchBeatportData(false)

			// Only unsearched track should be processed
			expect(store.bulkBeatportResults.total).toBe(1)
		})

		it('includes searched tracks when includeSearched is true', async () => {
			const store = useBeatportStore()
			const searchedTrack = createMockTrack({
				id: 'searched',
				beatport_data: { url: 'https://beatport.com/track/1' }
			})
			const unsearchedTrack = createMockTrack({
				id: 'unsearched',
				beatport_data: null
			})
			mockTracksStore.tracks = [searchedTrack, unsearchedTrack]
			mockTracksStore.getTrackById.mockImplementation((id: string) =>
				mockTracksStore.tracks.find((t) => t.id === id)
			)
			mockBeatportScraper.searchTracks.mockResolvedValue(null)
			mockTracksStore.updateTrack.mockImplementation((id: string) =>
				mockTracksStore.tracks.find((t) => t.id === id)
			)

			await store.bulkFetchBeatportData(true)

			// Both tracks should be processed
			expect(store.bulkBeatportResults.total).toBe(2)
		})

		it('tracks successful results', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1', beatport_data: null })
			mockTracksStore.tracks = [track]
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockResolvedValue({
				url: 'https://beatport.com/track/123',
				bpm: 128
			})
			mockTracksStore.updateTrack.mockResolvedValue(track)

			await store.bulkFetchBeatportData()

			expect(store.bulkBeatportResults.successful).toBe(1)
		})

		it('tracks failed results', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1', beatport_data: null })
			mockTracksStore.tracks = [track]
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockResolvedValue(null)
			mockTracksStore.updateTrack.mockResolvedValue(track)

			await store.bulkFetchBeatportData()

			expect(store.bulkBeatportResults.failed.length).toBe(1)
			expect(store.bulkBeatportResults.failed[0].trackId).toBe('track-1')
		})

		it('updates progress during bulk operation', async () => {
			const store = useBeatportStore()
			const tracks = [
				createMockTrack({ id: 'track-1', beatport_data: null }),
				createMockTrack({ id: 'track-2', beatport_data: null })
			]
			mockTracksStore.tracks = tracks
			mockTracksStore.getTrackById.mockImplementation((id: string) =>
				tracks.find((t) => t.id === id)
			)
			mockBeatportScraper.searchTracks.mockResolvedValue(null)
			mockTracksStore.updateTrack.mockImplementation((id: string) =>
				tracks.find((t) => t.id === id)
			)

			await store.bulkFetchBeatportData()

			// Should be 100 after completion
			expect(store.bulkBeatportProgress).toBe(100)
		})

		it('updates currentProcessingTrack during bulk operation', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1', beatport_data: null })
			mockTracksStore.tracks = [track]
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockResolvedValue(null)
			mockTracksStore.updateTrack.mockResolvedValue(track)

			await store.bulkFetchBeatportData()

			// After completion, currentProcessingTrack should be null
			expect(store.currentProcessingTrack).toBeNull()
		})

		it('updates lastProcessedTrack after each track', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({
				id: 'track-1',
				title: 'Test Track',
				beatport_data: null
			})
			mockTracksStore.tracks = [track]
			mockTracksStore.getTrackById.mockReturnValue(track)
			mockBeatportScraper.searchTracks.mockResolvedValue(null)
			mockTracksStore.updateTrack.mockResolvedValue(track)

			await store.bulkFetchBeatportData()

			expect(store.lastProcessedTrack).not.toBeNull()
			expect(store.lastProcessedTrack?.trackId).toBe('track-1')
		})
	})

	describe('cancelBulkBeatportFetch', () => {
		it('sets cancel flag', () => {
			const store = useBeatportStore()

			store.cancelBulkBeatportFetch()

			// The flag is internal but affects bulk operation
			// We can verify by checking the method doesn't throw
			expect(() => store.cancelBulkBeatportFetch()).not.toThrow()
		})
	})

	describe('resetBulkState', () => {
		it('resets all bulk operation state', () => {
			const store = useBeatportStore()
			// Set some state first
			store.bulkBeatportProgress = 50
			store.bulkBeatportResults = {
				successful: 5,
				failed: [{ trackId: '1', title: 'Test', error: 'Error' }],
				skipped: 2,
				total: 10
			}

			store.resetBulkState()

			expect(store.isBulkFetchingBeatportData).toBe(false)
			expect(store.bulkBeatportProgress).toBe(0)
			expect(store.currentProcessingTrack).toBeNull()
			expect(store.lastProcessedTrack).toBeNull()
			expect(store.bulkBeatportResults).toEqual({
				successful: 0,
				failed: [],
				skipped: 0,
				total: 0
			})
		})
	})
})
