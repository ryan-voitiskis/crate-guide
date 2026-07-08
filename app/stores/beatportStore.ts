import { toast } from 'vue-sonner'
import { Wand } from 'lucide-vue-next'
import {
	BEATPORT_SCRAPING_DISABLED_MESSAGE,
	BEATPORT_SCRAPING_DISABLED_STATUS,
	type BeatportNotFoundMarker,
	type BeatportTrackData
} from '../../shared/types/beatport'

interface BulkTrackResult {
	trackId: string
	title: string
	artist: string
	image: string | null
	success: boolean
	error?: string
	// Beatport metadata (populated on success)
	bpm?: number | null
	key?: string
	genre?: string
}

const BEATPORT_BULK_REQUEST_INTERVAL_MS = 1000
const BEATPORT_NO_MATCH_MESSAGE = 'No matching track found'
const BEATPORT_INVALID_TRACK_MESSAGE =
	'Track needs artist and title to search Beatport'
const BEATPORT_SAVE_NO_MATCH_ERROR = 'Failed to save Beatport search result'
const BEATPORT_SAVE_DATA_ERROR = 'Failed to save Beatport data'
const BEATPORT_FETCH_ERROR = 'Failed to get Beatport data'
const BEATPORT_BLOCKED_ERROR =
	'Beatport is blocking automated requests right now'

type BeatportLookupStatus = 'success' | 'not_found' | 'invalid_input'

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isBeatportNotFoundMarker(
	beatportData: unknown
): beatportData is BeatportNotFoundMarker {
	return (
		isObjectRecord(beatportData) &&
		beatportData.searched === true &&
		beatportData.notFound === true &&
		typeof beatportData.searchedAt === 'number'
	)
}

// Helper to check if track has been searched (found or not found)
function hasBeenSearched(beatportData: unknown): boolean {
	return hasFoundData(beatportData) || isBeatportNotFoundMarker(beatportData)
}

