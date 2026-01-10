<script setup lang="ts">
const cratesStore = useCratesStore()

const crate = computed(() => cratesStore.crateToDelete)
const isOpen = computed(() => !!crate.value)

async function handleDelete() {
	if (!crate.value) return
	const success = await cratesStore.deleteCrate(crate.value.id)
	if (success) {
		cratesStore.crateToDelete = null
	}
}

function handleCancel() {
	cratesStore.crateToDelete = null
}
</script>

<template>
	<AlertDialog :open="isOpen">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Delete Crate</AlertDialogTitle>
				<AlertDialogDescription>
					Are you sure you want to delete "{{ crate?.name }}"? This will not
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
