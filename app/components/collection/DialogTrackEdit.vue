<script setup lang="ts">
import { toast } from 'vue-sonner'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { z } from 'zod'

const tracks = useTracksStore()
const trackEdit = useTrackEditStore()
const recordDetails = useRecordDetailsStore()

// Validation schema
const trackSchema = z.object({
	title: z.string().min(1, 'Title is required').trim(),
	position: z.string().refine(isValidTrackPosition, POSITION_ERROR_MESSAGE),
	duration: z.string().refine(isValidDurationFormat, DURATION_ERROR_MESSAGE),
	bpm: z.string().refine(isValidBPM, BPM_ERROR_MESSAGE),
	keyComposite: z.string().refine(isValidKeyComposite, KEY_ERROR_MESSAGE), // TODO: check this is right!
	artists: z.array(z.any()), // TableArtistsEditable handles validation // TODO: can we remove this?
	extraartists: z.array(z.any()), // TableArtistsEditable handles validation // TODO: can we remove this?
	genres: z.array(z.string()),
	rpm: z.union([z.number(), z.null()]),
	playable: z.boolean(),
	time_signature_upper: z.union([z.number(), z.null()]),
	time_signature_lower: z.union([z.number(), z.null()])
})

const validationSchema = toTypedSchema(trackSchema)

const form = useForm({
	validationSchema,
	initialValues: {
		title: '',
		position: '',
		duration: '',
		bpm: '',
		keyComposite: 'none',
		artists: [] as DiscogsArtistDb[],
		extraartists: [] as DiscogsArtistDb[],
		genres: [] as string[],
		rpm: null as number | null,
		playable: true,
		time_signature_upper: null as number | null,
		time_signature_lower: null as number | null
	}
})

const { handleSubmit, setValues, values, errors, resetForm } = form
const [titleValue] = form.defineField('title')
const [positionValue] = form.defineField('position')
const [durationValue] = form.defineField('duration')
const [bpmValue] = form.defineField('bpm')
const [keyCompositeValue] = form.defineField('keyComposite')
const [artistsValue] = form.defineField('artists')
const [extraartistsValue] = form.defineField('extraartists')
const [genresValue] = form.defineField('genres')
const [rpmValue] = form.defineField('rpm')
const [playableValue] = form.defineField('playable')
const [timeSignatureUpperValue] = form.defineField('time_signature_upper')
const [timeSignatureLowerValue] = form.defineField('time_signature_lower')

const safeArtistsValue = computed({
	get: () => artistsValue.value || [],
	set: (value) => (artistsValue.value = value)
})

const safeExtraartistsValue = computed({
	get: () => extraartistsValue.value || [],
	set: (value) => (extraartistsValue.value = value)
})

const showUnsavedChangesAlert = ref(false)
const isSubmitting = ref(false)
const showValidationErrors = ref(false)

const dialogOpen = computed({
	get: () => trackEdit.isDialogOpen,
	set: (value: boolean) => {
		if (!value) handleCloseDialog()
	}
})

const isEditing = computed(() => trackEdit.isEditing)

const editingTrack = computed(() =>
	trackEdit.editingTrackId
		? tracks.getTrackById(trackEdit.editingTrackId)
		: null
)

const selectedRecordId = computed(() => recordDetails.selectedRecordId)

const dialogTitle = computed(() =>
	isEditing.value ? 'Edit Track' : 'Add Track'
)

const keyOptions = getKeyOptionsAlt()

const isFormInitialized = ref(false)

watch(
	[() => editingTrack.value, () => trackEdit.isDialogOpen],
	([track, isOpen]) => {
		if (track && isOpen && isEditing.value && !isFormInitialized.value) {
			// Editing existing track
			setValues({
				title: track.title || '',
				position: track.position || '',
				duration: msToMMSS(track.duration),
				bpm: track.bpm?.toString() || '',
				keyComposite: createKeyComposite(track.key, track.mode),
				artists: [...track.artists], // TODO: can we remove this?
				extraartists: [...track.extraartists], // TODO: can we remove this?
				genres: [...track.genres],
				rpm: track.rpm,
				playable: track.playable ?? true,
				time_signature_upper: track.time_signature_upper,
				time_signature_lower: track.time_signature_lower
			})
			isFormInitialized.value = true
		} else if (isOpen && !isEditing.value && !isFormInitialized.value) {
			// Opening for new track - reset form
			resetForm()
			isFormInitialized.value = true
		} else if (!isOpen) {
			// Dialog closing - reset everything
			isFormInitialized.value = false
			showValidationErrors.value = false
			resetForm()
		}
	},
	{ immediate: true }
)

