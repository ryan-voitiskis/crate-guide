<script setup lang="ts">
import { toast } from 'vue-sonner'

const tracks = useTracksStore()
const trackEdit = useTrackEditStore()

const isSubmitting = ref(false)

// Helper functions for converting form strings to DB types
function parseDuration(durationStr: string): number | null {
	if (!durationStr.trim()) return null

	// Handle MM:SS format (e.g., "3:45")
	const timeMatch = durationStr.match(/^(\d{1,2}):([0-5]\d)$/)
	if (timeMatch) {
		const minutes = parseInt(timeMatch[1]!, 10)
		const seconds = parseInt(timeMatch[2]!, 10)
		return minutes * 60 + seconds
	}

	// Handle plain seconds (e.g., "225")
	const seconds = parseInt(durationStr, 10)
	return isNaN(seconds) ? null : seconds
}

function parseNumber(numStr: string): number | null {
	if (!numStr.trim()) return null
	const num = parseFloat(numStr)
	return isNaN(num) ? null : num
}

function parseInteger(numStr: string): number | null {
	if (!numStr.trim()) return null
	const num = parseInt(numStr, 10)
	return isNaN(num) ? null : num
}

const isDialogOpen = computed(() => trackEdit.isDialogOpen)
const isEditing = computed(() => trackEdit.isEditing)

const dialogTitle = computed(() =>
	isEditing.value ? 'Edit Track' : 'Add Track'
)

const canSave = computed(() => trackEdit.canSave)

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
				position: trackEdit.trackForm.position.trim() || null,
				duration: parseDuration(trackEdit.trackForm.duration),
				bpm: parseNumber(trackEdit.trackForm.bpm),
				rpm: trackEdit.trackForm.rpm,
				key: parseInteger(trackEdit.trackForm.key),
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
			if (result) trackEdit.closeWithoutSaving()
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
				position: trackEdit.trackForm.position.trim() || null,
				duration: parseDuration(trackEdit.trackForm.duration),
				bpm: parseNumber(trackEdit.trackForm.bpm),
				rpm: trackEdit.trackForm.rpm,
				key: parseInteger(trackEdit.trackForm.key),
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
							v-model="trackEdit.trackForm.position"
							name="position"
							placeholder="A1, B2, etc."
						/>
					</div>
				</div>

				<!-- Artists Section -->
				<ArtistManager
					v-model="trackEdit.trackForm.artists"
					title="Artists (defaults to record artist)"
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
					<TagsInput v-model="trackEdit.trackForm.genres">
						<TagsInputItem
							v-for="(genre, index) in trackEdit.trackForm.genres"
							:key="`genre-${index}`"
							:value="genre"
						>
							<TagsInputItemText>{{ genre }}</TagsInputItemText>
							<TagsInputItemDelete />
						</TagsInputItem>
						<TagsInputInput placeholder="Add genres..." />
					</TagsInput>
				</div>

				<!-- Technical Details -->
				<div class="grid gap-4 md:grid-cols-3">
					<div class="space-y-2">
						<Label for="duration">Duration</Label>
						<Input
							id="duration"
							name="duration"
							v-model="trackEdit.trackForm.duration"
							placeholder="3:45"
						/>
					</div>

					<div class="space-y-2">
						<Label for="bpm">BPM</Label>
						<Input
							id="bpm"
							v-model="trackEdit.trackForm.bpm"
							name="bpm"
							type="number"
							step="0.1"
							placeholder="128.5"
						/>
					</div>

					<div class="space-y-2">
						<Label for="rpm">RPM</Label>
						<Select v-model="trackEdit.trackForm.rpm">
							<SelectTrigger class="w-full">
								<SelectValue placeholder="Select RPM" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem :value="null">Not specified</SelectItem>
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
							v-model="trackEdit.trackForm.key"
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
							<SelectTrigger class="w-full">
								<SelectValue placeholder="Select mode" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem :value="null">Not specified</SelectItem>
								<SelectItem :value="0">Minor</SelectItem>
								<SelectItem :value="1">Major</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div class="space-y-2">
						<Label>Time Signature</Label>
						<div class="flex gap-2">
							<NumberField
								v-model="trackEdit.trackForm.time_signature_upper"
								:min="1"
								:max="16"
								:default-value="4"
								class="w-16"
							>
								<NumberFieldInput placeholder="4" />
							</NumberField>
							<span class="flex items-center">/</span>
							<NumberField
								v-model="trackEdit.trackForm.time_signature_lower"
								:min="1"
								:max="16"
								:default-value="4"
								class="w-16"
							>
								<NumberFieldInput placeholder="4" />
							</NumberField>
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

	<AlertUnsavedTrackChanges />
</template>
