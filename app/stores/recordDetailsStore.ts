import { getWorkbenchStorePinia } from '~/utils/workbenchPinia'
import type { LibraryRecord, LibraryTrack } from '~~/shared/types/library'

export const useRecordDetailsStore = defineStore('recordDetails', () => {
	const pinia = getWorkbenchStorePinia()
	const records = useRecordsStore(pinia)
	const tracks = useTracksStore(pinia)

	const selectedRecordId = ref<string | null>(null)
	const isEditMode = ref(false)
	const editFocus = ref<'cover' | null>(null)
	const dialogGeneration = ref(0)
	const trackToConfirmDelete = ref<LibraryTrack | null>(null)

	// Dialog state (store-based pattern)
	const recordToRemove = ref<LibraryRecord | null>(null)
	const recordToAddToCrate = ref<LibraryRecord | null>(null)

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

	function openRecord(
		recordId: string,
		editMode = false,
		focus: 'cover' | null = null
	) {
		dialogGeneration.value += 1
		selectedRecordId.value = recordId
		isEditMode.value = editMode
		editFocus.value = focus
	}

	function closeRecord() {
		dialogGeneration.value += 1
		selectedRecordId.value = null
		isEditMode.value = false
		editFocus.value = null
		trackToConfirmDelete.value = null
		recordToRemove.value = null
		recordToAddToCrate.value = null
	}

	function toggleEditMode() {
		dialogGeneration.value += 1
		isEditMode.value = !isEditMode.value
	}

	return {
		selectedRecordId,
		selectedRecord,
		recordTracks,
		isEditMode,
		editFocus,
		dialogGeneration,
		trackToConfirmDelete,
		recordToRemove,
		recordToAddToCrate,
		openRecord,
		closeRecord,
		toggleEditMode
	}
})
