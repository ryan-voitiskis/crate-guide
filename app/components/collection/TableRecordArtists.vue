<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import { Check, GripVertical, Pencil, Plus, Trash, X } from 'lucide-vue-next'
import { z } from 'zod'

const recordDetails = useRecordDetailsStore()

const artistSchema = z.object({
	discogs_id: z
		.string()
		.refine(
			(val) => val === '' || /^\d+$/.test(val),
			'Discogs ID must be a number.'
		)
		.refine(
			(val) => val === '' || (Number(val) >= 1 && Number(val) <= 999999999),
			'Discogs ID must be between 1 and 999999999'
		),
	name: z.string().min(1, 'Artist name is required.').trim(),
	role: z.string().trim().optional()
})

type ArtistFormData = z.infer<typeof artistSchema>

const inputFields = [
	{
		key: 'discogs_id' as const,
		placeholder: '1453529',
		class: 'w-20 text-xs',
		displayValue: (artist: any) => artist.discogs_id || '–',
		displayClass: 'text-muted-foreground text-xs'
	},
	{
		key: 'name' as const,
		placeholder: 'Artist name',
		class: 'text-sm',
		displayValue: (artist: any) => artist.name,
		displayClass: 'text-sm font-medium'
	},
	{
		key: 'role' as const,
		placeholder: 'e.g., Producer, Remix',
		class: 'text-sm',
		displayValue: (artist: any) => artist.role || '–',
		displayClass: 'text-muted-foreground text-sm'
	}
]

const formMode = ref<'edit' | 'new' | null>(null)
const editingIndex = ref<number | null>(null)
const formData = ref<ArtistFormData>({
	discogs_id: '',
	name: '',
	role: ''
})
const formErrors = ref<z.ZodFormattedError<ArtistFormData> | null>(null)

const isFormActive = computed(() => formMode.value !== null)
const canSave = computed(() => {
	const result = artistSchema.safeParse(formData.value)
	return result.success
})

const isEditingRow = (index: number) =>
	formMode.value === 'edit' && editingIndex.value === index

const hasFieldError = (field: keyof ArtistFormData) =>
	formErrors.value?.[field]?._errors?.length

const shouldShowValidation = ref(false)

function validateForm() {
	const result = artistSchema.safeParse(formData.value)
	formErrors.value = result.success ? null : result.error.format()
	return result.success
}

function handleInputBlur(field: keyof ArtistFormData) {
	if (!formData.value[field] || formData.value[field].trim() === '') {
		shouldShowValidation.value = true
		validateForm()
	}
}

watch(
	formData,
	() => {
		if (formMode.value) validateForm()
	},
	{ deep: true }
)

function startEdit(index: number) {
	const artist = recordDetails.recordForm.artists[index]
	if (!artist) return

	formData.value = {
		discogs_id: artist.discogs_id?.toString() || '',
		name: artist.name,
		role: artist.role || ''
	}
	formMode.value = 'edit'
	editingIndex.value = index
	formErrors.value = null
	shouldShowValidation.value = false
}

function startAddNew() {
	formMode.value = 'new'
	formData.value = { discogs_id: '', name: '', role: '' }
	formErrors.value = null
	shouldShowValidation.value = false
}

function cancelForm() {
	formMode.value = null
	editingIndex.value = null
	formData.value = { discogs_id: '', name: '', role: '' }
	formErrors.value = null
	shouldShowValidation.value = false
}

function saveArtist() {
	if (!formMode.value) return

	shouldShowValidation.value = true
	const isValid = validateForm()

	if (!isValid) return

	const parsedData = artistSchema.parse(formData.value)
	const artistData = {
		discogs_id: parsedData.discogs_id
			? parseInt(parsedData.discogs_id, 10)
			: undefined,
		name: parsedData.name,
		role: parsedData.role || null
	}

	if (formMode.value === 'edit' && editingIndex.value !== null)
		recordDetails.recordForm.artists[editingIndex.value] = artistData
	else if (formMode.value === 'new')
		recordDetails.recordForm.artists.push(artistData)

	cancelForm()
}

function removeArtist(index: number) {
	recordDetails.recordForm.artists.splice(index, 1)
	if (editingIndex.value === index) cancelForm()
}

const sortableRef = ref<HTMLElement>()
const sortableOptions = reactive({
	handle: '.drag-handle',
	disabled: false,
	animation: 150,
	ghostClass: 'opacity-50'
})

watchEffect(() => {
	sortableOptions.disabled = isFormActive.value
})

useSortable(sortableRef, recordDetails.recordForm.artists, sortableOptions)

function getFirstError(
	errors: z.ZodFormattedError<ArtistFormData> | null
): string | null {
	if (!errors) return null
	if (errors.name?._errors?.length) return errors.name._errors[0]!
	if (errors.discogs_id?._errors?.length) return errors.discogs_id._errors[0]!
	if (errors.role?._errors?.length) return errors.role._errors[0]!

	return null
}
</script>

