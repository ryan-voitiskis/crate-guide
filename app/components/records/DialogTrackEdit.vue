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

const { handleSubmit, setValues, values, resetForm } = form

// Independent state for artists (not managed by form)
const artists = ref<DiscogsArtistDb[]>([])
const extraartists = ref<DiscogsArtistDb[]>([])

const showUnsavedChangesAlert = ref(false)
const isSubmitting = ref(false)
const showValidationErrors = ref(false)
let nextSubmissionId = 0
let activeSubmissionId: number | null = null

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

const isFormInitialized = ref(false)
let initializedDialogGeneration = -1

function resetSubmissionState() {
	activeSubmissionId = null
	isSubmitting.value = false
}

watch(
	[
		() => trackEdit.dialogGeneration,
		() => editingTrack.value,
		() => trackEdit.isDialogOpen,
		() => isEditing.value
	],
	([generation, track, isOpen, editing]) => {
		if (generation !== initializedDialogGeneration) {
			initializedDialogGeneration = generation
			isFormInitialized.value = false
			showUnsavedChangesAlert.value = false
			showValidationErrors.value = false
			resetSubmissionState()
			resetForm()
			artists.value = []
			extraartists.value = []
		}

		if (track && isOpen && editing && !isFormInitialized.value) {
			// Editing existing track
			setValues(trackToEditorValues(track))
			// Set artists independently
			artists.value = [...track.artists]
			extraartists.value = [...track.extraartists]
			isFormInitialized.value = true
		} else if (isOpen && !editing && !isFormInitialized.value) {
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
			resetSubmissionState()
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
	const recordId = selectedRecordId.value
	if (!recordId) {
		toast.error('Record ID is required to save track')
		return
	}
	const dialogGeneration = trackEdit.dialogGeneration
	const editing = trackEdit.isEditing
	const trackId = editing ? trackEdit.editingTrackId : null
	if (editing && !trackId) return
	const submissionId = ++nextSubmissionId
	activeSubmissionId = submissionId

	isSubmitting.value = true

	const ownsActiveDialog = () =>
		activeSubmissionId === submissionId &&
		trackEdit.dialogGeneration === dialogGeneration &&
		trackEdit.isDialogOpen &&
		trackEdit.isEditing === editing &&
		trackEdit.editingTrackId === trackId &&
		selectedRecordId.value === recordId

	try {
		const payload = buildTrackEditorPayload(
			values,
			artists.value,
			extraartists.value
		)

		if (editing && trackId) {
			// Update existing track
			const result = await tracks.updateTrack(trackId, payload)
			if (result && ownsActiveDialog()) {
				toast.success('Track updated successfully')
				resetSubmissionState()
				trackEdit.closeTrackDialog()
			}
		} else {
			// Create new track
			const newTrack = {
				record_id: recordId,
				...payload,
				beatport_data: null
			}

			const result = await tracks.createTrack(newTrack)
			if (result && ownsActiveDialog()) {
				toast.success('Track created successfully')
				resetSubmissionState()
				trackEdit.closeTrackDialog()
			}
		}
	} catch {
		if (ownsActiveDialog()) toast.error('Error saving track')
	} finally {
		if (ownsActiveDialog()) resetSubmissionState()
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
			class="max-h-dvh max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] p-2 max-sm:rounded-none max-sm:border-none sm:max-h-[90dvh] sm:p-6"
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
				<FormTrackEditorFields
					v-model:artists="artists"
					v-model:extraartists="extraartists"
					:key-format="user.currentKeyFormat"
					:show-validation-errors="showValidationErrors"
				/>

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
