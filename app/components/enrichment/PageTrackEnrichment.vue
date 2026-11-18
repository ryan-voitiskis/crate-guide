<script setup lang="ts">
import { WandSparkles } from '@lucide/vue'
import type {
	ReviewFilter,
	TrackEnrichmentApplyAttempt
} from '~/composables/useTrackEnrichmentWorkflow'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'

defineOptions({ name: 'PageTrackEnrichment' })

type Density = 'compact' | 'comfortable'

const props = defineProps<{
	initialReview?: {
		fileName: string
		rows: TrackEnrichmentRow[]
		selectedFilter?: ReviewFilter
	} | null
}>()

const records = useWorkbenchRecordsStore()
const tracks = useWorkbenchTracksStore()
const preferences = useWorkbenchPreferencesStore()
const capabilities = useWorkbenchCapabilities()
const runtime = useWorkbenchRuntime()
const isActive = usePageActive()

const fileInput = ref<HTMLInputElement | null>(null)
const collectionLoadState = ref<'loading' | 'ready' | 'failed'>('loading')
const density = useState<Density>('workbench-density', () => 'compact')
let recordDraftApplyAttempt = async (
	_attempt: TrackEnrichmentApplyAttempt
) => {}
// The draft session owns review read-only state but is created after the
// workflow it observes; bind it reactively once the session exists.
const draftReadOnly = shallowRef<() => boolean>(() => false)
const workflow = useTrackEnrichmentWorkflow({
	captureApplyGuard: () => {
		const { context } = runtime.capture()
		return () => runtime.isCurrent(context)
	},
	records,
	tracks,
	onApplyAttempt: (attempt) => recordDraftApplyAttempt(attempt),
	readOnly: () => draftReadOnly.value()
})
const {
	activeSource,
	selectedFileName,
	rows,
	stagedRowIds,
	selectedFilter,
	currentPage,
	parseWarnings,
	parseErrors,
	parsePhase,
	isParsing,
	parseCompleted,
	parseTotal,
	isApplying,
	showApplyDialog,
	applyCompleted,
	applyTotal,
	lastApplySummary,
	resumeSummary,
	requiresSourceReconnect,
	isReviewReadOnly,
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
	stagedEvidenceCount,
	stagedEvidenceOnlyCount,
	isStepComplete,
	canNavigateToStep,
	navigateToStep,
	parseFile,
	cancelParsing,
	retryParsing,
	canRetryParsing,
	reviewLocalSources,
	selectSource,
	loadPreparedReview,
	startAnotherSource,
	setRowStaged,
	setFilteredRowsStaged,
	clearStagedRows,
	openApplyReview,
	applyStagedRows,
	returnToReview
} = workflow

const isApplySummaryComplete = computed(() => {
	const summary = lastApplySummary.value
	return Boolean(
		summary &&
		summary.total > 0 &&
		summary.failed === 0 &&
		summary.remaining === 0 &&
		summary.succeeded === summary.total &&
		stagedRowIds.value.size === 0
	)
})

if (props.initialReview) {
	loadPreparedReview(props.initialReview.fileName, props.initialReview.rows)
	selectedFilter.value = props.initialReview.selectedFilter ?? 'ready'
}

const {
	query: reviewQuery,
	sortKey: reviewSortKey,
	sortDirection: reviewSortDirection,
	searchedRows: searchedReviewRows,
	sortedRows: sortedReviewRows,
	stageableRows: visibleStageableRows,
	selectionState: visibleSelectionState,
	pageCount: reviewPageCount,
	pagedRows: pagedReviewRows,
	shownStart: reviewShownStart,
	shownEnd: reviewShownEnd,
	setVisibleRowsStaged,
	setSort: setReviewSort
} = useTrackEnrichmentReviewTable({
	filteredRows,
	stagedRowIds,
	currentPage,
	selectedFileName,
	setRowStaged,
	setFilteredRowsStaged
})

const draftSession = useTrackEnrichmentDraftSession({
	runtime,
	workflow,
	records,
	tracks,
	density,
	sortKey: reviewSortKey,
	sortDirection: reviewSortDirection
})
recordDraftApplyAttempt = draftSession.recordApplyAttempt
draftReadOnly.value = () => draftSession.isReadOnly.value
const {
	activeEntry: activeDraftEntry,
	discoveryState: draftDiscoveryState,
	hasDraft,
	draftDetails,
	isHydrating: isDraftHydrating,
	isTakingOver: isDraftTakingOver,
	isTransitioning: isDraftTransitioning,
	isDraftMissingConflict,
	isOwned: isDraftOwned,
	isSourceBlockedByDraft,
	saveStatusLabel: draftSaveStatusLabel,
	savedAtAccessibleLabel: draftSavedAtAccessibleLabel,
	recoveryMessage: draftRecoveryMessage
} = draftSession

