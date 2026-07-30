export const useTrackEditStore = defineStore('trackEdit', () => {
	const isAddingTrack = ref(false)
	const editingTrackId = ref<string | null>(null)
	const dialogGeneration = ref(0)

	const isDialogOpen = computed(
		() => isAddingTrack.value || editingTrackId.value !== null
	)

	const isEditing = computed(() => editingTrackId.value !== null)

	function openAddTrackDialog() {
		dialogGeneration.value += 1
		isAddingTrack.value = true
		editingTrackId.value = null
	}

	function openEditTrackDialog(trackId: string) {
		dialogGeneration.value += 1
		editingTrackId.value = trackId
		isAddingTrack.value = false
	}

	function closeTrackDialog() {
		dialogGeneration.value += 1
		isAddingTrack.value = false
		editingTrackId.value = null
	}

	return {
		isDialogOpen,
		isEditing,
		editingTrackId,
		dialogGeneration,
		openAddTrackDialog,
		openEditTrackDialog,
		closeTrackDialog
	}
})
