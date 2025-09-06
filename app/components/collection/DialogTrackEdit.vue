<script setup lang="ts">
import { toast } from 'vue-sonner'

const tracks = useTracksStore()
const trackEdit = useTrackEditStore()

const isSubmitting = ref(false)
const isDialogOpen = computed(() => trackEdit.isDialogOpen)
const isEditing = computed(() => trackEdit.isEditing)

const dialogTitle = computed(() =>
	isEditing.value ? 'Edit Track' : 'Add Track'
)

const canSave = computed(() => trackEdit.canSaveTrack)

async function handleSubmit() {
	if (!canSave.value) return

	isSubmitting.value = true

	try {
		if (isEditing.value && trackEdit.editingTrack) {
			// Update existing track
			const updates = {
				title: trackEdit.trackForm.title.trim(),
				artists: trackEdit.trackForm.artists.filter(
					(a) => a.name.trim() !== ''
				),
				extraartists: trackEdit.trackForm.extraartists.filter(
					(a) => a.name.trim() !== ''
				),
				position: trackEdit.trackForm.position?.trim() || null,
				duration: trackEdit.trackForm.duration,
				bpm: trackEdit.trackForm.bpm,
				rpm: trackEdit.trackForm.rpm,
				key: trackEdit.trackForm.key,
				mode: trackEdit.trackForm.mode,
				genres: trackEdit.trackForm.genres,
				time_signature_upper: trackEdit.trackForm.time_signature_upper,
				time_signature_lower: trackEdit.trackForm.time_signature_lower,
				playable: trackEdit.trackForm.playable
			}

			const result = await tracks.updateTrack(
				trackEdit.editingTrack.id,
				updates
			)
			if (result) trackEdit.closeTrackDialog()
		} else {
			// Create new track
			const recordId = trackEdit.selectedRecordId
			if (!recordId) {
				toast.error('Record ID is required to create a track')
				return
			}

			const newTrack = {
				record_id: recordId,
				title: trackEdit.trackForm.title.trim(),
				artists: trackEdit.trackForm.artists.filter(
					(a) => a.name.trim() !== ''
				),
				extraartists: trackEdit.trackForm.extraartists.filter(
					(a) => a.name.trim() !== ''
				),
				position: trackEdit.trackForm.position?.trim() || null,
				duration: trackEdit.trackForm.duration,
				bpm: trackEdit.trackForm.bpm,
				rpm: trackEdit.trackForm.rpm,
				key: trackEdit.trackForm.key,
				mode: trackEdit.trackForm.mode,
				genres: trackEdit.trackForm.genres,
				time_signature_upper: trackEdit.trackForm.time_signature_upper,
				time_signature_lower: trackEdit.trackForm.time_signature_lower,
				playable: trackEdit.trackForm.playable
			}

			const result = await tracks.createTrack(newTrack)
			if (result) {
				toast.success('Track created successfully')
				trackEdit.closeTrackDialog()
			}
		}
	} catch (error) {
		toast.error('Error saving track')
	} finally {
		isSubmitting.value = false
	}
}

function handleCancel() {
	trackEdit.closeTrackDialog()
}

function handleDialogOpenChange(open: boolean) {
	if (!open) trackEdit.closeTrackDialog()
}
</script>

