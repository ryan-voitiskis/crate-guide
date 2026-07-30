<script setup lang="ts">
import { Pencil, PencilOff } from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import type { LibraryCoverChange } from '~~/shared/types/library'
import { Separator } from '../ui/separator'

const records = useWorkbenchRecordsStore()
const recordDetails = useWorkbenchRecordDetailsStore()

const dialogOpen = computed({
	get: () => !!recordDetails.selectedRecordId,
	set: (value: boolean) => {
		if (!value) handleCloseDialog()
	}
})

const recordSchema = z.object({
	title: z.string().min(1, 'Title is required').trim(),
	year: z.string().refine(
		(val) => {
			if (val === '') return true
			const num = Number(val)
			const maxYear = new Date().getFullYear() + 5
			return Number.isInteger(num) && num >= 1877 && num <= maxYear
		},
		{
			message: `Year must be between 1877 and ${new Date().getFullYear() + 5}`
		}
	),
	cover: z.union([
		z.literal(''),
		z
			.string()
			.url('Must be a valid URL')
			.regex(
				/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i,
				'Must be an image URL (jpg, png, gif, webp)'
			)
	])
})

const validationSchema = toTypedSchema(recordSchema)

const form = useForm({
	validationSchema,
	initialValues: {
		title: '',
		year: '',
		cover: ''
	}
})

const { handleSubmit, setValues, meta, values, errors } = form
const [titleValue] = form.defineField('title')
const [yearValue] = form.defineField('year')
const [coverValue] = form.defineField('cover')

const artists = ref<DiscogsArtistDb[]>([])
const coverEditorRef = ref<{
	focus: () => Promise<void>
	getChange: () => LibraryCoverChange
	hasPendingChange: () => boolean
	reset: () => void
}>()

const safeArtistsValue = computed({
	get: () =>
		recordDetails.isEditMode
			? artists.value
			: recordDetails.selectedRecord?.artists || [],
	set: (value) => (artists.value = value)
})

const showUnsavedChangesAlert = ref(false)

const isFormInitialized = ref(false)
const isSubmitting = ref(false)
let initializedDialogGeneration = -1
let nextSubmissionId = 0
let activeSubmissionId: number | null = null

function resetSubmissionState() {
	activeSubmissionId = null
	isSubmitting.value = false
}

watch(
	[
		() => recordDetails.dialogGeneration,
		() => recordDetails.selectedRecord,
		() => recordDetails.isEditMode
	],
	([generation, record, isEditMode]) => {
		if (generation !== initializedDialogGeneration) {
			initializedDialogGeneration = generation
			isFormInitialized.value = false
			showUnsavedChangesAlert.value = false
			resetSubmissionState()
			resetCoverEditor()
		}

		if (record && isEditMode && !isFormInitialized.value) {
			resetCoverEditor()
			setValues({
				title: record.title || '',
				year: record.year?.toString() || '',
				cover: getCoverFallbackUrl(record.cover) || ''
			})
			artists.value = record.artists || []
			isFormInitialized.value = true
			if (recordDetails.editFocus === 'cover') void focusCoverEditor()
		} else if (!isEditMode) isFormInitialized.value = false
	},
	{ immediate: true }
)

function hasFormChanges(): boolean {
	if (
		!recordDetails.selectedRecord ||
		!recordDetails.isEditMode ||
		!isFormInitialized.value
	)
		return false

	const current = recordDetails.selectedRecord
	const form = values

	return (
		(current.title || '') !== (form.title || '') ||
		(current.year?.toString() || '') !== (form.year || '') ||
		(getCoverFallbackUrl(current.cover) || '') !== (form.cover || '') ||
		coverEditorRef.value?.hasPendingChange() === true ||
		JSON.stringify(current.artists || []) !==
			JSON.stringify(artists.value || [])
	)
}

function handleCloseDialog() {
	if (hasFormChanges()) showUnsavedChangesAlert.value = true
	else {
		resetCoverEditor()
		recordDetails.closeRecord()
	}
}

function handleToggleEditMode() {
	if (recordDetails.isEditMode && hasFormChanges())
		showUnsavedChangesAlert.value = true
	else {
		if (recordDetails.isEditMode) resetCoverEditor()
		recordDetails.toggleEditMode()
	}
}

const saveRecord = handleSubmit(async (values) => {
	const recordId = recordDetails.selectedRecordId
	if (!recordId || recordDetails.selectedRecord?.id !== recordId) return
	const dialogGeneration = recordDetails.dialogGeneration
	const submissionId = ++nextSubmissionId
	activeSubmissionId = submissionId
	isSubmitting.value = true

	const ownsActiveEditor = () =>
		activeSubmissionId === submissionId &&
		recordDetails.dialogGeneration === dialogGeneration &&
		recordDetails.selectedRecordId === recordId &&
		recordDetails.isEditMode

	const coverChange = coverEditorRef.value?.getChange() ?? {
		type: 'keep' as const
	}
	const currentFallbackUrl = getCoverFallbackUrl(
		recordDetails.selectedRecord.cover
	)
	const shouldUpdateCover =
		coverChange.type !== 'keep' || (values.cover || null) !== currentFallbackUrl
	const updates = {
		title: values.title.trim(),
		year: values.year ? Number(values.year) : null,
		artists: artists.value,
		...(shouldUpdateCover
			? {
					cover: values.cover
						? ({ kind: 'external', url: values.cover } as const)
						: ({ kind: 'none' } as const)
				}
			: {})
	}

	try {
		const result = await records.updateRecordWithCover(
			recordId,
			updates,
			coverChange
		)
		if (!result || !ownsActiveEditor()) return
		resetSubmissionState()
		resetCoverEditor()
		recordDetails.toggleEditMode()
		isFormInitialized.value = false
	} finally {
		if (ownsActiveEditor()) resetSubmissionState()
	}
})

