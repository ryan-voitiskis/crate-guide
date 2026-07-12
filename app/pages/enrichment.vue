<script setup lang="ts">
import { toast } from 'vue-sonner'
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Check,
	CheckCircle2,
	FileUp,
	ListChecks,
	RefreshCw,
	ShieldCheck,
	Upload,
	X
} from 'lucide-vue-next'
import type { LocalAudioReviewSelection } from '~/types/localAudio'
import { parseRekordboxXml } from '~/utils/rekordboxXml'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import {
	buildTrackEnrichmentRowsAsync,
	buildTrackEnrichmentUpdate,
	canStageTrackEnrichmentRow
} from '~/utils/trackEnrichment'

type ReviewFilter =
	| 'ready'
	| 'review'
	| 'staged'
	| 'matched'
	| 'unmatched'
	| 'done'
type ApplySummary = {
	total: number
	succeeded: number
	failed: number
	bpm: number
	keyMode: number
}

const records = useRecordsStore()
const tracks = useTracksStore()
const user = useUserStore()

const fileInput = ref<HTMLInputElement | null>(null)
const activeSource = ref<'rekordboxXml' | 'localAudio'>('rekordboxXml')
const selectedFileName = ref<string | null>(null)
const rows = ref<TrackEnrichmentRow[]>([])
const stagedRowIds = ref<Set<string>>(new Set())
const selectedFilter = ref<ReviewFilter>('ready')
const currentPage = ref(1)
const parseWarnings = ref<string[]>([])
const parseErrors = ref<string[]>([])
const isParsing = ref(false)
const parseCompleted = ref(0)
const parseTotal = ref(0)
const isApplying = ref(false)
const showApplyDialog = ref(false)
const applyCompleted = ref(0)
const applyTotal = ref(0)
const lastApplySummary = ref<ApplySummary | null>(null)
const workflowView = ref<'source' | 'review'>('source')

const rowsPerPage = 100
const workflowSteps = [
	{ number: 1, label: 'Choose source', shortLabel: 'Source' },
	{ number: 2, label: 'Review matches', shortLabel: 'Review' },
	{ number: 3, label: 'Apply updates', shortLabel: 'Apply' }
] as const

const currentStep = computed<1 | 2 | 3>(() => {
	if (showApplyDialog.value || isApplying.value || lastApplySummary.value)
		return 3
	return workflowView.value === 'review' && rows.value.length > 0 ? 2 : 1
})

const matchedRows = computed(() => rows.value.filter((row) => !!row.track))
const readyRows = computed(() =>
	rows.value.filter((row) => row.defaultStaged && !row.applied)
)
const reviewRows = computed(() =>
	rows.value.filter(
		(row) =>
			!!row.track &&
			!row.applied &&
			!row.defaultStaged &&
			(row.canFillBpm || row.canFillKeyMode || !!row.stagingBlockedReason)
	)
)
const unmatchedRows = computed(() => rows.value.filter((row) => !row.track))
const doneRows = computed(() =>
	rows.value.filter((row) => row.applied || row.alreadyComplete)
)
const stagedRows = computed(() =>
	rows.value.filter(
		(row) => stagedRowIds.value.has(row.id) && canStageTrackEnrichmentRow(row)
	)
)
const blockedCount = computed(
	() => rows.value.filter((row) => !!row.stagingBlockedReason).length
)
const rowErrorCount = computed(
	() => rows.value.filter((row) => !!row.error).length
)
const errorCount = computed(
	() => parseErrors.value.length + rowErrorCount.value
)
const matchRate = computed(() => {
	if (rows.value.length === 0) return '0%'
	return `${((matchedRows.value.length / rows.value.length) * 100).toFixed(1)}%`
})
const applyProgress = computed(() =>
	applyTotal.value === 0
		? 0
		: Math.round((applyCompleted.value / applyTotal.value) * 100)
)
const parseProgress = computed(() =>
	parseTotal.value === 0
		? 0
		: Math.round((parseCompleted.value / parseTotal.value) * 100)
)
const visibleParseWarnings = computed(() => parseWarnings.value.slice(0, 5))
const sourceLabel = computed(() =>
	activeSource.value === 'rekordboxXml' ? 'Rekordbox XML' : 'Local audio'
)

const filterOptions = computed<
	{ value: ReviewFilter; label: string; count: number }[]
