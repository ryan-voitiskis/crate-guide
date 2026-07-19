<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import {
	ImagePlus,
	Link,
	Pencil,
	PencilOff,
	RotateCcw,
	Trash2,
	Upload
} from 'lucide-vue-next'
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
const coverInputMode = ref<'upload' | 'url'>('upload')
const pendingCoverFile = ref<File | null>(null)
const pendingCoverPreviewUrl = ref<string | null>(null)
const pendingCoverRemoval = ref(false)
const pendingCoverError = ref('')
const pendingCoverDimensions = ref({ width: 0, height: 0 })
const cropPositionX = ref(50)
const cropPositionY = ref(50)
const fileInputRef = ref<HTMLInputElement>()
const filePickerButtonRef = ref<ComponentPublicInstance>()
const coverEditorRef = ref<HTMLElement>()
let coverInspectionGeneration = 0

const coverPreviewRecord = computed(() => {
	const record = recordDetails.selectedRecord
	const title = record?.title || 'Record'

	if (pendingCoverPreviewUrl.value) {
		return {
			title,
			cover: pendingCoverPreviewUrl.value,
			cover_storage_path: null
		}
	}

	if (pendingCoverRemoval.value || coverInputMode.value === 'url') {
		return {
			title,
			cover: coverValue.value || null,
			cover_storage_path: null
		}
	}

	return {
		title,
		cover: recordDetails.isEditMode
			? coverValue.value || null
			: record?.cover || null,
		cover_storage_path: record?.cover_storage_path || null
	}
})

const previewObjectPosition = computed(
	() => `${cropPositionX.value}% ${cropPositionY.value}%`
)

const pendingImageIsLandscape = computed(
	() => pendingCoverDimensions.value.width > pendingCoverDimensions.value.height
)

const pendingImageIsPortrait = computed(
	() => pendingCoverDimensions.value.height > pendingCoverDimensions.value.width
)

const hasVisibleCover = computed(
	() =>
		!!coverPreviewRecord.value.cover ||
		!!coverPreviewRecord.value.cover_storage_path
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
			resetCoverEditor()
			setValues({
				title: record.title || '',
				year: record.year?.toString() || '',
				cover: record.cover || ''
			})
			artists.value = record.artists || []
			isFormInitialized.value = true
			if (recordDetails.editFocus === 'cover') focusCoverEditor()
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
		pendingCoverFile.value !== null ||
		pendingCoverRemoval.value ||
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
	if (!recordDetails.selectedRecord) return

	const updates = {
		title: values.title.trim(),
		year: values.year ? Number(values.year) : null,
		cover: values.cover || null,
		artists: artists.value
	}

	const coverChange = pendingCoverFile.value
		? {
				type: 'upload' as const,
				file: pendingCoverFile.value,
				crop: {
					positionX: cropPositionX.value,
					positionY: cropPositionY.value
				}
			}
		: pendingCoverRemoval.value
			? { type: 'remove' as const }
			: { type: 'keep' as const }

	const result = await records.updateRecordWithCover(
		recordDetails.selectedRecord.id,
		updates,
		coverChange
	)
	if (!result) return
	resetCoverEditor()
	recordDetails.toggleEditMode()
	isFormInitialized.value = false
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

function revokePendingCoverPreview() {
	if (!pendingCoverPreviewUrl.value) return
	URL.revokeObjectURL(pendingCoverPreviewUrl.value)
	pendingCoverPreviewUrl.value = null
}

function advanceCoverInspectionGeneration(): number {
	coverInspectionGeneration += 1
	return coverInspectionGeneration
}

function resetCoverEditor() {
	advanceCoverInspectionGeneration()
	revokePendingCoverPreview()
	pendingCoverFile.value = null
	pendingCoverRemoval.value = false
	pendingCoverError.value = ''
	pendingCoverDimensions.value = { width: 0, height: 0 }
	cropPositionX.value = 50
	cropPositionY.value = 50
	coverInputMode.value = 'upload'
	if (fileInputRef.value) fileInputRef.value.value = ''
}

async function inspectCoverFile(file: File) {
	const inspectionGeneration = advanceCoverInspectionGeneration()
	const fileError = validateRecordCoverFile(file)
	if (fileError) {
		pendingCoverError.value = fileError
		return
	}

	const previewUrl = URL.createObjectURL(file)
	const image = new Image()
	image.decoding = 'async'

	try {
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve()
			image.onerror = () => reject(new Error('The image could not be decoded.'))
			image.src = previewUrl
		})

		if (inspectionGeneration !== coverInspectionGeneration) {
			URL.revokeObjectURL(previewUrl)
			return
		}

		const dimensionError = validateRecordCoverDimensions(
			image.naturalWidth,
			image.naturalHeight
		)
		if (dimensionError) throw new Error(dimensionError)

		revokePendingCoverPreview()
		pendingCoverPreviewUrl.value = previewUrl
		pendingCoverFile.value = file
		pendingCoverRemoval.value = false
		pendingCoverError.value = ''
		pendingCoverDimensions.value = {
			width: image.naturalWidth,
			height: image.naturalHeight
		}
		cropPositionX.value = 50
		cropPositionY.value = 50
	} catch (error) {
		URL.revokeObjectURL(previewUrl)
		if (inspectionGeneration !== coverInspectionGeneration) return
		pendingCoverError.value =
			error instanceof Error ? error.message : 'The image could not be read.'
	}
}

