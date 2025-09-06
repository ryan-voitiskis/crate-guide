<script setup lang="ts">
import { Pencil, Plus, Trash } from 'lucide-vue-next'

const records = useRecordsStore()
const tracks = useTracksStore()

const isEditMode = ref(false)
const hasUnsavedChanges = ref(false)
const showUnsavedChangesAlert = ref(false)
const showAddTrackDialog = ref(false)
const showEditTrackDialog = ref(false)
const editingTrack = ref<Track | null>(null)

// Form data for record editing
const recordForm = ref<{
	title: string
	year: number | null
	cover: string | null
	artists: DiscogsArtistDb[]
}>({
	title: '',
	year: null,
	cover: null,
	artists: []
})

// Computed
const isDialogOpen = computed({
	get: () => records.selectedRecord !== null,
	set: (value: boolean) => {
		if (!value) {
			handleCloseDialog()
		}
	}
})

const currentRecord = computed(() => records.selectedRecord)

const recordTracks = computed(() => {
	if (!currentRecord.value) return []
	const recordTracksList = tracks.getTracksByRecordId(currentRecord.value.id)

	// Sort by position, handling various position formats (A1, B2, etc.)
	return recordTracksList.sort((a, b) => {
		if (!a.position && !b.position) return 0
		if (!a.position) return 1
		if (!b.position) return -1

		// Simple alphanumeric sort for positions like A1, A2, B1, B2
		return a.position.localeCompare(b.position, undefined, {
			numeric: true,
			sensitivity: 'base'
		})
	})
})

const canSave = computed(() => {
	return recordForm.value.title.trim().length > 0
})

// Functions
function initializeForm() {
	if (!currentRecord.value) return

	recordForm.value = {
		title: currentRecord.value.title,
		year: currentRecord.value.year,
		cover: currentRecord.value.cover,
		artists: [...currentRecord.value.artists]
	}
	hasUnsavedChanges.value = false
}

function checkForChanges() {
	if (!currentRecord.value) return false

	const current = currentRecord.value
	const form = recordForm.value

	return (
		current.title !== form.title ||
		current.year !== form.year ||
		current.cover !== form.cover ||
		JSON.stringify(current.artists) !== JSON.stringify(form.artists)
	)
}

function handleCloseDialog() {
	if (isEditMode.value && hasUnsavedChanges.value) {
		showUnsavedChangesAlert.value = true
		return
	}

	closeDialog()
}

function closeDialog() {
	records.selectedRecord = null
	isEditMode.value = false
	hasUnsavedChanges.value = false
	showUnsavedChangesAlert.value = false
}

function toggleEditMode() {
	if (!isEditMode.value) {
		initializeForm()
		isEditMode.value = true
	} else {
		if (hasUnsavedChanges.value) {
			showUnsavedChangesAlert.value = true
			return
		}
		isEditMode.value = false
	}
}

async function saveRecord() {
	if (!currentRecord.value || !canSave.value) return

	const updates = {
		title: recordForm.value.title.trim(),
		year: recordForm.value.year,
		cover: recordForm.value.cover
		// TODO: Implement artists editing - currently read-only due to complexity
		// artists: recordForm.value.artists
	}

	const result = await records.updateRecord(currentRecord.value.id, updates)

	if (result) {
		isEditMode.value = false
		hasUnsavedChanges.value = false
	}
}

function cancelEdit() {
	isEditMode.value = false
	hasUnsavedChanges.value = false
	initializeForm()
}

function handleAddTrack() {
	showAddTrackDialog.value = true
}

function handleEditTrack(track: Track) {
	editingTrack.value = track
	showEditTrackDialog.value = true
}

async function handleDeleteTrack(track: Track) {
	const confirmed = confirm(`Are you sure you want to delete "${track.title}"?`)
	if (!confirmed) return

	await tracks.deleteTrack(track.id)
}

// Watch for form changes
watch(
	recordForm,
	() => {
		if (isEditMode.value) {
			hasUnsavedChanges.value = checkForChanges()
		}
	},
	{ deep: true }
)

// Initialize form when dialog opens
watch(
	currentRecord,
	(newRecord) => {
		if (newRecord) {
			initializeForm()
		}
	},
	{ immediate: true }
)
</script>

<template>
	<!-- Main Dialog -->
	<Dialog v-model:open="isDialogOpen">
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
							:model-value="recordForm.cover ?? undefined"
							@update:model-value="
								recordForm.cover = $event ? String($event) : null
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
								v-model="recordForm.title"
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
								:model-value="recordForm.year ?? undefined"
								@update:model-value="
									recordForm.year = $event ? Number($event) : null
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
									<Trash class="h-4 w-4" />
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
	<AlertDialog v-model:open="showUnsavedChangesAlert">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
				<AlertDialogDescription>
					You have unsaved changes. Are you sure you want to continue without
					saving?
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel>Continue Editing</AlertDialogCancel>
				<AlertDialogAction
					@click="closeDialog"
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
