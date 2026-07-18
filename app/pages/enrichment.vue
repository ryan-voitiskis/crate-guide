<script setup lang="ts">
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Check,
	CheckCircle2,
	FileUp,
	ListChecks,
	RefreshCw,
	Search,
	ShieldCheck,
	Upload,
	WandSparkles,
	X
} from 'lucide-vue-next'
import {
	type TrackEnrichmentRow,
	canStageTrackEnrichmentRow
} from '~/utils/trackEnrichment'

type Density = 'compact' | 'comfortable'
type ReviewSortKey =
	| 'library'
	| 'source'
	| 'duration'
	| 'bpm'
	| 'key'
	| 'confidence'

const records = useWorkbenchRecordsStore()
const tracks = useWorkbenchTracksStore()
const user = useWorkbenchUserStore()
const capabilities = useWorkbenchCapabilities()
const isActive = usePageActive()

const fileInput = ref<HTMLInputElement | null>(null)
const collectionLoadState = ref<'loading' | 'ready' | 'failed'>('loading')
const density = useState<Density>('workbench-density', () => 'compact')
const reviewQuery = ref('')
const reviewSortKey = ref<ReviewSortKey | null>(null)
const reviewSortDirection = ref<'asc' | 'desc'>('asc')
const {
	activeSource,
	selectedFileName,
	rows,
	stagedRowIds,
	selectedFilter,
	currentPage,
	parseWarnings,
	parseErrors,
	isParsing,
	parseCompleted,
	parseTotal,
	isApplying,
	showApplyDialog,
	applyCompleted,
	applyTotal,
	lastApplySummary,
	currentStep,
	matchedRows,
	readyRows,
	reviewRows,
	unmatchedRows,
	stagedRows,
	blockedCount,
	errorCount,
	matchRate,
	applyProgress,
	parseProgress,
	visibleParseWarnings,
	sourceLabel,
	filterOptions,
	filteredRows,
	stagedBpmCount,
	stagedKeyModeCount,
	isStepComplete,
	canNavigateToStep,
	navigateToStep,
	parseFile,
	reviewLocalSources,
	selectSource,
	startAnotherSource,
	setRowStaged,
	setFilteredRowsStaged,
	clearStagedRows,
	openApplyReview,
	applyStagedRows,
	returnToReview
} = useTrackEnrichmentWorkflow({ records, tracks })

const rowsPerReviewPage = 100

function getReviewSearchText(row: TrackEnrichmentRow): string {
	return [
		row.track?.title,
		row.track?.position,
		row.track?.artists.map((artist) => artist.name).join(' '),
		row.record?.title,
		row.record?.labels[0]?.name,
		row.record?.labels[0]?.catno,
		row.source.name,
		row.source.artist,
		row.source.album,
		row.source.locationHint,
		row.source.sourceType === 'rekordboxXml' ? row.source.trackId : null,
		row.reasons.join(' '),
		row.warnings.join(' ')
	]
		.filter(Boolean)
		.join(' ')
		.toLocaleLowerCase()
}

const normalizedReviewQuery = computed(() =>
	reviewQuery.value.trim().toLocaleLowerCase()
)

const searchedReviewRows = computed(() => {
	if (!normalizedReviewQuery.value) return filteredRows.value
	return filteredRows.value.filter((row) =>
		getReviewSearchText(row).includes(normalizedReviewQuery.value)
	)
})

function compareNullableValues(
	left: string | number | null | undefined,
	right: string | number | null | undefined
): number {
	if (left === null || left === undefined || left === '')
		return right === null || right === undefined || right === '' ? 0 : 1
	if (right === null || right === undefined || right === '') return -1
	if (typeof left === 'number' && typeof right === 'number') return left - right
	return String(left).localeCompare(String(right), undefined, {
		numeric: true,
		sensitivity: 'base'
	})
}

function getReviewSortValue(
	row: TrackEnrichmentRow,
	key: ReviewSortKey
): string | number | null | undefined {
	switch (key) {
		case 'library':
			return `${row.track?.artists[0]?.name || ''} ${row.track?.title || ''}`
		case 'source':
			return `${row.source.artist || ''} ${row.source.name || ''}`
		case 'duration':
			return row.source.totalTimeSeconds
		case 'bpm':
			return row.proposedBpm
		case 'key':
			return row.proposedKey === null || row.proposedKey === undefined
				? null
				: row.proposedKey * 2 + (row.proposedMode ?? 0)
		case 'confidence':
			return (
				({ high: 300, medium: 200, manual: 100 } as const)[row.confidence] +
				row.score
			)
	}
}

