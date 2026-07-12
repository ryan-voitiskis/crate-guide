export const useManualRecordEntryStore = defineStore(
	'manualRecordEntry',
	() => {
		const isDialogOpen = ref(false)

		function openDialog() {
			isDialogOpen.value = true
		}

		function closeDialog() {
			isDialogOpen.value = false
		}

		return {
			isDialogOpen,
			openDialog,
			closeDialog
		}
	}
)
