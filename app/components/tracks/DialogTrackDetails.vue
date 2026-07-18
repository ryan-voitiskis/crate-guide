<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Pencil, PencilOff } from 'lucide-vue-next'
import { useForm } from 'vee-validate'
import {
	buildTrackEditorPayload,
	createTrackEditorInitialValues,
	hasTrackEditorChanges,
	trackEditorSchema,
	trackToEditorValues
} from '~/utils/trackEditor'

const props = defineProps<{
	trackId: string | null
}>()

const emit = defineEmits<{
	close: []
}>()

const tracks = useTracksStore()
const records = useRecordsStore()
const user = useUserStore()

const isEditMode = ref(false)
const showUnsavedChangesAlert = ref(false)
const isFormInitialized = ref(false)

const dialogOpen = computed({
	get: () => !!props.trackId,
	set: (value: boolean) => {
		if (!value) handleCloseDialog()
	}
})

const selectedTrack = computed(() =>
	props.trackId ? tracks.getTrackById(props.trackId) : null
)

const recordForTrack = computed(() =>
	selectedTrack.value
		? records.getRecordById(selectedTrack.value.record_id)
		: null
)

const validationSchema = toTypedSchema(trackEditorSchema)

const form = useForm({
	validationSchema,
	initialValues: createTrackEditorInitialValues()
})

const { handleSubmit, setValues, values, errors, meta } = form
const [titleValue] = form.defineField('title')
const [positionValue] = form.defineField('position')
const [durationValue] = form.defineField('duration')
const [bpmValue] = form.defineField('bpm')
const [keyCompositeValue] = form.defineField('keyComposite')
const [genresValue] = form.defineField('genres')
const [rpmValue] = form.defineField('rpm')
const [playableValue] = form.defineField('playable')
const [timeSignatureUpperValue] = form.defineField('time_signature_upper')
const [timeSignatureLowerValue] = form.defineField('time_signature_lower')

const artists = ref<DiscogsArtistDb[]>([])
const extraartists = ref<DiscogsArtistDb[]>([])

const keyOptions = computed(() =>
	getKeyOptionsForComposite(user.currentKeyFormat)
)

watch(
	[() => selectedTrack.value, () => isEditMode.value],
	([track, editMode]) => {
		if (track && editMode && !isFormInitialized.value) {
			setValues(trackToEditorValues(track))
			artists.value = [...track.artists]
			extraartists.value = [...track.extraartists]
			isFormInitialized.value = true
		} else if (!editMode) {
			isFormInitialized.value = false
		}
	},
	{ immediate: true }
)

function hasFormChanges(): boolean {
	if (!selectedTrack.value || !isEditMode.value || !isFormInitialized.value)
		return false

	return hasTrackEditorChanges(
		selectedTrack.value,
		values,
		artists.value,
		extraartists.value
	)
}

function handleCloseDialog() {
	if (hasFormChanges()) showUnsavedChangesAlert.value = true
	else {
		isEditMode.value = false
		emit('close')
	}
}

function handleToggleEditMode() {
	if (isEditMode.value && hasFormChanges()) {
		showUnsavedChangesAlert.value = true
	} else {
		isEditMode.value = !isEditMode.value
	}
}

const saveTrack = handleSubmit(async (values) => {
	if (!selectedTrack.value) return

	const updates = buildTrackEditorPayload(
		values,
		artists.value,
		extraartists.value
	)

	const result = await tracks.updateTrack(selectedTrack.value.id, updates)
	if (result) {
		isEditMode.value = false
		isFormInitialized.value = false
	}
})

function handleCancelEdit() {
	if (hasFormChanges()) showUnsavedChangesAlert.value = true
	else {
		isEditMode.value = false
	}
}

function confirmDiscardAndProceed() {
	showUnsavedChangesAlert.value = false
	isFormInitialized.value = false
	isEditMode.value = false
	emit('close')
}

function formatKey(track: Track): string {
	if (track.key === null || track.mode === null) return 'Not specified'
	return getFormattedKeyString(track.key, track.mode, user.currentKeyFormat)
}
</script>

