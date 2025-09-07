<script setup lang="ts">
import {
	Check,
	ChevronDown,
	ChevronUp,
	Pencil,
	Plus,
	Trash,
	X
} from 'lucide-vue-next'
import { z } from 'zod'

const recordDetails = useRecordDetailsStore()

const artistSchema = z.object({
	discogs_id: z.union([
		z.literal(''),
		z
			.string()
			.pipe(z.coerce.number().int().min(1).max(999999999))
			.transform(String)
	]),
	name: z.string().min(1, 'Artist name is required').trim(),
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

watchEffect(() => {
	if (!formMode.value) return
	const result = artistSchema.safeParse(formData.value)
	formErrors.value = result.success ? null : result.error.format()
})

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
}

function startAddNew() {
	formMode.value = 'new'
	formData.value = { discogs_id: '', name: '', role: '' }
	formErrors.value = null
}

function cancelForm() {
	formMode.value = null
	editingIndex.value = null
	formData.value = { discogs_id: '', name: '', role: '' }
	formErrors.value = null
}

function saveArtist() {
	if (!canSave.value || !formMode.value) return

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

function moveArtist(index: number, direction: 'up' | 'down') {
	const artists = recordDetails.recordForm.artists
	const targetIndex = direction === 'up' ? index - 1 : index + 1

	if (targetIndex < 0 || targetIndex >= artists.length) return
	if (!artists[index] || !artists[targetIndex])
		return // Swap using destructuring
	;[artists[index], artists[targetIndex]] = [
		artists[targetIndex]!,
		artists[index]!
	]
}

const canMoveUp = (index: number) => index > 0 && !isFormActive.value
const canMoveDown = (index: number) =>
	index < recordDetails.recordForm.artists.length - 1 && !isFormActive.value

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
						<TableHead v-if="recordDetails.isEditMode" class="w-16">
							Order
						</TableHead>
						<TableHead class="w-24">Discogs ID</TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Role</TableHead>
						<TableHead v-if="recordDetails.isEditMode" class="w-24">
							Actions
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<!-- Existing Artists -->
					<template
						v-for="(artist, index) in recordDetails.recordForm.artists"
						:key="`artist-${index}`"
					>
						<TableRow>
							<!-- Reorder Controls -->
							<TableCell v-if="recordDetails.isEditMode">
								<div class="flex gap-1">
									<Button
										@click="moveArtist(index, 'up')"
										size="icon"
										variant="ghost"
										:disabled="!canMoveUp(index)"
									>
										<ChevronUp />
									</Button>
									<Button
										@click="moveArtist(index, 'down')"
										size="icon"
										variant="ghost"
										:disabled="!canMoveDown(index)"
									>
										<ChevronDown />
									</Button>
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
										{ 'border-destructive': hasFieldError(field.key) }
									]"
									@keydown.enter="saveArtist"
									@keydown.escape="cancelForm"
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
										:disabled="!canSave"
										:class="[
											canSave ? 'text-green-600' : 'text-gray-400',
											'disabled:cursor-not-allowed'
										]"
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

						<!-- Error message row for editing -->
						<TableRow
							v-if="isEditingRow(index) && getFirstError(formErrors)"
							class="hover:bg-transparent"
						>
							<TableCell
								:colspan="recordDetails.isEditMode ? 5 : 4"
								class="pt-1 pb-0"
							>
								<p class="text-destructive text-sm">
									{{ getFirstError(formErrors) }}
								</p>
							</TableCell>
						</TableRow>
					</template>

					<!-- Add New Artist Row -->
					<template v-if="formMode === 'new'">
						<TableRow>
							<TableCell v-if="recordDetails.isEditMode">
								<!-- Empty cell for order controls -->
							</TableCell>

							<!-- Loop through input fields for new row -->
							<TableCell v-for="field in inputFields" :key="field.key">
								<Input
									v-model="formData[field.key]"
									:name="`new_${field.key}`"
									:placeholder="field.placeholder"
									:class="[
										field.class,
										{ 'border-destructive': hasFieldError(field.key) }
									]"
									@keydown.enter="saveArtist"
									@keydown.escape="cancelForm"
								/>
							</TableCell>

							<TableCell>
								<div class="flex gap-1">
									<Button
										@click="saveArtist"
										size="icon"
										variant="ghost"
										:disabled="!canSave"
										:class="[
											canSave ? 'text-green-600' : 'text-gray-400',
											'disabled:cursor-not-allowed'
										]"
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

						<!-- Error message row for new artist -->
						<TableRow
							v-if="getFirstError(formErrors)"
							class="hover:bg-transparent"
						>
							<TableCell
								:colspan="recordDetails.isEditMode ? 5 : 4"
								class="pt-1 pb-0"
							>
								<p class="text-destructive text-sm">
									{{ getFirstError(formErrors) }}
								</p>
							</TableCell>
						</TableRow>
					</template>
				</TableBody>
			</Table>
		</div>

		<!-- Empty State (read-only) -->
		<div v-else-if="!recordDetails.isEditMode" class="space-y-1">
			<div
				v-for="artist in recordDetails.selectedRecord?.artists || []"
				:key="artist.name"
				class="bg-muted rounded p-2 text-sm"
			>
				{{ artist.name }}
				<span v-if="artist.role" class="text-muted-foreground">
					({{ artist.role }})
				</span>
			</div>
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
