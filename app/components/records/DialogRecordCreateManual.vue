<script setup lang="ts">
import { ArrowLeft, ClipboardList, Plus, Save, Trash2 } from 'lucide-vue-next'

type Step = 'record' | 'tracks'
type RecordField = 'title' | 'year' | 'cover' | 'labelName'
type TrackField = 'position' | 'title' | 'duration' | 'bpm' | 'keyComposite'

type TrackDraft = {
	id: number
	position: string
	title: string
	artist: string
	duration: string
	bpm: string
	keyComposite: string
}

const manualEntry = useManualRecordEntryStore()
const records = useRecordsStore()
const recordDetails = useRecordDetailsStore()
const user = useUserStore()

const currentYear = new Date().getFullYear()
const maxYear = currentYear + 5

const step = ref<Step>('record')
const title = ref('')
const artistName = ref('')
const labelName = ref('')
const catno = ref('')
const year = ref('')
const cover = ref('')
const genres = ref<string[]>([])
const defaultRpm = ref<number | null>(null)
const pasteValue = ref('')
const recordSubmitAttempted = ref(false)
const trackSubmitAttempted = ref(false)
let nextTrackRowId = 1

const trackRows = ref<TrackDraft[]>([])

const dialogOpen = computed({
	get: () => manualEntry.isDialogOpen,
	set: (value: boolean) => {
		if (!value) manualEntry.closeDialog()
	}
})

const keyOptions = computed(() =>
	getKeyOptionsForComposite(user.currentKeyFormat)
)

const recordErrors = computed<Partial<Record<RecordField, string>>>(() => {
	const errors: Partial<Record<RecordField, string>> = {}

	if (!title.value.trim()) errors.title = 'Title is required.'

	if (year.value.trim()) {
		const parsedYear = Number(year.value)
		if (
			!Number.isInteger(parsedYear) ||
			parsedYear < 1877 ||
			parsedYear > maxYear
		) {
			errors.year = `Year must be between 1877 and ${maxYear}.`
		}
	}

	if (cover.value.trim()) {
		const trimmedCover = cover.value.trim()
		try {
			new URL(trimmedCover)
			if (!/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(trimmedCover)) {
				errors.cover = 'Must be an image URL.'
			}
		} catch {
			errors.cover = 'Must be a valid URL.'
		}
	}

	if (catno.value.trim() && !labelName.value.trim()) {
		errors.labelName = 'Label is required when cat no is set.'
	}

	return errors
})

const hasRecordErrors = computed(
	() => Object.keys(recordErrors.value).length > 0
)

const hasTrackErrors = computed(() =>
	trackRows.value.some((row) =>
		(['position', 'title', 'duration', 'bpm', 'keyComposite'] as const).some(
			(field) => Boolean(getTrackFieldError(row, field))
		)
	)
)

const tracksToCreate = computed(() =>
	trackRows.value.filter((row) => row.title.trim())
)

const saveLabel = computed(() =>
	tracksToCreate.value.length
		? `Create record and ${tracksToCreate.value.length} ${tracksToCreate.value.length === 1 ? 'track' : 'tracks'}`
		: 'Create record'
)

watch(
	() => manualEntry.isDialogOpen,
	(isOpen) => {
		if (isOpen) resetForm()
	}
)

function createEmptyTrackRow(): TrackDraft {
	return {
		id: nextTrackRowId++,
		position: '',
		title: '',
		artist: '',
		duration: '',
		bpm: '',
		keyComposite: 'none'
	}
}

function resetForm() {
	step.value = 'record'
	title.value = ''
	artistName.value = ''
	labelName.value = ''
	catno.value = ''
	year.value = ''
	cover.value = ''
	genres.value = []
	defaultRpm.value = null
	pasteValue.value = ''
	recordSubmitAttempted.value = false
	trackSubmitAttempted.value = false
	nextTrackRowId = 1
	trackRows.value = Array.from({ length: 4 }, () => createEmptyTrackRow())
}

function getRecordFieldError(field: RecordField): string {
	return recordErrors.value[field] ?? ''
}

function shouldShowRecordError(field: RecordField): boolean {
	return recordSubmitAttempted.value && Boolean(getRecordFieldError(field))
}

function isTrackRowEmpty(row: TrackDraft): boolean {
	return (
		!row.position.trim() &&
		!row.title.trim() &&
		!row.artist.trim() &&
		!row.duration.trim() &&
		!row.bpm.trim() &&
		row.keyComposite === 'none'
	)
}

