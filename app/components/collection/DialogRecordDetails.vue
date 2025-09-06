<script setup lang="ts">
import { Pencil, Plus, Trash } from 'lucide-vue-next'

const records = useRecordsStore()
const recordDetails = useRecordDetailsStore()
const trackEdit = useTrackEditStore()

function handleCloseDialog(open: boolean) {
	if (!open) recordDetails.closeRecord()
}
</script>

<template>
	<!-- Main Dialog -->
	<Dialog :open="recordDetails.isOpen" @update:open="handleCloseDialog">
		<DialogContent class="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
			<DialogHeader>
				<div class="flex items-center justify-between">
					<div>
						<DialogTitle>Record Details</DialogTitle>
						<DialogDescription v-if="recordDetails.selectedRecord">
							{{ recordDetails.selectedRecord.title }}
						</DialogDescription>
					</div>
					<Button
						@click="recordDetails.toggleEditMode()"
						:variant="recordDetails.isEditMode ? 'secondary' : 'outline'"
						size="sm"
					>
						{{ recordDetails.isEditMode ? 'Cancel Edit' : 'Edit Record' }}
					</Button>
				</div>
			</DialogHeader>

			<div class="flex-1 space-y-6 overflow-auto pr-2">
				<!-- Record Details Section -->
				<div class="grid gap-6 md:grid-cols-3">
					<!-- Cover Image -->
					<div class="space-y-2">
						<label class="text-sm font-medium">Cover</label>
						<div
							class="bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-lg"
						>
							<img
								v-if="recordDetails.selectedRecord?.cover"
								:src="recordDetails.selectedRecord.cover"
								:alt="recordDetails.selectedRecord?.title"
								class="h-full w-full object-cover"
							/>
							<span v-else class="text-muted-foreground text-sm">No cover</span>
						</div>
						<Input
							v-if="recordDetails.isEditMode"
							:model-value="recordDetails.recordForm.cover ?? undefined"
							@update:model-value="
								recordDetails.recordForm.cover = $event ? String($event) : null
							"
							name="cover"
							placeholder="Cover URL"
							class="text-xs"
						/>
					</div>

					<!-- Record Info -->
					<div class="space-y-4 md:col-span-2">
						<!-- Title -->
						<div class="space-y-2">
							<label class="text-sm font-medium">Title</label>
							<Input
								v-if="recordDetails.isEditMode"
								v-model="recordDetails.recordForm.title"
								name="title"
								placeholder="Record title"
								class="text-lg font-semibold"
							/>
							<h2 v-else class="text-lg font-semibold">
								{{ recordDetails.selectedRecord?.title }}
							</h2>
						</div>

						<!-- Year -->
						<div class="space-y-2">
							<label class="text-sm font-medium">Year</label>
							<Input
								v-if="recordDetails.isEditMode"
								:model-value="recordDetails.recordForm.year ?? undefined"
								@update:model-value="
									recordDetails.recordForm.year = $event ? Number($event) : null
								"
								name="year"
								type="number"
								placeholder="Release year"
								class="w-32"
							/>
							<p v-else class="text-muted-foreground">
								{{ recordDetails.selectedRecord?.year || 'Unknown' }}
							</p>
						</div>

						<!-- Artists -->
						<div class="space-y-2">
							<label class="text-sm font-medium">Artists</label>
							<!-- TODO: Implement artists editing table with add/remove functionality -->
							<!-- For now, showing as read-only -->
							<div class="space-y-1">
								<div
									v-for="artist in recordDetails.selectedRecord?.artists"
									:key="artist.name"
									class="bg-muted rounded p-2 text-sm"
								>
									{{ artist.name }}
									<span v-if="artist.role" class="text-muted-foreground">
										({{ artist.role }})
									</span>
								</div>
							</div>
						</div>

						<!-- Labels -->
						<div class="space-y-2">
							<label class="text-sm font-medium">Labels</label>
							<div class="space-y-1">
								<div
									v-for="label in recordDetails.selectedRecord?.labels"
									:key="label.name"
									class="bg-muted rounded p-2 text-sm"
								>
									{{ label.name }}
									<span v-if="label.catno" class="text-muted-foreground">
										- {{ label.catno }}
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Tracks Section -->
				<div class="space-y-4">
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">
							Tracks ({{ recordDetails.recordTracks.length }})
						</h3>
						<Button
							@click="trackEdit.openAddTrackDialog()"
							size="sm"
							variant="outline"
						>
							<Plus class="mr-2 size-4" />
							Add Track
						</Button>
					</div>

					<!-- Tracks List -->
					<div class="space-y-2">
						<div
							v-for="track in recordDetails.recordTracks"
							:key="track.id"
							class="hover:bg-muted/50 flex items-center gap-4 rounded-lg border px-2 py-1"
						>
							<!-- Position -->
							<div class="text-muted-foreground w-12 font-mono text-sm">
								{{ track.position || '–' }}
							</div>

							<!-- Title & Artists -->
							<div class="min-w-0 flex-1">
								<div class="truncate font-medium">{{ track.title }}</div>
								<div class="text-muted-foreground truncate text-sm">
									<span v-if="track.artists.length">
										{{ track.artists.map((a) => a.name).join(', ') }}
									</span>
									<span v-if="track.extraartists.length">
										{{
											track.extraartists.length
												? ' feat. ' +
													track.extraartists.map((a) => a.name).join(', ')
												: ''
										}}
									</span>
								</div>
							</div>

							<!-- Duration -->
							<div class="text-muted-foreground w-16 text-right text-sm">
								{{ formatDuration(track.duration) }}
							</div>

							<!-- BPM -->
							<div class="text-muted-foreground w-16 text-right text-sm">
								{{ track.bpm ? Math.round(track.bpm) : '–' }}
							</div>

							<!-- Key -->
							<div class="text-muted-foreground w-12 text-center text-sm">
								{{ formatKey(track.key) }}
							</div>

							<!-- Actions -->
							<div class="flex gap-1">
								<Button
									@click="trackEdit.openEditTrackDialog(track.id)"
									size="sm"
									variant="ghost"
								>
									<Pencil class="size-4" />
								</Button>
								<Button
									@click="trackEdit.deleteTrack(track.id)"
									size="sm"
									variant="ghost"
									class="text-destructive-foreground"
								>
									<Trash class="size-4" />
								</Button>
							</div>
						</div>

						<div
							v-if="!recordDetails.recordTracks.length"
							class="text-muted-foreground py-8 text-center"
						>
							No tracks found. Add some tracks to get started.
						</div>
					</div>
				</div>
			</div>

			<!-- Dialog Footer (only shown in edit mode) -->
			<DialogFooter v-if="recordDetails.isEditMode" class="border-t pt-4">
				<Button @click="recordDetails.cancelEdit()" variant="secondary">
					Cancel
				</Button>
				<Button
					@click="recordDetails.saveRecord()"
					:disabled="!recordDetails.canSave"
					:loading="records.isUpdatingRecord"
				>
					Save Changes
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>

	<!-- Unsaved Changes Alert -->
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
					@click="recordDetails.handleDiscardChanges()"
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				>
					Discard Changes
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>

	<DialogTrackEdit />
</template>
