<script setup lang="ts">
const tracks = useTracksStore()
const recordDetails = useRecordDetailsStore()

const track = computed(() => recordDetails.trackToConfirmDelete)
const isOpen = computed(() => !!track.value)

function deleteTrack() {
	tracks.deleteTrack(track.value!.id)
	recordDetails.trackToConfirmDelete = null
}
</script>

<template>
	<AlertDialog v-model:open="isOpen">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Confirm Delete</AlertDialogTitle>
				<AlertDialogDescription>
					Are you sure you want to delete {{ track?.title }}
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel @click="recordDetails.trackToConfirmDelete = null">
					Cancel
				</AlertDialogCancel>
				<AlertDialogAction
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					@click="deleteTrack()"
				>
					Delete
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