function hasFormChanges(): boolean {
	if (!editingTrack.value || !isEditing.value || !isFormInitialized.value)
		return false

	const current = editingTrack.value
	const form = values

	// Convert duration back to seconds for comparison
	let formDurationSeconds: number | null = null
	if (form.duration) {
		const timeMatch = form.duration.match(/^(\d{1,2}):([0-5]\d)$/)
		if (timeMatch) {
			const minutes = parseInt(timeMatch[1]!, 10)
			const seconds = parseInt(timeMatch[2]!, 10)
			formDurationSeconds = minutes * 60 + seconds
		}
	}

	return (
		(current.title || '') !== (form.title || '') ||
		(current.position || '') !== (form.position || '') ||
		(current.duration || null) !== formDurationSeconds ||
		(current.bpm?.toString() || '') !== (form.bpm || '') ||
		current.rpm !== form.rpm ||
		createKeyComposite(current.key, current.mode) !== form.keyComposite ||
		current.time_signature_upper !== form.time_signature_upper ||
		current.time_signature_lower !== form.time_signature_lower ||
		(current.playable ?? true) !== form.playable ||
		JSON.stringify(current.genres || []) !==
			JSON.stringify(form.genres || []) ||
		JSON.stringify(current.artists || []) !==
			JSON.stringify(form.artists || []) ||
		JSON.stringify(current.extraartists || []) !==
			JSON.stringify(form.extraartists || [])
	)
}

function handleCloseDialog() {
	if (hasFormChanges()) showUnsavedChangesAlert.value = true
	else {
		showValidationErrors.value = false
		trackEdit.closeTrackDialog()
	}
}

