interface TrackEditForm {
	title: string
	position: string | null
	artists: DiscogsArtistDb[]
	extraartists: DiscogsArtistDb[]
	duration: number | null
	bpm: number | null
	rpm: number | null
	playable: boolean
	key: number | null
	mode: number | null
	time_signature_upper: number | null
	time_signature_lower: number | null
	genres: string[]
}

const defaultFormData: TrackEditForm = {
	title: '',
	position: null,
	artists: [],
	extraartists: [],
	duration: null,
	bpm: null,
	rpm: null,
	playable: true,
	key: null,
	mode: null,
	time_signature_upper: null,
	time_signature_lower: null,
	genres: []
}

export const useTrackEditStore = defineStore('trackEdit', () => {
	const tracks = useTracksStore()
	const recordDetails = useRecordDetailsStore()

	const isAddingTrack = ref(false)
	const editingTrackId = ref<string | null>(null)
	const showUnsavedChangesAlert = ref(false)

	const trackForm = ref<TrackEditForm>({
		title: '',
		position: null,
		artists: [],
		extraartists: [],
		duration: null,
		bpm: null,
		rpm: null,
		playable: true,
		key: null,
		mode: null,
		time_signature_upper: null,
		time_signature_lower: null,
		genres: []
	})

	const originalFormData = ref<TrackEditForm | null>(null)

	const isDialogOpen = computed(
		() => isAddingTrack.value || editingTrackId.value !== null
	)

	const isEditing = computed(() => editingTrackId.value !== null)

	const editingTrack = computed(() =>
		editingTrackId.value ? tracks.getTrackById(editingTrackId.value) : null
	)

	const selectedRecordId = computed(() => recordDetails.selectedRecordId)

	const canSave = computed(() => {
		return trackForm.value.title.trim().length > 0
	})

	function hasFormChanges(): boolean {
		if (!originalFormData.value) return false

		const current = trackForm.value
		const original = originalFormData.value

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
	}

	function syncFormWithTrack() {
		if (editingTrackId.value && editingTrack.value) {
			const track = editingTrack.value
			trackForm.value = {
				title: track.title,
				position: track.position,
				artists: [...track.artists],
				extraartists: [...track.extraartists],
				duration: track.duration,
				bpm: track.bpm,
				rpm: track.rpm,
				playable: track.playable ?? true,
				key: track.key,
				mode: track.mode,
				time_signature_upper: track.time_signature_upper,
				time_signature_lower: track.time_signature_lower,
				genres: [...track.genres]
			}
		} else trackForm.value = defaultFormData
		originalFormData.value = JSON.parse(JSON.stringify(trackForm.value))
	}

	function resetForm() {
		trackForm.value = defaultFormData
		originalFormData.value = null
	}

	function openAddTrackDialog() {
		isAddingTrack.value = true
		editingTrackId.value = null
		syncFormWithTrack()
	}

	function openEditTrackDialog(trackId: string) {
		editingTrackId.value = trackId
		isAddingTrack.value = false
		syncFormWithTrack()
	}

	function closeTrackDialog() {
		if (hasFormChanges()) showUnsavedChangesAlert.value = true
		else closeWithoutSaving()
	}

	function closeWithoutSaving() {
		isAddingTrack.value = false
		editingTrackId.value = null
		showUnsavedChangesAlert.value = false
		resetForm()
	}

	function confirmDiscardAndClose() {
		showUnsavedChangesAlert.value = false
		closeWithoutSaving()
	}

	return {
		trackForm,
		showUnsavedChangesAlert,
		isDialogOpen,
		isEditing,
		editingTrack,
		canSave,
		selectedRecordId,
		openAddTrackDialog,
		openEditTrackDialog,
		closeTrackDialog,
		closeWithoutSaving,
		confirmDiscardAndClose
	}
})