const sortedReviewRows = computed(() => {
	if (!reviewSortKey.value) return searchedReviewRows.value

	const direction = reviewSortDirection.value === 'asc' ? 1 : -1
	const key = reviewSortKey.value
	return [...searchedReviewRows.value].sort(
		(left, right) =>
			compareNullableValues(
				getReviewSortValue(left, key),
				getReviewSortValue(right, key)
			) * direction
	)
})

const visibleStageableRows = computed(() =>
	searchedReviewRows.value.filter(canStageTrackEnrichmentRow)
)

const visibleStagedCount = computed(
	() =>
		visibleStageableRows.value.filter((row) => stagedRowIds.value.has(row.id))
			.length
)

const visibleSelectionState = computed<boolean | 'indeterminate'>(() => {
	if (visibleStagedCount.value === 0) return false
	if (visibleStagedCount.value === visibleStageableRows.value.length)
		return true
	return 'indeterminate'
})

const reviewPageCount = computed(() =>
	Math.max(1, Math.ceil(sortedReviewRows.value.length / rowsPerReviewPage))
)

const pagedReviewRows = computed(() => {
	const start = (currentPage.value - 1) * rowsPerReviewPage
	return sortedReviewRows.value.slice(start, start + rowsPerReviewPage)
})

const reviewShownStart = computed(() =>
	sortedReviewRows.value.length === 0
		? 0
		: (currentPage.value - 1) * rowsPerReviewPage + 1
)

const reviewShownEnd = computed(() =>
	Math.min(currentPage.value * rowsPerReviewPage, sortedReviewRows.value.length)
)

watch([reviewQuery, reviewSortKey, reviewSortDirection], () => {
	currentPage.value = 1
})

watch(reviewPageCount, (nextPageCount) => {
	if (currentPage.value > nextPageCount) currentPage.value = nextPageCount
})

watch(selectedFileName, (nextFileName, previousFileName) => {
	if (nextFileName === previousFileName) return
	reviewQuery.value = ''
	reviewSortKey.value = null
	reviewSortDirection.value = 'asc'
})

function setVisibleRowsStaged(checked: boolean) {
	if (!normalizedReviewQuery.value) {
		setFilteredRowsStaged(checked)
		return
	}

	for (const row of visibleStageableRows.value) setRowStaged(row, checked)
}

function setReviewSort(key: ReviewSortKey) {
	if (reviewSortKey.value === key) {
		reviewSortDirection.value =
			reviewSortDirection.value === 'asc' ? 'desc' : 'asc'
		return
	}

	reviewSortKey.value = key
	reviewSortDirection.value = key === 'confidence' ? 'desc' : 'asc'
}

const workflowSteps = [
	{ number: 1, label: 'Choose source', shortLabel: 'Source' },
	{ number: 2, label: 'Review matches', shortLabel: 'Review' },
	{ number: 3, label: 'Apply updates', shortLabel: 'Apply' }
] as const

onMounted(async () => {
	const results = await Promise.all([
		records.fetchAllRecords(),
		tracks.fetchAllTracks()
	])
	collectionLoadState.value = results.every((result) => result)
		? 'ready'
		: 'failed'
})

function openFilePicker() {
	if (!capabilities.canEnrichTracks) return
	fileInput.value?.click()
}

async function handleFileInput(event: Event) {
	if (!capabilities.canEnrichTracks) return
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return

	await parseFile(file)
	input.value = ''
}