const submitTrack = handleSubmit(async (values) => {
	if (!selectedRecordId.value) {
		toast.error('Record ID is required to save track')
		return
	}

	isSubmitting.value = true

	try {
		if (isEditing.value && editingTrack.value) {
			// Update existing track
			const keyData = parseKeyComposite(values.keyComposite || 'none')
			const artists = values.artists.filter(isDiscogsArtistDb)
			const extraartists = values.extraartists.filter(isDiscogsArtistDb)
			const updates = {
				title: (values.title || '').trim(),
				artists,
				extraartists,
				position: (values.position || '').trim() || null,
				duration: mmssToMs(values.duration || ''),
				bpm: parseBPM(values.bpm || ''),
				rpm: values.rpm ?? null,
				key: keyData.key,
				mode: keyData.mode,
				genres: values.genres,
				time_signature_upper: values.time_signature_upper,
				time_signature_lower: values.time_signature_lower,
				playable: values.playable
			}

			const result = await tracks.updateTrack(editingTrack.value.id, updates)
			if (result) {
				toast.success('Track updated successfully')
				trackEdit.closeTrackDialog()
				isFormInitialized.value = false
			}
		} else {
			// Create new track
			const keyData = parseKeyComposite(values.keyComposite || 'none')
			const artists = values.artists || []
			const extraartists = values.extraartists || []
			const newTrack = {
				record_id: selectedRecordId.value,
				title: (values.title || '').trim(),
				artists,
				extraartists,
				position: (values.position || '').trim() || null,
				duration: mmssToMs(values.duration || ''),
				bpm: parseBPM(values.bpm || ''),
				rpm: values.rpm ?? null,
				key: keyData.key,
				mode: keyData.mode,
				genres: values.genres || [],
				time_signature_upper: values.time_signature_upper || null,
				time_signature_lower: values.time_signature_lower || null,
				playable: values.playable ?? true
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
})

function saveTrack() {
	showValidationErrors.value = true
	submitTrack()
}

function handleCancel() {
	if (hasFormChanges()) showUnsavedChangesAlert.value = true
	else {
		showValidationErrors.value = false
		trackEdit.closeTrackDialog()
	}
}

function confirmDiscardAndProceed() {
	showUnsavedChangesAlert.value = false
	isFormInitialized.value = false
	showValidationErrors.value = false
	resetForm()
	trackEdit.closeTrackDialog()
}
</script>

<template>
	<Dialog v-model:open="dialogOpen">
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
								v-model="titleValue"
								name="title"
								placeholder="Track title"
								:class="{
									'border-destructive': !!errors.title && showValidationErrors
								}"
								required
							/>
							<p
								v-if="errors.title && showValidationErrors"
								class="text-destructive text-sm"
							>
								{{ errors.title }}
							</p>
						</FormItem>
					</div>

					<div class="space-y-2">
						<Label for="position">Position</Label>
						<FormItem>
							<Input
								id="position"
								v-model="positionValue"
								name="position"
								placeholder="A1, B2, etc."
								:class="{
									'border-destructive':
										!!errors.position && showValidationErrors
								}"
							/>
							<p
								v-if="errors.position && showValidationErrors"
								class="text-destructive text-sm"
							>
								{{ errors.position }}
							</p>
						</FormItem>
					</div>
				</div>

				<!-- Artists Section -->
				<TableArtistsEditable
					v-model="safeArtistsValue"
					:is-edit-mode="true"
					label="Artists (defaults to record artist)"
				/>

				<!-- Extra Artists Section -->
				<TableArtistsEditable
					v-model="safeExtraartistsValue"
					:is-edit-mode="true"
					label="Extra Artists (Remixers, Features, etc.)"
				/>

				<!-- Genres -->
				<div class="space-y-2">
					<Label>Genres</Label>
					<TagsInput v-model="genresValue">
						<TagsInputItem
							v-for="(genre, index) in genresValue"
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
								v-model="durationValue"
								placeholder="3:45"
								:class="{
									'border-destructive':
										!!errors.duration && showValidationErrors
								}"
							/>
							<p
								v-if="errors.duration && showValidationErrors"
								class="text-destructive text-sm"
							>
								{{ errors.duration }}
							</p>
						</FormItem>
					</div>

					<div class="space-y-2">
						<Label for="bpm">BPM</Label>
						<FormItem>
							<Input
								id="bpm"
								v-model="bpmValue"
								name="bpm"
								placeholder="128.5"
								:class="{
									'border-destructive': !!errors.bpm && showValidationErrors
								}"
							/>
							<p
								v-if="errors.bpm && showValidationErrors"
								class="text-destructive text-sm"
							>
								{{ errors.bpm }}
							</p>
						</FormItem>
					</div>

					<div class="space-y-2">
						<Label for="rpm">RPM</Label>
						<Select v-model="rpmValue">
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
							<Select v-model="keyCompositeValue">
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
								v-if="errors.keyComposite && showValidationErrors"
								class="text-destructive text-sm"
							>
								{{ errors.keyComposite }}
							</p>
						</FormItem>
					</div>

					<div class="space-y-2">
						<Label>Time Signature</Label>
						<div class="flex gap-2">
							<NumberField
								v-model="timeSignatureUpperValue"
								:min="1"
								:max="16"
								:default-value="4"
								class="w-16"
							>
								<NumberFieldInput placeholder="4" />
							</NumberField>
							<span class="flex items-center">/</span>
							<NumberField
								v-model="timeSignatureLowerValue"
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
					<Switch id="playable" v-model:checked="playableValue" />
					<Label for="playable">Playable (track is in good condition)</Label>
				</div>
			</div>

			<DialogFooter>
				<Button @click="handleCancel" variant="secondary">Cancel</Button>
				<Button @click="saveTrack" :loading="isSubmitting">
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
					You have unsaved changes. Are you sure you want to discard them?
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel @click="showUnsavedChangesAlert = false">
					Keep Editing
				</AlertDialogCancel>
				<AlertDialogAction @click="confirmDiscardAndProceed">
					Discard Changes
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