function handleCancelEdit() {
	if (hasFormChanges()) showUnsavedChangesAlert.value = true
	else {
		resetCoverEditor()
		recordDetails.toggleEditMode()
	}
}

function confirmDiscardAndProceed() {
	showUnsavedChangesAlert.value = false
	isFormInitialized.value = false
	resetCoverEditor()
	recordDetails.closeRecord()
}

function resetCoverEditor(): void {
	coverEditorRef.value?.reset()
}

async function focusCoverEditor(): Promise<void> {
	await nextTick()
	await coverEditorRef.value?.focus()
}

function startCoverEdit(): void {
	if (!recordDetails.isEditMode) recordDetails.toggleEditMode()
	recordDetails.editFocus = 'cover'
	void focusCoverEditor()
}
</script>

<template>
	<Dialog v-model:open="dialogOpen">
		<DialogContent
			class="max-h-dvh grid-rows-[auto_minmax(0,1fr)_auto] p-2 max-sm:rounded-none max-sm:border-none sm:max-h-[90dvh] sm:p-6"
		>
			<DialogHeader>
				<DialogTitle>Record Details</DialogTitle>
				<DialogDescription v-if="recordDetails.selectedRecord">
					{{
						recordDetails.selectedRecord.labels[0]?.catno ??
						recordDetails.selectedRecord.title
					}}
				</DialogDescription>
			</DialogHeader>

			<div
				class="-mx-2 -mb-2 space-y-6 overflow-y-auto px-2 pb-2 sm:-mx-6 sm:-mb-4 sm:px-6"
				tabindex="-1"
			>
				<div class="space-y-6">
					<div class="grid gap-4 sm:gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
						<FormRecordCoverEditor
							ref="coverEditorRef"
							v-model="coverValue"
							:record="recordDetails.selectedRecord ?? null"
							:is-edit-mode="recordDetails.isEditMode"
							:url-error="errors.cover"
							@start-edit="startCoverEdit"
						/>

						<div class="space-y-4 text-sm">
							<Button
								:variant="recordDetails.isEditMode ? 'secondary' : 'outline'"
								size="sm"
								@click="handleToggleEditMode"
							>
								<PencilOff
									v-if="recordDetails.isEditMode"
									class="mr-2 size-4"
								/>
								<Pencil v-else class="mr-2 size-4" />
								{{ recordDetails.isEditMode ? 'Cancel Edit' : 'Edit Record' }}
							</Button>
							<div class="space-y-2">
								<Label>Title</Label>
								<FormItem v-if="recordDetails.isEditMode">
									<Input
										v-model="titleValue"
										name="title"
										placeholder="Record title"
										:class="{
											'border-destructive': !!errors.title
										}"
									/>
									<p v-if="errors.title" class="text-destructive text-sm">
										{{ errors.title }}
									</p>
								</FormItem>
								<div v-else>{{ recordDetails.selectedRecord?.title }}</div>
							</div>

							<div class="space-y-2">
								<Label class="font-medium">Year</Label>
								<FormItem v-if="recordDetails.isEditMode">
									<Input
										v-model="yearValue"
										name="year"
										type="text"
										placeholder="Release year"
										:class="[
											'w-full sm:w-32',
											{
												'border-destructive': !!errors.year
											}
										]"
									/>
									<p v-if="errors.year" class="text-destructive text-sm">
										{{ errors.year }}
									</p>
								</FormItem>
								<p v-else class="text-muted-foreground">
									{{ recordDetails.selectedRecord?.year || 'Unknown' }}
								</p>
							</div>
						</div>
					</div>

					<TableArtistsEditable
						v-model="safeArtistsValue"
						:is-edit-mode="recordDetails.isEditMode"
						label="Artists"
					/>

					<div class="space-y-2">
						<Label>
							Labels ({{ recordDetails.selectedRecord?.labels.length || 0 }})
						</Label>
						<div class="space-y-1">
							<div
								v-for="label in recordDetails.selectedRecord?.labels"
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

					<div
						v-if="recordDetails.isEditMode"
						class="flex flex-col justify-end gap-2 pt-0 max-sm:px-2 sm:flex-row"
					>
						<Button variant="secondary" @click="handleCancelEdit">
							Cancel
						</Button>
						<ButtonLoading
							:disabled="!meta.valid"
							:loading="isSubmitting"
							@click="saveRecord"
						>
							Save Changes
						</ButtonLoading>
					</div>
				</div>

				<Separator class="my-8" />

				<SectionRecordTracks />
			</div>
		</DialogContent>
	</Dialog>

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

	<AlertConfirmDeleteTrack />
	<DialogTrackEdit />
</template>