<template>
	<Dialog v-model:open="dialogOpen">
		<DialogContent
			class="max-h-[100dvh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] p-2 max-sm:rounded-none max-sm:border-none sm:max-h-[90dvh] sm:p-6"
		>
			<DialogHeader>
				<DialogTitle>Track Details</DialogTitle>
				<DialogDescription v-if="selectedTrack">
					<span v-if="recordForTrack">
						{{ recordForTrack.title }}
						<span v-if="recordForTrack.labels?.[0]?.catno">
							({{ recordForTrack.labels[0].catno }})
						</span>
					</span>
				</DialogDescription>
			</DialogHeader>

			<div
				class="-mx-6 -mb-4 space-y-6 overflow-y-auto px-6 pb-2"
				tabindex="-1"
			>
				<div v-if="recordForTrack" class="flex items-start gap-4">
					<ImageRecordCover
						:record="recordForTrack"
						class="size-24 shrink-0 rounded-lg"
					/>
					<div class="space-y-1">
						<h3 class="font-medium">{{ recordForTrack.title }}</h3>
						<p class="text-muted-foreground text-sm">
							{{ recordForTrack.artists.map((a) => a.name).join(', ') }}
						</p>
						<p v-if="recordForTrack.year" class="text-muted-foreground text-sm">
							{{ recordForTrack.year }}
						</p>
					</div>
				</div>

				<div class="space-y-4">
					<div class="flex gap-2">
						<Button
							:variant="isEditMode ? 'secondary' : 'outline'"
							size="sm"
							@click="handleToggleEditMode"
						>
							<PencilOff v-if="isEditMode" class="mr-2 size-4" />
							<Pencil v-else class="mr-2 size-4" />
							{{ isEditMode ? 'Cancel Edit' : 'Edit Track' }}
						</Button>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<Label>Title</Label>
							<FormItem v-if="isEditMode">
								<Input
									v-model="titleValue"
									name="title"
									placeholder="Track title"
									:class="{
										'border-destructive': !!errors.title
									}"
								/>
								<p v-if="errors.title" class="text-destructive text-sm">
									{{ errors.title }}
								</p>
							</FormItem>
							<div v-else>{{ selectedTrack?.title }}</div>
						</div>

						<div class="space-y-2">
							<Label>Position</Label>
							<FormItem v-if="isEditMode">
								<Input
									v-model="positionValue"
									name="position"
									placeholder="A1, B2, etc."
									:class="{
										'border-destructive': !!errors.position
									}"
								/>
								<p v-if="errors.position" class="text-destructive text-sm">
									{{ errors.position }}
								</p>
							</FormItem>
							<div v-else class="text-muted-foreground">
								{{ selectedTrack?.position || 'Not specified' }}
							</div>
						</div>
					</div>

					<TableArtistsEditable
						v-model="artists"
						:is-edit-mode="isEditMode"
						label="Artists"
					/>

					<TableArtistsEditable
						v-model="extraartists"
						:is-edit-mode="isEditMode"
						label="Extra Artists"
					/>

					<div class="space-y-2">
						<Label>Genres</Label>
						<TagsInput v-if="isEditMode" v-model="genresValue">
							<TagsInputItem
								v-for="(genre, index) in genresValue"
								:key="`genre-${index}`"
								:value="genre"
							>
								<TagsInputItemText>{{ genre }}</TagsInputItemText>
								<TagsInputItemDelete />
							</TagsInputItem>
							<TagsInputInput placeholder="Add genres..." />
						</TagsInput>
						<div v-else class="flex flex-wrap gap-1">
							<span
								v-for="genre in selectedTrack?.genres"
								:key="genre"
								class="bg-muted rounded px-2 py-1 text-sm"
							>
								{{ genre }}
							</span>
							<span
								v-if="!selectedTrack?.genres?.length"
								class="text-muted-foreground"
							>
								No genres specified
							</span>
						</div>
					</div>

					<div class="grid gap-4 md:grid-cols-3">
						<div class="space-y-2">
							<Label>Duration</Label>
							<FormItem v-if="isEditMode">
								<Input
									v-model="durationValue"
									name="duration"
									placeholder="3:45"
									:class="{
										'border-destructive': !!errors.duration
									}"
								/>
								<p v-if="errors.duration" class="text-destructive text-sm">
									{{ errors.duration }}
								</p>
							</FormItem>
							<div v-else class="text-muted-foreground">
								{{
									msToMMSS(selectedTrack?.duration || null) || 'Not specified'
								}}
							</div>
						</div>

						<div class="space-y-2">
							<Label>BPM</Label>
							<FormItem v-if="isEditMode">
								<Input
									v-model="bpmValue"
									name="bpm"
									placeholder="128.5"
									:class="{
										'border-destructive': !!errors.bpm
									}"
								/>
								<p v-if="errors.bpm" class="text-destructive text-sm">
									{{ errors.bpm }}
								</p>
							</FormItem>
							<div v-else class="text-muted-foreground">
								{{ selectedTrack?.bpm || 'Not specified' }}
							</div>
						</div>

						<div class="space-y-2">
							<Label>RPM</Label>
							<Select v-if="isEditMode" v-model="rpmValue">
								<SelectTrigger class="w-full">
									<SelectValue placeholder="Select RPM" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem :value="null">Not specified</SelectItem>
									<SelectItem :value="33">33⅓ RPM</SelectItem>
									<SelectItem :value="45">45 RPM</SelectItem>
								</SelectContent>
							</Select>
							<div v-else class="text-muted-foreground">
								{{
									selectedTrack?.rpm
										? `${selectedTrack.rpm} RPM`
										: 'Not specified'
								}}
							</div>
						</div>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<Label>Key</Label>
							<FormItem v-if="isEditMode">
								<Select v-model="keyCompositeValue">
									<SelectTrigger class="w-full">
										<SelectValue placeholder="Select key" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem
											v-for="option in keyOptions"
											:key="option.id"
											:value="option.id"
										>
											{{ option.name }}
										</SelectItem>
									</SelectContent>
								</Select>
								<p v-if="errors.keyComposite" class="text-destructive text-sm">
									{{ errors.keyComposite }}
								</p>
							</FormItem>
							<div v-else class="text-muted-foreground">
								{{ selectedTrack ? formatKey(selectedTrack) : 'Not specified' }}
							</div>
						</div>

						<div class="space-y-2">
							<Label>Time Signature</Label>
							<div v-if="isEditMode" class="flex gap-2">
								<NumberField
									v-model="timeSignatureUpperValue"
									:min="1"
									:max="16"
									:default-value="4"
									class="w-16"
								>
									<NumberFieldInput placeholder="4" />
								</NumberField>
								<span class="flex items-center">/</span>
								<NumberField
									v-model="timeSignatureLowerValue"
									:min="1"
									:max="16"
									:default-value="4"
									class="w-16"
								>
									<NumberFieldInput placeholder="4" />
								</NumberField>
							</div>
							<div v-else class="text-muted-foreground">
								{{
									selectedTrack?.time_signature_upper &&
									selectedTrack?.time_signature_lower
										? `${selectedTrack.time_signature_upper}/${selectedTrack.time_signature_lower}`
										: 'Not specified'
								}}
							</div>
						</div>
					</div>

					<div class="flex items-center space-x-2">
						<Switch
							v-if="isEditMode"
							id="playable"
							v-model:checked="playableValue"
						/>
						<Label v-if="isEditMode" for="playable">
							Playable (track is in good condition)
						</Label>
						<div v-else class="flex items-center gap-2">
							<Label>Playable</Label>
							<span
								:class="[
									'rounded px-2 py-1 text-sm',
									selectedTrack?.playable
										? 'bg-green-500/10 text-green-600 dark:text-green-400'
										: 'bg-destructive/10 text-destructive'
								]"
							>
								{{ selectedTrack?.playable ? 'Yes' : 'No' }}
							</span>
						</div>
					</div>

					<div v-if="selectedTrack?.beatport_data" class="space-y-2">
						<Label>Beatport Data</Label>
						<pre class="bg-muted overflow-x-auto rounded-lg p-3 text-sm">{{
							JSON.stringify(selectedTrack.beatport_data, null, 2)
						}}</pre>
					</div>

					<div
						v-if="isEditMode"
						class="flex flex-col justify-end gap-2 pt-0 max-sm:px-2 sm:flex-row"
					>
						<Button variant="secondary" @click="handleCancelEdit">
							Cancel
						</Button>
						<ButtonLoading
							:disabled="!meta.valid"
							:loading="tracks.isUpdatingTrack"
							@click="saveTrack"
						>
							Save Changes
						</ButtonLoading>
					</div>
				</div>
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
</template>
