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
