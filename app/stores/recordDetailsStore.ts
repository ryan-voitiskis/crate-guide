export const useRecordDetailsStore = defineStore('recordDetails', () => {
	const records = useRecordsStore()
	const tracks = useTracksStore()

	const selectedRecordId = ref<string | null>(null)
	const isEditMode = ref(false)
	const trackToConfirmDelete = ref<Track | null>(null)

	const selectedRecord = computed(() =>
		selectedRecordId.value
			? records.getRecordById(selectedRecordId.value)
			: null
	)

	const recordTracks = computed(() => {
		if (!selectedRecordId.value) return []
		const tracksList = tracks.getTracksByRecordId(selectedRecordId.value)
		return sortTracksByPosition(tracksList)
	})

	function openRecord(recordId: string) {
		selectedRecordId.value = recordId
		isEditMode.value = false
	}

	function closeRecord() {
		selectedRecordId.value = null
		isEditMode.value = false
		trackToConfirmDelete.value = null
	}

	function toggleEditMode() {
		isEditMode.value = !isEditMode.value
	}

	return {
		selectedRecordId,
		selectedRecord,
		recordTracks,
		isEditMode,
		trackToConfirmDelete,
		openRecord,
		closeRecord,
		toggleEditMode
	}
})