<template>
	<Dialog :open="isDialogOpen" @update:open="handleDialogOpenChange">
		<DialogContent class="max-h-[90vh] max-w-4xl overflow-auto">
			<DialogHeader>
				<DialogTitle>{{ dialogTitle }}</DialogTitle>
				<DialogDescription>
					{{
						isEditing
							? 'Edit track information and metadata'
							: 'Add a new track to this record'
					}}
				</DialogDescription>
			</DialogHeader>

			<div class="space-y-6">
				<!-- Basic Track Info -->
				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<Label for="title">Title *</Label>
						<Input
							id="title"
							v-model="trackEdit.trackForm.title"
							name="title"
							placeholder="Track title"
							required
						/>
					</div>

					<div class="space-y-2">
						<Label for="position">Position</Label>
						<Input
							id="position"
							:model-value="trackEdit.trackForm.position ?? undefined"
							@update:model-value="
								trackEdit.trackForm.position = $event ? String($event) : null
							"
							name="position"
							placeholder="A1, B2, etc."
						/>
					</div>
				</div>

				<!-- Artists Section -->
				<ArtistManager
					v-model="trackEdit.trackForm.artists"
					title="Artists"
					role-placeholder="Role"
					:required="true"
				/>

				<!-- Extra Artists Section -->
				<ArtistManager
					v-model="trackEdit.trackForm.extraartists"
					title="Extra Artists (Remixers, Features, etc.)"
					role-placeholder="Role (remix, feat, etc.)"
				/>

				<!-- Genres -->
				<div class="space-y-2">
					<Label>Genres</Label>
					<TagsInput
						v-model="trackEdit.trackForm.genres"
						placeholder="Add genres..."
					/>
				</div>

				<!-- Technical Details -->
				<div class="grid gap-4 md:grid-cols-3">
					<div class="space-y-2">
						<Label for="duration">Duration</Label>
						<Input
							id="duration"
							name="duration"
							:value="formatDuration(trackEdit.trackForm.duration)"
							@input="
								trackEdit.trackForm.duration = parseUserDuration(
									($event.target as HTMLInputElement).value
								)
							"
							placeholder="3:45 or 225"
						/>
					</div>

					<div class="space-y-2">
						<Label for="bpm">BPM</Label>
						<Input
							id="bpm"
							:model-value="trackEdit.trackForm.bpm ?? undefined"
							@update:model-value="
								trackEdit.trackForm.bpm = $event ? Number($event) : null
							"
							name="bpm"
							type="number"
							step="0.1"
							placeholder="128.5"
						/>
					</div>

					<div class="space-y-2">
						<Label for="rpm">RPM</Label>
						<Select v-model="trackEdit.trackForm.rpm">
							<SelectTrigger>
								<SelectValue placeholder="Select RPM" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem :value="33">33⅓ RPM</SelectItem>
								<SelectItem :value="45">45 RPM</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				<!-- Musical Details -->
				<div class="grid gap-4 md:grid-cols-3">
					<div class="space-y-2">
						<Label for="key">Key</Label>
						<Input
							id="key"
							:model-value="trackEdit.trackForm.key ?? undefined"
							@update:model-value="
								trackEdit.trackForm.key = $event ? Number($event) : null
							"
							name="key"
							type="number"
							min="0"
							max="23"
							placeholder="0-23 (Camelot)"
						/>
					</div>

					<div class="space-y-2">
						<Label for="mode">Mode</Label>
						<Select v-model="trackEdit.trackForm.mode">
							<SelectTrigger>
								<SelectValue placeholder="Select mode" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem :value="0">Minor</SelectItem>
								<SelectItem :value="1">Major</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div class="space-y-2">
						<Label>Time Signature</Label>
						<div class="flex gap-2">
							<Input
								:model-value="
									trackEdit.trackForm.time_signature_upper ?? undefined
								"
								@update:model-value="
									trackEdit.trackForm.time_signature_upper = $event
										? Number($event)
										: null
								"
								name="time-signature-upper"
								type="number"
								min="1"
								max="16"
								placeholder="4"
								class="w-16"
							/>
							<span class="flex items-center">/</span>
							<Input
								:model-value="
									trackEdit.trackForm.time_signature_lower ?? undefined
								"
								@update:model-value="
									trackEdit.trackForm.time_signature_lower = $event
										? Number($event)
										: null
								"
								name="time-signature-lower"
								type="number"
								min="1"
								max="16"
								placeholder="4"
								class="w-16"
							/>
						</div>
					</div>
				</div>

				<!-- Playable Toggle -->
				<div class="flex items-center space-x-2">
					<Switch
						id="playable"
						v-model:checked="trackEdit.trackForm.playable"
					/>
					<Label for="playable">Playable (track is in good condition)</Label>
				</div>
			</div>

			<DialogFooter>
				<Button @click="handleCancel" variant="secondary">Cancel</Button>
				<Button
					@click="handleSubmit"
					:disabled="!canSave"
					:loading="isSubmitting"
				>
					{{ isEditing ? 'Update Track' : 'Add Track' }}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>

	<!-- Unsaved Changes Alert -->
	<AlertDialog v-model:open="trackEdit.showTrackUnsavedChangesAlert">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
				<AlertDialogDescription>
					You have unsaved changes to this track. Are you sure you want to
					discard them?
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel
					@click="trackEdit.showTrackUnsavedChangesAlert = false"
				>
					Continue Editing
				</AlertDialogCancel>
				<AlertDialogAction
					@click="trackEdit.handleDiscardTrackChanges()"
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				>
					Discard Changes
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