function getTrackFieldError(row: TrackDraft, field: TrackField): string {
	if (isTrackRowEmpty(row)) return ''

	if (field === 'title' && !row.title.trim()) return 'Title is required.'
	if (field === 'position' && !isValidTrackPosition(row.position)) {
		return POSITION_ERROR_MESSAGE
	}
	if (field === 'duration' && !isValidDurationFormat(row.duration)) {
		return DURATION_ERROR_MESSAGE
	}
	if (field === 'bpm' && !isValidBPM(row.bpm)) return BPM_ERROR_MESSAGE
	if (field === 'keyComposite' && !isValidKeyComposite(row.keyComposite)) {
		return KEY_ERROR_MESSAGE
	}

	return ''
}

function shouldShowTrackError(row: TrackDraft, field: TrackField): boolean {
	return trackSubmitAttempted.value && Boolean(getTrackFieldError(row, field))
}

function parseOptionalYear(): number | null {
	return year.value.trim() ? Number(year.value) : null
}

function addTrackRow() {
	trackRows.value.push(createEmptyTrackRow())
}

function removeTrackRow(rowId: number) {
	if (trackRows.value.length === 1) {
		trackRows.value = [createEmptyTrackRow()]
		return
	}

	trackRows.value = trackRows.value.filter((row) => row.id !== rowId)
}

function parsePastedTrackLine(
	line: string
): Pick<TrackDraft, 'position' | 'title'> {
	const trimmed = line.trim()
	const positionMatch = trimmed.match(
		/^([A-Za-z]\d+(?:-[A-Za-z]\d+)?)[\s).:-]+(.+)$/
	)
	if (positionMatch?.[1] && positionMatch[2]) {
		return {
			position: positionMatch[1].toUpperCase(),
			title: positionMatch[2].trim()
		}
	}

	const numberedMatch = trimmed.match(/^\d+[\s).:-]+(.+)$/)
	if (numberedMatch?.[1])
		return { position: '', title: numberedMatch[1].trim() }

	return { position: '', title: trimmed }
}

function addPastedRows() {
	const parsedRows = pasteValue.value
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => ({
			...createEmptyTrackRow(),
			...parsePastedTrackLine(line)
		}))

	if (!parsedRows.length) return

	const shouldReplaceRows = trackRows.value.every(isTrackRowEmpty)
	trackRows.value = shouldReplaceRows
		? parsedRows
		: [...trackRows.value, ...parsedRows]
	pasteValue.value = ''
}

function goToTracksStep() {
	recordSubmitAttempted.value = true
	if (hasRecordErrors.value) return
	step.value = 'tracks'
}

function goToRecordStep() {
	step.value = 'record'
}

async function saveManualRecord() {
	recordSubmitAttempted.value = true
	trackSubmitAttempted.value = true

	if (hasRecordErrors.value) {
		step.value = 'record'
		return
	}

	if (hasTrackErrors.value) {
		step.value = 'tracks'
		return
	}

	const createdRecord = await records.createRecordWithTracks({
		title: title.value,
		artistName: artistName.value,
		labelName: labelName.value,
		catno: catno.value,
		year: parseOptionalYear(),
		cover: cover.value,
		defaultGenres: genres.value.map((genre) => genre.trim()).filter(Boolean),
		defaultRpm: defaultRpm.value,
		tracks: tracksToCreate.value.map((row) => {
			const keyData = parseKeyComposite(row.keyComposite || 'none')

			return {
				title: row.title,
				artistName: row.artist,
				position: row.position,
				duration: mmssToMs(row.duration),
				bpm: parseBPM(row.bpm),
				rpm: defaultRpm.value,
				key: keyData.key,
				mode: keyData.mode,
				genres: genres.value.map((genre) => genre.trim()).filter(Boolean),
				playable: true
			}
		})
	})

	if (!createdRecord) return

	manualEntry.closeDialog()
	recordDetails.openRecord(createdRecord.id)
}
</script>

