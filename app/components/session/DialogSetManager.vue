<script setup lang="ts">
import { ChevronRight, Star, Trash2 } from 'lucide-vue-next'

const session = useWorkbenchSessionStore()
const tracks = useWorkbenchTracksStore()

const selectedSet = computed(() => {
	if (!session.selectedSetId) return null
	return session.savedSets.find((s) => s.id === session.selectedSetId)
})

const deleteConfirmOpen = ref(false)
const setToDelete = ref<string | null>(null)

function formatDate(dateString: string | null): string {
	if (!dateString) return 'Unknown date'
	return new Date(dateString).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	})
}

function getTrackTitle(trackId: string): string {
	const track = tracks.getTrackById(trackId)
	return track?.title ?? 'Unknown track'
}

function getTrackArtists(trackId: string): string {
	const track = tracks.getTrackById(trackId)
	if (!track) return ''
	return track.artists.map((a) => a.name).join(', ')
}

function handleOpenChange(open: boolean) {
	if (!open) {
		session.showSetManager = false
		session.selectedSetId = null
	}
}

function confirmDelete(setId: string) {
	setToDelete.value = setId
	deleteConfirmOpen.value = true
}

async function handleDelete() {
	if (setToDelete.value) {
		await session.deleteSet(setToDelete.value)
		setToDelete.value = null
	}
	deleteConfirmOpen.value = false
}

onMounted(() => {
	if (session.savedSets.length === 0) {
		session.fetchSavedSets()
	}
})
</script>

<template>
	<Dialog :open="session.showSetManager" @update:open="handleOpenChange">
		<DialogContent class="sm:max-w-2xl">
			<DialogHeader>
				<DialogTitle>Saved Sets</DialogTitle>
				<DialogDescription>
					Browse and manage your saved DJ sets.
				</DialogDescription>
			</DialogHeader>

			<div class="min-h-75 py-4">
				<!-- Loading state -->
				<div
					v-if="session.isLoadingSets"
					class="flex h-full items-center justify-center"
				>
					<div class="flex items-center gap-2">
						<div
							class="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
						/>
						<span class="text-sm">Loading sets...</span>
					</div>
				</div>

				<!-- Empty state -->
				<div
					v-else-if="session.savedSets.length === 0"
					class="text-muted-foreground flex h-full items-center justify-center"
				>
					No saved sets yet
				</div>

				<!-- Sets list and detail view -->
				<div v-else class="flex h-100 gap-4">
					<!-- Sets list -->
					<ScrollArea class="w-1/2">
						<div class="space-y-1 pr-2">
							<button
								v-for="set in session.savedSets"
								:key="set.id"
								class="hover:bg-muted/50 flex w-full items-center justify-between rounded-lg p-2 text-left transition-colors"
								:class="{ 'bg-muted': session.selectedSetId === set.id }"
								@click="session.selectedSetId = set.id"
							>
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium">
										{{ set.name || 'Untitled Set' }}
									</div>
									<div class="text-muted-foreground text-xs">
										{{ set.played_tracks.length }} tracks
										<span class="mx-1">·</span>
										{{ formatDate(set.created_at) }}
									</div>
								</div>
								<ChevronRight class="text-muted-foreground h-4 w-4 shrink-0" />
							</button>
						</div>
					</ScrollArea>

					<!-- Set detail view -->
					<div class="border-border flex-1 border-l pl-4">
						<div v-if="selectedSet">
							<div class="mb-3 flex items-start justify-between">
								<div>
									<h3 class="font-medium">
										{{ selectedSet.name || 'Untitled Set' }}
									</h3>
									<p class="text-muted-foreground text-xs">
										{{ formatDate(selectedSet.created_at) }}
									</p>
								</div>
								<Button
									variant="ghost"
									size="sm"
									class="text-destructive hover:text-destructive"
									@click="confirmDelete(selectedSet.id)"
								>
									<Trash2 class="h-4 w-4" />
								</Button>
							</div>

							<ScrollArea class="h-80">
								<div class="space-y-2 pr-2">
									<div
										v-for="(entry, index) in selectedSet.played_tracks"
										:key="entry.track_id + index"
										class="border-border border-b pb-2 last:border-b-0"
									>
										<div class="flex items-start justify-between gap-2">
											<div class="min-w-0 flex-1">
												<div class="truncate text-sm font-medium">
													{{ getTrackTitle(entry.track_id) }}
												</div>
												<div class="text-muted-foreground text-xs">
													{{ getTrackArtists(entry.track_id) }}
												</div>
												<div
													v-if="entry.adjusted_bpm"
													class="text-muted-foreground text-xs"
												>
													{{ entry.adjusted_bpm.toFixed(1) }} BPM
												</div>
											</div>
											<div
												v-if="index > 0 && entry.transition_rating !== null"
												class="flex shrink-0 gap-0.5"
											>
												<Star
													v-for="star in 5"
													:key="star"
													class="h-3 w-3"
													:class="{
														'fill-yellow-500 text-yellow-500':
															star <= (entry.transition_rating ?? 0),
														'text-muted-foreground/50':
															star > (entry.transition_rating ?? 0)
													}"
												/>
											</div>
										</div>
									</div>
								</div>
							</ScrollArea>
						</div>

						<div
							v-else
							class="text-muted-foreground flex h-full items-center justify-center text-sm"
						>
							Select a set to view details
						</div>
					</div>
				</div>
			</div>

			<DialogFooter>
				<Button variant="ghost" @click="session.showSetManager = false">
					Close
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>

	<!-- Delete confirmation dialog -->
	<AlertDialog v-model:open="deleteConfirmOpen">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Delete Set</AlertDialogTitle>
				<AlertDialogDescription>
					Are you sure you want to delete this set? This action cannot be
					undone.
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel>Cancel</AlertDialogCancel>
				<AlertDialogAction
					class="bg-destructive hover:bg-destructive/90 text-white"
					@click="handleDelete"
				>
					Delete
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