function handleFileInput(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (file) void inspectCoverFile(file)
}

function handleCoverDrop(event: DragEvent) {
	if (!recordDetails.isEditMode || coverInputMode.value !== 'upload') return
	const file = event.dataTransfer?.files[0]
	if (file) void inspectCoverFile(file)
}

function chooseCoverFile() {
	fileInputRef.value?.click()
}

function clearPendingFile() {
	advanceCoverInspectionGeneration()
	revokePendingCoverPreview()
	pendingCoverFile.value = null
	pendingCoverError.value = ''
	pendingCoverDimensions.value = { width: 0, height: 0 }
	if (fileInputRef.value) fileInputRef.value.value = ''
}

function removeCover() {
	clearPendingFile()
	if (recordDetails.selectedRecord?.cover_storage_path) {
		pendingCoverRemoval.value = true
		return
	}
	coverValue.value = ''
}

function selectUploadMode() {
	coverInputMode.value = 'upload'
	pendingCoverRemoval.value = false
}

function selectUrlMode() {
	clearPendingFile()
	coverInputMode.value = 'url'
	pendingCoverRemoval.value = !!recordDetails.selectedRecord?.cover_storage_path
}

async function focusCoverEditor() {
	await nextTick()
	coverEditorRef.value?.scrollIntoView({ block: 'nearest' })
	filePickerButtonRef.value?.$el?.focus()
}

function startCoverEdit() {
	if (!recordDetails.isEditMode) recordDetails.toggleEditMode()
	recordDetails.editFocus = 'cover'
	void focusCoverEditor()
}

onUnmounted(() => {
	advanceCoverInspectionGeneration()
	revokePendingCoverPreview()
})
</script>