function handleFileDrop(file: File) {
	if (!capabilities.canEnrichTracks) return
	void parseFile(file)
}
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col">
		<Teleport to="#header-left" defer>
			<template v-if="isActive">
				<div class="flex items-center gap-2">
					<WandSparkles class="text-primary size-4" />
					<span class="hidden text-xs font-semibold sm:inline">
						BPM &amp; Key
					</span>
				</div>

				<nav
					class="border-border bg-background/60 flex items-center gap-0.5 rounded-sm border p-0.5"
					aria-label="Enrichment workflow"
				>
					<button
						v-for="step in workflowSteps"
						:key="step.number"
						type="button"
						data-testid="enrichment-workflow-step"
						:disabled="
							collectionLoadState !== 'ready' || !canNavigateToStep(step.number)
						"
						:aria-label="step.label"
						:aria-current="currentStep === step.number ? 'step' : undefined"
						class="flex h-7 items-center gap-1.5 rounded-[2px] px-1.5 text-xs transition-colors disabled:cursor-default"
						:class="
							currentStep === step.number
								? 'bg-muted text-foreground'
								: canNavigateToStep(step.number)
									? 'text-muted-foreground hover:text-foreground'
									: 'text-muted-foreground/45'
						"
						@click="navigateToStep(step.number)"
					>
						<span
							class="flex size-4 items-center justify-center rounded-[2px] border font-mono text-[9px] font-semibold"
							:class="
								isStepComplete(step.number)
									? 'border-primary bg-primary text-primary-foreground'
									: currentStep === step.number
										? 'border-foreground text-foreground'
										: 'border-current'
							"
						>
							<Check v-if="isStepComplete(step.number)" class="size-3" />
							<span v-else>{{ step.number }}</span>
						</span>
						<span class="hidden lg:inline">{{ step.shortLabel }}</span>
					</button>
				</nav>
			</template>
		</Teleport>

		<div class="scrollbar-hidden flex-1 overflow-y-auto">
			<div
				class="flex w-full flex-col gap-3 p-3 pb-0 sm:p-4 sm:pb-0"
				:class="
					currentStep === 1
						? 'mx-auto max-w-3xl pt-5 sm:pt-8'
						: currentStep !== 2
							? 'mx-auto max-w-[1600px]'
							: ''
				"
			>
				<input
					ref="fileInput"
					type="file"
					accept=".xml,text/xml,application/xml"
					class="hidden"
					:disabled="!capabilities.canEnrichTracks"
					@change="handleFileInput"
				/>

				<StateLoading
					v-if="collectionLoadState === 'loading'"
					message="Loading collection..."
				/>

				<NoticeError v-else-if="collectionLoadState === 'failed'">
					Collection data could not be loaded. Refresh to try again.
				</NoticeError>

				<template v-else>
					<NoticeWarning v-if="!capabilities.canEnrichTracks">
						BPM and key import is shown for context, but file analysis and
						collection updates are disabled in the demo.
					</NoticeWarning>

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
						:selected-file-name="selectedFileName"
						:disabled="!capabilities.canEnrichTracks"
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
							class="border-border bg-card/40 grid grid-cols-2 divide-x divide-y overflow-hidden rounded-sm border sm:grid-cols-6 sm:divide-y-0"
						>
							<div class="px-3 py-2">
								<div
									class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
								>
									{{ sourceLabel }} tracks
								</div>
								<div class="mt-0.5 text-base font-semibold tabular-nums">
									{{ rows.length }}
								</div>
							</div>
							<div class="px-3 py-2">
								<div
									class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
								>
									Matched
								</div>
								<div class="mt-0.5 flex items-baseline gap-1.5">
									<span class="text-base font-semibold tabular-nums">
										{{ matchedRows.length }}
									</span>
									<span class="text-muted-foreground font-mono text-[10px]">
										{{ matchRate }}
									</span>
								</div>
							</div>
							<div class="px-3 py-2">
								<div
									class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
								>
									Ready
								</div>
								<div
									class="text-primary mt-0.5 text-base font-semibold tabular-nums"
								>
									{{ readyRows.length }}
								</div>
							</div>
							<div class="px-3 py-2">
								<div
									class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
								>
									Needs review
								</div>
								<div class="mt-0.5 text-base font-semibold tabular-nums">
									{{ reviewRows.length }}
								</div>
							</div>
							<div class="px-3 py-2">
								<div
									class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
								>
									Staged
								</div>
								<div
									class="mt-0.5 text-base font-semibold text-emerald-700 tabular-nums dark:text-emerald-400"
								>
									{{ stagedRows.length }}
								</div>
							</div>
							<div class="px-3 py-2">
								<div
									class="text-muted-foreground font-mono text-[9px] tracking-[0.08em] uppercase"
								>
									Not in collection
								</div>
								<div class="mt-0.5 text-base font-semibold tabular-nums">
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
							class="border-border bg-muted/20 flex flex-col gap-1.5 rounded-sm border p-1.5 xl:flex-row xl:items-center xl:justify-between"
						>
							<div class="workbench-scrollbar overflow-x-auto">
								<ToggleGroup
									v-model="selectedFilter"
									type="single"
									variant="outline"
									class="w-max justify-start"
								>
									<ToggleGroupItem
										v-for="option in filterOptions"
										:key="option.value"
										:value="option.value"
										size="sm"
										class="h-7 gap-1.5 rounded-sm px-2 text-xs"
									>
										{{ option.label }}
										<span class="text-muted-foreground font-mono tabular-nums">
											{{ option.count }}
										</span>
									</ToggleGroupItem>
								</ToggleGroup>
							</div>

							<div
								class="flex min-w-0 flex-wrap items-center justify-end gap-1.5"
							>
								<label
									class="border-border bg-background flex h-8 min-w-52 flex-1 items-center gap-2 rounded-sm border px-2 xl:w-72 xl:flex-none"
								>
									<Search class="text-muted-foreground size-3.5 shrink-0" />
									<input
										v-model="reviewQuery"
										type="search"
										class="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-xs outline-none"
										placeholder="Filter title, artist, release, ID..."
										aria-label="Filter enrichment matches"
									/>
									<span
										class="text-muted-foreground font-mono text-[10px] tabular-nums"
									>
										{{ searchedReviewRows.length }}
									</span>
									<button
										v-if="reviewQuery"
										type="button"
										class="text-muted-foreground hover:text-foreground -mr-1 flex size-6 items-center justify-center rounded-sm"
										aria-label="Clear match filter"
										@click="reviewQuery = ''"
									>
										<X class="size-3.5" />
									</button>
								</label>

								<ControlLibraryDensity
									v-model="density"
									class="hidden md:flex"
								/>

								<Button
									variant="ghost"
									size="sm"
									class="h-8 px-2 text-xs"
									:disabled="
										visibleStageableRows.length === 0 ||
										visibleSelectionState === true
									"
									@click="setVisibleRowsStaged(true)"
								>
									<ListChecks class="mr-1.5 size-3.5" />
									Stage eligible ({{ visibleStageableRows.length }})
								</Button>
								<Button
									variant="ghost"
									size="sm"
									class="h-8 px-2 text-xs"
									:disabled="stagedRows.length === 0"
									@click="clearStagedRows"
								>
									<X class="mr-1.5 size-3.5" />
									Clear staged
								</Button>
							</div>
						</div>

						<div
							v-if="searchedReviewRows.length === 0"
							class="border-border flex min-h-40 items-center justify-center rounded-md border border-dashed"
						>
							<div class="flex flex-col items-center gap-2 text-center">
								<RefreshCw class="size-4" />
								<div class="text-muted-foreground text-sm">
									{{
										reviewQuery
											? 'No matches for this filter'
											: 'No rows in this view'
									}}
								</div>
								<Button
									v-if="reviewQuery"
									variant="outline"
									size="sm"
									@click="reviewQuery = ''"
								>
									Clear filter
								</Button>
							</div>
						</div>

						<template v-else>
							<TableTrackEnrichmentReview
								:rows="pagedReviewRows"
								:staged-row-ids="stagedRowIds"
								:filtered-selection-state="visibleSelectionState"
								:stageable-row-count="visibleStageableRows.length"
								:is-applying="isApplying"
								:key-format="user.currentKeyFormat"
								:source-label="sourceLabel"
								:density="density"
								:sort-key="reviewSortKey"
								:sort-direction="reviewSortDirection"
								@sort="setReviewSort"
								@stage-all="setVisibleRowsStaged"
								@stage-row="setRowStaged"
							/>

							<div class="flex items-center justify-between gap-3 pb-1 text-xs">
								<div class="text-muted-foreground font-mono tabular-nums">
									{{ reviewShownStart }}-{{ reviewShownEnd }} of
									{{ sortedReviewRows.length }}
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
									<span class="text-muted-foreground font-mono tabular-nums">
										{{ currentPage }} / {{ reviewPageCount }}
									</span>
									<Button
										variant="outline"
										size="sm"
										:disabled="currentPage === reviewPageCount"
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

		<Dialog
			v-if="collectionLoadState === 'ready'"
			v-model:open="showApplyDialog"
		>
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
					<ButtonLoading :loading="isApplying" @click="applyStagedRows">
						<Upload class="mr-2 size-4" />
						Apply updates
					</ButtonLoading>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>