<template>
	<Dialog v-model:open="dialogOpen">
		<DialogContent
			class="max-h-[100dvh] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] p-2 max-sm:rounded-none max-sm:border-none sm:max-h-[90dvh] sm:p-6"
		>
			<DialogHeader>
				<DialogTitle>Add Record Manually</DialogTitle>
				<DialogDescription>
					{{ step === 'record' ? 'Record details' : 'Track list' }}
				</DialogDescription>
			</DialogHeader>

			<div class="-mx-6 space-y-6 overflow-y-auto px-6 pb-2" tabindex="-1">
				<div
					class="border-border grid grid-cols-2 overflow-hidden rounded-md border"
				>
					<button
						type="button"
						class="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors"
						:class="
							step === 'record'
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-muted-foreground'
						"
						@click="goToRecordStep"
					>
						1. Record
					</button>
					<button
						type="button"
						class="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors"
						:class="
							step === 'tracks'
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-muted-foreground'
						"
						@click="goToTracksStep"
					>
						2. Tracks
					</button>
				</div>

				<div v-if="step === 'record'" class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2 md:col-span-2">
						<Label for="manual-record-title">
							Title
							<span class="text-primary -ml-0.5">*</span>
						</Label>
						<Input
							id="manual-record-title"
							v-model="title"
							name="title"
							placeholder="Record title"
							:class="{
								'border-destructive': shouldShowRecordError('title')
							}"
						/>
						<p
							v-if="shouldShowRecordError('title')"
							class="text-destructive text-sm"
						>
							{{ getRecordFieldError('title') }}
						</p>
					</div>

					<div class="space-y-2">
						<Label for="manual-record-artist">Artist</Label>
						<Input
							id="manual-record-artist"
							v-model="artistName"
							name="artist"
							placeholder="Artist name"
						/>
					</div>

					<div class="space-y-2">
						<Label for="manual-record-year">Year</Label>
						<Input
							id="manual-record-year"
							v-model="year"
							name="year"
							inputmode="numeric"
							placeholder="2026"
							:class="{
								'border-destructive': shouldShowRecordError('year')
							}"
						/>
						<p
							v-if="shouldShowRecordError('year')"
							class="text-destructive text-sm"
						>
							{{ getRecordFieldError('year') }}
						</p>
					</div>

					<div class="space-y-2">
						<Label for="manual-record-label">Label</Label>
						<Input
							id="manual-record-label"
							v-model="labelName"
							name="label"
							placeholder="Label name"
							:class="{
								'border-destructive': shouldShowRecordError('labelName')
							}"
						/>
						<p
							v-if="shouldShowRecordError('labelName')"
							class="text-destructive text-sm"
						>
							{{ getRecordFieldError('labelName') }}
						</p>
					</div>

					<div class="space-y-2">
						<Label for="manual-record-catno">Cat no</Label>
						<Input
							id="manual-record-catno"
							v-model="catno"
							name="catno"
							placeholder="ABC-001"
						/>
					</div>

					<div class="space-y-2 md:col-span-2">
						<Label for="manual-record-cover">Cover URL</Label>
						<Input
							id="manual-record-cover"
							v-model="cover"
							name="cover"
							placeholder="https://example.com/cover.jpg"
							:class="{
								'border-destructive': shouldShowRecordError('cover')
							}"
						/>
						<p
							v-if="shouldShowRecordError('cover')"
							class="text-destructive text-sm"
						>
							{{ getRecordFieldError('cover') }}
						</p>
					</div>

					<div class="space-y-2">
						<Label>Default genres</Label>
						<TagsInput v-model="genres">
							<TagsInputItem
								v-for="(genre, index) in genres"
								:key="`manual-genre-${index}`"
								:value="genre"
							>
								<TagsInputItemText>{{ genre }}</TagsInputItemText>
								<TagsInputItemDelete />
							</TagsInputItem>
							<TagsInputInput placeholder="House, Techno..." />
						</TagsInput>
					</div>

					<div class="space-y-2">
						<Label>Default RPM</Label>
						<Select v-model="defaultRpm">
							<SelectTrigger class="w-full">
								<SelectValue placeholder="Select RPM" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem :value="null">Not specified</SelectItem>
								<SelectItem :value="33">33 RPM</SelectItem>
								<SelectItem :value="45">45 RPM</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				<div v-else class="space-y-5">
					<div class="grid gap-3 md:grid-cols-[1fr_auto]">
						<Textarea
							v-model="pasteValue"
							class="min-h-24 font-mono text-sm"
							placeholder="A1 Track title&#10;A2 Track title"
						/>
						<Button
							variant="outline"
							class="md:self-start"
							:disabled="!pasteValue.trim()"
							@click="addPastedRows"
						>
							<ClipboardList class="mr-2 size-4" />
							Add pasted rows
						</Button>
					</div>

					<div class="space-y-3">
						<div
							v-for="(row, index) in trackRows"
							:key="row.id"
							class="border-border grid gap-3 rounded-md border p-3 lg:grid-cols-[5rem_minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_5.5rem_9rem_2.5rem]"
						>
							<div class="space-y-1">
								<Label :for="`manual-track-position-${row.id}`">Pos</Label>
								<Input
									:id="`manual-track-position-${row.id}`"
									v-model="row.position"
									:name="`track-position-${index}`"
									placeholder="A1"
									:class="{
										'border-destructive': shouldShowTrackError(row, 'position')
									}"
								/>
							</div>

							<div class="space-y-1">
								<Label :for="`manual-track-title-${row.id}`">
									Title
									<span class="text-primary -ml-0.5">*</span>
								</Label>
								<Input
									:id="`manual-track-title-${row.id}`"
									v-model="row.title"
									:name="`track-title-${index}`"
									placeholder="Track title"
									:class="{
										'border-destructive': shouldShowTrackError(row, 'title')
									}"
								/>
							</div>

							<div class="space-y-1">
								<Label :for="`manual-track-artist-${row.id}`">Artist</Label>
								<Input
									:id="`manual-track-artist-${row.id}`"
									v-model="row.artist"
									:name="`track-artist-${index}`"
									placeholder="Record artist"
								/>
							</div>

							<div class="space-y-1">
								<Label :for="`manual-track-duration-${row.id}`">Time</Label>
								<Input
									:id="`manual-track-duration-${row.id}`"
									v-model="row.duration"
									:name="`track-duration-${index}`"
									placeholder="3:45"
									:class="{
										'border-destructive': shouldShowTrackError(row, 'duration')
									}"
								/>
							</div>

							<div class="space-y-1">
								<Label :for="`manual-track-bpm-${row.id}`">BPM</Label>
								<Input
									:id="`manual-track-bpm-${row.id}`"
									v-model="row.bpm"
									:name="`track-bpm-${index}`"
									inputmode="decimal"
									placeholder="128"
									:class="{
										'border-destructive': shouldShowTrackError(row, 'bpm')
									}"
								/>
							</div>

							<div class="space-y-1">
								<Label>Key</Label>
								<Select v-model="row.keyComposite">
									<SelectTrigger
										class="w-full"
										:class="{
											'border-destructive': shouldShowTrackError(
												row,
												'keyComposite'
											)
										}"
									>
										<SelectValue placeholder="Key" />
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
							</div>

							<div class="flex items-end justify-end">
								<Button
									size="icon"
									variant="destructive-ghost"
									title="Remove track row"
									aria-label="Remove track row"
									@click="removeTrackRow(row.id)"
								>
									<Trash2 />
								</Button>
							</div>

							<div
								v-if="
									shouldShowTrackError(row, 'position') ||
									shouldShowTrackError(row, 'title') ||
									shouldShowTrackError(row, 'duration') ||
									shouldShowTrackError(row, 'bpm') ||
									shouldShowTrackError(row, 'keyComposite')
								"
								class="text-destructive text-sm lg:col-span-7"
							>
								{{
									getTrackFieldError(row, 'title') ||
									getTrackFieldError(row, 'position') ||
									getTrackFieldError(row, 'duration') ||
									getTrackFieldError(row, 'bpm') ||
									getTrackFieldError(row, 'keyComposite')
								}}
							</div>
						</div>
					</div>

					<Button variant="outline" @click="addTrackRow">
						<Plus class="mr-2 size-4" />
						Add row
					</Button>
				</div>
			</div>

			<DialogFooter class="gap-2">
				<Button
					v-if="step === 'tracks'"
					variant="secondary"
					@click="goToRecordStep"
				>
					<ArrowLeft class="mr-2 size-4" />
					Back
				</Button>
				<Button
					v-if="step === 'record'"
					variant="default"
					@click="goToTracksStep"
				>
					Next
				</Button>
				<Button
					v-else
					:loading="records.isCreatingRecord"
					@click="saveManualRecord"
				>
					<Save class="mr-2 size-4" />
					{{ saveLabel }}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
