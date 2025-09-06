<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Plus, Trash } from 'lucide-vue-next'

// Props & Emits
interface Props {
	open: boolean
	track?: Track | null
	recordId?: string
}

interface Emits {
	(e: 'update:open', value: boolean): void
	(e: 'saved'): void
}

const props = withDefaults(defineProps<Props>(), {
	track: null
})
const emit = defineEmits<Emits>()

// Dependencies
const tracks = useTracksStore()
const recordDetails = useRecordDetailsStore()

// State
const isSubmitting = ref(false)
const hasUnsavedChanges = ref(false)
const showUnsavedChangesAlert = ref(false)

// Store original form data for change detection
const originalFormData = ref<typeof trackForm.value | null>(null)

// Form data
const trackForm = ref<{
	title: string
	artists: DiscogsArtistDb[]
	extraartists: DiscogsArtistDb[]
	position: string | null
	duration: number | null
	bpm: number | null
	rpm: number | null
	key: number | null
	mode: number | null
	genres: string[]
	time_signature_upper: number | null
	time_signature_lower: number | null
	playable: boolean
}>({
	title: '',
	artists: [],
	extraartists: [],
	position: null,
	duration: null,
	bpm: null,
	rpm: null,
	key: null,
	mode: null,
	genres: [],
	time_signature_upper: null,
	time_signature_lower: null,
	playable: true
})

// Computed
const isDialogOpen = computed(() => props.open)

const isEditing = computed(() => props.track !== null)

const dialogTitle = computed(() =>
	isEditing.value ? 'Edit Track' : 'Add Track'
)

const canSave = computed(() => {
	return (
		trackForm.value.title.trim().length > 0 &&
		trackForm.value.artists.some((artist) => artist.name.trim().length > 0)
	)
})

// Functions
function initializeForm() {
	if (isEditing.value && props.track) {
		// Editing existing track
		trackForm.value = {
			title: props.track.title,
			artists: [...props.track.artists],
			extraartists: [...props.track.extraartists],
			position: props.track.position,
			duration: props.track.duration,
			bpm: props.track.bpm,
			rpm: props.track.rpm,
			key: props.track.key,
			mode: props.track.mode,
			genres: [...props.track.genres],
			time_signature_upper: props.track.time_signature_upper,
			time_signature_lower: props.track.time_signature_lower,
			playable: props.track.playable ?? true
		}
	} else {
		// Adding new track
		trackForm.value = {
			title: '',
			artists: [{ name: '', discogs_id: undefined, role: null }],
			extraartists: [],
			position: null,
			duration: null,
			bpm: null,
			rpm: null,
			key: null,
			mode: null,
			genres: [],
			time_signature_upper: null,
			time_signature_lower: null,
			playable: true
		}
	}
	// Store a deep copy of the initial form data
	originalFormData.value = JSON.parse(JSON.stringify(trackForm.value))
	hasUnsavedChanges.value = false
}

function checkForChanges(): boolean {
	if (!originalFormData.value) return false

	const current = trackForm.value
	const original = originalFormData.value

	// Check basic fields
	if (
		current.title !== original.title ||
		current.position !== original.position ||
		current.duration !== original.duration ||
		current.bpm !== original.bpm ||
		current.rpm !== original.rpm ||
		current.key !== original.key ||
		current.mode !== original.mode ||
		current.time_signature_upper !== original.time_signature_upper ||
		current.time_signature_lower !== original.time_signature_lower ||
		current.playable !== original.playable
	) {
		return true
	}

	// Check arrays
	if (JSON.stringify(current.genres) !== JSON.stringify(original.genres)) {
		return true
	}

	if (JSON.stringify(current.artists) !== JSON.stringify(original.artists)) {
		return true
	}

	if (
		JSON.stringify(current.extraartists) !==
		JSON.stringify(original.extraartists)
	) {
		return true
	}

	return false
}

function addArtist() {
	trackForm.value.artists.push({
		name: '',
		discogs_id: undefined,
		role: null
	})
	hasUnsavedChanges.value = checkForChanges()
}

function removeArtist(index: number) {
	trackForm.value.artists.splice(index, 1)
	hasUnsavedChanges.value = checkForChanges()
}

