export const useTrackEditStore = defineStore('trackEdit', () => {
	const isAddingTrack = ref(false)
	const editingTrackId = ref<string | null>(null)

	const isDialogOpen = computed(
		() => isAddingTrack.value || editingTrackId.value !== null
	)

	const isEditing = computed(() => editingTrackId.value !== null)

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

	return {
		isDialogOpen,
		isEditing,
		editingTrackId,
		openAddTrackDialog,
		openEditTrackDialog,
		closeTrackDialog
	}
})
