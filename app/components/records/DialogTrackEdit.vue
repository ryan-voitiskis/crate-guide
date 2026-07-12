<script setup lang="ts">
import { toast } from 'vue-sonner'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import {
	buildTrackEditorPayload,
	createTrackEditorInitialValues,
	hasTrackEditorChanges,
	trackEditorSchema,
	trackToEditorValues
} from '~/utils/trackEditor'

const tracks = useTracksStore()
const trackEdit = useTrackEditStore()
const recordDetails = useRecordDetailsStore()
const user = useUserStore()

const validationSchema = toTypedSchema(trackEditorSchema)

const form = useForm({
	validationSchema,
	initialValues: createTrackEditorInitialValues()
})

const { handleSubmit, setValues, values, errors, resetForm } = form
const [titleValue] = form.defineField('title')
const [positionValue] = form.defineField('position')
const [durationValue] = form.defineField('duration')
const [bpmValue] = form.defineField('bpm')
const [keyCompositeValue] = form.defineField('keyComposite')
const [genresValue] = form.defineField('genres')
const [rpmValue] = form.defineField('rpm')
const [playableValue] = form.defineField('playable')
const [timeSignatureUpperValue] = form.defineField('time_signature_upper')
const [timeSignatureLowerValue] = form.defineField('time_signature_lower')

// Independent state for artists (not managed by form)
const artists = ref<DiscogsArtistDb[]>([])
const extraartists = ref<DiscogsArtistDb[]>([])

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

const keyOptions = computed(() =>
	getKeyOptionsForComposite(user.currentKeyFormat)
)

const isFormInitialized = ref(false)

watch(
	[() => editingTrack.value, () => trackEdit.isDialogOpen],
	([track, isOpen]) => {
		if (track && isOpen && isEditing.value && !isFormInitialized.value) {
			// Editing existing track
			setValues(trackToEditorValues(track))
			// Set artists independently
			artists.value = [...track.artists]
			extraartists.value = [...track.extraartists]
			isFormInitialized.value = true
		} else if (isOpen && !isEditing.value && !isFormInitialized.value) {
			// Opening for new track - reset form
			resetForm()
			artists.value = []
			extraartists.value = []
			isFormInitialized.value = true
		} else if (!isOpen) {
			// Dialog closing - reset everything
			isFormInitialized.value = false
			showValidationErrors.value = false
			resetForm()
			artists.value = []
			extraartists.value = []
		}
	},
	{ immediate: true }
)

function hasFormChanges(): boolean {
	if (!editingTrack.value || !isEditing.value || !isFormInitialized.value)
		return false

	return hasTrackEditorChanges(
		editingTrack.value,
		values,
		artists.value,
		extraartists.value
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
		const payload = buildTrackEditorPayload(
			values,
			artists.value,
			extraartists.value
		)

		if (isEditing.value && editingTrack.value) {
			// Update existing track
			const result = await tracks.updateTrack(editingTrack.value.id, payload)
			if (result) {
				toast.success('Track updated successfully')
				trackEdit.closeTrackDialog()
				isFormInitialized.value = false
			}
		} else {
			// Create new track
			const newTrack = {
				record_id: selectedRecordId.value,
				...payload,
				beatport_data: null
			}

			const result = await tracks.createTrack(newTrack)
			if (result) {
				toast.success('Track created successfully')
				trackEdit.closeTrackDialog()
			}
		}
	} catch {
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
		<DialogContent
			class="max-h-[100dvh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] p-2 max-sm:rounded-none max-sm:border-none sm:max-h-[90dvh] sm:p-6"
		>
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

			<div class="-mx-6 space-y-6 overflow-y-auto px-6" tabindex="-1">
				<!-- Basic Track Info -->
				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<Label for="title">
							Title
							<span class="text-primary -ml-0.5">*</span>
						</Label>
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
					v-model="artists"
					:is-edit-mode="true"
					label="Artists"
				/>

				<!-- Extra Artists Section -->
				<TableArtistsEditable
					v-model="extraartists"
					:is-edit-mode="true"
					label="Extra Artists"
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
								v-model="durationValue"
								name="duration"
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

				<div
					class="flex flex-col justify-end gap-2 pt-0 max-sm:px-2 sm:flex-row"
				>
					<Button variant="secondary" @click="handleCancel">Cancel</Button>
					<ButtonLoading :loading="isSubmitting" @click="saveTrack">
						{{ isEditing ? 'Update Track' : 'Add Track' }}
					</ButtonLoading>
				</div>
			</div>
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
