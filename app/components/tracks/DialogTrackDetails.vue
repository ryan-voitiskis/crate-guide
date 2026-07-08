<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { ImageOff, Pencil, PencilOff } from 'lucide-vue-next'
import { useForm } from 'vee-validate'
import { z } from 'zod'

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

const trackSchema = z.object({
	title: z.string().min(1, 'Title is required').trim(),
	position: z.string().refine(isValidTrackPosition, POSITION_ERROR_MESSAGE),
	duration: z.string().refine(isValidDurationFormat, DURATION_ERROR_MESSAGE),
	bpm: z.string().refine(isValidBPM, BPM_ERROR_MESSAGE),
	keyComposite: z.string().refine(isValidKeyComposite, KEY_ERROR_MESSAGE),
	genres: z.array(z.string()),
	rpm: z.union([z.number(), z.null()]),
	playable: z.boolean(),
	time_signature_upper: z.union([z.number(), z.null()]),
	time_signature_lower: z.union([z.number(), z.null()])
})

const validationSchema = toTypedSchema(trackSchema)

const form = useForm({
	validationSchema,
	initialValues: {
		title: '',
		position: '',
		duration: '',
		bpm: '',
		keyComposite: 'none',
		genres: [] as string[],
		rpm: null as number | null,
		playable: true,
		time_signature_upper: null as number | null,
		time_signature_lower: null as number | null
	}
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
			setValues({
				title: track.title || '',
				position: track.position || '',
				duration: msToMMSS(track.duration),
				bpm: track.bpm?.toString() || '',
				keyComposite: createKeyComposite(track.key, track.mode),
				genres: [...track.genres],
				rpm: track.rpm,
				playable: track.playable ?? true,
				time_signature_upper: track.time_signature_upper,
				time_signature_lower: track.time_signature_lower
			})
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

	const current = selectedTrack.value
	const form = values

	let formDurationSeconds: number | null = null
	if (form.duration) {
		const timeMatch = form.duration.match(/^(\d{1,2}):([0-5]\d)$/)
		if (timeMatch) {
			const minutes = parseInt(timeMatch[1]!, 10)
			const seconds = parseInt(timeMatch[2]!, 10)
			formDurationSeconds = minutes * 60 + seconds
		}
	}

	return (
		(current.title || '') !== (form.title || '') ||
		(current.position || '') !== (form.position || '') ||
		(current.duration || null) !== formDurationSeconds ||
		(current.bpm?.toString() || '') !== (form.bpm || '') ||
		current.rpm !== form.rpm ||
		createKeyComposite(current.key, current.mode) !== form.keyComposite ||
		current.time_signature_upper !== form.time_signature_upper ||
		current.time_signature_lower !== form.time_signature_lower ||
		(current.playable ?? true) !== form.playable ||
		JSON.stringify(current.genres || []) !==
			JSON.stringify(form.genres || []) ||
		JSON.stringify(current.artists || []) !==
			JSON.stringify(artists.value || []) ||
		JSON.stringify(current.extraartists || []) !==
			JSON.stringify(extraartists.value || [])
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

	const keyData = parseKeyComposite(values.keyComposite || 'none')
	const updates = {
		title: values.title.trim(),
		artists: artists.value,
		extraartists: extraartists.value,
		position: values.position.trim() || null,
		duration: mmssToMs(values.duration || ''),
		bpm: parseBPM(values.bpm || ''),
		rpm: values.rpm,
		key: keyData.key,
		mode: keyData.mode,
		genres: values.genres,
		time_signature_upper: values.time_signature_upper,
		time_signature_lower: values.time_signature_lower,
		playable: values.playable
	}

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
					<div
						class="bg-muted relative size-24 shrink-0 overflow-hidden rounded-lg bg-cover bg-center bg-no-repeat"
						:style="{
							backgroundImage: recordForTrack.cover
								? `url('${recordForTrack.cover}')`
								: 'none'
						}"
					>
						<ImageOff
							v-if="!recordForTrack.cover"
							class="text-muted-foreground absolute inset-0 m-auto size-8"
						/>
					</div>
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
						<Button
							:disabled="!meta.valid"
							:loading="tracks.isUpdatingTrack"
							@click="saveTrack"
						>
							Save Changes
						</Button>
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
