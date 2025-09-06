import { toast } from 'vue-sonner'

export const useRecordDetailsStore = defineStore('recordDetails', () => {
	const records = useRecordsStore()
	const tracks = useTracksStore()

	// UI State
	const selectedRecordId = ref<string | null>(null)
	const isEditMode = ref(false)

	// Track dialog state
	const isAddingTrack = ref(false)
	const editingTrackId = ref<string | null>(null)

	// Alert dialog state
	const showUnsavedChangesAlert = ref(false)
	const pendingAction = ref<'close' | 'toggleEdit' | null>(null)

	// Form state for record editing
	const recordForm = ref<{
		title: string
		year: number | null
		cover: string | null
		artists: DiscogsArtistDb[]
	}>({
		title: '',
		year: null,
		cover: null,
		artists: []
	})

	// Computed
	const isOpen = computed(() => selectedRecordId.value !== null)

	const selectedRecord = computed(() =>
		selectedRecordId.value
			? records.getRecordById(selectedRecordId.value)
			: null
	)

	const recordTracks = computed(() => {
		if (!selectedRecordId.value) return []
		const recordTracksList = tracks.getTracksByRecordId(selectedRecordId.value)

		// Sort by position, handling various position formats (A1, B2, etc.)
		return recordTracksList.sort((a, b) => {
			if (!a.position && !b.position) return 0
			if (!a.position) return 1
			if (!b.position) return -1

			// Simple alphanumeric sort for positions like A1, A2, B1, B2
			return a.position.localeCompare(b.position, undefined, {
				numeric: true,
				sensitivity: 'base'
			})
		})
	})

	const editingTrack = computed(() =>
		editingTrackId.value ? tracks.getTrackById(editingTrackId.value) : null
	)

	const canSave = computed(() => recordForm.value.title.trim().length > 0)

	const hasUnsavedChanges = computed(() => {
		if (!isEditMode.value) return false
		return checkForChanges()
	})

	// Actions
	function openRecord(recordId: string) {
		selectedRecordId.value = recordId
		isEditMode.value = false
		hasUnsavedChanges.value = false
		initializeForm()
	}

	function closeRecord() {
		// Check for unsaved changes
		if (isEditMode.value && checkForChanges()) {
			pendingAction.value = 'close'
			showUnsavedChangesAlert.value = true
			return
		}

		// Proceed with closing
		forceCloseRecord()
	}

	function forceCloseRecord() {
		selectedRecordId.value = null
		isEditMode.value = false
		isAddingTrack.value = false
		editingTrackId.value = null
		showUnsavedChangesAlert.value = false
		pendingAction.value = null
		resetForm()
	}

	function toggleEditMode() {
		if (!isEditMode.value) {
			initializeForm()
			isEditMode.value = true
		} else {
			// Check for unsaved changes when trying to exit edit mode
			if (checkForChanges()) {
				pendingAction.value = 'toggleEdit'
				showUnsavedChangesAlert.value = true
				return
			}
			isEditMode.value = false
			initializeForm() // Reset to original values
		}
	}

	function initializeForm() {
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

	function checkForChanges(): boolean {
		if (!selectedRecord.value) return false

		const current = selectedRecord.value
		const form = recordForm.value

		return (
			current.title !== form.title ||
			current.year !== form.year ||
			current.cover !== form.cover ||
			JSON.stringify(current.artists) !== JSON.stringify(form.artists)
		)
	}

	async function saveRecord() {
		if (!selectedRecord.value || !canSave.value) return false

		const updates = {
			title: recordForm.value.title.trim(),
			year: recordForm.value.year,
			cover: recordForm.value.cover
			// TODO: Implement artists editing - currently read-only due to complexity
			// artists: recordForm.value.artists
		}

		const result = await records.updateRecord(selectedRecord.value.id, updates)

		if (result) {
			isEditMode.value = false
			return true
		}

		return false
	}

	function cancelEdit() {
		isEditMode.value = false
		initializeForm()
	}

	function handleDiscardChanges() {
		showUnsavedChangesAlert.value = false

		// Execute the pending action
		if (pendingAction.value === 'close') {
			forceCloseRecord()
		} else if (pendingAction.value === 'toggleEdit') {
			isEditMode.value = false
			initializeForm()
		}

		pendingAction.value = null
	}

	// Track management
	function openAddTrackDialog() {
		isAddingTrack.value = true
		editingTrackId.value = null
	}

	function openEditTrackDialog(trackId: string) {
		editingTrackId.value = trackId
		isAddingTrack.value = false
	}

	function closeTrackDialog() {
		isAddingTrack.value = false
		editingTrackId.value = null
	}

	async function deleteTrack(trackId: string) {
		const track = tracks.getTrackById(trackId)
		if (!track) return false

		const confirmed = confirm(
			`Are you sure you want to delete "${track.title}"?`
		)
		if (!confirmed) return false

		const result = await tracks.deleteTrack(trackId)
		return result
	}

	return {
		// State
		selectedRecordId: readonly(selectedRecordId),
		isOpen: readonly(isOpen),
		selectedRecord: readonly(selectedRecord),
		recordTracks: readonly(recordTracks),
		isEditMode: readonly(isEditMode),
		hasUnsavedChanges,
		recordForm,
		canSave,

		// Track dialog state
		isAddingTrack: readonly(isAddingTrack),
		editingTrackId: readonly(editingTrackId),
		editingTrack: readonly(editingTrack),

		// Alert dialog state
		showUnsavedChangesAlert,

		// Actions
		openRecord,
		closeRecord,
		forceCloseRecord,
		toggleEditMode,
		saveRecord,
		cancelEdit,
		handleDiscardChanges,

		// Track management
		openAddTrackDialog,
		openEditTrackDialog,
		closeTrackDialog,
		deleteTrack
	}
})
