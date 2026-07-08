import { toast } from 'vue-sonner'
import { createPinia, setActivePinia } from 'pinia'
import {
	createMockTrack,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	BEATPORT_SCRAPING_DISABLED_MESSAGE,
	type BeatportTrackData
} from '../../../shared/types/beatport'
import { useBeatportStore } from '../beatportStore'

vi.mock('vue-sonner', () => ({
	toast: Object.assign(vi.fn(), {
		error: vi.fn()
	})
}))

const mockTracksStore = {
	tracks: [] as ReturnType<typeof createMockTrack>[],
	getTrackById: vi.fn(),
	updateTrack: vi.fn()
}

const mockBeatportScraper = {
	searchTracks: vi.fn()
}

const mockH = vi.fn(() => ({}))
const mockParseBeatportKey = vi.fn(
	(): { key: number | null; mode: number | null } => ({ key: null, mode: null })
)

vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useBeatportScraper', () => mockBeatportScraper)
vi.stubGlobal('h', mockH)
vi.stubGlobal('parseBeatportKey', mockParseBeatportKey)

function createBeatportTrackData(
	overrides: Partial<BeatportTrackData> = {}
): BeatportTrackData {
	return {
		accessed: Date.now(),
		url: 'https://beatport.com/track/123',
		genre: 'House',
		bpm: 128,
		key: 'Am',
		img: 'https://example.com/track.jpg',
		...overrides
	}
}

describe('beatportStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetTrackIdCounter()
		setActivePinia(createPinia())

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

		it('starts with empty bulk results', () => {
			const store = useBeatportStore()
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

	describe('persisted Beatport data helpers', () => {
		it('detects not-found markers as searched but not found', () => {
			const store = useBeatportStore()
			const notFoundMarker = {
				searched: true,
				notFound: true,
				searchedAt: Date.now()
			}

			expect(store.hasBeenSearched(notFoundMarker)).toBe(true)
			expect(store.hasFoundData(notFoundMarker)).toBe(false)
		})

		it('detects persisted Beatport track data as found', () => {
			const store = useBeatportStore()
			const foundData = createBeatportTrackData()

			expect(store.hasBeenSearched(foundData)).toBe(true)
			expect(store.hasFoundData(foundData)).toBe(true)
		})

		it('ignores empty or malformed Beatport data', () => {
			const store = useBeatportStore()

			expect(store.hasBeenSearched(null)).toBe(false)
			expect(
				store.hasFoundData({ url: 'https://beatport.com/track/123' })
			).toBe(false)
		})
	})

	describe('getBeatportData', () => {
		it('returns the disabled message without looking up or scraping the track', async () => {
			const store = useBeatportStore()

			const result = await store.getBeatportData('track-1')

			expect(result).toBe(false)
			expect(toast.error).toHaveBeenCalledWith(
				BEATPORT_SCRAPING_DISABLED_MESSAGE
			)
			expect(store.isLoadingBeatportData).toBe(false)
			expect(store.loadingTrackId).toBeNull()
			expect(mockTracksStore.getTrackById).not.toHaveBeenCalled()
			expect(mockBeatportScraper.searchTracks).not.toHaveBeenCalled()
			expect(mockTracksStore.updateTrack).not.toHaveBeenCalled()
		})
	})

	describe('bulkFetchBeatportData', () => {
		it('does nothing when no tracks would be processed', async () => {
			const store = useBeatportStore()

			await store.bulkFetchBeatportData()

			expect(store.bulkBeatportResults).toEqual({
				successful: 0,
				failed: [],
				skipped: 0,
				total: 0
			})
			expect(toast.error).not.toHaveBeenCalled()
			expect(mockBeatportScraper.searchTracks).not.toHaveBeenCalled()
		})

		it('marks unsearched tracks as failed with the disabled message', async () => {
			const store = useBeatportStore()
			const track = createMockTrack({ id: 'track-1', beatport_data: null })
			mockTracksStore.tracks = [track]

			await store.bulkFetchBeatportData()

			expect(store.isBulkFetchingBeatportData).toBe(false)
			expect(store.bulkBeatportProgress).toBe(100)
			expect(store.currentProcessingTrack).toBeNull()
			expect(store.bulkBeatportResults).toEqual({
				successful: 0,
				failed: [
					{
						trackId: 'track-1',
						title: track.title,
						error: BEATPORT_SCRAPING_DISABLED_MESSAGE
					}
				],
				skipped: 0,
				total: 1
			})
			expect(store.lastProcessedTrack).toMatchObject({
				trackId: 'track-1',
				success: false,
				error: BEATPORT_SCRAPING_DISABLED_MESSAGE
			})
			expect(toast.error).toHaveBeenCalledWith(
				BEATPORT_SCRAPING_DISABLED_MESSAGE
			)
			expect(mockBeatportScraper.searchTracks).not.toHaveBeenCalled()
			expect(mockTracksStore.updateTrack).not.toHaveBeenCalled()
		})

		it('keeps default searched-track filtering while disabled', async () => {
			const store = useBeatportStore()
			const searchedTrack = createMockTrack({
				id: 'searched',
				beatport_data: createBeatportTrackData()
			})
			const unsearchedTrack = createMockTrack({
				id: 'unsearched',
				beatport_data: null
			})
			mockTracksStore.tracks = [searchedTrack, unsearchedTrack]

			await store.bulkFetchBeatportData()

			expect(store.bulkBeatportResults.failed).toEqual([
				{
					trackId: 'unsearched',
					title: unsearchedTrack.title,
					error: BEATPORT_SCRAPING_DISABLED_MESSAGE
				}
			])

			await store.bulkFetchBeatportData(true)

			expect(store.bulkBeatportResults.failed).toHaveLength(2)
			expect(
				store.bulkBeatportResults.failed.map((track) => track.trackId)
			).toEqual(['searched', 'unsearched'])
		})
	})

	describe('cancelBulkBeatportFetch', () => {
		it('sets the cancellation flag without changing visible state', () => {
			const store = useBeatportStore()

			store.cancelBulkBeatportFetch()

			expect(store.isBulkFetchingBeatportData).toBe(false)
			expect(store.bulkBeatportProgress).toBe(0)
		})
	})

	describe('resetBulkState', () => {
		it('resets all bulk operation state', () => {
			const store = useBeatportStore()
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