// Helper to check if track was found (has actual data, not just "not found" marker)
function hasFoundData(
	beatportData: unknown
): beatportData is BeatportTrackData {
	if (!isObjectRecord(beatportData) || isBeatportNotFoundMarker(beatportData)) {
		return false
	}

	return (
		typeof beatportData.accessed === 'number' &&
		typeof beatportData.url === 'string' &&
		typeof beatportData.genre === 'string' &&
		(typeof beatportData.bpm === 'number' || beatportData.bpm === null) &&
		typeof beatportData.key === 'string' &&
		typeof beatportData.img === 'string'
	)
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function getBeatportErrorStatus(error: unknown): number | null {
	if (!isObjectRecord(error)) return null

	const statusCode = error.statusCode
	if (typeof statusCode === 'number') return statusCode

	const status = error.status
	if (typeof status === 'number') return status

	return null
}

function getBeatportErrorMessage(error: unknown): string {
	const status = getBeatportErrorStatus(error)
	if (
		status === BEATPORT_SCRAPING_DISABLED_STATUS ||
		(error instanceof Error &&
			error.message === BEATPORT_SCRAPING_DISABLED_MESSAGE)
	) {
		return BEATPORT_SCRAPING_DISABLED_MESSAGE
	}

	return status === 403 || status === 503
		? BEATPORT_BLOCKED_ERROR
		: BEATPORT_FETCH_ERROR
}

function isBeatportScrapingEnabled(): boolean {
	return false
}

async function persistNotFoundMarker(
	tracks: ReturnType<typeof useTracksStore>,
	trackId: string
): Promise<void> {
	const notFoundMarker: BeatportNotFoundMarker = {
		searched: true,
		notFound: true,
		searchedAt: Date.now()
	}

	const result = await tracks.updateTrack(
		trackId,
		{ beatport_data: notFoundMarker },
		{ silent: true }
	)

	if (!result) {
		throw new Error(BEATPORT_SAVE_NO_MATCH_ERROR)
	}
}

export const useBeatportStore = defineStore('beatport', () => {
	const isLoadingBeatportData = ref(false)
	const loadingTrackId = ref<string | null>(null)

	const isBulkFetchingBeatportData = ref(false)
	const bulkBeatportProgress = ref(0)
	const bulkBeatportCancelled = ref(false)
	const currentProcessingTrack = ref<{
		trackId: string
		title: string
		artist: string
	} | null>(null)
	const lastProcessedTrack = ref<BulkTrackResult | null>(null)
	const bulkBeatportResults = ref<{
		successful: number
		failed: Array<{ trackId: string; title: string; error: string }>
		skipped: number
		total: number
	}>({
		successful: 0,
		failed: [],
		skipped: 0,
		total: 0
	})

	async function getBeatportData(trackId: string): Promise<boolean> {
		if (!isBeatportScrapingEnabled()) {
			toast.error(BEATPORT_SCRAPING_DISABLED_MESSAGE)
			return false
		}

		const tracks = useTracksStore()
		const track = tracks.getTrackById(trackId)

		if (!track) {
			toast.error('Track not found')
			return false
		}

		const firstArtist = track.artists?.[0]?.name
		if (!firstArtist || !track.title) {
			toast.error('Track needs artist and title to search Beatport')
			return false
		}

		isLoadingBeatportData.value = true
		loadingTrackId.value = trackId

		try {
			const beatportScraper = useBeatportScraper()
			const beatportData = await beatportScraper.searchTracks({
				artist: firstArtist,
				title: track.title
			})

			if (!beatportData) {
				await persistNotFoundMarker(tracks, track.id)
				toast(`${BEATPORT_NO_MATCH_MESSAGE} on Beatport`, {
					icon: h(Wand, { class: 'size-5 text-amber-500' })
				})
				return false
			}

			const keyData = parseBeatportKey(beatportData.key)
			const updates: Partial<Track> = { beatport_data: beatportData }

			// Only auto-populate empty fields to preserve user data
			if (!track.bpm && beatportData.bpm) updates.bpm = beatportData.bpm

			if (track.key === null && keyData.key !== null) {
				updates.key = keyData.key
				updates.mode = keyData.mode
			}

			const result = await tracks.updateTrack(track.id, updates, {
				silent: true
			})
			if (result) {
				toast('Beatport data found', {
					icon: h(Wand, { class: 'size-5 text-green-500' })
				})
				return true
			}

			throw new Error(BEATPORT_SAVE_DATA_ERROR)
		} catch (error) {
			console.error('Error fetching Beatport data:', error)
			toast.error(getBeatportErrorMessage(error))
			return false
		} finally {
			isLoadingBeatportData.value = false
			loadingTrackId.value = null
		}
	}

	async function bulkFetchBeatportData(
		includeSearched: boolean = false
	): Promise<void> {
		const tracksStore = useTracksStore()
		const tracksToProcess = includeSearched
			? tracksStore.tracks
			: tracksStore.tracks.filter(
					(track) => !hasBeenSearched(track.beatport_data)
				)

		if (tracksToProcess.length === 0) {
			return
		}

		if (!isBeatportScrapingEnabled()) {
			const lastTrack = tracksToProcess[tracksToProcess.length - 1]
			isBulkFetchingBeatportData.value = false
			bulkBeatportCancelled.value = false
			bulkBeatportProgress.value = 100
			currentProcessingTrack.value = null
			lastProcessedTrack.value = lastTrack
				? {
						trackId: lastTrack.id,
						title: lastTrack.title,
						artist: lastTrack.artists?.[0]?.name || 'Unknown Artist',
						image: null,
						success: false,
						error: BEATPORT_SCRAPING_DISABLED_MESSAGE
					}
				: null
			bulkBeatportResults.value = {
				successful: 0,
				failed: tracksToProcess.map((track) => ({
					trackId: track.id,
					title: track.title,
					error: BEATPORT_SCRAPING_DISABLED_MESSAGE
				})),
				skipped: 0,
				total: tracksToProcess.length
			}
			toast.error(BEATPORT_SCRAPING_DISABLED_MESSAGE)
			return
		}

		isBulkFetchingBeatportData.value = true
		bulkBeatportCancelled.value = false
		bulkBeatportProgress.value = 0
		currentProcessingTrack.value = null
		lastProcessedTrack.value = null
		bulkBeatportResults.value = {
			successful: 0,
			failed: [],
			skipped: 0,
			total: tracksToProcess.length
		}

		for (let i = 0; i < tracksToProcess.length; i++) {
			if (bulkBeatportCancelled.value) break

			const track = tracksToProcess[i]
			if (!track) continue

			const firstArtist = track.artists?.[0]?.name || 'Unknown Artist'

			// Set current processing track
			currentProcessingTrack.value = {
				trackId: track.id,
				title: track.title,
				artist: firstArtist
			}

			try {
				const result = await getBeatportDataSilent(track.id)

				// Get updated track to access beatport image
				const updatedTrack = tracksStore.getTrackById(track.id)
				const beatportData = hasFoundData(updatedTrack?.beatport_data)
					? updatedTrack.beatport_data
					: null
				const beatportImage = beatportData?.img ?? null

				if (result === 'success') {
					bulkBeatportResults.value.successful++
					lastProcessedTrack.value = {
						trackId: track.id,
						title: track.title,
						artist: firstArtist,
						image: beatportImage,
						success: true,
						bpm: beatportData?.bpm ?? null,
						key: beatportData?.key,
						genre: beatportData?.genre
					}
				} else if (result === 'not_found') {
					bulkBeatportResults.value.failed.push({
						trackId: track.id,
						title: track.title,
						error: BEATPORT_NO_MATCH_MESSAGE
					})
					lastProcessedTrack.value = {
						trackId: track.id,
						title: track.title,
						artist: firstArtist,
						image: null,
						success: false,
						error: BEATPORT_NO_MATCH_MESSAGE
					}
				} else {
					bulkBeatportResults.value.skipped++
					lastProcessedTrack.value = {
						trackId: track.id,
						title: track.title,
						artist: firstArtist,
						image: null,
						success: false,
						error: BEATPORT_INVALID_TRACK_MESSAGE
					}
				}
			} catch (error) {
				const errorMessage =
					getBeatportErrorStatus(error) !== null
						? getBeatportErrorMessage(error)
						: error instanceof Error
							? error.message
							: 'Unknown error'

				bulkBeatportResults.value.failed.push({
					trackId: track.id,
					title: track.title,
					error: errorMessage
				})
				lastProcessedTrack.value = {
					trackId: track.id,
					title: track.title,
					artist: firstArtist,
					image: null,
					success: false,
					error: errorMessage
				}

				if (
					errorMessage.includes('429') ||
					errorMessage.includes('rate limit')
				) {
					console.warn('[Beatport] Rate limiting detected:', errorMessage)
				}
			}

			bulkBeatportProgress.value = Math.round(
				((i + 1) / tracksToProcess.length) * 100
			)

			const hasMoreTracks = i < tracksToProcess.length - 1
			if (!bulkBeatportCancelled.value && hasMoreTracks) {
				await sleep(BEATPORT_BULK_REQUEST_INTERVAL_MS)
			}
		}

		isBulkFetchingBeatportData.value = false
		currentProcessingTrack.value = null
	}

	// Silent version for bulk operations (no toasts)
	async function getBeatportDataSilent(
		trackId: string
	): Promise<BeatportLookupStatus> {
		if (!isBeatportScrapingEnabled()) {
			throw new Error(BEATPORT_SCRAPING_DISABLED_MESSAGE)
		}

		const tracks = useTracksStore()
		const track = tracks.getTrackById(trackId)

		if (!track) {
			throw new Error('Track not found')
		}

		const firstArtist = track.artists?.[0]?.name
		if (!firstArtist || !track.title) return 'invalid_input'

		try {
			const beatportScraper = useBeatportScraper()
			const beatportData = await beatportScraper.searchTracks({
				artist: firstArtist,
				title: track.title
			})

			if (!beatportData) {
				await persistNotFoundMarker(tracks, track.id)
				return 'not_found'
			}

			const keyData = parseBeatportKey(beatportData.key)
			const updates: Partial<Track> = { beatport_data: beatportData }

			if (!track.bpm && beatportData.bpm) updates.bpm = beatportData.bpm

			if (track.key === null && keyData.key !== null) {
				updates.key = keyData.key
				updates.mode = keyData.mode
			}

			const result = await tracks.updateTrack(track.id, updates, {
				silent: true
			})
			if (!result) {
				throw new Error(BEATPORT_SAVE_DATA_ERROR)
			}

			return 'success'
		} catch (error) {
			console.error('Error fetching Beatport data:', error)
			throw error
		}
	}

	function cancelBulkBeatportFetch() {
		bulkBeatportCancelled.value = true
	}

	function resetBulkState() {
		isBulkFetchingBeatportData.value = false
		bulkBeatportProgress.value = 0
		bulkBeatportCancelled.value = false
		currentProcessingTrack.value = null
		lastProcessedTrack.value = null
		bulkBeatportResults.value = {
			successful: 0,
			failed: [],
			skipped: 0,
			total: 0
		}
	}

	return {
		isLoadingBeatportData,
		loadingTrackId,
		isBulkFetchingBeatportData,
		bulkBeatportProgress,
		bulkBeatportResults,
		currentProcessingTrack,
		lastProcessedTrack,
		hasBeenSearched,
		hasFoundData,
		getBeatportData,
		bulkFetchBeatportData,
		cancelBulkBeatportFetch,
		resetBulkState
	}
})
