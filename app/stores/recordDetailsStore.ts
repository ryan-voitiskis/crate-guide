export const useRecordDetailsStore = defineStore('recordDetails', () => {
	const records = useRecordsStore()
	const tracks = useTracksStore()

	const selectedRecordId = ref<string | null>(null)
	const isEditMode = ref(false)
	const trackToConfirmDelete = ref<Track | null>(null)

	// Dialog state (store-based pattern)
	const recordToRemove = ref<DatabaseRecord | null>(null)
	const recordToAddToCrate = ref<DatabaseRecord | null>(null)

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

	function openRecord(recordId: string, editMode = false) {
		selectedRecordId.value = recordId
		isEditMode.value = editMode
	}

	function closeRecord() {
		selectedRecordId.value = null
		isEditMode.value = false
		trackToConfirmDelete.value = null
		recordToRemove.value = null
		recordToAddToCrate.value = null
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
		recordToRemove,
		recordToAddToCrate,
		openRecord,
		closeRecord,
		toggleEditMode
	}
})