<template>
	<!-- Main Dialog -->
	<Dialog v-model:open="dialogOpen">
		<DialogContent
			class="max-h-[100dvh] grid-rows-[auto_minmax(0,1fr)_auto] p-2 max-sm:rounded-none max-sm:border-none sm:max-h-[90dvh] sm:p-6"
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
				<!-- Record Details Section -->
				<div class="space-y-6">
					<div class="grid gap-4 sm:gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
						<!-- Cover Image -->
						<div ref="coverEditorRef" class="space-y-3">
							<div class="flex items-center justify-between gap-2">
								<Label>Cover artwork</Label>
								<span
									v-if="recordDetails.selectedRecord?.cover_storage_path"
									class="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wide uppercase"
								>
									Uploaded
								</span>
							</div>
							<div
								class="group border-border relative aspect-square overflow-hidden rounded-lg border"
								:class="
									recordDetails.isEditMode && coverInputMode === 'upload'
										? 'hover:border-primary/70 border-dashed'
										: ''
								"
								@dragover.prevent
								@drop.prevent="handleCoverDrop"
							>
								<ImageRecordCover
									:record="coverPreviewRecord"
									:object-position="previewObjectPosition"
									show-label
									class="size-full"
								>
									<template #missing>
										<div
											class="flex flex-col items-center gap-3 px-6 text-center"
										>
											<ImagePlus
												class="text-muted-foreground size-9 stroke-[1.4]"
											/>
											<div>
												<p class="text-sm font-medium">No cover artwork</p>
												<p class="text-muted-foreground mt-1 text-xs">
													{{
														recordDetails.isEditMode
															? 'Drop an image here or choose a file.'
															: 'Discogs does not have artwork for this release.'
													}}
												</p>
											</div>
											<Button
												v-if="!recordDetails.isEditMode"
												size="sm"
												variant="outline"
												@click="startCoverEdit"
											>
												<ImagePlus class="mr-1.5 size-3.5" />
												Add cover
											</Button>
										</div>
									</template>
								</ImageRecordCover>
								<button
									v-if="recordDetails.isEditMode && coverInputMode === 'upload'"
									type="button"
									class="focus-visible:ring-ring absolute inset-0 flex items-end justify-center bg-linear-to-t from-black/65 via-transparent to-transparent p-4 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
									@click="chooseCoverFile"
								>
									<span
										class="rounded bg-black/65 px-3 py-1.5 text-xs font-medium text-white"
									>
										{{ pendingCoverFile ? 'Replace image' : 'Choose image' }}
									</span>
								</button>
							</div>

							<input
								ref="fileInputRef"
								type="file"
								data-testid="record-cover-file-input"
								accept="image/jpeg,image/png,image/webp"
								class="sr-only"
								@change="handleFileInput"
							/>

							<template v-if="recordDetails.isEditMode">
								<div
									class="border-border bg-background grid w-full grid-cols-2 overflow-hidden rounded-md border p-0.5"
								>
									<Button
										variant="ghost"
										size="sm"
										class="h-8 min-w-0 overflow-hidden rounded-sm px-1.5 text-[11px] [&_svg]:size-3.5"
										:class="coverInputMode === 'upload' && 'bg-muted'"
										@click="selectUploadMode"
									>
										<Upload class="mr-1 shrink-0" />
										Upload
									</Button>
									<Button
										variant="ghost"
										size="sm"
										class="h-8 min-w-0 overflow-hidden rounded-sm px-1.5 text-[11px] [&_svg]:size-3.5"
										:class="coverInputMode === 'url' && 'bg-muted'"
										@click="selectUrlMode"
									>
										<Link class="mr-1 shrink-0" />
										Image URL
									</Button>
								</div>

								<div v-if="coverInputMode === 'upload'" class="space-y-2">
									<Button
										ref="filePickerButtonRef"
										variant="outline"
										class="w-full"
										@click="chooseCoverFile"
									>
										<Upload class="mr-2 size-4" />
										{{
											pendingCoverFile ? 'Choose another image' : 'Choose image'
										}}
									</Button>
									<p
										class="text-muted-foreground text-center text-[11px] leading-relaxed"
									>
										JPG, PNG or WebP · max 10 MB · saved as 1200 px WebP
									</p>
								</div>

								<div v-else class="space-y-2">
									<Label for="record-cover-url" class="text-xs">
										External image URL
									</Label>
									<Input
										id="record-cover-url"
										v-model="coverValue"
										name="cover"
										placeholder="https://example.com/cover.jpg"
										class="text-xs"
										:class="{ 'border-destructive': !!errors.cover }"
									/>
									<p v-if="errors.cover" class="text-destructive text-xs">
										{{ errors.cover }}
									</p>
									<p
										v-if="recordDetails.selectedRecord?.cover_storage_path"
										class="text-muted-foreground text-[11px]"
									>
										Saving switches from the uploaded image to this URL.
									</p>
								</div>

								<div
									v-if="
										pendingCoverFile &&
										(pendingImageIsLandscape || pendingImageIsPortrait)
									"
									class="border-border bg-muted/40 space-y-3 rounded-md border p-3"
								>
									<div class="flex items-center justify-between gap-2">
										<p class="text-xs font-medium">Square crop position</p>
										<Button
											variant="ghost"
											size="icon"
											class="size-6"
											title="Centre crop"
											@click="cropPositionX = cropPositionY = 50"
										>
											<RotateCcw class="size-3.5" />
										</Button>
									</div>
									<label v-if="pendingImageIsLandscape" class="block space-y-1">
										<span class="text-muted-foreground text-[10px] uppercase">
											Horizontal
										</span>
										<input
											v-model.number="cropPositionX"
											type="range"
											min="0"
											max="100"
											class="accent-primary w-full"
										/>
									</label>
									<label v-if="pendingImageIsPortrait" class="block space-y-1">
										<span class="text-muted-foreground text-[10px] uppercase">
											Vertical
										</span>
										<input
											v-model.number="cropPositionY"
											type="range"
											min="0"
											max="100"
											class="accent-primary w-full"
										/>
									</label>
								</div>

								<p v-if="pendingCoverError" class="text-destructive text-xs">
									{{ pendingCoverError }}
								</p>

								<Button
									v-if="hasVisibleCover"
									variant="destructive-ghost"
									size="sm"
									class="text-destructive w-full"
									@click="removeCover"
								>
									<Trash2 class="mr-1.5 size-3.5" />
									Remove cover
								</Button>
							</template>
						</div>

						<!-- Record Info -->
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
						</div>
					</div>

					<!-- Artists -->
					<TableArtistsEditable
						v-model="safeArtistsValue"
						:is-edit-mode="recordDetails.isEditMode"
						label="Artists"
					/>

					<!-- Labels -->
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
							:loading="records.isUpdatingRecord || records.isUpdatingCover"
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