>(() => [
	{ value: 'ready', label: 'Ready', count: readyRows.value.length },
	{ value: 'review', label: 'Needs review', count: reviewRows.value.length },
	{ value: 'staged', label: 'Staged', count: stagedRows.value.length },
	{ value: 'matched', label: 'All matches', count: matchedRows.value.length },
	{
		value: 'unmatched',
		label: 'Not in collection',
		count: unmatchedRows.value.length
	},
	{ value: 'done', label: 'Done', count: doneRows.value.length }
])

const filteredRows = computed(() => {
	switch (selectedFilter.value) {
		case 'ready':
			return readyRows.value
		case 'review':
			return reviewRows.value
		case 'staged':
			return stagedRows.value
		case 'matched':
			return matchedRows.value
		case 'unmatched':
			return unmatchedRows.value
		case 'done':
			return doneRows.value
		default:
			return []
	}
})
const stageableFilteredRows = computed(() =>
	filteredRows.value.filter(canStageTrackEnrichmentRow)
)
const stagedFilteredCount = computed(
	() =>
		stageableFilteredRows.value.filter((row) => stagedRowIds.value.has(row.id))
			.length
)
const filteredSelectionState = computed<boolean | 'indeterminate'>(() => {
	if (stagedFilteredCount.value === 0) return false
	if (stagedFilteredCount.value === stageableFilteredRows.value.length)
		return true
	return 'indeterminate'
})
const pageCount = computed(() =>
	Math.max(1, Math.ceil(filteredRows.value.length / rowsPerPage))
)
const pagedRows = computed(() => {
	const start = (currentPage.value - 1) * rowsPerPage
	return filteredRows.value.slice(start, start + rowsPerPage)
})
const shownStart = computed(() =>
	filteredRows.value.length === 0
		? 0
		: (currentPage.value - 1) * rowsPerPage + 1
)
const shownEnd = computed(() =>
	Math.min(currentPage.value * rowsPerPage, filteredRows.value.length)
)

const stagedBpmCount = computed(
	() => stagedRows.value.filter((row) => row.canFillBpm).length
)
const stagedKeyModeCount = computed(
	() => stagedRows.value.filter((row) => row.canFillKeyMode).length
)

watch(selectedFilter, () => {
	currentPage.value = 1
})

watch(pageCount, (nextPageCount) => {
	if (currentPage.value > nextPageCount) currentPage.value = nextPageCount
})

onMounted(async () => {
	await Promise.all([records.fetchAllRecords(), tracks.fetchAllTracks()])
})

function isStepComplete(step: number): boolean {
	return currentStep.value > step || (step === 3 && !!lastApplySummary.value)
}

function canNavigateToStep(step: number): boolean {
	if (isParsing.value || isApplying.value || showApplyDialog.value) return false
	if (step === 1) return true
	return step === 2 && rows.value.length > 0
}

function navigateToStep(step: number) {
	if (!canNavigateToStep(step)) return
	if (step === 1) {
		workflowView.value = 'source'
		lastApplySummary.value = null
		return
	}
	workflowView.value = 'review'
	lastApplySummary.value = null
}

function openFilePicker() {
	fileInput.value?.click()
}

async function handleFileInput(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return

	await parseFile(file)
	input.value = ''
}

function handleFileDrop(file: File) {
	void parseFile(file)
}

async function parseFile(file: File) {
	activeSource.value = 'rekordboxXml'
	workflowView.value = 'source'
	isParsing.value = true
	parseCompleted.value = 0
	parseTotal.value = 0
	parseWarnings.value = []
	parseErrors.value = []
	rows.value = []
	stagedRowIds.value = new Set()
	selectedFileName.value = file.name
	selectedFilter.value = 'ready'
	currentPage.value = 1
	lastApplySummary.value = null

	try {
		await nextTick()
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		const result = parseRekordboxXml(await file.text())
		parseWarnings.value = result.warnings
		parseErrors.value = result.errors

		if (result.errors.length > 0) return

		parseTotal.value = result.tracks.length
		const nextRows = await buildTrackEnrichmentRowsAsync({
			sources: result.tracks,
			tracks: tracks.tracks,
			records: records.records,
			onProgress: (completed, total) => {
				parseCompleted.value = completed
				parseTotal.value = total
			}
		})
		rows.value = nextRows
		stagedRowIds.value = new Set(
			nextRows.filter((row) => row.defaultStaged).map((row) => row.id)
		)
		workflowView.value = 'review'
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown parse error'
		parseErrors.value = [message]
	} finally {
		isParsing.value = false
	}
}

