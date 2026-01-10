<script setup lang="ts">
const props = defineProps<{
	open: boolean
	crate: Crate
}>()

const emit = defineEmits<{
	'update:open': [value: boolean]
	confirm: []
}>()

const cratesStore = useCratesStore()

async function handleDelete() {
	const success = await cratesStore.deleteCrate(props.crate.id)
	if (success) {
		emit('confirm')
		emit('update:open', false)
	}
}

function handleCancel() {
	emit('update:open', false)
}
</script>

<template>
	<AlertDialog :open="open" @update:open="emit('update:open', $event)">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Delete Crate</AlertDialogTitle>
				<AlertDialogDescription>
					Are you sure you want to delete "{{ crate.name }}"? This will not
					delete the records in this crate, only the crate itself.
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel @click="handleCancel">Cancel</AlertDialogCancel>
				<AlertDialogAction
					@click="handleDelete"
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					:loading="cratesStore.isDeletingCrate"
				>
					Delete
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
