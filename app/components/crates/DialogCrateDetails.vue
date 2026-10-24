<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Disc3, Pencil, PencilOff, Plus, Trash2 } from '@lucide/vue'
import { toTypedFormSchema } from '~/utils/toTypedFormSchema'
import { useForm } from 'vee-validate'
import { crateSchema } from '~/utils/schemas/crate'
import {
	crateEditorBaseline,
	crateEditorChanges,
	crateEditorPatch
} from '~/utils/metadataEditor'
import type { LibraryCrate } from '~~/shared/types/library'

const props = defineProps<{
	open: boolean
	crate: LibraryCrate
}>()

const emit = defineEmits<{
	'update:open': [value: boolean]
	delete: [crate: LibraryCrate]
	addRecord: [crate: LibraryCrate]
}>()

const records = useWorkbenchRecordsStore()
const cratesStore = useWorkbenchCratesStore()
const runtime = useWorkbenchRuntime()

// Edit mode state
const isEditMode = ref(false)
const showUnsavedChangesAlert = ref(false)
const isFormInitialized = ref(false)
const isSubmitting = ref(false)
const editBaseline = shallowRef<ReturnType<typeof crateEditorBaseline> | null>(
	null
)
const editConflict = shallowRef<{
	latest: ReturnType<typeof crateEditorBaseline> | null
} | null>(null)
let dialogGeneration = 0
let nextSubmissionId = 0
let activeSubmissionId: number | null = null

// Form setup
const validationSchema = toTypedFormSchema(crateSchema)

const form = useForm({
	validationSchema,
	initialValues: {
		name: '',
		description: ''
	}
})

const { handleSubmit, errors, resetForm, values, meta } = form
const [nameValue] = form.defineField('name')
const [descriptionValue] = form.defineField('description')

const colorValue = ref<string | null>(null)
const conflictChanges = computed(() =>
	editBaseline.value && editConflict.value?.latest
		? crateEditorChanges(
				editBaseline.value.payload,
				editConflict.value.latest.payload
			)
		: []
)

function editorPayload(formValues: { name?: string; description?: string }) {
	return {
		name: (formValues.name || '').trim(),
		description: formValues.description?.trim() || null,
		color: colorValue.value
	}
}

function reviewLatestCrate() {
	const latest = editConflict.value?.latest
	if (!latest || !editBaseline.value) return
	const edits = crateEditorPatch(
		editBaseline.value.payload,
		editorPayload(values)
	)
	const reviewed = { ...latest.payload, ...edits }
	editBaseline.value = latest
	resetForm({
		values: { name: reviewed.name, description: reviewed.description || '' }
	})
	colorValue.value = reviewed.color
	editConflict.value = null
}

const descriptionLength = computed(() => descriptionValue.value?.length || 0)

const crateRecords = computed(() =>
	records.getRecordsByIds(props.crate.records)
)

const recordCount = computed(() => props.crate.records.length)

function initializeFormFromCrate(crate: LibraryCrate) {
	editBaseline.value = crateEditorBaseline(crate)
	editConflict.value = null
	resetForm({
		values: {
			name: crate.name,
			description: crate.description || ''
		}
	})
	colorValue.value = crate.color
	isFormInitialized.value = true
}

// Initialize form when entering edit mode
watch(
	[() => props.crate, () => isEditMode.value],
	([crate, editMode]) => {
		if (crate && editMode && !isFormInitialized.value) {
			initializeFormFromCrate(crate)
		} else if (!editMode) {
			isFormInitialized.value = false
		}
	},
	{ immediate: true }
)

watch(
	isEditMode,
	() => {
		dialogGeneration += 1
		activeSubmissionId = null
		isSubmitting.value = false
		if (!isEditMode.value) {
			editBaseline.value = null
			editConflict.value = null
		}
	},
	{ flush: 'sync' }
)

