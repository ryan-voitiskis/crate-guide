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

const recordDetails = useRecordDetailsStore()

const editingArtistIndex = ref<number | null>(null)

const editForm = ref({
	discogs_id: '',
	name: '',
	role: ''
})

const isAddingNew = ref(false)
const newArtistForm = ref({
	discogs_id: '',
	name: '',
	role: ''
})

// Validation state
const editFormValidation = ref({
	discogs_id: { isValid: true, message: '' }
})

const newArtistFormValidation = ref({
	discogs_id: { isValid: true, message: '' }
})

const canSaveEdit = computed(
	() =>
		editForm.value.name.trim().length > 0 &&
		editFormValidation.value.discogs_id.isValid
)
const canSaveNew = computed(
	() =>
		newArtistForm.value.name.trim().length > 0 &&
		newArtistFormValidation.value.discogs_id.isValid
)

// Watchers for immediate validation
watch(
	() => editForm.value.discogs_id,
	(newValue) => {
		if (editingArtistIndex.value !== null) {
			validateEditFormDiscogsId()
		}
	},
	{ immediate: true }
)

watch(
	() => newArtistForm.value.discogs_id,
	(newValue) => {
		if (isAddingNew.value) {
			validateNewArtistFormDiscogsId()
		}
	},
	{ immediate: true }
)

function startEditArtist(index: number) {
	const artist = recordDetails.recordForm.artists[index]
	if (!artist) return

	editForm.value = {
		discogs_id: artist.discogs_id?.toString() || '',
		name: artist.name,
		role: artist.role || ''
	}
	editingArtistIndex.value = index
	// Reset validation state
	editFormValidation.value.discogs_id = { isValid: true, message: '' }
}

function cancelEditArtist() {
	editingArtistIndex.value = null
	editForm.value = { discogs_id: '', name: '', role: '' }
	editFormValidation.value.discogs_id = { isValid: true, message: '' }
}

function saveEditArtist() {
	if (!canSaveEdit.value || editingArtistIndex.value === null) return

	const normalizedId = normalizeDiscogsArtistId(editForm.value.discogs_id)
	const updatedArtist = {
		discogs_id: normalizedId ?? undefined,
		name: editForm.value.name.trim(),
		role: editForm.value.role.trim() || null
	}

	recordDetails.recordForm.artists[editingArtistIndex.value] = updatedArtist
	editingArtistIndex.value = null
	editForm.value = { discogs_id: '', name: '', role: '' }
	editFormValidation.value.discogs_id = { isValid: true, message: '' }
}

function startAddNew() {
	isAddingNew.value = true
	newArtistForm.value = { discogs_id: '', name: '', role: '' }
	newArtistFormValidation.value.discogs_id = { isValid: true, message: '' }
}

function cancelAddNew() {
	isAddingNew.value = false
	newArtistForm.value = { discogs_id: '', name: '', role: '' }
	newArtistFormValidation.value.discogs_id = { isValid: true, message: '' }
}

function saveNewArtist() {
	if (!canSaveNew.value) return

	const normalizedId = normalizeDiscogsArtistId(newArtistForm.value.discogs_id)
	const newArtist = {
		discogs_id: normalizedId ?? undefined,
		name: newArtistForm.value.name.trim(),
		role: newArtistForm.value.role.trim() || null
	}

	recordDetails.recordForm.artists.push(newArtist)
	isAddingNew.value = false
	newArtistForm.value = { discogs_id: '', name: '', role: '' }
	newArtistFormValidation.value.discogs_id = { isValid: true, message: '' }
}

function validateEditFormDiscogsId() {
	// Allow empty value (optional field)
	if (!editForm.value.discogs_id.trim()) {
		editFormValidation.value.discogs_id = { isValid: true, message: '' }
		return
	}

	const validation = validateDiscogsArtistId(editForm.value.discogs_id)
	editFormValidation.value.discogs_id = {
		isValid: validation.isValid,
		message: validation.message
	}
}

function validateNewArtistFormDiscogsId() {
	// Allow empty value (optional field)
	if (!newArtistForm.value.discogs_id.trim()) {
		newArtistFormValidation.value.discogs_id = { isValid: true, message: '' }
		return
	}

	const validation = validateDiscogsArtistId(newArtistForm.value.discogs_id)
	newArtistFormValidation.value.discogs_id = {
		isValid: validation.isValid,
		message: validation.message
	}
}

function removeArtist(index: number) {
	recordDetails.recordForm.artists.splice(index, 1)
	if (editingArtistIndex.value === index) cancelEditArtist()
}

function moveArtistUp(index: number) {
	if (index <= 0) return
	const artists = recordDetails.recordForm.artists
	if (!artists[index] || !artists[index - 1]) return

	const temp = artists[index]
	artists[index] = artists[index - 1]!
	artists[index - 1] = temp
}

function moveArtistDown(index: number) {
	const artists = recordDetails.recordForm.artists
	if (index >= artists.length - 1) return
	if (!artists[index] || !artists[index + 1]) return

	const temp = artists[index]
	artists[index] = artists[index + 1]!
	artists[index + 1] = temp
}
</script>

