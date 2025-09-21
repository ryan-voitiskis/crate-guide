import { toast } from 'vue-sonner'

export const useBeatportStore = defineStore('beatport', () => {
	const isLoadingBeatportData = ref(false)

	const isBulkFetchingBeatportData = ref(false)
	const bulkBeatportProgress = ref(0)
	const bulkBeatportCancelled = ref(false)
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

		try {
			const beatportScraper = useBeatportScraper()
			const beatportData = await beatportScraper.searchTracks({
				artist: firstArtist,
				title: track.title
			})

			if (!beatportData) {
				toast.error('No matching track found on Beatport')
				return false
			}

			const keyData = parseBeatportKey(beatportData.key)
			const updates: any = { beatport_data: beatportData }

			// Only auto-populate empty fields to preserve user data
			if (!track.bpm && beatportData.bpm) updates.bpm = beatportData.bpm

			if (track.key === null && keyData.key !== null) {
				updates.key = keyData.key
				updates.mode = keyData.mode
			}

			const result = await tracks.updateTrack(track.id, updates)
			if (result) {
				toast.success('Beatport data retrieved successfully!')
				return true
			}

			return false
		} catch (error) {
			console.error('Error fetching Beatport data:', error)
			toast.error('Failed to get Beatport data')
			return false
		} finally {
			isLoadingBeatportData.value = false
		}
	}

	async function bulkFetchBeatportData(
		skipExistingData: boolean = true
	): Promise<void> {
		const tracks = useTracksStore()
		const tracksToProcess = skipExistingData
			? tracks.tracks.filter((track) => !track.beatport_data)
			: tracks.tracks

		if (tracksToProcess.length === 0) {
			toast.info('No tracks to process')
			return
		}

		isBulkFetchingBeatportData.value = true
		bulkBeatportCancelled.value = false
		bulkBeatportProgress.value = 0
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

			try {
				const success = await getBeatportData(track.id)
				if (success) {
					bulkBeatportResults.value.successful++
				} else {
					bulkBeatportResults.value.failed.push({
						trackId: track.id,
						title: track.title,
						error: 'No matching track found'
					})
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : 'Unknown error'

				bulkBeatportResults.value.failed.push({
					trackId: track.id,
					title: track.title,
					error: errorMessage
				})

				// Log rate limiting for debugging
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

		const { successful, failed } = bulkBeatportResults.value
		if (!bulkBeatportCancelled.value) {
			toast.success(
				`Beatport data fetch complete: ${successful} successful, ${failed.length} failed`
			)
		}
	}

	function cancelBulkBeatportFetch() {
		bulkBeatportCancelled.value = true
	}

	function resetBulkState() {
		isBulkFetchingBeatportData.value = false
		bulkBeatportProgress.value = 0
		bulkBeatportCancelled.value = false
		bulkBeatportResults.value = {
			successful: 0,
			failed: [],
			skipped: 0,
			total: 0
		}
	}

	return {
		isLoadingBeatportData,
		isBulkFetchingBeatportData,
		bulkBeatportProgress,
		bulkBeatportResults,
		getBeatportData,
		bulkFetchBeatportData,
		cancelBulkBeatportFetch,
		resetBulkState
	}
})