async function reviewLocalSources(selection: LocalAudioReviewSelection) {
	const { sources } = selection
	isParsing.value = true
	parseCompleted.value = 0
	parseTotal.value = sources.length
	parseWarnings.value = []
	parseErrors.value = []
	rows.value = []
	stagedRowIds.value = new Set()
	selectedFileName.value = `${sources.length.toLocaleString()} files with data · ${selection.processedFiles.toLocaleString()} of ${selection.totalFiles.toLocaleString()} scanned`
	selectedFilter.value = 'ready'
	currentPage.value = 1
	lastApplySummary.value = null

	try {
		const nextRows = await buildTrackEnrichmentRowsAsync({
			sources,
			tracks: tracks.tracks,
			records: records.records,
			onProgress: (completed, total) => {
				parseCompleted.value = completed
				parseTotal.value = total
			}
		})
		rows.value = nextRows
		stagedRowIds.value = new Set(
			nextRows.filter((row) => row.defaultStaged).map((row) => row.id)
		)
		workflowView.value = 'review'
	} catch (error) {
		parseErrors.value = [
			error instanceof Error ? error.message : 'Unknown matching error'
		]
	} finally {
		isParsing.value = false
	}
}

function selectSource(source: 'rekordboxXml' | 'localAudio') {
	if (activeSource.value === source) return
	activeSource.value = source
	rows.value = []
	stagedRowIds.value = new Set()
	selectedFileName.value = null
	lastApplySummary.value = null
	workflowView.value = 'source'
}

function returnToSource() {
	workflowView.value = 'source'
	lastApplySummary.value = null
}

function startAnotherSource() {
	rows.value = []
	stagedRowIds.value = new Set()
	selectedFileName.value = null
	lastApplySummary.value = null
	workflowView.value = 'source'
}

function setRowStaged(row: TrackEnrichmentRow, checked: boolean) {
	if (!canStageTrackEnrichmentRow(row)) return
	const nextStagedIds = new Set(stagedRowIds.value)
	if (checked) nextStagedIds.add(row.id)
	else nextStagedIds.delete(row.id)
	stagedRowIds.value = nextStagedIds
}

function setFilteredRowsStaged(checked: boolean) {
	const nextStagedIds = new Set(stagedRowIds.value)
	for (const row of stageableFilteredRows.value) {
		if (checked) nextStagedIds.add(row.id)
		else nextStagedIds.delete(row.id)
	}
	stagedRowIds.value = nextStagedIds
}

function clearStagedRows() {
	stagedRowIds.value = new Set()
}

function openApplyReview() {
	if (stagedRows.value.length === 0) {
		toast.warning('Stage at least one match to apply.')
		return
	}
	showApplyDialog.value = true
}

async function applyStagedRows() {
	const rowsToApply = stagedRows.value
	const importedAt = new Date().toISOString()
	const preparedUpdates: {
		row: TrackEnrichmentRow
		update: NonNullable<ReturnType<typeof buildTrackEnrichmentUpdate>>
	}[] = []

	for (const row of rowsToApply) {
		const update = buildTrackEnrichmentUpdate(
			row,
			selectedFileName.value ?? sourceLabel.value,
			importedAt
		)
		if (update) preparedUpdates.push({ row, update })
	}

	if (preparedUpdates.length === 0) {
		toast.warning('No staged matches can be applied.')
		showApplyDialog.value = false
		return
	}

	isApplying.value = true
	applyCompleted.value = 0
	applyTotal.value = preparedUpdates.length
	rows.value = rows.value.map((row) =>
		stagedRowIds.value.has(row.id) ? { ...row, error: null } : row
	)

	try {
		const results = await tracks.updateTracksBatch(
			preparedUpdates.map((entry) => entry.update),
			{
				onProgress: (completed) => {
					applyCompleted.value = completed
				}
			}
		)
		const resultByRowId = new Map(
			preparedUpdates.map((entry, index) => [entry.row.id, results[index]])
		)

		rows.value = rows.value.map((row) => {
			const result = resultByRowId.get(row.id)
			if (!result) return row

			return {
				...row,
				track: result.track ?? row.track,
				applied: result.success,
				error: result.error
			}
		})

		const succeeded = results.filter((result) => result.success).length
		const failed = results.length - succeeded
		const successfulUpdates = preparedUpdates.filter(
			(_entry, index) => results[index]?.success
		)
		lastApplySummary.value = {
			total: results.length,
			succeeded,
			failed,
			bpm: successfulUpdates.filter(
				(entry) => entry.update.updates.bpm !== undefined
			).length,
			keyMode: successfulUpdates.filter(
				(entry) => entry.update.updates.key !== undefined
			).length
		}

		if (failed > 0) {
			toast.error(
				`Applied ${succeeded} of ${results.length}. ${failed} failed.`
			)
		} else {
			toast.success(`Applied ${succeeded} of ${results.length}.`)
		}
	} finally {
		isApplying.value = false
		showApplyDialog.value = false
	}
}

