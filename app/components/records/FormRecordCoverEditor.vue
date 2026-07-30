<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { ImagePlus, Link, RotateCcw, Trash2, Upload } from '@lucide/vue'
import type {
	CoverReference,
	LibraryCoverChange,
	LibraryRecord
} from '~~/shared/types/library'

type RecordCoverEditorHandle = {
	focus: () => Promise<void>
	getChange: () => LibraryCoverChange
	hasPendingChange: () => boolean
	reset: () => void
}

const props = defineProps<{
	record: Pick<LibraryRecord, 'title' | 'cover'> | null
	isEditMode: boolean
	urlError?: string
}>()

const emit = defineEmits<{
	startEdit: []
}>()

const coverUrl = defineModel<string>({ default: '' })
const inputMode = ref<'upload' | 'url'>('upload')
const pendingFile = ref<File | null>(null)
const pendingPreviewUrl = ref<string | null>(null)
const pendingRemoval = ref(false)
const pendingError = ref('')
const pendingDimensions = ref({ width: 0, height: 0 })
const cropPositionX = ref(50)
const cropPositionY = ref(50)
const fileInputRef = ref<HTMLInputElement>()
const filePickerButtonRef = ref<ComponentPublicInstance>()
const editorRef = ref<HTMLElement>()
let inspectionGeneration = 0

function coverReferenceFromUrl(url: string | null | undefined): CoverReference {
	return url ? { kind: 'external', url } : { kind: 'none' }
}

const previewRecord = computed(() => {
	const title = props.record?.title || 'Record'

	if (pendingPreviewUrl.value) {
		return {
			title,
			cover: coverReferenceFromUrl(pendingPreviewUrl.value)
		}
	}

	if (pendingRemoval.value || inputMode.value === 'url') {
		return {
			title,
			cover: coverReferenceFromUrl(coverUrl.value)
		}
	}

	return {
		title,
		cover: props.record?.cover ?? coverReferenceFromUrl(coverUrl.value)
	}
})

const previewObjectPosition = computed(
	() => `${cropPositionX.value}% ${cropPositionY.value}%`
)
const pendingImageIsLandscape = computed(
	() => pendingDimensions.value.width > pendingDimensions.value.height
)
const pendingImageIsPortrait = computed(
	() => pendingDimensions.value.height > pendingDimensions.value.width
)
const hasVisibleCover = computed(() =>
	hasRecordCover(previewRecord.value.cover)
)

function revokePendingPreview(): void {
	if (!pendingPreviewUrl.value) return
	URL.revokeObjectURL(pendingPreviewUrl.value)
	pendingPreviewUrl.value = null
}

function advanceInspectionGeneration(): number {
	inspectionGeneration += 1
	return inspectionGeneration
}

function clearPendingFile(): void {
	advanceInspectionGeneration()
	revokePendingPreview()
	pendingFile.value = null
	pendingError.value = ''
	pendingDimensions.value = { width: 0, height: 0 }
	if (fileInputRef.value) fileInputRef.value.value = ''
}

function reset(): void {
	clearPendingFile()
	pendingRemoval.value = false
	cropPositionX.value = 50
	cropPositionY.value = 50
	inputMode.value = 'upload'
}

async function inspectFile(file: File): Promise<void> {
	const currentInspection = advanceInspectionGeneration()
	const fileError = validateRecordCoverFile(file)
	if (fileError) {
		pendingError.value = fileError
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

		if (currentInspection !== inspectionGeneration) {
			URL.revokeObjectURL(previewUrl)
			return
		}

		const dimensionError = validateRecordCoverDimensions(
			image.naturalWidth,
			image.naturalHeight
		)
		if (dimensionError) throw new Error(dimensionError)

		revokePendingPreview()
		pendingPreviewUrl.value = previewUrl
		pendingFile.value = file
		pendingRemoval.value = false
		pendingError.value = ''
		pendingDimensions.value = {
			width: image.naturalWidth,
			height: image.naturalHeight
		}
		cropPositionX.value = 50
		cropPositionY.value = 50
	} catch (error) {
		URL.revokeObjectURL(previewUrl)
		if (currentInspection !== inspectionGeneration) return
		pendingError.value =
			error instanceof Error ? error.message : 'The image could not be read.'
	}
}

function handleFileInput(event: Event): void {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (file) void inspectFile(file)
}

function handleDrop(event: DragEvent): void {
	if (!props.isEditMode || inputMode.value !== 'upload') return
	const file = event.dataTransfer?.files[0]
	if (file) void inspectFile(file)
}

function chooseFile(): void {
	fileInputRef.value?.click()
}

function removeCover(): void {
	clearPendingFile()
	if (props.record && isManagedRecordCover(props.record.cover)) {
		pendingRemoval.value = true
		return
	}
	coverUrl.value = ''
}

function selectUploadMode(): void {
	inputMode.value = 'upload'
	pendingRemoval.value = false
}

function selectUrlMode(): void {
	clearPendingFile()
	inputMode.value = 'url'
	pendingRemoval.value = Boolean(
		props.record && isManagedRecordCover(props.record.cover)
	)
}