<template>
	<div class="col-span-3 space-y-2">
		<div class="flex items-center justify-between">
			<Label>Artists ({{ recordDetails.recordForm.artists.length }})</Label>
			<Button
				v-if="recordDetails.isEditMode"
				@click="startAddNew"
				size="sm"
				variant="outline"
				:disabled="isFormActive"
			>
				<Plus class="mr-1 size-4" />
				Add Artist
			</Button>
		</div>

		<!-- Artists Table -->
		<div
			v-if="recordDetails.recordForm.artists.length || formMode === 'new'"
			class="overflow-hidden rounded-md border"
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead v-if="recordDetails.isEditMode" class="w-12">
							<span class="sr-only">Drag</span>
						</TableHead>
						<TableHead class="w-24">Discogs ID</TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Role</TableHead>
						<TableHead v-if="recordDetails.isEditMode" class="w-24">
							Actions
						</TableHead>
					</TableRow>
				</TableHeader>
				<tbody ref="sortableRef">
					<TableRow
						v-for="(artist, index) in recordDetails.recordForm.artists"
						:key="`artist-${artist.name}-${index}`"
					>
						<!-- Drag Handle -->
						<TableCell v-if="recordDetails.isEditMode">
							<div
								class="drag-handle text-muted-foreground hover:text-foreground flex cursor-grab items-center justify-center transition-colors active:cursor-grabbing"
								:class="{ 'cursor-not-allowed opacity-50': isFormActive }"
							>
								<GripVertical class="size-4" />
							</div>
						</TableCell>

						<!-- Loop through input fields -->
						<TableCell v-for="field in inputFields" :key="field.key">
							<Input
								v-if="isEditingRow(index)"
								v-model="formData[field.key]"
								:name="field.key"
								:placeholder="field.placeholder"
								:class="[
									field.class,
									{
										'border-destructive':
											shouldShowValidation && hasFieldError(field.key)
									}
								]"
								@keydown.enter="saveArtist"
								@keydown.escape="cancelForm"
								@blur="handleInputBlur(field.key)"
							/>
							<span v-else :class="field.displayClass">
								{{ field.displayValue(artist) }}
							</span>
						</TableCell>

						<!-- Actions -->
						<TableCell v-if="recordDetails.isEditMode">
							<div v-if="isEditingRow(index)" class="flex gap-1">
								<Button
									@click="saveArtist"
									size="icon"
									variant="ghost"
									:class="[canSave ? 'text-green-600' : 'text-gray-400']"
								>
									<Check />
								</Button>
								<Button
									@click="cancelForm"
									size="icon"
									variant="ghost"
									class="text-muted-foreground"
								>
									<X />
								</Button>
							</div>
							<div v-else class="flex justify-end gap-1">
								<Button
									@click="startEdit(index)"
									size="icon"
									variant="ghost"
									:disabled="isFormActive"
								>
									<Pencil />
								</Button>
								<Button
									@click="removeArtist(index)"
									size="icon"
									variant="destructive-ghost"
									:disabled="isFormActive"
								>
									<Trash />
								</Button>
							</div>
						</TableCell>
					</TableRow>
				</tbody>

				<!-- Add New Artist Row (outside draggable) -->
				<tbody v-if="formMode === 'new'">
					<TableRow>
						<TableCell v-if="recordDetails.isEditMode">
							<!-- Empty cell for drag handle -->
						</TableCell>

						<!-- Loop through input fields for new row -->
						<TableCell v-for="field in inputFields" :key="field.key">
							<Input
								v-model="formData[field.key]"
								:name="`new_${field.key}`"
								:placeholder="field.placeholder"
								:class="[
									field.class,
									{
										'border-destructive':
											shouldShowValidation && hasFieldError(field.key)
									}
								]"
								@keydown.enter="saveArtist"
								@keydown.escape="cancelForm"
								@blur="handleInputBlur(field.key)"
							/>
						</TableCell>

						<TableCell>
							<div class="flex gap-1">
								<Button
									@click="saveArtist"
									size="icon"
									variant="ghost"
									:class="[canSave ? 'text-green-600' : 'text-gray-400']"
								>
									<Check />
								</Button>
								<Button
									@click="cancelForm"
									size="icon"
									variant="ghost"
									class="text-muted-foreground"
								>
									<X />
								</Button>
							</div>
						</TableCell>
					</TableRow>
				</tbody>
			</Table>
		</div>

		<!-- Form Error Display -->
		<NoticeError
			v-if="formMode && shouldShowValidation && getFirstError(formErrors)"
		>
			{{ getFirstError(formErrors) }}
		</NoticeError>

		<!-- Empty State (read-only mode) -->
		<div v-else-if="!recordDetails.isEditMode" class="space-y-1">
			<div
				v-if="!recordDetails.selectedRecord?.artists?.length"
				class="text-muted-foreground text-sm"
			>
				No artists
			</div>
		</div>

		<!-- Empty State (edit mode) -->
		<div
			v-else-if="!recordDetails.recordForm.artists.length"
			class="text-muted-foreground py-4 text-center text-sm"
		>
			No artists. Click "Add Artist" to get started.
		</div>
	</div>
</template>