function returnToReview() {
	lastApplySummary.value = null
	workflowView.value = 'review'
	selectedFilter.value = errorCount.value > 0 ? 'review' : 'done'
}
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col">
		<div class="scrollbar-hidden flex-1 overflow-y-auto">
			<div class="mx-auto flex max-w-[1600px] flex-col gap-4 p-2 pb-0">
				<input
					ref="fileInput"
					type="file"
					accept=".xml,text/xml,application/xml"
					class="hidden"
					@change="handleFileInput"
				/>

				<div
					class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
				>
					<div class="min-w-0">
						<h1 class="text-xl font-semibold">BPM &amp; Key</h1>
						<p class="text-muted-foreground truncate text-sm">
							{{
								selectedFileName ||
								'Complete your collection with existing DJ analysis'
							}}
						</p>
					</div>

					<Button
						v-if="currentStep === 2"
						variant="outline"
						@click="returnToSource"
					>
						<ArrowLeft class="mr-2 size-4" />
						Back to source
					</Button>
				</div>

				<div
					class="border-border grid grid-cols-3 overflow-hidden rounded-md border"
				>
					<button
						v-for="step in workflowSteps"
						:key="step.number"
						type="button"
						:disabled="!canNavigateToStep(step.number)"
						class="border-border flex min-w-0 items-center gap-2 border-r px-2 py-2.5 last:border-r-0 sm:px-4"
						:class="
							currentStep === step.number
								? 'bg-muted/60'
								: canNavigateToStep(step.number)
									? 'bg-background hover:bg-muted/30'
									: 'bg-background cursor-default'
						"
						@click="navigateToStep(step.number)"
					>
						<div
							class="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
							:class="
								isStepComplete(step.number)
									? 'border-primary bg-primary text-primary-foreground'
									: currentStep === step.number
										? 'border-foreground text-foreground'
										: 'border-border text-muted-foreground'
							"
						>
							<Check v-if="isStepComplete(step.number)" class="size-3.5" />
							<span v-else>{{ step.number }}</span>
						</div>
						<span
							class="min-w-0 text-xs font-medium sm:text-sm"
							:class="
								currentStep === step.number
									? 'text-foreground'
									: 'text-muted-foreground'
							"
						>
							<span class="sm:hidden">{{ step.shortLabel }}</span>
							<span class="hidden sm:inline">{{ step.label }}</span>
						</span>
					</button>
				</div>

				<StateLoading
					v-if="records.isLoadingRecords || tracks.isLoadingTracks"
					message="Loading collection..."
				/>

				<template v-else>
					<NoticeError v-if="parseErrors.length" class="items-start">
						<div class="space-y-1">
							<div v-for="error in parseErrors" :key="error">{{ error }}</div>
						</div>
					</NoticeError>

					<NoticeWarning v-if="parseWarnings.length" class="items-start">
						<div class="space-y-1">
							<div v-for="warning in visibleParseWarnings" :key="warning">
								{{ warning }}
							</div>
							<div v-if="parseWarnings.length > visibleParseWarnings.length">
								+ {{ parseWarnings.length - visibleParseWarnings.length }} more
								warnings
							</div>
						</div>
					</NoticeWarning>

					<PanelTrackEnrichmentSource
						v-show="currentStep === 1"
						:active-source="activeSource"
						:is-parsing="isParsing"
						:parse-completed="parseCompleted"
						:parse-total="parseTotal"
						:parse-progress="parseProgress"
						@select-file="openFilePicker"
						@drop-file="handleFileDrop"
						@select-source="selectSource"
						@review-local="reviewLocalSources"
					/>

					<div v-if="lastApplySummary" class="py-8 sm:py-12">
						<div
							class="mx-auto flex max-w-2xl flex-col items-center text-center"
						>
							<CheckCircle2 class="text-primary size-10" />
							<h2 class="mt-4 text-lg font-semibold">Enrichment complete</h2>
							<p class="text-muted-foreground mt-1 text-sm">
								{{ lastApplySummary.succeeded }} of {{ lastApplySummary.total }}
								staged tracks updated.
							</p>

							<div
								class="border-border mt-6 grid w-full grid-cols-3 divide-x rounded-md border"
							>
								<div class="px-3 py-3">
									<div class="text-muted-foreground text-xs">Tracks</div>
									<div class="mt-1 text-xl font-semibold tabular-nums">
										{{ lastApplySummary.succeeded }}
									</div>
								</div>
								<div class="px-3 py-3">
									<div class="text-muted-foreground text-xs">BPM filled</div>
									<div class="mt-1 text-xl font-semibold tabular-nums">
										{{ lastApplySummary.bpm }}
									</div>
								</div>
								<div class="px-3 py-3">
									<div class="text-muted-foreground text-xs">Keys filled</div>
									<div class="mt-1 text-xl font-semibold tabular-nums">
										{{ lastApplySummary.keyMode }}
									</div>
								</div>
							</div>

							<NoticeError v-if="lastApplySummary.failed" class="mt-4 w-full">
								{{ lastApplySummary.failed }} updates failed. Review the result
								rows for details.
							</NoticeError>

							<div class="mt-6 flex flex-wrap justify-center gap-2">
								<Button variant="outline" @click="returnToReview">
									<ArrowLeft class="mr-2 size-4" />
									Review results
								</Button>
								<Button @click="startAnotherSource">
									<FileUp class="mr-2 size-4" />
									Use another source
								</Button>
							</div>
						</div>
					</div>

					<template v-else-if="currentStep === 2">
						<div
							class="border-border grid grid-cols-2 divide-x divide-y overflow-hidden rounded-md border sm:grid-cols-6 sm:divide-y-0"
						>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">
									{{ sourceLabel }} tracks
								</div>
								<div class="mt-0.5 text-lg font-semibold tabular-nums">
									{{ rows.length }}
								</div>
							</div>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">Matched</div>
								<div class="mt-0.5 flex items-baseline gap-1.5">
									<span class="text-lg font-semibold tabular-nums">
										{{ matchedRows.length }}
									</span>
									<span class="text-muted-foreground text-xs">
										{{ matchRate }}
									</span>
								</div>
							</div>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">Ready</div>
								<div
									class="text-primary mt-0.5 text-lg font-semibold tabular-nums"
								>
									{{ readyRows.length }}
								</div>
							</div>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">Needs review</div>
								<div class="mt-0.5 text-lg font-semibold tabular-nums">
									{{ reviewRows.length }}
								</div>
							</div>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">Staged</div>
								<div
									class="mt-0.5 text-lg font-semibold text-emerald-700 tabular-nums dark:text-emerald-400"
								>
									{{ stagedRows.length }}
								</div>
							</div>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">
									Not in collection
								</div>
								<div class="mt-0.5 text-lg font-semibold tabular-nums">
									{{ unmatchedRows.length }}
								</div>
							</div>
						</div>

						<div
							v-if="blockedCount || errorCount"
							class="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
						>
							<span v-if="blockedCount" class="flex items-center gap-1.5">
								<AlertTriangle class="size-3.5 text-amber-600" />
								{{ blockedCount }} competing matches blocked
							</span>
							<span v-if="errorCount" class="text-destructive">
								{{ errorCount }} errors
							</span>
						</div>

						<div
							class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"
						>
							<ToggleGroup
								v-model="selectedFilter"
								type="single"
								variant="outline"
								class="max-w-full flex-wrap justify-start"
							>
								<ToggleGroupItem
									v-for="option in filterOptions"
									:key="option.value"
									:value="option.value"
									size="sm"
									class="gap-1.5"
								>
									{{ option.label }}
									<span class="text-muted-foreground tabular-nums">
										{{ option.count }}
									</span>
								</ToggleGroupItem>
							</ToggleGroup>

							<div class="flex items-center gap-1 self-end lg:self-auto">
								<Button
									variant="ghost"
									size="sm"
									:disabled="
										stageableFilteredRows.length === 0 ||
										filteredSelectionState === true
									"
									@click="setFilteredRowsStaged(true)"
								>
									<ListChecks class="mr-1.5 size-4" />
									Stage all eligible ({{ stageableFilteredRows.length }})
								</Button>
								<Button
									variant="ghost"
									size="sm"
									:disabled="stagedRows.length === 0"
									@click="clearStagedRows"
								>
									<X class="mr-1.5 size-4" />
									Clear staged
								</Button>
							</div>
						</div>

						<div
							v-if="filteredRows.length === 0"
							class="border-border flex min-h-40 items-center justify-center rounded-md border border-dashed"
						>
							<div
								class="text-muted-foreground flex items-center gap-2 text-sm"
							>
								<RefreshCw class="size-4" />
								No rows in this view
							</div>
						</div>

						<template v-else>
							<TableTrackEnrichmentReview
								:rows="pagedRows"
								:staged-row-ids="stagedRowIds"
								:filtered-selection-state="filteredSelectionState"
								:stageable-row-count="stageableFilteredRows.length"
								:is-applying="isApplying"
								:key-format="user.currentKeyFormat"
								:source-label="sourceLabel"
								@stage-all="setFilteredRowsStaged"
								@stage-row="setRowStaged"
							/>

							<div class="flex items-center justify-between gap-3 pb-2 text-sm">
								<div class="text-muted-foreground tabular-nums">
									{{ shownStart }}-{{ shownEnd }} of {{ filteredRows.length }}
								</div>
								<div class="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										:disabled="currentPage === 1"
										@click="currentPage--"
									>
										<ArrowLeft class="size-4" />
										<span class="sr-only">Previous page</span>
									</Button>
									<span class="text-muted-foreground tabular-nums">
										{{ currentPage }} / {{ pageCount }}
									</span>
									<Button
										variant="outline"
										size="sm"
										:disabled="currentPage === pageCount"
										@click="currentPage++"
									>
										<ArrowRight class="size-4" />
										<span class="sr-only">Next page</span>
									</Button>
								</div>
							</div>
						</template>

						<div
							class="border-border bg-background/95 sticky bottom-0 z-10 -mx-2 mt-1 flex flex-col gap-2 border-t-2 border-t-emerald-500 px-3 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="flex min-w-0 items-center gap-3">
								<div
									class="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
								>
									<ListChecks class="size-4" />
								</div>
								<div class="min-w-0">
									<div class="text-sm font-semibold">
										{{ stagedRows.length }} tracks staged for import
									</div>
									<div class="text-muted-foreground text-xs">
										{{ stagedBpmCount }} BPM and {{ stagedKeyModeCount }} key
										values will be filled
									</div>
								</div>
							</div>
							<Button
								:disabled="stagedRows.length === 0 || isApplying"
								@click="openApplyReview"
							>
								<ShieldCheck class="mr-2 size-4" />
								Review staged updates ({{ stagedRows.length }})
							</Button>
						</div>
					</template>
				</template>
			</div>
		</div>

		<Dialog v-model:open="showApplyDialog">
			<DialogContent class="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						Apply {{ stagedRows.length }} staged track updates?
					</DialogTitle>
					<DialogDescription>
						Only blank fields will be filled. Existing BPM and key values remain
						unchanged.
					</DialogDescription>
				</DialogHeader>

				<div class="border-border grid grid-cols-3 divide-x rounded-md border">
					<div class="px-3 py-3 text-center">
						<div class="text-muted-foreground text-xs">Tracks</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							{{ stagedRows.length }}
						</div>
					</div>
					<div class="px-3 py-3 text-center">
						<div class="text-muted-foreground text-xs">BPM</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							{{ stagedBpmCount }}
						</div>
					</div>
					<div class="px-3 py-3 text-center">
						<div class="text-muted-foreground text-xs">Keys</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							{{ stagedKeyModeCount }}
						</div>
					</div>
				</div>

				<div class="text-muted-foreground flex items-start gap-2 text-sm">
					<ShieldCheck class="text-primary mt-0.5 size-4 shrink-0" />
					<span>Match details and source provenance will be retained.</span>
				</div>

				<div v-if="isApplying" class="flex flex-col gap-2">
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Applying updates</span>
						<span class="font-mono">
							{{ applyCompleted }} / {{ applyTotal }}
						</span>
					</div>
					<Progress :model-value="applyProgress" />
				</div>

				<DialogFooter class="gap-2">
					<Button
						variant="outline"
						:disabled="isApplying"
						@click="showApplyDialog = false"
					>
						Back to review
					</Button>
					<Button :loading="isApplying" @click="applyStagedRows">
						<Upload class="mr-2 size-4" />
						Apply updates
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>