function hasPendingChange(): boolean {
	return pendingFile.value !== null || pendingRemoval.value
}

function getChange(): LibraryCoverChange {
	if (pendingFile.value) {
		return {
			type: 'upload',
			file: pendingFile.value,
			crop: {
				positionX: cropPositionX.value,
				positionY: cropPositionY.value
			}
		}
	}
	return pendingRemoval.value ? { type: 'remove' } : { type: 'keep' }
}

async function focus(): Promise<void> {
	await nextTick()
	editorRef.value?.scrollIntoView({ block: 'nearest' })
	filePickerButtonRef.value?.$el?.focus()
}

onUnmounted(() => {
	advanceInspectionGeneration()
	revokePendingPreview()
})

defineExpose<RecordCoverEditorHandle>({
	focus,
	getChange,
	hasPendingChange,
	reset
})
</script>

<template>
	<div ref="editorRef" class="space-y-3">
		<div class="flex items-center justify-between gap-2">
			<Label>Cover artwork</Label>
			<span
				v-if="record && isManagedRecordCover(record.cover)"
				class="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wide uppercase"
			>
				Managed image
			</span>
		</div>
		<div
			class="group border-border relative aspect-square overflow-hidden rounded-lg border"
			:class="
				isEditMode && inputMode === 'upload'
					? 'hover:border-primary/70 border-dashed'
					: ''
			"
			@dragover.prevent
			@drop.prevent="handleDrop"
		>
			<ImageRecordCover
				:record="previewRecord"
				:object-position="previewObjectPosition"
				show-label
				class="size-full"
			>
				<template #missing>
					<div class="flex flex-col items-center gap-3 px-6 text-center">
						<ImagePlus class="text-muted-foreground size-9 stroke-[1.4]" />
						<div>
							<p class="text-sm font-medium">No cover artwork</p>
							<p class="text-muted-foreground mt-1 text-xs">
								{{
									isEditMode
										? 'Drop an image here or choose a file.'
										: 'Discogs does not have artwork for this release.'
								}}
							</p>
						</div>
						<Button
							v-if="!isEditMode"
							size="sm"
							variant="outline"
							@click="emit('startEdit')"
						>
							<ImagePlus class="mr-1.5 size-3.5" />
							Add cover
						</Button>
					</div>
				</template>
			</ImageRecordCover>
			<button
				v-if="isEditMode && inputMode === 'upload'"
				type="button"
				class="focus-visible:ring-ring absolute inset-0 flex items-end justify-center bg-linear-to-t from-black/65 via-transparent to-transparent p-4 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
				@click="chooseFile"
			>
				<span
					class="rounded bg-black/65 px-3 py-1.5 text-xs font-medium text-white"
				>
					{{ pendingFile ? 'Replace image' : 'Choose image' }}
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

		<template v-if="isEditMode">
			<div
				class="border-border bg-background grid w-full grid-cols-2 overflow-hidden rounded-md border p-0.5"
			>
				<Button
					variant="ghost"
					size="sm"
					class="h-8 min-w-0 overflow-hidden rounded-sm px-1.5 text-[11px] [&_svg]:size-3.5"
					:class="inputMode === 'upload' && 'bg-muted'"
					@click="selectUploadMode"
				>
					<Upload class="mr-1 shrink-0" />
					Upload
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="h-8 min-w-0 overflow-hidden rounded-sm px-1.5 text-[11px] [&_svg]:size-3.5"
					:class="inputMode === 'url' && 'bg-muted'"
					@click="selectUrlMode"
				>
					<Link class="mr-1 shrink-0" />
					Image URL
				</Button>
			</div>

			<div v-if="inputMode === 'upload'" class="space-y-2">
				<Button
					ref="filePickerButtonRef"
					variant="outline"
					class="w-full"
					@click="chooseFile"
				>
					<Upload class="mr-2 size-4" />
					{{ pendingFile ? 'Choose another image' : 'Choose image' }}
				</Button>
				<p
					class="text-muted-foreground text-center text-[11px] leading-relaxed"
				>
					JPG, PNG or WebP · max 10 MB · saved as 1200 px WebP
				</p>
			</div>

			<div v-else class="space-y-2">
				<Label for="record-cover-url" class="text-xs">External image URL</Label>
				<Input
					id="record-cover-url"
					v-model="coverUrl"
					name="cover"
					placeholder="https://example.com/cover.jpg"
					class="text-xs"
					:class="{ 'border-destructive': !!urlError }"
				/>
				<p v-if="urlError" class="text-destructive text-xs">
					{{ urlError }}
				</p>
				<p
					v-if="record && isManagedRecordCover(record.cover)"
					class="text-muted-foreground text-[11px]"
				>
					Saving switches from the uploaded image to this URL.
				</p>
			</div>

			<div
				v-if="
					pendingFile && (pendingImageIsLandscape || pendingImageIsPortrait)
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

			<p v-if="pendingError" class="text-destructive text-xs">
				{{ pendingError }}
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
</template>
