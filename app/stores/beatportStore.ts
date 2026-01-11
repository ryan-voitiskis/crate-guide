import { toast } from 'vue-sonner'
import { Wand } from 'lucide-vue-next'

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

// Local type for beatport data structure
interface BeatportTrackData {
	url?: string
	bpm?: number
	key?: string
	img?: string
}

// Local type for "not found" marker
interface BeatportNotFoundMarker {
	searched: boolean
	notFound: boolean
	searchedAt: number
}

// Helper to check if track has been searched (found or not found)
function hasBeenSearched(
	beatportData: BeatportTrackData | BeatportNotFoundMarker | null
): boolean {
	if (!beatportData) return false
	// If it has the notFound marker, it was searched
	if ('notFound' in beatportData && beatportData.notFound === true) return true
	// If it has actual data (url, bpm, etc.), it was found
	if ('url' in beatportData && beatportData.url) return true
	return false
}

// Helper to check if track was found (has actual data, not just "not found" marker)
function hasFoundData(
	beatportData: BeatportTrackData | BeatportNotFoundMarker | null
): beatportData is BeatportTrackData {
	if (!beatportData) return false
	if ('notFound' in beatportData && beatportData.notFound === true) return false
	return (
		'url' in beatportData &&
		(!!beatportData.url || beatportData.bpm !== undefined)
	)
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
				// Save "not found" marker so we don't search again
				const notFoundMarker: BeatportNotFoundMarker = {
					searched: true,
					notFound: true,
					searchedAt: Date.now()
				}
				await tracks.updateTrack(
					track.id,
					{ beatport_data: notFoundMarker },
					{ silent: true }
				)
				toast('No matching track found on Beatport', {
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

			return false
		} catch (error) {
			console.error('Error fetching Beatport data:', error)
			toast.error('Failed to get Beatport data')
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
				const success = await getBeatportDataSilent(track.id)

				// Get updated track to access beatport image
				const updatedTrack = tracksStore.getTrackById(track.id)
				const beatportImage = updatedTrack?.beatport_data?.img || null

				if (success) {
					bulkBeatportResults.value.successful++
					const beatportData = updatedTrack?.beatport_data
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
				} else {
					bulkBeatportResults.value.failed.push({
						trackId: track.id,
						title: track.title,
						error: 'No matching track found'
					})
					lastProcessedTrack.value = {
						trackId: track.id,
						title: track.title,
						artist: firstArtist,
						image: null,
						success: false,
						error: 'No matching track found'
					}
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : 'Unknown error'

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
		}

		isBulkFetchingBeatportData.value = false
		currentProcessingTrack.value = null
	}

	// Silent version for bulk operations (no toasts)
	async function getBeatportDataSilent(trackId: string): Promise<boolean> {
		const tracks = useTracksStore()
		const track = tracks.getTrackById(trackId)

		if (!track) return false

		const firstArtist = track.artists?.[0]?.name
		if (!firstArtist || !track.title) return false

		try {
			const beatportScraper = useBeatportScraper()
			const beatportData = await beatportScraper.searchTracks({
				artist: firstArtist,
				title: track.title
			})

			if (!beatportData) {
				// Save "not found" marker
				const notFoundMarker: BeatportNotFoundMarker = {
					searched: true,
					notFound: true,
					searchedAt: Date.now()
				}
				await tracks.updateTrack(
					track.id,
					{ beatport_data: notFoundMarker },
					{ silent: true }
				)
				return false
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
			return result !== null
		} catch (error) {
			console.error('Error fetching Beatport data:', error)
			return false
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