function addExtraArtist() {
	trackForm.value.extraartists.push({
		name: '',
		discogs_id: undefined,
		role: null
	})
	hasUnsavedChanges.value = checkForChanges()
}

function removeExtraArtist(index: number) {
	trackForm.value.extraartists.splice(index, 1)
	hasUnsavedChanges.value = checkForChanges()
}

async function handleSubmit() {
	if (!canSave.value) return

	isSubmitting.value = true

	try {
		if (isEditing.value && props.track) {
			// Update existing track
			const updates = {
				title: trackForm.value.title.trim(),
				artists: trackForm.value.artists.filter((a) => a.name.trim() !== ''),
				extraartists: trackForm.value.extraartists.filter(
					(a) => a.name.trim() !== ''
				),
				position: trackForm.value.position?.trim() || null,
				duration: trackForm.value.duration,
				bpm: trackForm.value.bpm,
				rpm: trackForm.value.rpm,
				key: trackForm.value.key,
				mode: trackForm.value.mode,
				genres: trackForm.value.genres,
				time_signature_upper: trackForm.value.time_signature_upper,
				time_signature_lower: trackForm.value.time_signature_lower,
				playable: trackForm.value.playable
			}

			const result = await tracks.updateTrack(props.track.id, updates)
			if (result) {
				emit('saved')
				hasUnsavedChanges.value = false
			}
		} else {
			// Create new track
			const recordId = props.recordId || recordDetails.selectedRecordId
			if (!recordId) {
				toast.error('Record ID is required to create a track')
				return
			}

			const newTrack = {
				record_id: recordId,
				title: trackForm.value.title.trim(),
				artists: trackForm.value.artists.filter((a) => a.name.trim() !== ''),
				extraartists: trackForm.value.extraartists.filter(
					(a) => a.name.trim() !== ''
				),
				position: trackForm.value.position?.trim() || null,
				duration: trackForm.value.duration,
				bpm: trackForm.value.bpm,
				rpm: trackForm.value.rpm,
				key: trackForm.value.key,
				mode: trackForm.value.mode,
				genres: trackForm.value.genres,
				time_signature_upper: trackForm.value.time_signature_upper,
				time_signature_lower: trackForm.value.time_signature_lower,
				playable: trackForm.value.playable
			}

			const result = await tracks.createTrack(newTrack)
			if (result) {
				emit('saved')
				toast.success('Track created successfully')
				// Close dialog if it's managed by the store
				if (!props.recordId && recordDetails.isAddingTrack) {
					recordDetails.closeTrackDialog()
				}
				hasUnsavedChanges.value = false
			}
		}
	} catch (error) {
		toast.error('Error saving track')
	} finally {
		isSubmitting.value = false
	}
}

function handleCancel() {
	const hasChanges = checkForChanges()
	if (hasChanges) {
		showUnsavedChangesAlert.value = true
		return
	}
	closeDialog()
}

function handleDialogOpenChange(open: boolean) {
	if (!open) {
		const hasChanges = checkForChanges()
		if (hasChanges) {
			showUnsavedChangesAlert.value = true
			return
		}
		closeDialog()
	}
}

function closeDialog() {
	emit('update:open', false)
	hasUnsavedChanges.value = false
	showUnsavedChangesAlert.value = false
}

watch(
	trackForm,
	() => {
		if (props.open) hasUnsavedChanges.value = checkForChanges()
	},
	{ deep: true }
)

watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) initializeForm()
	},
	{ immediate: true }
)
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
							v-model="trackForm.title"
							name="title"
							placeholder="Track title"
							required
						/>
					</div>

					<div class="space-y-2">
						<Label for="position">Position</Label>
						<Input
							id="position"
							:model-value="trackForm.position ?? undefined"
							@update:model-value="
								trackForm.position = $event ? String($event) : null
							"
							name="position"
							placeholder="A1, B2, etc."
						/>
					</div>
				</div>

				<!-- Artists Section -->
				<div class="space-y-4">
					<div class="flex items-center justify-between">
						<Label>Artists *</Label>
						<Button @click="addArtist" size="sm" variant="outline">
							<Plus class="mr-2 size-4" />
							Add Artist
						</Button>
					</div>

					<div class="space-y-2">
						<div
							v-for="(artist, index) in trackForm.artists"
							:key="index"
							class="flex items-center gap-2"
						>
							<Input
								v-model="artist.name"
								name="artist-name"
								placeholder="Artist name"
								class="flex-1"
							/>
							<Input
								:model-value="artist.discogs_id ?? undefined"
								@update:model-value="
									artist.discogs_id = $event ? Number($event) : undefined
								"
								name="artist-discogs-id"
								type="number"
								placeholder="Discogs ID"
								class="w-32"
							/>
							<Input
								:model-value="artist.role ?? undefined"
								@update:model-value="
									artist.role = $event ? String($event) : null
								"
								name="artist-role"
								placeholder="Role"
								class="w-32"
							/>
							<Button
								@click="removeArtist(index)"
								size="sm"
								variant="outline"
								class="text-destructive-foreground"
							>
								<Trash class="size-4" />
							</Button>
						</div>
					</div>
				</div>

				<!-- Extra Artists Section -->
				<div class="space-y-4">
					<div class="flex items-center justify-between">
						<Label>Extra Artists (Remixers, Features, etc.)</Label>
						<Button @click="addExtraArtist" size="sm" variant="outline">
							<Plus class="mr-2 size-4" />
							Add Extra Artist
						</Button>
					</div>

					<div class="space-y-2" v-if="trackForm.extraartists.length">
						<div
							v-for="(artist, index) in trackForm.extraartists"
							:key="index"
							class="flex items-center gap-2"
						>
							<Input
								v-model="artist.name"
								name="extra-artist-name"
								placeholder="Artist name"
								class="flex-1"
							/>
							<Input
								:model-value="artist.discogs_id ?? undefined"
								@update:model-value="
									artist.discogs_id = $event ? Number($event) : undefined
								"
								name="extra-artist-discogs-id"
								type="number"
								placeholder="Discogs ID"
								class="w-32"
							/>
							<Input
								:model-value="artist.role ?? undefined"
								@update:model-value="
									artist.role = $event ? String($event) : null
								"
								name="extra-artist-role"
								placeholder="Role (remix, feat, etc.)"
								class="w-40"
							/>
							<Button
								@click="removeExtraArtist(index)"
								size="sm"
								variant="ghost"
								class="text-destructive"
							>
								<Trash class="size-4" />
							</Button>
						</div>
					</div>
				</div>

				<!-- Genres -->
				<div class="space-y-2">
					<Label>Genres</Label>
					<TagsInput v-model="trackForm.genres" placeholder="Add genres..." />
				</div>

				<!-- Technical Details -->
				<div class="grid gap-4 md:grid-cols-3">
					<div class="space-y-2">
						<Label for="duration">Duration</Label>
						<Input
							id="duration"
							name="duration"
							:value="formatDuration(trackForm.duration)"
							@input="
								trackForm.duration = parseUserDuration(
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
							:model-value="trackForm.bpm ?? undefined"
							@update:model-value="
								trackForm.bpm = $event ? Number($event) : null
							"
							name="bpm"
							type="number"
							step="0.1"
							placeholder="128.5"
						/>
					</div>

					<div class="space-y-2">
						<Label for="rpm">RPM</Label>
						<Select v-model="trackForm.rpm">
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
							:model-value="trackForm.key ?? undefined"
							@update:model-value="
								trackForm.key = $event ? Number($event) : null
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
						<Select v-model="trackForm.mode">
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
								:model-value="trackForm.time_signature_upper ?? undefined"
								@update:model-value="
									trackForm.time_signature_upper = $event
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
								:model-value="trackForm.time_signature_lower ?? undefined"
								@update:model-value="
									trackForm.time_signature_lower = $event
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
					<Switch id="playable" v-model:checked="trackForm.playable" />
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
	<AlertDialog v-model:open="showUnsavedChangesAlert">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
				<AlertDialogDescription>
					You have unsaved changes to this track. Are you sure you want to
					discard them?
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel @click="showUnsavedChangesAlert.value = false">
					Continue Editing
				</AlertDialogCancel>
				<AlertDialogAction
					@click="closeDialog()"
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				>
					Discard Changes
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
