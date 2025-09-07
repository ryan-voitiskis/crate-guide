<script setup lang="ts">
import { toast } from 'vue-sonner'
import { z } from 'zod'
import { getKeyOptionsAlt, parseKeyComposite } from '~/utils/keyFunctions'

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

// Validation schema
const trackSchema = z.object({
	title: z.string().min(1, 'Title is required').trim(),
	position: z.string().refine((val) => {
		if (val === '') return true
		return /^[A-Z]\d+$|^[A-Z]\d+-[A-Z]\d+$/i.test(val.trim())
	}, 'Position must be empty or like A1, B2, or A1-A2'),
	duration: z.string().refine((val) => {
		if (val === '') return true
		return /^[0-9]{1,2}:[0-5][0-9]$/.test(val)
	}, 'Duration must be empty or MM:SS format (e.g., 3:45)'),
	bpm: z.string().refine((val) => {
		if (val === '') return true
		const num = parseFloat(val)
		return !isNaN(num) && num >= 60 && num <= 300
	}, 'BPM must be empty or a number between 60-300'),
	keyComposite: z.string().refine((val) => {
		if (val === 'none') return true
		// Validate that it's a valid key option ID
		const parsed = parseKeyComposite(val)
		return parsed.key !== null && parsed.mode !== null
	}, 'Please select a valid key or leave unspecified')
})

type TrackFormData = z.infer<typeof trackSchema>

// Validation state
const formErrors = ref<z.ZodFormattedError<TrackFormData> | null>(null)

// Form data computed
const formData = computed(() => ({
	title: trackEdit.trackForm.title,
	position: trackEdit.trackForm.position,
	duration: trackEdit.trackForm.duration,
	bpm: trackEdit.trackForm.bpm,
	keyComposite: trackEdit.trackForm.keyComposite
}))

// Validation result computed
const validationResult = computed(() => trackSchema.safeParse(formData.value))

// Validation logic
watchEffect(() => {
	formErrors.value = validationResult.value.success
		? null
		: validationResult.value.error.format()
})

const hasFieldError = (field: keyof TrackFormData) =>
	formErrors.value?.[field]?._errors?.length

function validateField() {
	formErrors.value = validationResult.value.success
		? null
		: validationResult.value.error.format()
}

const isDialogOpen = computed(() => trackEdit.isDialogOpen)
const isEditing = computed(() => trackEdit.isEditing)

const dialogTitle = computed(() =>
	isEditing.value ? 'Edit Track' : 'Add Track'
)

const canSave = computed(() => trackEdit.canSave)

// Get key options for Select
const keyOptions = getKeyOptionsAlt()

async function handleSubmit() {
	if (!canSave.value) return

	if (!validationResult.value.success) {
		formErrors.value = validationResult.value.error.format()
		return
	}

	isSubmitting.value = true

	try {
		if (isEditing.value && trackEdit.editingTrack) {
			// Update existing track
			const keyData = parseKeyComposite(trackEdit.trackForm.keyComposite)
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
				key: keyData.key,
				mode: keyData.mode,
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

			const keyData = parseKeyComposite(trackEdit.trackForm.keyComposite)
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
				key: keyData.key,
				mode: keyData.mode,
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
						<FormItem>
							<Input
								id="title"
								v-model="trackEdit.trackForm.title"
								@blur="validateField"
								name="title"
								placeholder="Track title"
								:class="{ 'border-destructive': hasFieldError('title') }"
								required
							/>
							<p
								v-if="formErrors?.title?._errors?.length"
								class="text-destructive text-sm"
							>
								{{ formErrors.title._errors[0] }}
							</p>
						</FormItem>
					</div>

					<div class="space-y-2">
						<Label for="position">Position</Label>
						<FormItem>
							<Input
								id="position"
								v-model="trackEdit.trackForm.position"
								@blur="validateField"
								name="position"
								placeholder="A1, B2, etc."
								:class="{ 'border-destructive': hasFieldError('position') }"
							/>
							<p
								v-if="formErrors?.position?._errors?.length"
								class="text-destructive text-sm"
							>
								{{ formErrors.position._errors[0] }}
							</p>
						</FormItem>
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
						<FormItem>
							<Input
								id="duration"
								name="duration"
								v-model="trackEdit.trackForm.duration"
								@blur="validateField"
								placeholder="3:45"
								:class="{ 'border-destructive': hasFieldError('duration') }"
							/>
							<p
								v-if="formErrors?.duration?._errors?.length"
								class="text-destructive text-sm"
							>
								{{ formErrors.duration._errors[0] }}
							</p>
						</FormItem>
					</div>

					<div class="space-y-2">
						<Label for="bpm">BPM</Label>
						<FormItem>
							<Input
								id="bpm"
								v-model="trackEdit.trackForm.bpm"
								@blur="validateField"
								name="bpm"
								placeholder="128.5"
								:class="{ 'border-destructive': hasFieldError('bpm') }"
							/>
							<p
								v-if="formErrors?.bpm?._errors?.length"
								class="text-destructive text-sm"
							>
								{{ formErrors.bpm._errors[0] }}
							</p>
						</FormItem>
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
				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<Label for="key">Key</Label>
						<FormItem>
							<Select v-model="trackEdit.trackForm.keyComposite">
								<SelectTrigger class="w-full">
									<SelectValue placeholder="Select key" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem
										v-for="option in keyOptions"
										:key="option.id"
										:value="option.id"
									>
										{{ option.name }}
									</SelectItem>
								</SelectContent>
							</Select>
							<p
								v-if="formErrors?.keyComposite?._errors?.length"
								class="text-destructive text-sm"
							>
								{{ formErrors.keyComposite._errors[0] }}
							</p>
						</FormItem>
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
