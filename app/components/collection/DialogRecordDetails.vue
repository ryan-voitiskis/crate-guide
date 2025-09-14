<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Pencil, PencilOff } from 'lucide-vue-next'
import { useForm } from 'vee-validate'
import { z } from 'zod'

const records = useRecordsStore()
const recordDetails = useRecordDetailsStore()

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
	]),
	artists: z.array(z.any()) // TableArtistsEditable handles artist validation
})

const validationSchema = toTypedSchema(recordSchema)

const form = useForm({
	validationSchema,
	initialValues: {
		title: '',
		year: '',
		cover: '',
		artists: [] as DiscogsArtistDb[]
	}
})

const { handleSubmit, setValues, meta, values, errors } = form
const [titleValue] = form.defineField('title')
const [yearValue] = form.defineField('year')
const [coverValue] = form.defineField('cover')
const [artistsValue] = form.defineField('artists')

const safeArtistsValue = computed({
	get: () =>
		recordDetails.isEditMode
			? artistsValue.value || []
			: recordDetails.selectedRecord?.artists || [],
	set: (value) => (artistsValue.value = value)
})

const showUnsavedChangesAlert = ref(false)

const isFormInitialized = ref(false)

watch(
	[() => recordDetails.selectedRecord, () => recordDetails.isEditMode],
	([record, isEditMode]) => {
		if (record && isEditMode && !isFormInitialized.value) {
			setValues({
				title: record.title || '',
				year: record.year?.toString() || '',
				cover: record.cover || '',
				artists: record.artists || []
			})
			isFormInitialized.value = true
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
		(current.cover || '') !== (form.cover || '') ||
		JSON.stringify(current.artists || []) !== JSON.stringify(form.artists || [])
	)
}

function handleCloseDialog() {
	if (hasFormChanges()) showUnsavedChangesAlert.value = true
	else recordDetails.closeRecord()
}

function handleToggleEditMode() {
	if (recordDetails.isEditMode && hasFormChanges())
		showUnsavedChangesAlert.value = true
	else recordDetails.toggleEditMode()
}

const saveRecord = handleSubmit(async (values) => {
	if (!recordDetails.selectedRecord) return

	const updates = {
		title: values.title.trim(),
		year: values.year ? Number(values.year) : null,
		cover: values.cover || null,
		artists: values.artists
	}

	const result = await records.updateRecord(
		recordDetails.selectedRecord.id,
		updates
	)
	if (!result) return
	recordDetails.toggleEditMode()
	isFormInitialized.value = false
})

function handleCancelEdit() {
	if (hasFormChanges()) showUnsavedChangesAlert.value = true
	else recordDetails.toggleEditMode()
}

function confirmDiscardAndProceed() {
	showUnsavedChangesAlert.value = false
	isFormInitialized.value = false
	if (recordDetails.isEditMode) recordDetails.toggleEditMode()
	else recordDetails.closeRecord()
}
</script>

<template>
	<!-- Main Dialog -->
	<Dialog v-model:open="dialogOpen">
		<DialogContent
			class="max-h-[100dvh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] p-0 sm:max-h-[90dvh]"
		>
			<DialogHeader class="p-6 pb-0">
				<div>
					<div>
						<DialogTitle>Record Details</DialogTitle>
						<DialogDescription v-if="recordDetails.selectedRecord">
							{{ recordDetails.selectedRecord.title }}
						</DialogDescription>
					</div>
					<Button
						@click="handleToggleEditMode"
						:variant="recordDetails.isEditMode ? 'secondary' : 'outline'"
						size="sm"
						class="mt-2"
					>
						<PencilOff v-if="recordDetails.isEditMode" class="mr-2 size-4" />
						<Pencil v-else class="mr-2 size-4" />
						{{ recordDetails.isEditMode ? 'Cancel Edit' : 'Edit Record' }}
					</Button>
				</div>
			</DialogHeader>

			<div class="space-y-6 overflow-y-auto px-2 py-4 sm:px-6" tabindex="-1">
				<!-- Record Details Section -->
				<div class="grid gap-4 sm:gap-6 md:grid-cols-3">
					<!-- Cover Image -->
					<div class="max-w-32 space-y-2">
						<Label>Cover</Label>
						<div
							class="bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-lg"
						>
							<img
								v-if="recordDetails.selectedRecord?.cover"
								:src="recordDetails.selectedRecord.cover"
								:alt="recordDetails.selectedRecord?.title"
								class="h-full w-full object-cover"
							/>
							<span v-else class="text-muted-foreground text-sm">No cover</span>
						</div>
					</div>

					<!-- Record Info -->
					<div class="col-span-3 mb-6 space-y-4 text-sm md:col-span-2">
						<!-- Title -->
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
							<div v-else>
								{{ recordDetails.selectedRecord?.title }}
							</div>
						</div>

						<!-- Year -->
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

						<!-- Cover URL -->
						<div v-if="recordDetails.isEditMode" class="space-y-2">
							<Label class="font-medium">Cover URL</Label>
							<FormItem>
								<Input
									v-model="coverValue"
									name="cover"
									placeholder="Cover URL"
									:class="[
										'w-full text-xs',
										{
											'border-destructive': !!errors.cover
										}
									]"
								/>
								<p v-if="errors.cover" class="text-destructive text-sm">
									{{ errors.cover }}
								</p>
							</FormItem>
						</div>
					</div>

					<!-- Artists -->
					<TableArtistsEditable
						v-model="safeArtistsValue"
						:is-edit-mode="recordDetails.isEditMode"
						label="Artists"
					/>

					<!-- Labels -->
					<div class="col-span-3 space-y-2">
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
				</div>

				<SectionRecordTracks />
			</div>

			<!-- Dialog Footer (only shown in edit mode) -->
			<DialogFooter v-if="recordDetails.isEditMode" class="p-6 pt-0">
				<Button @click="handleCancelEdit" variant="secondary">Cancel</Button>
				<Button
					@click="saveRecord"
					:disabled="!meta.valid"
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
