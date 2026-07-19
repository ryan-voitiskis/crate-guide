<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useSortable } from '@vueuse/integrations/useSortable'
import { Check, GripVertical, Pencil, Plus, Trash, X } from 'lucide-vue-next'
import { useForm } from 'vee-validate'
import { z } from 'zod'

const props = defineProps<{
	modelValue: DiscogsArtistDb[]
	isEditMode?: boolean
	label?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: DiscogsArtistDb[]] }>()

const artists = computed({
	get: () => props.modelValue,
	set: (value) => emit('update:modelValue', value)
})

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

const validationSchema = toTypedSchema(artistSchema)

const formMode = ref<'edit' | 'new' | null>(null)
const editingIndex = ref<number | null>(null)
const submitAttempted = ref(false)

const form = useForm({
	validationSchema,
	initialValues: {
		discogs_id: '',
		name: '',
		role: ''
	}
})

const { handleSubmit, resetForm, setValues, meta } = form

const [discogsIdValue, discogsIdMeta] = form.defineField('discogs_id')
const [nameValue, nameMeta] = form.defineField('name')
const [roleValue, roleMeta] = form.defineField('role')

const fields = {
	discogs_id: { value: discogsIdValue, meta: discogsIdMeta },
	name: { value: nameValue, meta: nameMeta },
	role: { value: roleValue, meta: roleMeta }
}

const shouldShowFieldError = (fieldKey: keyof typeof fields) => {
	return (
		(fields[fieldKey].meta.value.touched || submitAttempted.value) &&
		!!form.errors.value[fieldKey]
	)
}

const fieldConfig = [
	{
		key: 'discogs_id' as const,
		placeholder: '1453529',
		class: 'text-xs',
		displayValue: (artist: DiscogsArtistDb) => artist.discogs_id || '–',
		displayClass: 'text-muted-foreground text-xs',
		field: fields.discogs_id
	},
	{
		key: 'name' as const,
		placeholder: 'Artist name',
		class: 'text-sm',
		displayValue: (artist: DiscogsArtistDb) => artist.name,
		displayClass: 'text-sm font-medium',
		field: fields.name
	},
	{
		key: 'role' as const,
		placeholder: 'e.g., Producer, Remix',
		class: 'text-sm',
		displayValue: (artist: DiscogsArtistDb) => artist.role || '–',
		displayClass: 'text-muted-foreground text-sm',
		field: fields.role
	}
]

const isFormActive = computed(() => formMode.value !== null)

const isEditingRow = (index: number) =>
	formMode.value === 'edit' && editingIndex.value === index

const firstError = computed(() => {
	for (const field of fieldConfig) {
		if (shouldShowFieldError(field.key) && form.errors.value[field.key])
			return form.errors.value[field.key]
	}
	return null
})

function startEdit(index: number) {
	const artist = artists.value[index]
	if (!artist) return

	setValues({
		discogs_id: artist.discogs_id?.toString() || '',
		name: artist.name,
		role: artist.role || ''
	})

	formMode.value = 'edit'
	editingIndex.value = index
	submitAttempted.value = false
	focusFirstField()
}

function startAddNew() {
	resetForm()
	formMode.value = 'new'
	submitAttempted.value = false
	focusFirstField()
}

function cancelForm() {
	formMode.value = null
	editingIndex.value = null
	submitAttempted.value = false
	resetForm()
}

function createArtistData(values: {
	discogs_id?: string
	name?: string
	role?: string
}) {
	return {
		discogs_id: values.discogs_id ? parseInt(values.discogs_id, 10) : undefined,
		name: values.name || '',
		role: values.role || null
	}
}

const saveArtist = handleSubmit(
	(values) => {
		if (!formMode.value) return

		const artistData = createArtistData(values)
		const updatedArtists = [...artists.value]

		if (formMode.value === 'edit' && editingIndex.value !== null)
			updatedArtists[editingIndex.value] = artistData
		else updatedArtists.push(artistData)

		emit('update:modelValue', updatedArtists)
		cancelForm()
	},
	() => (submitAttempted.value = true)
)

function removeArtist(index: number) {
	const updatedArtists = artists.value.filter((_, i) => i !== index)
	emit('update:modelValue', updatedArtists)
	if (editingIndex.value === index) cancelForm()
}

const firstFieldRef = ref()

