import type { ComputedRef, Ref } from 'vue'
import { nextTick } from 'vue'
import { toast } from 'vue-sonner'
import type { LocalAudioReviewSelection } from '~/types/localAudio'
import { parseRekordboxXml } from '~/utils/rekordboxXml'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import {
	buildTrackEnrichmentRowsAsync,
	buildTrackEnrichmentUpdate,
	canStageTrackEnrichmentRow
} from '~/utils/trackEnrichment'

export type ReviewFilter =
	| 'ready'
	| 'review'
	| 'staged'
	| 'matched'
	| 'unmatched'
	| 'done'

export type ApplySummary = {
	total: number
	succeeded: number
	failed: number
	bpm: number
	keyMode: number
}

export type TrackEnrichmentSourceKind = 'rekordboxXml' | 'localAudio'
export type TrackEnrichmentWorkflowView = 'source' | 'review'

type FilterOption = {
	value: ReviewFilter
	label: string
	count: number
}

export type TrackEnrichmentWorkflow = {
	activeSource: Ref<TrackEnrichmentSourceKind>
	selectedFileName: Ref<string | null>
	rows: Ref<TrackEnrichmentRow[]>
	stagedRowIds: Ref<Set<string>>
	selectedFilter: Ref<ReviewFilter>
	currentPage: Ref<number>
	parseWarnings: Ref<string[]>
	parseErrors: Ref<string[]>
	isParsing: Ref<boolean>
	parseCompleted: Ref<number>
	parseTotal: Ref<number>
	isApplying: Ref<boolean>
	showApplyDialog: Ref<boolean>
	applyCompleted: Ref<number>
	applyTotal: Ref<number>
	lastApplySummary: Ref<ApplySummary | null>
	workflowView: Ref<TrackEnrichmentWorkflowView>
	currentStep: ComputedRef<1 | 2 | 3>
	matchedRows: ComputedRef<TrackEnrichmentRow[]>
	readyRows: ComputedRef<TrackEnrichmentRow[]>
	reviewRows: ComputedRef<TrackEnrichmentRow[]>
	unmatchedRows: ComputedRef<TrackEnrichmentRow[]>
	doneRows: ComputedRef<TrackEnrichmentRow[]>
	stagedRows: ComputedRef<TrackEnrichmentRow[]>
	blockedCount: ComputedRef<number>
	rowErrorCount: ComputedRef<number>
	errorCount: ComputedRef<number>
	matchRate: ComputedRef<string>
	applyProgress: ComputedRef<number>
	parseProgress: ComputedRef<number>
	visibleParseWarnings: ComputedRef<string[]>
	sourceLabel: ComputedRef<string>
	filterOptions: ComputedRef<FilterOption[]>
	filteredRows: ComputedRef<TrackEnrichmentRow[]>
	stageableFilteredRows: ComputedRef<TrackEnrichmentRow[]>
	stagedFilteredCount: ComputedRef<number>
	filteredSelectionState: ComputedRef<boolean | 'indeterminate'>
	pageCount: ComputedRef<number>
	pagedRows: ComputedRef<TrackEnrichmentRow[]>
	shownStart: ComputedRef<number>
	shownEnd: ComputedRef<number>
	stagedBpmCount: ComputedRef<number>
	stagedKeyModeCount: ComputedRef<number>
	isStepComplete: (step: number) => boolean
	canNavigateToStep: (step: number) => boolean
	navigateToStep: (step: number) => void
	parseFile: (file: File) => Promise<void>
	reviewLocalSources: (selection: LocalAudioReviewSelection) => Promise<void>
	selectSource: (source: TrackEnrichmentSourceKind) => void
	returnToSource: () => void
	startAnotherSource: () => void
	setRowStaged: (row: TrackEnrichmentRow, checked: boolean) => void
	setFilteredRowsStaged: (checked: boolean) => void
	clearStagedRows: () => void
	openApplyReview: () => void
	applyStagedRows: () => Promise<void>
	returnToReview: () => void
}

const rowsPerPage = 100

