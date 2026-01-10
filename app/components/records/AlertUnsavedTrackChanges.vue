<script setup lang="ts">
const trackEdit = useTrackEditStore()
</script>

<template>
	<AlertDialog v-model:open="trackEdit.showUnsavedChangesAlert">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
				<AlertDialogDescription>
					You have unsaved changes to this track. Are you sure you want to
					discard them?
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel @click="trackEdit.showUnsavedChangesAlert = false">
					Continue Editing
				</AlertDialogCancel>
				<AlertDialogAction
					@click="trackEdit.confirmDiscardAndClose()"
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				>
					Discard Changes
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
