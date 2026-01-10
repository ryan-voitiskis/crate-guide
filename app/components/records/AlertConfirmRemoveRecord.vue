<script setup lang="ts">
import { toast } from 'vue-sonner'

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
		// Remove from all crates first (already silent, no toasts)
		for (const crate of affectedCrates.value) {
			await cratesStore.removeRecordFromCrate(crate.id, recordId)
		}

		// Delete the record (tracks cascade automatically)
		// Note: recordsStore.deleteRecord shows its own toast, so we suppress it
		const recordIndex = recordsStore.records.findIndex((r) => r.id === recordId)
		if (recordIndex === -1) return

		const removedRecord = recordsStore.records.splice(recordIndex, 1)[0]
		if (!removedRecord) return

		const supabase = useSupabaseClient<Database>()
		const { error } = await supabase.from('records').delete().eq('id', recordId)

		if (error) {
			// Revert optimistic update
			recordsStore.records.splice(recordIndex, 0, removedRecord)
			throw error
		}

		// Close any open dialogs
		recordDetails.closeRecord()

		// Show single consolidated toast
		toast.success('Record removed from collection')
	} catch (error) {
		console.error('Error removing record:', error)
		toast.error('Failed to remove record')
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
				<AlertDialogAction
					@click="handleRemove"
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					:loading="isRemoving"
				>
					Remove
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
