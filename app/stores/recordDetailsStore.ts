interface RecordEditForm {
	title: string
	year: number | null
	cover: string | null
	artists: DiscogsArtistDb[]
}

export const useRecordDetailsStore = defineStore('recordDetails', () => {
	const records = useRecordsStore()
	const tracks = useTracksStore()

	const selectedRecordId = ref<string | null>(null)
	const isEditMode = ref(false)
	const showUnsavedChangesAlert = ref(false)
	const trackToConfirmDelete = ref<Track | null>(null)

	const recordForm = ref<RecordEditForm>({
		title: '',
		year: null,
		cover: null,
		artists: []
	})

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

	const canSave = computed(() => recordForm.value.title.trim().length > 0)

	function hasFormChanges(): boolean {
		if (!selectedRecord.value || !isEditMode.value) return false

		const current = selectedRecord.value
		const form = recordForm.value

		return (
			current.title !== form.title ||
			current.year !== form.year ||
			current.cover !== form.cover ||
			JSON.stringify(current.artists) !== JSON.stringify(form.artists)
		)
	}

	function syncFormWithRecord() {
		if (!selectedRecord.value) return

		recordForm.value = {
			title: selectedRecord.value.title,
			year: selectedRecord.value.year,
			cover: selectedRecord.value.cover,
			artists: [...selectedRecord.value.artists]
		}
	}

	function resetForm() {
		recordForm.value = {
			title: '',
			year: null,
			cover: null,
			artists: []
		}
	}

	function openRecord(recordId: string) {
		selectedRecordId.value = recordId
		isEditMode.value = false
		syncFormWithRecord()
	}

	function closeRecord() {
		if (hasFormChanges()) showUnsavedChangesAlert.value = true
		else closeWithoutSaving()
	}

	function closeWithoutSaving() {
		selectedRecordId.value = null
		isEditMode.value = false
		showUnsavedChangesAlert.value = false
		resetForm()
	}

	function toggleEditMode() {
		if (!isEditMode.value) {
			syncFormWithRecord()
			isEditMode.value = true
		} else {
			if (hasFormChanges()) showUnsavedChangesAlert.value = true
			else cancelEdit()
		}
	}

	async function saveRecord() {
		if (!selectedRecord.value || !canSave.value) return

		const updates = {
			title: recordForm.value.title.trim(),
			year: recordForm.value.year,
			cover: recordForm.value.cover
			// TODO: Implement artists editing
		}

		const result = await records.updateRecord(selectedRecord.value.id, updates)
		if (result) isEditMode.value = false
	}

	function cancelEdit() {
		isEditMode.value = false
		syncFormWithRecord()
	}

	function confirmDiscardAndProceed() {
		showUnsavedChangesAlert.value = false
		if (isEditMode.value) cancelEdit()
		else closeWithoutSaving()
	}

	return {
		selectedRecordId,
		selectedRecord,
		recordTracks,
		isEditMode,
		recordForm,
		canSave,
		showUnsavedChangesAlert,
		trackToConfirmDelete,
		openRecord,
		closeRecord,
		toggleEditMode,
		saveRecord,
		cancelEdit,
		confirmDiscardAndProceed
	}
})
