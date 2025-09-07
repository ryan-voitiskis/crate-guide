interface RecordEditForm {
	title: string
	year: string
	cover: string
	artists: DiscogsArtistDb[]
}

const emptyRecordForm: RecordEditForm = {
	title: '',
	year: '',
	cover: '',
	artists: []
}

export const useRecordDetailsStore = defineStore('recordDetails', () => {
	const records = useRecordsStore()
	const tracks = useTracksStore()

	const selectedRecordId = ref<string | null>(null)
	const isEditMode = ref(false)
	const showUnsavedChangesAlert = ref(false)
	const trackToConfirmDelete = ref<Track | null>(null)
	const recordForm = ref<RecordEditForm>(emptyRecordForm)

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
			(current.year?.toString() || '') !== form.year ||
			(current.cover || '') !== form.cover ||
			JSON.stringify(current.artists) !== JSON.stringify(form.artists)
		)
	}

	function syncFormWithRecord() {
		if (!selectedRecord.value) return

		recordForm.value = {
			title: selectedRecord.value.title,
			year: selectedRecord.value.year?.toString() || '',
			cover: selectedRecord.value.cover || '',
			artists: [...selectedRecord.value.artists]
		}
	}

	function resetForm() {
		recordForm.value = emptyRecordForm
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
			year: recordForm.value.year ? Number(recordForm.value.year) : null,
			cover: recordForm.value.cover || null,
			artists: recordForm.value.artists
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