// A different selected crate or dialog lifetime cannot inherit a pending save.
watch(
	[() => props.open, () => props.crate.id],
	() => {
		dialogGeneration += 1
		activeSubmissionId = null
		isSubmitting.value = false
		isEditMode.value = false
		isFormInitialized.value = false
		showUnsavedChangesAlert.value = false
		resetForm()
	},
	{ flush: 'sync' }
)

function hasFormChanges(): boolean {
	if (!isEditMode.value || !isFormInitialized.value) return false

	return (
		!!editBaseline.value &&
		Object.keys(
			crateEditorPatch(editBaseline.value.payload, editorPayload(values))
		).length > 0
	)
}

function handleToggleEditMode() {
	if (isEditMode.value && hasFormChanges()) {
		showUnsavedChangesAlert.value = true
	} else {
		isEditMode.value = !isEditMode.value
	}
}

function handleCloseDialog() {
	if (isEditMode.value && hasFormChanges()) {
		showUnsavedChangesAlert.value = true
	} else {
		emit('update:open', false)
	}
}

function confirmDiscardAndProceed() {
	showUnsavedChangesAlert.value = false
	isFormInitialized.value = false
	isEditMode.value = false
	resetForm()
	emit('update:open', false)
}

const saveChanges = handleSubmit(async (formValues) => {
	if (
		isSubmitting.value ||
		editConflict.value ||
		!editBaseline.value ||
		!props.open
	)
		return
	const baseline = editBaseline.value
	const generation = dialogGeneration
	const submissionId = ++nextSubmissionId
	const context = runtime.capture().context
	activeSubmissionId = submissionId
	isSubmitting.value = true
	const ownsActiveEditor = () =>
		activeSubmissionId === submissionId &&
		dialogGeneration === generation &&
		props.open &&
		props.crate.id === baseline.id &&
		isEditMode.value &&
		runtime.isCurrent(context)
	try {
		const result = await cratesStore.updateCrate(
			baseline.id,
			crateEditorPatch(baseline.payload, editorPayload(formValues)),
			{
				expectedUpdatedAt: baseline.expectedUpdatedAt,
				onConflict(latest) {
					if (ownsActiveEditor())
						editConflict.value = {
							latest: latest ? crateEditorBaseline(latest) : null
						}
				}
			}
		)
		if (result && ownsActiveEditor()) {
			isEditMode.value = false
			isFormInitialized.value = false
		}
	} finally {
		if (ownsActiveEditor()) {
			activeSubmissionId = null
			isSubmitting.value = false
		}
	}
})

async function removeRecord(recordId: string) {
	const record = records.getRecordById(recordId)
	const recordTitle = record?.title || 'Record'
	const crateId = props.crate.id

	const success = await cratesStore.removeRecordFromCrate(crateId, recordId)

	if (success) {
		toast(`${recordTitle} removed from crate`, {
			id: 'crate-record-removed',
			duration: 5000,
			action: {
				label: 'Undo',
				onClick: () => {
					cratesStore.addRecordToCrate(crateId, recordId, { silent: true })
				}
			}
		})
	}
}

function handleDelete() {
	emit('delete', props.crate)
}

function handleAddRecord() {
	emit('addRecord', props.crate)
}

function handleInteractOutside(event: Event) {
	const target = event.target as HTMLElement
	if (target?.closest('[data-sonner-toast]')) {
		event.preventDefault()
	}
}
</script>

