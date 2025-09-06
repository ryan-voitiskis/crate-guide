<script setup lang="ts">
import { Pencil, Plus, Trash } from 'lucide-vue-next'

const records = useRecordsStore()
const recordDetails = useRecordDetailsStore()

// Computed
const isDialogOpen = computed(() => recordDetails.isOpen)

const currentRecord = computed(() => recordDetails.selectedRecord)
const recordTracks = computed(() => recordDetails.recordTracks)
const isEditMode = computed(() => recordDetails.isEditMode)
const canSave = computed(() => recordDetails.canSave)
const editingTrack = computed(() => recordDetails.editingTrack)

const showAddTrackDialog = computed({
	get: () => recordDetails.isAddingTrack,
	set: (value: boolean) => {
		if (!value) {
			recordDetails.closeTrackDialog()
		}
	}
})

const showEditTrackDialog = computed({
	get: () => recordDetails.editingTrackId !== null,
	set: (value: boolean) => {
		if (!value) {
			recordDetails.closeTrackDialog()
		}
	}
})

// Functions
function handleCloseDialog(open: boolean) {
	// Only handle close attempts (when open becomes false)
	if (!open) {
		recordDetails.closeRecord()
	}
}

function handleContinueEditing() {
	// Just close the alert, keep everything as is
	recordDetails.showUnsavedChangesAlert = false
}

function handleDiscardChanges() {
	// Determine what action triggered the unsaved changes alert
	// and handle accordingly
	recordDetails.handleDiscardChanges()
}

function toggleEditMode() {
	recordDetails.toggleEditMode()
}

async function saveRecord() {
	const result = await recordDetails.saveRecord()
	if (!result) {
		// Handle save failure if needed
	}
}

function cancelEdit() {
	recordDetails.cancelEdit()
}

function handleAddTrack() {
	recordDetails.openAddTrackDialog()
}

function handleEditTrack(track: Track) {
	recordDetails.openEditTrackDialog(track.id)
}

async function handleDeleteTrack(track: Track) {
	await recordDetails.deleteTrack(track.id)
}

// No watchers needed - all handled in store
</script>

<template>
	<!-- Main Dialog -->
	<Dialog :open="isDialogOpen" @update:open="handleCloseDialog">
		<DialogContent class="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
			<DialogHeader>
				<div class="flex items-center justify-between">
					<div>
						<DialogTitle>Record Details</DialogTitle>
						<DialogDescription v-if="currentRecord">
							{{ currentRecord.title }}
						</DialogDescription>
					</div>
					<Button
						@click="toggleEditMode"
						:variant="isEditMode ? 'secondary' : 'outline'"
						size="sm"
					>
						{{ isEditMode ? 'Cancel Edit' : 'Edit Record' }}
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
								v-if="currentRecord?.cover"
								:src="currentRecord.cover"
								:alt="currentRecord?.title"
								class="h-full w-full object-cover"
							/>
							<span v-else class="text-muted-foreground text-sm">No cover</span>
						</div>
						<Input
							v-if="isEditMode"
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
								v-if="isEditMode"
								v-model="recordDetails.recordForm.title"
								name="title"
								placeholder="Record title"
								class="text-lg font-semibold"
							/>
							<h2 v-else class="text-lg font-semibold">
								{{ currentRecord?.title }}
							</h2>
						</div>

						<!-- Year -->
						<div class="space-y-2">
							<label class="text-sm font-medium">Year</label>
							<Input
								v-if="isEditMode"
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
								{{ currentRecord?.year || 'Unknown' }}
							</p>
						</div>

						<!-- Artists -->
						<div class="space-y-2">
							<label class="text-sm font-medium">Artists</label>
							<!-- TODO: Implement artists editing table with add/remove functionality -->
							<!-- For now, showing as read-only -->
							<div class="space-y-1">
								<div
									v-for="artist in currentRecord?.artists"
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
									v-for="label in currentRecord?.labels"
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
							Tracks ({{ recordTracks.length }})
						</h3>
						<Button @click="handleAddTrack" size="sm" variant="outline">
							<Plus class="mr-2 h-4 w-4" />
							Add Track
						</Button>
					</div>

					<!-- Tracks List -->
					<div class="space-y-2">
						<div
							v-for="track in recordTracks"
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
									@click="handleEditTrack(track)"
									size="sm"
									variant="ghost"
								>
									<Pencil class="h-4 w-4" />
								</Button>
								<Button
									@click="handleDeleteTrack(track)"
									size="sm"
									variant="ghost"
									class="text-destructive-foreground"
								>
									<Trash class="size-4" />
								</Button>
							</div>
						</div>

						<div
							v-if="!recordTracks.length"
							class="text-muted-foreground py-8 text-center"
						>
							No tracks found. Add some tracks to get started.
						</div>
					</div>
				</div>
			</div>

			<!-- Dialog Footer (only shown in edit mode) -->
			<DialogFooter v-if="isEditMode" class="border-t pt-4">
				<Button @click="cancelEdit" variant="secondary">Cancel</Button>
				<Button
					@click="saveRecord"
					:disabled="!canSave"
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
				<AlertDialogCancel @click="handleContinueEditing">
					Continue Editing
				</AlertDialogCancel>
				<AlertDialogAction
					@click="handleDiscardChanges"
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				>
					Discard Changes
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>

	<!-- Add Track Dialog -->
	<DialogTrackEdit
		v-model:open="showAddTrackDialog"
		:record-id="currentRecord?.id"
		@saved="showAddTrackDialog = false"
	/>

	<!-- Edit Track Dialog -->
	<DialogTrackEdit
		v-model:open="showEditTrackDialog"
		:track="editingTrack"
		:record-id="currentRecord?.id"
		@saved="showEditTrackDialog = false"
	/>
</template>