function handleBeforeUnload(event: BeforeUnloadEvent) {
	if (!isActive.value || !draftSession.shouldWarnBeforeUnload.value) return

	event.preventDefault()
	event.returnValue = true
}

if (import.meta.client) {
	useEventListener(window, 'beforeunload', handleBeforeUnload)
}

function cancelPendingWork() {
	cancelParsing()
	workflow.cancelPendingApply()
}
watch(isActive, (active) => {
	if (!active) cancelPendingWork()
})
onDeactivated(cancelPendingWork)
onBeforeUnmount(cancelPendingWork)

onMounted(async () => {
	const results = await Promise.all([
		records.fetchAllRecords(),
		tracks.fetchAllTracks()
	])
	if (!results.every((result) => result)) {
		collectionLoadState.value = 'failed'
		return
	}
	if (capabilities.canEnrichTracks) await draftSession.initialize()
	collectionLoadState.value = 'ready'
})

async function handleResumeDraft() {
	await draftSession.resume()
}

async function handleTakeOverDraft() {
	if (
		!window.confirm(
			'Take over this review? The other tab will become read-only and any unsaved changes there may be lost.'
		)
	) {
		return
	}
	if (await draftSession.takeOver()) {
		if (rows.value.length === 0) await draftSession.resume()
	}
}

async function handleStartFresh() {
	const message = isDraftMissingConflict.value
		? 'Discard this in-memory review and start fresh? The saved review was already deleted in another tab.'
		: 'Start a fresh review? The saved review stays recoverable until the replacement is safely stored.'
	if (!window.confirm(message)) {
		return
	}
	await draftSession.startFresh()
}

async function handleDeleteDraft() {
	if (
		!window.confirm(
			'Delete this device-local review? This cannot be recovered from Crate Guide because drafts are not backed up.'
		)
	) {
		return
	}
	if (await draftSession.deleteDraft()) startAnotherSource()
}

async function handleCompletedAnotherSource() {
	await draftSession.acknowledgeCompleteAndDelete()
}

async function handleKeepDraft() {
	await draftSession.keepForLater()
}

function openFilePicker() {
	if (!capabilities.canEnrichTracks || isSourceBlockedByDraft.value) return
	fileInput.value?.click()
}

async function handleFileInput(event: Event) {
	if (!capabilities.canEnrichTracks || isSourceBlockedByDraft.value) return
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return

	await parseFile(file)
	input.value = ''
}

function handleFileDrop(file: File) {
	if (!capabilities.canEnrichTracks || isSourceBlockedByDraft.value) return
	void parseFile(file)
}

function handleSelectSource(source: Parameters<typeof selectSource>[0]) {
	if (isSourceBlockedByDraft.value) return
	selectSource(source)
}

function handleReviewLocal(
	selection: Parameters<typeof reviewLocalSources>[0]
) {
	if (isSourceBlockedByDraft.value) return
	void reviewLocalSources(selection)
}
</script>

