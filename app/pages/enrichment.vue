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
	Loader2,
	RefreshCw,
	ShieldCheck,
	Upload,
	X
} from 'lucide-vue-next'
import { parseRekordboxXml } from '~/utils/rekordboxXml'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import {
	buildTrackEnrichmentRowsAsync,
	buildTrackEnrichmentUpdate
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
const selectedFileName = ref<string | null>(null)
const rows = ref<TrackEnrichmentRow[]>([])
const approvedIds = ref<Set<string>>(new Set())
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

const rowsPerPage = 100
const workflowSteps = [
	{ number: 1, label: 'Import XML' },
	{ number: 2, label: 'Review matches' },
	{ number: 3, label: 'Apply updates' }
] as const

const currentStep = computed<1 | 2 | 3>(() => {
	if (showApplyDialog.value || isApplying.value || lastApplySummary.value)
		return 3
	return rows.value.length > 0 ? 2 : 1
})

const matchedRows = computed(() => rows.value.filter((row) => !!row.track))
const readyRows = computed(() =>
	rows.value.filter((row) => row.defaultApproved && !row.applied)
)
const reviewRows = computed(() =>
	rows.value.filter(
		(row) =>
			!!row.track &&
			!row.applied &&
			!row.defaultApproved &&
			(row.canFillBpm || row.canFillKeyMode || !!row.approvalBlockedReason)
	)
)
const unmatchedRows = computed(() => rows.value.filter((row) => !row.track))
const doneRows = computed(() =>
	rows.value.filter((row) => row.applied || row.alreadyComplete)
)
const stagedRows = computed(() =>
	rows.value.filter(
		(row) => approvedIds.value.has(row.id) && canApproveRow(row)
	)
)
const blockedCount = computed(
	() => rows.value.filter((row) => !!row.approvalBlockedReason).length
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
const approvableFilteredRows = computed(() =>
	filteredRows.value.filter(canApproveRow)
)
const stagedFilteredCount = computed(
	() =>
		approvableFilteredRows.value.filter((row) => approvedIds.value.has(row.id))
			.length
)
const filteredSelectionState = computed<boolean | 'indeterminate'>(() => {
	if (stagedFilteredCount.value === 0) return false
	if (stagedFilteredCount.value === approvableFilteredRows.value.length)
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

const approvedRows = computed(() => stagedRows.value)
const selectedBpmCount = computed(
	() => approvedRows.value.filter((row) => row.canFillBpm).length
)
const selectedKeyModeCount = computed(
	() => approvedRows.value.filter((row) => row.canFillKeyMode).length
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

async function parseFile(file: File) {
	isParsing.value = true
	parseCompleted.value = 0
	parseTotal.value = 0
	parseWarnings.value = []
	parseErrors.value = []
	rows.value = []
	approvedIds.value = new Set()
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
			xmlTracks: result.tracks,
			tracks: tracks.tracks,
			records: records.records,
			onProgress: (completed, total) => {
				parseCompleted.value = completed
				parseTotal.value = total
			}
		})
		rows.value = nextRows
		approvedIds.value = new Set(
			nextRows.filter((row) => row.defaultApproved).map((row) => row.id)
		)
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown parse error'
		parseErrors.value = [message]
	} finally {
		isParsing.value = false
	}
}

function canApproveRow(row: TrackEnrichmentRow): boolean {
	return (
		!!row.track &&
		!row.applied &&
		!row.approvalBlockedReason &&
		(row.canFillBpm || row.canFillKeyMode)
	)
}

function isRowApproved(row: TrackEnrichmentRow): boolean {
	return approvedIds.value.has(row.id)
}

function setRowApproved(row: TrackEnrichmentRow, checked: boolean) {
	if (!canApproveRow(row)) return
	const nextApproved = new Set(approvedIds.value)
	if (checked) nextApproved.add(row.id)
	else nextApproved.delete(row.id)
	approvedIds.value = nextApproved
}

function setFilteredRowsApproved(checked: boolean) {
	const nextApproved = new Set(approvedIds.value)
	for (const row of approvableFilteredRows.value) {
		if (checked) nextApproved.add(row.id)
		else nextApproved.delete(row.id)
	}
	approvedIds.value = nextApproved
}

function clearSelection() {
	approvedIds.value = new Set()
}

function formatBpm(value: number | null | undefined): string {
	return value === null || value === undefined ? '-' : value.toFixed(1)
}

function formatKeyValue(
	key: number | null | undefined,
	mode: number | null | undefined
): string {
	if (
		key === null ||
		key === undefined ||
		mode === null ||
		mode === undefined
	) {
		return '-'
	}
	return getFormattedKeyString(key, mode, user.currentKeyFormat, 'short')
}

function formatTrackArtists(row: TrackEnrichmentRow): string {
	if (!row.track) return '-'
	return row.track.artists.map((artist) => artist.name).join(', ') || '-'
}

function getConfidenceVariant(confidence: TrackEnrichmentRow['confidence']) {
	if (confidence === 'high') return 'default'
	if (confidence === 'medium') return 'secondary'
	return 'outline'
}

function getRowClasses(row: TrackEnrichmentRow): string {
	if (row.error) return 'bg-destructive/5'
	if (isRowApproved(row))
		return 'border-l-2 border-l-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/15'
	if (row.approvalBlockedReason || row.hasConflict) return 'bg-amber-500/5'
	return ''
}

function openApplyReview() {
	if (approvedRows.value.length === 0) {
		toast.warning('Select at least one match to apply.')
		return
	}
	showApplyDialog.value = true
}

async function applyApprovedRows() {
	const rowsToApply = approvedRows.value
	const importedAt = new Date().toISOString()
	const selectedBpm = selectedBpmCount.value
	const selectedKeyMode = selectedKeyModeCount.value
	const updatesWithRows = rowsToApply
		.map((row) => ({
			row,
			update: buildTrackEnrichmentUpdate(
				row,
				selectedFileName.value ?? 'unknown.xml',
				importedAt
			)
		}))
		.filter((entry) => entry.update !== null)

	if (updatesWithRows.length === 0) {
		toast.warning('No selected matches can be applied.')
		showApplyDialog.value = false
		return
	}

	isApplying.value = true
	applyCompleted.value = 0
	applyTotal.value = updatesWithRows.length
	rows.value = rows.value.map((row) =>
		approvedIds.value.has(row.id) ? { ...row, error: null } : row
	)

	try {
		const results = await tracks.updateTracksBatch(
			updatesWithRows.map((entry) => entry.update!),
			{
				onProgress: (completed) => {
					applyCompleted.value = completed
				}
			}
		)

		rows.value = rows.value.map((row) => {
			const resultIndex = updatesWithRows.findIndex(
				(entry) => entry.row.id === row.id
			)
			if (resultIndex === -1) return row

			const result = results[resultIndex]
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
		lastApplySummary.value = {
			total: results.length,
			succeeded,
			failed,
			bpm: selectedBpm,
			keyMode: selectedKeyMode
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
						<h1 class="text-xl font-semibold">Track Enrichment</h1>
						<p class="text-muted-foreground truncate text-sm">
							{{ selectedFileName || 'Import BPM and key from Rekordbox' }}
						</p>
					</div>

					<Button
						v-if="rows.length > 0 && !lastApplySummary"
						variant="outline"
						:loading="isParsing"
						@click="openFilePicker"
					>
						<RefreshCw class="mr-2 size-4" />
						Replace XML
					</Button>
				</div>

				<div
					class="border-border grid grid-cols-3 overflow-hidden rounded-md border"
				>
					<div
						v-for="step in workflowSteps"
						:key="step.number"
						class="border-border flex min-w-0 items-center gap-2 border-r px-2 py-2.5 last:border-r-0 sm:px-4"
						:class="
							currentStep === step.number ? 'bg-muted/60' : 'bg-background'
						"
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
							class="truncate text-xs font-medium sm:text-sm"
							:class="
								currentStep === step.number
									? 'text-foreground'
									: 'text-muted-foreground'
							"
						>
							{{ step.label }}
						</span>
					</div>
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

					<div
						v-if="rows.length === 0"
						class="border-border flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed p-8 text-center"
					>
						<FileUp class="text-muted-foreground mb-3 size-9" />
						<h2 class="text-base font-semibold">
							Choose a Rekordbox collection XML
						</h2>
						<p class="text-muted-foreground mt-1 max-w-lg text-sm">
							Matches are reviewed before applying. Existing BPM and key values
							are never overwritten.
						</p>
						<Button class="mt-5" :loading="isParsing" @click="openFilePicker">
							<FileUp class="mr-2 size-4" />
							Select XML
						</Button>
						<div
							v-if="isParsing && parseTotal > 0"
							class="mt-4 flex w-full max-w-sm flex-col gap-2"
						>
							<div
								class="text-muted-foreground flex items-center justify-between text-xs"
							>
								<span>Matching collection</span>
								<span class="font-mono">
									{{ parseCompleted }} / {{ parseTotal }}
								</span>
							</div>
							<Progress :model-value="parseProgress" />
						</div>
					</div>

					<div v-else-if="lastApplySummary" class="py-8 sm:py-12">
						<div
							class="mx-auto flex max-w-2xl flex-col items-center text-center"
						>
							<CheckCircle2 class="text-primary size-10" />
							<h2 class="mt-4 text-lg font-semibold">Enrichment complete</h2>
							<p class="text-muted-foreground mt-1 text-sm">
								{{ lastApplySummary.succeeded }} of {{ lastApplySummary.total }}
								selected tracks updated.
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
								<Button @click="openFilePicker">
									<FileUp class="mr-2 size-4" />
									Import another XML
								</Button>
							</div>
						</div>
					</div>

					<template v-else>
						<div
							class="border-border grid grid-cols-2 divide-x divide-y overflow-hidden rounded-md border sm:grid-cols-6 sm:divide-y-0"
						>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">XML tracks</div>
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
									{{ approvedRows.length }}
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
										approvableFilteredRows.length === 0 ||
										filteredSelectionState === true
									"
									@click="setFilteredRowsApproved(true)"
								>
									<ListChecks class="mr-1.5 size-4" />
									Stage all eligible ({{ approvableFilteredRows.length }})
								</Button>
								<Button
									variant="ghost"
									size="sm"
									:disabled="approvedRows.length === 0"
									@click="clearSelection"
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
							<div class="border-border overflow-x-auto rounded-md border">
								<Table class="min-w-[1160px] table-fixed">
									<TableHeader>
										<TableRow>
											<TableHead class="w-32">
												<div class="flex items-center gap-2">
													<Checkbox
														:model-value="filteredSelectionState"
														:disabled="
															approvableFilteredRows.length === 0 || isApplying
														"
														large-hit-area
														aria-label="Stage all eligible tracks in this view"
														@update:model-value="
															setFilteredRowsApproved($event === true)
														"
													/>
													<span>Stage</span>
												</div>
											</TableHead>
											<TableHead class="w-[21%]">Crate Guide match</TableHead>
											<TableHead class="w-[21%]">XML source</TableHead>
											<TableHead class="w-32">BPM</TableHead>
											<TableHead class="w-36">Key</TableHead>
											<TableHead>Confidence</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<TableRow
											v-for="row in pagedRows"
											:key="row.id"
											:class="getRowClasses(row)"
										>
											<TableCell>
												<div class="flex items-center gap-2">
													<Checkbox
														:model-value="isRowApproved(row)"
														:disabled="!canApproveRow(row) || isApplying"
														large-hit-area
														:aria-label="`Stage ${row.source.name || 'XML track'}`"
														@update:model-value="
															setRowApproved(row, $event === true)
														"
													/>
													<span
														v-if="isRowApproved(row)"
														class="text-xs font-medium text-emerald-700 dark:text-emerald-400"
													>
														Staged
													</span>
													<span
														v-else-if="canApproveRow(row)"
														class="text-muted-foreground text-xs"
													>
														Not staged
													</span>
													<span v-else class="text-muted-foreground text-xs">
														Unavailable
													</span>
												</div>
											</TableCell>
											<TableCell class="whitespace-normal">
												<div class="truncate font-medium">
													{{ row.track?.title || '-' }}
												</div>
												<div class="text-muted-foreground truncate text-xs">
													{{ formatTrackArtists(row) }}
												</div>
												<div class="text-muted-foreground truncate text-xs">
													{{ row.record?.title || '-' }}
												</div>
											</TableCell>
											<TableCell class="whitespace-normal">
												<div class="truncate font-medium">
													{{ row.source.name || '-' }}
												</div>
												<div class="text-muted-foreground truncate text-xs">
													{{ row.source.artist || '-' }}
												</div>
												<div class="text-muted-foreground truncate text-xs">
													{{
														row.source.album || row.source.locationHint || '-'
													}}
												</div>
											</TableCell>
											<TableCell class="font-mono text-xs">
												<div
													class="grid grid-cols-[1fr_auto_1fr] items-center gap-1"
												>
													<span class="text-muted-foreground text-right">
														{{ formatBpm(row.track?.bpm) }}
													</span>
													<ArrowRight class="text-muted-foreground size-3" />
													<span :class="row.canFillBpm ? 'font-semibold' : ''">
														{{ formatBpm(row.proposedBpm) }}
													</span>
												</div>
											</TableCell>
											<TableCell class="font-mono text-xs">
												<div
													class="grid grid-cols-[1fr_auto_1fr] items-center gap-1"
												>
													<span class="text-muted-foreground text-right">
														{{
															formatKeyValue(row.track?.key, row.track?.mode)
														}}
													</span>
													<ArrowRight class="text-muted-foreground size-3" />
													<span
														:class="row.canFillKeyMode ? 'font-semibold' : ''"
													>
														{{
															formatKeyValue(row.proposedKey, row.proposedMode)
														}}
													</span>
												</div>
											</TableCell>
											<TableCell class="whitespace-normal">
												<div class="mb-1 flex flex-wrap items-center gap-1">
													<Badge
														:variant="getConfidenceVariant(row.confidence)"
													>
														{{ row.confidence }}
													</Badge>
													<Badge
														v-if="row.approvalBlockedReason"
														variant="outline"
													>
														<AlertTriangle class="size-3" />
														Blocked
													</Badge>
													<Badge v-else-if="row.hasConflict" variant="outline">
														<AlertTriangle class="size-3" />
														Conflict
													</Badge>
													<Badge v-if="row.applied" variant="secondary">
														<Check class="size-3" />
														Applied
													</Badge>
													<Badge
														v-if="isApplying && isRowApproved(row)"
														variant="outline"
													>
														<Loader2 class="size-3 animate-spin" />
														Queued
													</Badge>
												</div>
												<div class="text-muted-foreground line-clamp-2 text-xs">
													{{ row.reasons.join(', ') || 'No reliable match' }}
												</div>
												<div
													v-if="row.warnings.length"
													class="mt-1 line-clamp-2 text-xs text-amber-700 dark:text-amber-400"
												>
													{{ row.warnings.join(', ') }}
												</div>
												<div
													v-if="row.error"
													class="text-destructive mt-1 text-xs"
												>
													{{ row.error }}
												</div>
											</TableCell>
										</TableRow>
									</TableBody>
								</Table>
							</div>

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
										{{ approvedRows.length }} tracks staged for import
									</div>
									<div class="text-muted-foreground text-xs">
										{{ selectedBpmCount }} BPM and
										{{ selectedKeyModeCount }} key values will be filled
									</div>
								</div>
							</div>
							<Button
								:disabled="approvedRows.length === 0 || isApplying"
								@click="openApplyReview"
							>
								<ShieldCheck class="mr-2 size-4" />
								Review staged updates ({{ approvedRows.length }})
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
						Apply {{ approvedRows.length }} staged track updates?
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
							{{ approvedRows.length }}
						</div>
					</div>
					<div class="px-3 py-3 text-center">
						<div class="text-muted-foreground text-xs">BPM</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							{{ selectedBpmCount }}
						</div>
					</div>
					<div class="px-3 py-3 text-center">
						<div class="text-muted-foreground text-xs">Keys</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							{{ selectedKeyModeCount }}
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
					<Button :loading="isApplying" @click="applyApprovedRows">
						<Upload class="mr-2 size-4" />
						Apply updates
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>
