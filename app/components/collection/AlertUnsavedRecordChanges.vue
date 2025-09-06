<script setup lang="ts">
const recordDetails = useRecordDetailsStore()
</script>

<template>
	<AlertDialog v-model:open="recordDetails.showUnsavedChangesAlert">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
				<AlertDialogDescription>
					You have unsaved changes. Are you sure you want to continue without
					saving?
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel
					@click="recordDetails.showUnsavedChangesAlert = false"
				>
					Continue Editing
				</AlertDialogCancel>
				<AlertDialogAction
					@click="recordDetails.confirmDiscardAndProceed()"
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				>
					Discard Changes
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
