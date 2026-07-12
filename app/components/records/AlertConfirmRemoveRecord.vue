<script setup lang="ts">
const recordDetails = useRecordDetailsStore()
const recordsStore = useRecordsStore()
const cratesStore = useCratesStore()

const record = computed(() => recordDetails.recordToRemove)
const isOpen = computed(() => !!record.value)

const isRemoving = ref(false)

const affectedCrates = computed(() => {
	if (!record.value) return []
	return cratesStore.getCratesContainingRecord(record.value.id)
})

const crateNames = computed(() =>
	affectedCrates.value.map((c) => c.name).join(', ')
)

const descriptionText = computed(() => {
	if (!record.value) return ''

	const title = record.value.title
	const crateCount = affectedCrates.value.length

	if (crateCount === 0) {
		return `Are you sure you want to remove "${title}" from your collection? This will also remove all tracks on this record.`
	}

	return `Are you sure you want to remove "${title}" from your collection? This record is in ${crateCount} crate${crateCount > 1 ? 's' : ''}: ${crateNames.value}. It will be removed from all crates and all tracks on this record will be deleted.`
})

async function handleRemove() {
	if (!record.value) return

	isRemoving.value = true
	const recordId = record.value.id

	try {
		const success = await recordsStore.removeRecordFromCollection(recordId)
		if (!success) return

		// Close any open dialogs
		recordDetails.closeRecord()
	} finally {
		isRemoving.value = false
		recordDetails.recordToRemove = null
	}
}

function handleCancel() {
	recordDetails.recordToRemove = null
}
</script>

<template>
	<AlertDialog :open="isOpen">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Remove Record</AlertDialogTitle>
				<AlertDialogDescription>
					{{ descriptionText }}
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel @click="handleCancel">Cancel</AlertDialogCancel>
				<AlertDialogActionLoading
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					:loading="isRemoving"
					@click="handleRemove"
				>
					Remove
				</AlertDialogActionLoading>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