<template>
	<div class="flex h-full min-h-0 flex-1 flex-col">
		<Teleport to="#header-left" defer>
			<template v-if="isActive">
				<div class="flex items-center gap-2">
					<WandSparkles class="text-primary size-4" />
					<span class="hidden text-xs font-semibold sm:inline">
						BPM &amp; Key
					</span>
				</div>

				<NavTrackEnrichmentSteps
					:current-step="currentStep"
					:disabled="collectionLoadState !== 'ready'"
					:can-navigate-to-step="canNavigateToStep"
					:is-step-complete="isStepComplete"
					@navigate="navigateToStep"
				/>
			</template>
		</Teleport>

		<div
			data-testid="enrichment-scroll-region"
			class="scrollbar-hidden min-h-0 flex-1"
			:class="
				currentStep === 2
					? 'overflow-y-auto md:overflow-hidden'
					: 'overflow-y-auto'
			"
		>
			<div
				class="flex w-full flex-col"
				:class="
					currentStep === 1
						? 'mx-auto max-w-3xl gap-3 p-3 pt-5 pb-0 sm:p-4 sm:pt-8 sm:pb-0'
						: currentStep !== 2
							? 'mx-auto max-w-400 gap-3 p-3 pb-0 sm:p-4 sm:pb-0'
							: 'min-h-full md:h-full md:min-h-0'
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

					<SectionTrackEnrichmentDraft
						v-if="currentStep === 1"
						:has-draft="hasDraft"
						:is-missing-conflict="isDraftMissingConflict"
						:details="draftDetails"
						:discovery-state="draftDiscoveryState"
						:is-live-elsewhere="
							activeDraftEntry?.lease.status === 'live' && !isDraftOwned
						"
						:save-status-label="draftSaveStatusLabel"
						:saved-at-accessible-label="draftSavedAtAccessibleLabel"
						:recovery-message="draftRecoveryMessage"
						:is-hydrating="isDraftHydrating"
						:is-taking-over="isDraftTakingOver"
						:is-transitioning="isDraftTransitioning"
						@resume="handleResumeDraft"
						@take-over="handleTakeOverDraft"
						@start-fresh="handleStartFresh"
						@delete="handleDeleteDraft"
					/>

					<div v-show="currentStep === 1" class="contents">
						<Suspense>
							<LazyPanelTrackEnrichmentSource
								:active-source="activeSource"
								:parse-phase="parsePhase"
								:is-parsing="isParsing"
								:parse-completed="parseCompleted"
								:parse-total="parseTotal"
								:parse-progress="parseProgress"
								:selected-file-name="selectedFileName"
								:can-retry-parsing="canRetryParsing"
								:disabled="
									!capabilities.canEnrichTracks || isSourceBlockedByDraft
								"
								@select-file="openFilePicker"
								@drop-file="handleFileDrop"
								@select-source="handleSelectSource"
								@review-local="handleReviewLocal"
								@cancel-parsing="cancelParsing"
								@retry-parsing="retryParsing"
							/>
							<template #fallback>
								<div
									data-testid="enrichment-source-loading"
									class="border-border bg-muted/20 flex min-h-40 items-center justify-center rounded-md border"
									role="status"
									aria-live="polite"
								>
									<SpinnerLoading class="mr-2 size-4" />
									<span class="text-muted-foreground text-sm">
										Loading source controls…
									</span>
								</div>
							</template>
						</Suspense>
					</div>

					<PanelTrackEnrichmentApplySummary
						v-if="lastApplySummary"
						:summary="lastApplySummary"
						:is-complete="isApplySummaryComplete"
						:is-transitioning="isDraftTransitioning"
						:save-status-label="draftSaveStatusLabel"
						:saved-at-accessible-label="draftSavedAtAccessibleLabel"
						@review-results="returnToReview"
						@use-another-source="handleCompletedAnotherSource"
						@keep-for-later="handleKeepDraft"
					/>

					<PanelTrackEnrichmentReviewWorkspace
						v-else-if="currentStep === 2"
						v-model:selected-filter="selectedFilter"
						v-model:query="reviewQuery"
						v-model:density="density"
						v-model:current-page="currentPage"
						:is-read-only="isReviewReadOnly"
						:is-draft-missing-conflict="isDraftMissingConflict"
						:is-draft-taking-over="isDraftTakingOver"
						:is-draft-transitioning="isDraftTransitioning"
						:resume-summary="resumeSummary"
						:requires-source-reconnect="requiresSourceReconnect"
						:source-label="sourceLabel"
						:row-count="rows.length"
						:matched-count="matchedRows.length"
						:match-rate="matchRate"
						:ready-count="readyRows.length"
						:review-count="reviewRows.length"
						:unmatched-count="unmatchedRows.length"
						:blocked-count="blockedCount"
						:error-count="errorCount"
						:filter-options="filterOptions"
						:searched-count="searchedReviewRows.length"
						:stageable-count="visibleStageableRows.length"
						:selection-state="visibleSelectionState"
						:paged-rows="pagedReviewRows"
						:staged-row-ids="stagedRowIds"
						:is-applying="isApplying"
						:key-format="preferences.currentKeyFormat"
						:sort-key="reviewSortKey"
						:sort-direction="reviewSortDirection"
						:shown-start="reviewShownStart"
						:shown-end="reviewShownEnd"
						:sorted-count="sortedReviewRows.length"
						:page-count="reviewPageCount"
						:staged-count="stagedRows.length"
						:staged-evidence-count="stagedEvidenceCount"
						:staged-bpm-count="stagedBpmCount"
						:staged-key-mode-count="stagedKeyModeCount"
						:staged-evidence-only-count="stagedEvidenceOnlyCount"
						:draft-save-status-label="draftSaveStatusLabel"
						:draft-saved-at-accessible-label="draftSavedAtAccessibleLabel"
						@start-fresh="handleStartFresh"
						@take-over="handleTakeOverDraft"
						@stage-visible="setVisibleRowsStaged"
						@stage-row="setRowStaged"
						@clear-staged="clearStagedRows"
						@sort="setReviewSort"
						@open-apply-review="openApplyReview"
					/>
				</template>
			</div>
		</div>

		<DialogTrackEnrichmentApply
			v-if="collectionLoadState === 'ready'"
			v-model:open="showApplyDialog"
			:staged-count="stagedRows.length"
			:staged-evidence-count="stagedEvidenceCount"
			:staged-evidence-only-count="stagedEvidenceOnlyCount"
			:staged-bpm-count="stagedBpmCount"
			:staged-key-mode-count="stagedKeyModeCount"
			:is-applying="isApplying"
			:apply-completed="applyCompleted"
			:apply-total="applyTotal"
			:apply-progress="applyProgress"
			@confirm="applyStagedRows"
		/>
	</div>
</template>
