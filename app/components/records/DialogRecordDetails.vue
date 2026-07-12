<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { ImageOff, Pencil, PencilOff } from 'lucide-vue-next'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import { Separator } from '../ui/separator'

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

const imageLoaded = ref(false)

const coverSrc = computed((): string | null =>
	recordDetails.isEditMode
		? coverValue.value || null
		: recordDetails.selectedRecord?.cover || null
)

const safeArtistsValue = computed({
	get: () =>
		recordDetails.isEditMode
			? artists.value
			: recordDetails.selectedRecord?.artists || [],
	set: (value) => (artists.value = value)
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
				cover: record.cover || ''
			})
			artists.value = record.artists || []
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
		JSON.stringify(current.artists || []) !==
			JSON.stringify(artists.value || [])
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
		artists: artists.value
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
	recordDetails.closeRecord()
}
</script>

<template>
	<!-- Main Dialog -->
	<Dialog v-model:open="dialogOpen">
		<DialogContent
			class="max-h-[100dvh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] p-2 max-sm:rounded-none max-sm:border-none sm:max-h-[90dvh] sm:p-6"
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
				class="-mx-6 -mb-4 space-y-6 overflow-y-auto px-6 pb-2"
				tabindex="-1"
			>
				<!-- Record Details Section -->
				<div class="grid gap-4 sm:gap-6 md:grid-cols-2">
					<!-- Cover Image -->
					<div class="space-y-2">
						<div
							class="bg-muted relative flex aspect-square items-center justify-center overflow-hidden rounded-lg"
						>
							<img
								v-if="coverSrc"
								:src="coverSrc"
								:alt="recordDetails.selectedRecord?.title"
								class="absolute h-full w-full object-cover"
								:class="[{ 'opacity-0': !imageLoaded }]"
								@load="imageLoaded = true"
								@error="imageLoaded = false"
							/>
							<ImageOff
								v-if="!coverSrc || !imageLoaded"
								class="text-muted-foreground size-8"
							/>
						</div>
					</div>

					<!-- Record Info -->
					<div class="col-span-3 mb-6 space-y-4 text-sm md:col-span-2">
						<Button
							:variant="recordDetails.isEditMode ? 'secondary' : 'outline'"
							size="sm"
							@click="handleToggleEditMode"
						>
							<PencilOff v-if="recordDetails.isEditMode" class="mr-2 size-4" />
							<Pencil v-else class="mr-2 size-4" />
							{{ recordDetails.isEditMode ? 'Cancel Edit' : 'Edit Record' }}
						</Button>
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
							<div v-else>{{ recordDetails.selectedRecord?.title }}</div>
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

					<div
						v-if="recordDetails.isEditMode"
						class="col-span-3 flex flex-col justify-end gap-2 pt-0 max-sm:px-2 sm:flex-row"
					>
						<Button variant="secondary" @click="handleCancelEdit">
							Cancel
						</Button>
						<ButtonLoading
							:disabled="!meta.valid"
							:loading="records.isUpdatingRecord"
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
