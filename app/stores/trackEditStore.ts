export const useTrackEditStore = defineStore('trackEdit', () => {
	const tracks = useTracksStore()
	const recordDetails = useRecordDetailsStore()

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
	const showTrackUnsavedChangesAlert = ref(false)
	const pendingTrackAction = ref<'close' | null>(null)

	// Computed
	const isDialogOpen = computed(
		() => editingTrackId.value !== null || isAddingTrack.value
	)

	const isEditing = computed(() => editingTrackId.value !== null)

	const editingTrack = computed(() =>
		editingTrackId.value ? tracks.getTrackById(editingTrackId.value) : null
	)

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

	const selectedRecordId = computed(() => recordDetails.selectedRecordId)

	// Actions
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
		isAddingTrack,
		editingTrackId,
		trackForm,
		showTrackUnsavedChangesAlert,

		// Computed
		isDialogOpen,
		isEditing,
		editingTrack,
		canSaveTrack,
		hasUnsavedTrackChanges,
		selectedRecordId,

		// Actions
		openAddTrackDialog,
		openEditTrackDialog,
		closeTrackDialog,
		forceCloseTrackDialog,
		deleteTrack,
		initializeTrackForm,
		resetTrackForm,
		handleDiscardTrackChanges
	}
})