<template>
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<Label>Artists ({{ recordDetails.recordForm.artists.length }})</Label>
			<Button
				v-if="recordDetails.isEditMode"
				@click="startAddNew"
				size="sm"
				variant="outline"
				:disabled="isAddingNew || editingArtistIndex !== null"
			>
				<Plus class="mr-1 size-3" />
				Add Artist
			</Button>
		</div>

		<!-- Artists Table -->
		<div
			v-if="recordDetails.recordForm.artists.length || isAddingNew"
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
					<TableRow
						v-for="(artist, index) in recordDetails.recordForm.artists"
						:key="`artist-${index}`"
					>
						<!-- Reorder Controls -->
						<TableCell v-if="recordDetails.isEditMode">
							<div class="flex gap-1">
								<Button
									@click="moveArtistUp(index)"
									size="sm"
									variant="ghost"
									:disabled="
										index === 0 || editingArtistIndex !== null || isAddingNew
									"
								>
									<ChevronUp class="size-3" />
								</Button>
								<Button
									@click="moveArtistDown(index)"
									size="sm"
									variant="ghost"
									:disabled="
										index === recordDetails.recordForm.artists.length - 1 ||
										editingArtistIndex !== null ||
										isAddingNew
									"
								>
									<ChevronDown class="size-3" />
								</Button>
							</div>
						</TableCell>

						<!-- Discogs ID -->
						<TableCell>
							<div v-if="editingArtistIndex === index" class="space-y-1">
								<Input
									v-model="editForm.discogs_id"
									name="discogs_id"
									placeholder="1453529"
									class="w-20 text-xs"
									:class="{
										'border-red-500': !editFormValidation.discogs_id.isValid
									}"
									@keydown.enter="saveEditArtist"
									@keydown.escape="cancelEditArtist"
								/>
								<p
									v-if="!editFormValidation.discogs_id.isValid"
									class="text-xs text-red-600"
								>
									{{ editFormValidation.discogs_id.message }}
								</p>
							</div>
							<span v-else class="text-muted-foreground text-xs">
								{{ artist.discogs_id || '–' }}
							</span>
						</TableCell>

						<!-- Name -->
						<TableCell>
							<Input
								v-if="editingArtistIndex === index"
								v-model="editForm.name"
								name="name"
								placeholder="Artist name"
								class="text-sm"
								@keydown.enter="saveEditArtist"
								@keydown.escape="cancelEditArtist"
							/>
							<span v-else class="text-sm font-medium">
								{{ artist.name }}
							</span>
						</TableCell>

						<!-- Role -->
						<TableCell>
							<Input
								v-if="editingArtistIndex === index"
								v-model="editForm.role"
								name="role"
								placeholder="e.g., Producer, Remix"
								class="text-sm"
								@keydown.enter="saveEditArtist"
								@keydown.escape="cancelEditArtist"
							/>
							<span v-else class="text-muted-foreground text-sm">
								{{ artist.role || '–' }}
							</span>
						</TableCell>

						<!-- Actions -->
						<TableCell v-if="recordDetails.isEditMode">
							<div v-if="editingArtistIndex === index" class="flex gap-1">
								<Button
									@click="saveEditArtist"
									size="icon"
									variant="ghost"
									:disabled="!canSaveEdit"
									:class="[
										canSaveEdit ? 'text-green-600' : 'text-gray-400',
										'disabled:cursor-not-allowed'
									]"
								>
									<Check />
								</Button>
								<Button
									@click="cancelEditArtist"
									size="icon"
									variant="ghost"
									class="text-muted-foreground"
								>
									<X />
								</Button>
							</div>
							<div v-else class="flex gap-1">
								<Button
									@click="startEditArtist(index)"
									size="icon"
									variant="ghost"
									:disabled="editingArtistIndex !== null || isAddingNew"
								>
									<Pencil />
								</Button>
								<Button
									@click="removeArtist(index)"
									size="icon"
									variant="ghost"
									class="text-destructive-foreground"
									:disabled="editingArtistIndex !== null || isAddingNew"
								>
									<Trash />
								</Button>
							</div>
						</TableCell>
					</TableRow>

					<!-- Add New Artist Row -->
					<TableRow v-if="isAddingNew">
						<TableCell v-if="recordDetails.isEditMode">
							<!-- Empty cell for order controls -->
						</TableCell>
						<TableCell>
							<div class="space-y-1">
								<Input
									v-model="newArtistForm.discogs_id"
									name="new_discogs_id"
									placeholder="1453529"
									class="w-20 text-xs"
									:class="{
										'border-red-500':
											!newArtistFormValidation.discogs_id.isValid
									}"
									@keydown.enter="saveNewArtist"
									@keydown.escape="cancelAddNew"
								/>
								<p
									v-if="!newArtistFormValidation.discogs_id.isValid"
									class="text-xs text-red-600"
								>
									{{ newArtistFormValidation.discogs_id.message }}
								</p>
							</div>
						</TableCell>
						<TableCell>
							<Input
								v-model="newArtistForm.name"
								name="new_name"
								placeholder="Artist name"
								class="text-sm"
								@keydown.enter="saveNewArtist"
								@keydown.escape="cancelAddNew"
							/>
						</TableCell>
						<TableCell>
							<Input
								v-model="newArtistForm.role"
								name="new_role"
								placeholder="e.g., Producer, Remix"
								class="text-sm"
								@keydown.enter="saveNewArtist"
								@keydown.escape="cancelAddNew"
							/>
						</TableCell>
						<TableCell>
							<div class="flex gap-1">
								<Button
									@click="saveNewArtist"
									size="icon"
									variant="ghost"
									:disabled="!canSaveNew"
									:class="[
										canSaveNew ? 'text-green-600' : 'text-gray-400',
										'disabled:cursor-not-allowed'
									]"
								>
									<Check />
								</Button>
								<Button
									@click="cancelAddNew"
									size="icon"
									variant="ghost"
									class="text-muted-foreground"
								>
									<X />
								</Button>
							</div>
						</TableCell>
					</TableRow>
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