function setFirstFieldRef(
	el: Element | ComponentPublicInstance | null,
	fieldIndex: number
) {
	if (fieldIndex === 0 && el) firstFieldRef.value = el
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

const { stop } = useSortable(sortableRef, artists, sortableOptions)

onUnmounted(() => stop())

async function focusFirstField() {
	await nextTick()
	firstFieldRef.value?.$el?.focus()
}
</script>

<template>
	<div class="space-y-2 md:col-span-3">
		<div class="flex items-center justify-between">
			<Label>{{ label || 'Artists' }} ({{ artists.length }})</Label>
			<Button
				v-if="isEditMode"
				size="sm"
				variant="outline"
				:disabled="isFormActive"
				@click="startAddNew"
			>
				<Plus class="mr-1 size-4" />
				Add Artist
			</Button>
		</div>

		<!-- Artists Table -->
		<div v-if="artists.length || formMode === 'new'" class="overflow-hidden">
			<Table>
				<TableHeader class="contents max-sm:hidden">
					<TableRow
						:class="[
							'grid hover:bg-transparent',
							isEditMode
								? 'grid-cols-[44px_64px_3fr_2fr_84px]'
								: 'grid-cols-[64px_3fr_2fr]'
						]"
					>
						<TableHead v-if="isEditMode" class="flex items-center p-1">
							<span class="sr-only">Drag</span>
						</TableHead>
						<TableHead class="flex items-center p-1">
							<IconDiscogs class="mr-2 size-4" />
							ID
						</TableHead>
						<TableHead class="flex items-center p-1">Name</TableHead>
						<TableHead class="flex items-center p-1">Role</TableHead>
						<TableHead v-if="isEditMode" class="flex items-center p-1">
							Actions
						</TableHead>
					</TableRow>
				</TableHeader>
				<tbody ref="sortableRef">
					<TableRow
						v-for="(artist, index) in artists"
						:key="`artist-${artist.name}-${index}`"
						:class="[
							'grid h-11! max-sm:h-auto!',
							isEditMode
								? 'grid-cols-[44px_64px_3fr_2fr_84px] max-sm:grid-cols-[44px_1fr_84px]'
								: 'grid-cols-[64px_3fr_2fr] max-sm:grid-cols-[1fr]'
						]"
					>
						<!-- Drag Handle -->
						<TableCell
							v-if="isEditMode"
							class="drag-handle text-muted-foreground hover:text-accent-foreground bp-0 flex h-11! w-full cursor-grab items-center justify-center whitespace-normal transition-colors active:cursor-grabbing max-sm:h-auto!"
							:class="{ 'cursor-not-allowed opacity-50': isFormActive }"
						>
							<GripVertical class="size-4" />
						</TableCell>

						<!-- Desktop: Loop through input fields -->
						<TableCell
							v-for="(field, fieldIndex) in fieldConfig"
							:key="field.key"
							class="hidden items-center overflow-hidden p-1 whitespace-normal sm:flex"
						>
							<Input
								v-if="isEditingRow(index)"
								:ref="(el) => setFirstFieldRef(el, fieldIndex)"
								v-model="field.field.value.value"
								:name="field.key"
								:placeholder="field.placeholder"
								class="px-1"
								:class="[
									field.class,
									{
										'border-destructive': shouldShowFieldError(field.key)
									}
								]"
								@keydown.enter="saveArtist"
								@keydown.escape.stop="cancelForm"
							/>
							<TooltipProvider v-else>
								<Tooltip>
									<TooltipTrigger as-child>
										<span :class="[field.displayClass, 'block truncate']">
											{{ field.displayValue(artist) }}
										</span>
									</TooltipTrigger>
									<TooltipContent
										v-if="
											field.displayValue(artist) &&
											field.displayValue(artist) !== '–'
										"
									>
										<p>{{ field.displayValue(artist) }}</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</TableCell>

						<!-- Mobile: Combined content -->
						<TableCell class="flex flex-col gap-2 p-2 sm:hidden">
							<!-- Edit mode: vertical form -->
							<div v-if="isEditingRow(index)" class="space-y-3">
								<div
									v-for="(field, fieldIndex) in fieldConfig"
									:key="field.key"
								>
									<Label
										:for="`${field.key}-${index}`"
										class="text-muted-foreground mb-1 block text-xs"
									>
										{{
											field.key === 'discogs_id'
												? 'Discogs ID'
												: field.key === 'name'
													? 'Name'
													: 'Role'
										}}
									</Label>
									<Input
										:id="`${field.key}-${index}`"
										:ref="(el) => setFirstFieldRef(el, fieldIndex)"
										v-model="field.field.value.value"
										:name="field.key"
										:placeholder="field.placeholder"
										:class="[
											field.class,
											{
												'border-destructive': shouldShowFieldError(field.key)
											}
										]"
										@keydown.enter="saveArtist"
										@keydown.escape.stop="cancelForm"
									/>
								</div>
							</div>
							<!-- Display mode: stacked values -->
							<div v-else>
								<div class="text-sm font-medium">{{ artist.name }}</div>
								<div v-if="artist.role" class="text-muted-foreground text-sm">
									{{ artist.role }}
								</div>
								<div
									v-if="artist.discogs_id"
									class="text-muted-foreground text-xs"
								>
									{{ artist.discogs_id }}
								</div>
							</div>
						</TableCell>

						<!-- Actions -->
						<TableCell
							v-if="isEditMode"
							class="flex h-11! items-center justify-end gap-1 p-1 whitespace-normal max-sm:h-auto!"
						>
							<Button
								v-if="isEditingRow(index)"
								size="icon"
								variant="ghost"
								title="Save artist"
								aria-label="Save artist"
								:class="[meta.valid ? 'text-green-600' : 'text-gray-400']"
								@click="saveArtist"
							>
								<Check />
							</Button>
							<Button
								v-else
								size="icon"
								variant="ghost"
								title="Edit artist"
								aria-label="Edit artist"
								:disabled="isFormActive"
								@click="startEdit(index)"
							>
								<Pencil />
							</Button>
							<Button
								v-if="isEditingRow(index)"
								size="icon"
								variant="ghost"
								title="Cancel edit"
								aria-label="Cancel edit"
								class="text-muted-foreground"
								@click="cancelForm"
							>
								<X />
							</Button>
							<Button
								v-else
								size="icon"
								variant="destructive-ghost"
								title="Remove artist"
								aria-label="Remove artist"
								:disabled="isFormActive"
								@click="removeArtist(index)"
							>
								<Trash />
							</Button>
						</TableCell>
					</TableRow>
				</tbody>

				<!-- Add New Artist Row (outside draggable) -->
				<tbody v-if="formMode === 'new'" class="contents">
					<TableRow
						:class="[
							'grid h-11! max-sm:h-auto!',
							isEditMode
								? 'grid-cols-[44px_64px_3fr_2fr_84px] max-sm:grid-cols-[44px_1fr_84px]'
								: 'grid-cols-[64px_3fr_2fr] max-sm:grid-cols-[1fr]'
						]"
					>
						<TableCell
							v-if="isEditMode"
							class="flex h-11! items-center whitespace-normal max-sm:h-auto!"
						>
							<!-- Empty cell for drag handle -->
						</TableCell>

						<!-- Desktop: Loop through input fields for new row -->
						<TableCell
							v-for="(field, fieldIndex) in fieldConfig"
							:key="field.key"
							class="hidden items-center overflow-hidden p-1 whitespace-normal sm:flex"
						>
							<Input
								:ref="(el) => setFirstFieldRef(el, fieldIndex)"
								v-model="field.field.value.value"
								:name="`new_${field.key}`"
								:placeholder="field.placeholder"
								class="p-1"
								:class="[
									field.class,
									{
										'border-destructive': shouldShowFieldError(field.key)
									}
								]"
								@keydown.enter="saveArtist"
								@keydown.escape.stop="cancelForm"
							/>
						</TableCell>

						<!-- Mobile: Combined form -->
						<TableCell class="flex flex-col gap-2 p-2 sm:hidden">
							<div class="space-y-3">
								<div
									v-for="(field, fieldIndex) in fieldConfig"
									:key="field.key"
								>
									<Label
										:for="`new_${field.key}`"
										class="text-muted-foreground mb-1 block text-xs"
									>
										{{
											field.key === 'discogs_id'
												? 'Discogs ID'
												: field.key === 'name'
													? 'Name'
													: 'Role'
										}}
									</Label>
									<Input
										:id="`new_${field.key}`"
										:ref="(el) => setFirstFieldRef(el, fieldIndex)"
										v-model="field.field.value.value"
										:name="`new_${field.key}`"
										:placeholder="field.placeholder"
										:class="[
											field.class,
											{
												'border-destructive': shouldShowFieldError(field.key)
											}
										]"
										@keydown.enter="saveArtist"
										@keydown.escape.stop="cancelForm"
									/>
								</div>
							</div>
						</TableCell>

						<TableCell
							class="flex h-11! items-center justify-end gap-1 p-1 whitespace-normal max-sm:h-auto!"
						>
							<Button
								size="icon"
								variant="ghost"
								:class="[meta.valid ? 'text-green-600' : 'text-gray-400']"
								@click="saveArtist"
							>
								<Check />
							</Button>
							<Button
								size="icon"
								variant="ghost"
								class="text-muted-foreground"
								@click="cancelForm"
							>
								<X />
							</Button>
						</TableCell>
					</TableRow>
				</tbody>
			</Table>
		</div>

		<!-- Form Error Display -->
		<NoticeError v-if="formMode && firstError">
			{{ firstError }}
		</NoticeError>

		<!-- Empty State (read-only mode) -->
		<div v-else-if="!isEditMode" class="space-y-1">
			<div v-if="!artists.length" class="text-muted-foreground text-sm">
				No artists
			</div>
		</div>

		<!-- Empty State (edit mode) -->
		<div
			v-else-if="!artists.length"
			class="text-muted-foreground py-4 text-center text-sm"
		>
			No artists. Click "Add Artist" to get started.
		</div>
	</div>
</template>