<template>
	<Dialog :open="open" @update:open="handleCloseDialog">
		<DialogContent
			class="flex h-[90dvh] max-w-2xl flex-col gap-0 p-0"
			@interact-outside="handleInteractOutside"
		>
			<!-- Header -->
			<DialogHeader class="space-y-3 border-b p-6 pb-4">
				<!-- View mode -->
				<template v-if="!isEditMode">
					<div class="flex items-center gap-2">
						<div
							v-if="crate.color"
							class="size-4 shrink-0 rounded-full"
							:style="{ backgroundColor: crate.color }"
						/>
						<DialogTitle class="truncate">{{ crate.name }}</DialogTitle>
					</div>
					<DialogDescription v-if="crate.description" class="text-left">
						{{ crate.description }}
					</DialogDescription>
					<DialogDescription v-else class="sr-only">
						Crate details
					</DialogDescription>
					<div class="flex items-center justify-between">
						<Badge variant="secondary" class="w-fit">
							<Disc3 class="mr-1 size-3" />
							{{ recordCount }} {{ recordCount === 1 ? 'record' : 'records' }}
						</Badge>
						<Button
							variant="outline"
							size="sm"
							class="w-fit shrink-0"
							@click="handleAddRecord"
						>
							<Plus class="mr-2 size-4" />
							Add records
						</Button>
						<div class="flex gap-1">
							<Button
								variant="outline"
								size="icon"
								title="Edit crate"
								aria-label="Edit crate"
								@click="handleToggleEditMode"
							>
								<Pencil class="size-4" />
							</Button>
							<Button
								variant="outline"
								size="icon"
								title="Delete crate"
								aria-label="Delete crate"
								@click="handleDelete"
							>
								<Trash2 class="text-destructive size-4" />
							</Button>
						</div>
					</div>
				</template>

				<!-- Edit mode -->
				<template v-else>
					<div class="flex items-center justify-between">
						<DialogTitle>Edit Crate</DialogTitle>
						<Button
							variant="ghost"
							size="icon"
							title="Cancel edit"
							aria-label="Cancel edit"
							@click="handleToggleEditMode"
						>
							<PencilOff class="size-4" />
						</Button>
					</div>
					<DialogDescription class="sr-only">
						Edit crate details
					</DialogDescription>
					<div class="space-y-3">
						<NoticeMetadataEditConflict
							v-if="editConflict"
							entity="crate"
							:has-latest="!!editConflict.latest"
							:changes="conflictChanges"
							@review="reviewLatestCrate"
						/>
						<FormItem>
							<Label for="edit-name">
								Name
								<span class="text-primary -ml-0.5">*</span>
							</Label>
							<Input
								id="edit-name"
								v-model="nameValue"
								name="name"
								placeholder="Crate name"
								maxlength="50"
								:class="{ 'border-destructive': !!errors.name }"
							/>
							<p v-if="errors.name" class="text-destructive text-sm">
								{{ errors.name }}
							</p>
						</FormItem>
						<FormItem>
							<Label for="edit-description">Description</Label>
							<Textarea
								id="edit-description"
								v-model="descriptionValue"
								name="description"
								placeholder="Keep it short - a few words about this crate"
								maxlength="100"
								rows="2"
								:class="{ 'border-destructive': !!errors.description }"
							/>
							<div class="flex justify-between">
								<p v-if="errors.description" class="text-destructive text-sm">
									{{ errors.description }}
								</p>
								<span class="text-muted-foreground ml-auto text-xs">
									{{ descriptionLength }}/100
								</span>
							</div>
						</FormItem>
						<div class="flex items-end justify-between gap-4">
							<div class="space-y-2">
								<Label>Color</Label>
								<PickerColor v-model="colorValue" />
							</div>
							<ButtonLoading
								:loading="isSubmitting"
								:disabled="!meta.valid || !!editConflict"
								@click="saveChanges"
							>
								Save
							</ButtonLoading>
						</div>
					</div>
				</template>
			</DialogHeader>

			<!-- Content -->
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden py-4 pr-2 pl-6">
				<div
					v-if="crateRecords.length === 0"
					class="flex min-h-50 flex-col items-center justify-center text-center"
				>
					<div class="bg-muted mb-4 rounded-full p-4">
						<Disc3 class="text-muted-foreground size-8" />
					</div>
					<p class="text-muted-foreground text-sm">
						No records in this crate yet.
					</p>
				</div>

				<ScrollArea v-else class="h-full">
					<div class="pr-4">
						<ListCrateRecords :records="crateRecords" @remove="removeRecord" />
					</div>
				</ScrollArea>
			</div>

			<!-- Footer -->
			<DialogFooter class="bg-background relative z-10 gap-2 border-t p-6 pt-4">
				<Button variant="secondary" @click="handleCloseDialog">Close</Button>
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