export function useTrackEnrichmentWorkflow(): TrackEnrichmentWorkflow {
	const records = useRecordsStore()
	const tracks = useTracksStore()

	const activeSource = ref<TrackEnrichmentSourceKind>('rekordboxXml')
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
	const workflowView = ref<TrackEnrichmentWorkflowView>('source')
	let reviewOperationGeneration = 0

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

	const filterOptions = computed<FilterOption[]>(() => [
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
			stageableFilteredRows.value.filter((row) =>
				stagedRowIds.value.has(row.id)
			).length
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

	function initializeReview(fileLabel: string, nextRows: TrackEnrichmentRow[]) {
		selectedFileName.value = fileLabel
		rows.value = nextRows
		stagedRowIds.value = new Set(
			nextRows
				.filter((row) => row.defaultStaged && canStageTrackEnrichmentRow(row))
				.map((row) => row.id)
		)
		selectedFilter.value = 'ready'
		currentPage.value = 1
		lastApplySummary.value = null
		showApplyDialog.value = false
		applyCompleted.value = 0
		applyTotal.value = 0
		workflowView.value = 'review'
	}

	function resetWorkflow(nextSource?: TrackEnrichmentSourceKind) {
		reviewOperationGeneration++
		if (nextSource) activeSource.value = nextSource
		selectedFileName.value = null
		rows.value = []
		stagedRowIds.value = new Set()
		selectedFilter.value = 'ready'
		currentPage.value = 1
		parseWarnings.value = []
		parseErrors.value = []
		isParsing.value = false
		parseCompleted.value = 0
		parseTotal.value = 0
		isApplying.value = false
		showApplyDialog.value = false
		applyCompleted.value = 0
		applyTotal.value = 0
		lastApplySummary.value = null
		workflowView.value = 'source'
	}

	function beginReviewOperation(
		source: TrackEnrichmentSourceKind,
		fileLabel: string,
		total: number
	): number {
		const operationGeneration = ++reviewOperationGeneration
		activeSource.value = source
		prepareForReview(fileLabel, total)
		isParsing.value = true
		return operationGeneration
	}

	function isCurrentReviewOperation(operationGeneration: number): boolean {
		return operationGeneration === reviewOperationGeneration
	}

	function prepareForReview(fileLabel: string, total: number) {
		workflowView.value = 'source'
		selectedFileName.value = fileLabel
		rows.value = []
		stagedRowIds.value = new Set()
		selectedFilter.value = 'ready'
		currentPage.value = 1
		parseWarnings.value = []
		parseErrors.value = []
		parseCompleted.value = 0
		parseTotal.value = total
		lastApplySummary.value = null
		showApplyDialog.value = false
		applyCompleted.value = 0
		applyTotal.value = 0
	}

	function isStepComplete(step: number): boolean {
		return currentStep.value > step || (step === 3 && !!lastApplySummary.value)
	}

	function canNavigateToStep(step: number): boolean {
		if (isParsing.value || isApplying.value || showApplyDialog.value)
			return false
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

	async function parseFile(file: File) {
		const operationGeneration = beginReviewOperation(
			'rekordboxXml',
			file.name,
			0
		)

		try {
			await nextTick()
			if (!isCurrentReviewOperation(operationGeneration)) return
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve())
			)
			if (!isCurrentReviewOperation(operationGeneration)) return
			const fileContents = await file.text()
			if (!isCurrentReviewOperation(operationGeneration)) return
			const result = parseRekordboxXml(fileContents)
			if (!isCurrentReviewOperation(operationGeneration)) return
			parseWarnings.value = result.warnings
			parseErrors.value = result.errors

			if (result.errors.length > 0) return

			parseTotal.value = result.tracks.length
			const nextRows = await buildTrackEnrichmentRowsAsync({
				sources: result.tracks,
				tracks: tracks.tracks,
				records: records.records,
				onProgress: (completed, total) => {
					if (!isCurrentReviewOperation(operationGeneration)) return
					parseCompleted.value = completed
					parseTotal.value = total
				}
			})
			if (!isCurrentReviewOperation(operationGeneration)) return
			initializeReview(file.name, nextRows)
		} catch (error) {
			if (!isCurrentReviewOperation(operationGeneration)) return
			parseErrors.value = [
				error instanceof Error ? error.message : 'Unknown parse error'
			]
		} finally {
			if (isCurrentReviewOperation(operationGeneration)) {
				isParsing.value = false
			}
		}
	}

	async function reviewLocalSources(selection: LocalAudioReviewSelection) {
		const { sources } = selection
		const fileLabel = `${sources.length.toLocaleString()} files with data · ${selection.processedFiles.toLocaleString()} of ${selection.totalFiles.toLocaleString()} scanned`
		const operationGeneration = beginReviewOperation(
			'localAudio',
			fileLabel,
			sources.length
		)

		try {
			const nextRows = await buildTrackEnrichmentRowsAsync({
				sources,
				tracks: tracks.tracks,
				records: records.records,
				onProgress: (completed, total) => {
					if (!isCurrentReviewOperation(operationGeneration)) return
					parseCompleted.value = completed
					parseTotal.value = total
				}
			})
			if (!isCurrentReviewOperation(operationGeneration)) return
			initializeReview(fileLabel, nextRows)
		} catch (error) {
			if (!isCurrentReviewOperation(operationGeneration)) return
			parseErrors.value = [
				error instanceof Error ? error.message : 'Unknown matching error'
			]
		} finally {
			if (isCurrentReviewOperation(operationGeneration)) {
				isParsing.value = false
			}
		}
	}

	function selectSource(source: TrackEnrichmentSourceKind) {
		if (activeSource.value === source) return
		resetWorkflow(source)
	}

	function returnToSource() {
		workflowView.value = 'source'
		lastApplySummary.value = null
	}

	function startAnotherSource() {
		resetWorkflow()
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

	return {
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
		workflowView,
		currentStep,
		matchedRows,
		readyRows,
		reviewRows,
		unmatchedRows,
		doneRows,
		stagedRows,
		blockedCount,
		rowErrorCount,
		errorCount,
		matchRate,
		applyProgress,
		parseProgress,
		visibleParseWarnings,
		sourceLabel,
		filterOptions,
		filteredRows,
		stageableFilteredRows,
		stagedFilteredCount,
		filteredSelectionState,
		pageCount,
		pagedRows,
		shownStart,
		shownEnd,
		stagedBpmCount,
		stagedKeyModeCount,
		isStepComplete,
		canNavigateToStep,
		navigateToStep,
		parseFile,
		reviewLocalSources,
		selectSource,
		returnToSource,
		startAnotherSource,
		setRowStaged,
		setFilteredRowsStaged,
		clearStagedRows,
		openApplyReview,
		applyStagedRows,
		returnToReview
	}
}
