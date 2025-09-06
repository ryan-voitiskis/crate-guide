export const useRecordDetailsStore = defineStore('recordDetails', () => {
	const records = useRecordsStore()
	const tracks = useTracksStore()

	// UI State
	const selectedRecordId = ref<string | null>(null)
	const isEditMode = ref(false)

	// Track dialog state
	const isAddingTrack = ref(false)
	const editingTrackId = ref<string | null>(null)

	// Track form state
	const trackForm = ref<{
		title: string
		artists: DiscogsArtistDb[]
		extraartists: DiscogsArtistDb[]
		position: string | null
		duration: number | null
		bpm: number | null
		rpm: number | null
		key: number | null
		mode: number | null
		genres: string[]
		time_signature_upper: number | null
		time_signature_lower: number | null
		playable: boolean
	}>({
		title: '',
		artists: [],
		extraartists: [],
		position: null,
		duration: null,
		bpm: null,
		rpm: null,
		key: null,
		mode: null,
		genres: [],
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true
	})

	const originalTrackFormData = ref<typeof trackForm.value | null>(null)

	// Alert dialog state
	const showUnsavedChangesAlert = ref(false)
	const pendingAction = ref<'close' | 'toggleEdit' | null>(null)
	const showTrackUnsavedChangesAlert = ref(false)
	const pendingTrackAction = ref<'close' | null>(null)

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

	const canSaveTrack = computed(() => {
		return (
			trackForm.value.title.trim().length > 0 &&
			trackForm.value.artists.some((artist) => artist.name.trim().length > 0)
		)
	})

	const hasUnsavedTrackChanges = computed(() => {
		if (!originalTrackFormData.value) return false

		const current = trackForm.value
		const original = originalTrackFormData.value

		// Check basic fields
		return (
			current.title !== original.title ||
			current.position !== original.position ||
			current.duration !== original.duration ||
			current.bpm !== original.bpm ||
			current.rpm !== original.rpm ||
			current.key !== original.key ||
			current.mode !== original.mode ||
			current.time_signature_upper !== original.time_signature_upper ||
			current.time_signature_lower !== original.time_signature_lower ||
			current.playable !== original.playable ||
			JSON.stringify(current.genres) !== JSON.stringify(original.genres) ||
			JSON.stringify(current.artists) !== JSON.stringify(original.artists) ||
			JSON.stringify(current.extraartists) !==
				JSON.stringify(original.extraartists)
		)
	})

	// Actions
	function openRecord(recordId: string) {
		selectedRecordId.value = recordId
		isEditMode.value = false
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

	// Track form management
	function initializeTrackForm() {
		if (editingTrackId.value && editingTrack.value) {
			// Editing existing track
			const track = editingTrack.value
			trackForm.value = {
				title: track.title,
				artists: [...track.artists],
				extraartists: [...track.extraartists],
				position: track.position,
				duration: track.duration,
				bpm: track.bpm,
				rpm: track.rpm,
				key: track.key,
				mode: track.mode,
				genres: [...track.genres],
				time_signature_upper: track.time_signature_upper,
				time_signature_lower: track.time_signature_lower,
				playable: track.playable ?? true
			}
		} else {
			// Adding new track
			trackForm.value = {
				title: '',
				artists: [{ name: '', discogs_id: undefined, role: null }],
				extraartists: [],
				position: null,
				duration: null,
				bpm: null,
				rpm: null,
				key: null,
				mode: null,
				genres: [],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true
			}
		}
		// Store a deep copy of the initial form data
		originalTrackFormData.value = JSON.parse(JSON.stringify(trackForm.value))
	}

	function resetTrackForm() {
		trackForm.value = {
			title: '',
			artists: [],
			extraartists: [],
			position: null,
			duration: null,
			bpm: null,
			rpm: null,
			key: null,
			mode: null,
			genres: [],
			time_signature_upper: null,
			time_signature_lower: null,
			playable: true
		}
		originalTrackFormData.value = null
	}

	// Track management
	function openAddTrackDialog() {
		isAddingTrack.value = true
		editingTrackId.value = null
		initializeTrackForm()
	}

	function openEditTrackDialog(trackId: string) {
		editingTrackId.value = trackId
		isAddingTrack.value = false
		initializeTrackForm()
	}

	function closeTrackDialog() {
		// Check for unsaved changes
		if (hasUnsavedTrackChanges.value) {
			pendingTrackAction.value = 'close'
			showTrackUnsavedChangesAlert.value = true
			return
		}

		// Proceed with closing
		forceCloseTrackDialog()
	}

	function forceCloseTrackDialog() {
		isAddingTrack.value = false
		editingTrackId.value = null
		showTrackUnsavedChangesAlert.value = false
		pendingTrackAction.value = null
		resetTrackForm()
	}

	function handleDiscardTrackChanges() {
		showTrackUnsavedChangesAlert.value = false

		// Execute the pending action
		if (pendingTrackAction.value === 'close') {
			forceCloseTrackDialog()
		}

		pendingTrackAction.value = null
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
		selectedRecordId,
		isOpen,
		selectedRecord,
		recordTracks,
		isEditMode,
		hasUnsavedChanges,
		recordForm,
		canSave,

		// Track dialog state
		isAddingTrack,
		editingTrackId,
		editingTrack,

		// Track form state
		trackForm,
		hasUnsavedTrackChanges,
		canSaveTrack,

		// Track alert dialog state
		showTrackUnsavedChangesAlert,

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
		forceCloseTrackDialog,
		deleteTrack,

		// Track form management
		initializeTrackForm,
		resetTrackForm,
		handleDiscardTrackChanges
	}
})
