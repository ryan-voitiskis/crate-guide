import type { ComputedRef, Ref } from 'vue'
import { nextTick, onScopeDispose, shallowRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { LocalAudioReviewSelection } from '~/types/localAudio'
import {
	RekordboxXmlWorkerCancelledError,
	RekordboxXmlWorkerParseError,
	type RekordboxXmlWorkerParseHandle,
	startRekordboxXmlWorkerParse
} from '~/utils/rekordboxXmlWorkerClient'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'
import {
	buildTrackEnrichmentRowsAsync,
	buildTrackEnrichmentUpdate,
	canStageTrackEnrichmentRow
} from '~/utils/trackEnrichment'
import type { TrackEnrichmentDraftResumeSummary } from '~/utils/trackEnrichmentDraftResume'
import type { TrackBatchUpdateOutcome } from '~~/shared/types/trackUpdates'

export type ReviewFilter =
	| 'ready'
	| 'review'
	| 'changed'
	| 'evidence'
	| 'staged'
	| 'matched'
	| 'unmatched'
	| 'done'

export type ApplySummary = {
	total: number
	succeeded: number
	failed: number
	remaining: number
	bpm: number
	keyMode: number
	evidence: number
	evidenceOnly: number
}

export type TrackEnrichmentSourceKind = 'rekordboxXml' | 'localAudio'
export type TrackEnrichmentWorkflowView = 'source' | 'review'
export type TrackEnrichmentParsePhase = 'idle' | 'parsing' | 'matching'

export type TrackEnrichmentApplyAttempt = {
	rows: readonly {
		row: TrackEnrichmentRow
		intentKind: 'fill-empty-fields' | 'evidence-only'
		requested: { bpm: boolean; keyMode: boolean }
	}[]
	outcome: TrackBatchUpdateOutcome
	attemptedAt: string
}

export type TrackEnrichmentResumedReview = {
	fileLabel: string
	rows: TrackEnrichmentRow[]
	stagedRowIds: readonly string[]
	changedRowIds: readonly string[]
	doneRowIds: readonly string[]
	selectedFilter: ReviewFilter
	resumeSummary: TrackEnrichmentDraftResumeSummary
	requiresReconnect: boolean
}

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
	parsePhase: Ref<TrackEnrichmentParsePhase>
	parseBytesCompleted: Ref<number>
	parseBytesTotal: Ref<number>
	isParsing: Ref<boolean>
	parseCompleted: Ref<number>
	parseTotal: Ref<number>
	isApplying: Ref<boolean>
	showApplyDialog: Ref<boolean>
	applyCompleted: Ref<number>
	applyTotal: Ref<number>
	lastApplySummary: Ref<ApplySummary | null>
	workflowView: Ref<TrackEnrichmentWorkflowView>
	changedRowIds: Ref<Set<string>>
	resumeSummary: Ref<TrackEnrichmentDraftResumeSummary | null>
	requiresSourceReconnect: Ref<boolean>
	isReviewReadOnly: Ref<boolean>
	currentStep: ComputedRef<1 | 2 | 3>
	matchedRows: ComputedRef<TrackEnrichmentRow[]>
	readyRows: ComputedRef<TrackEnrichmentRow[]>
	reviewRows: ComputedRef<TrackEnrichmentRow[]>
	evidenceOnlyRows: ComputedRef<TrackEnrichmentRow[]>
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
	stagedBpmCount: ComputedRef<number>
	stagedKeyModeCount: ComputedRef<number>
	stagedEvidenceCount: ComputedRef<number>
	stagedEvidenceOnlyCount: ComputedRef<number>
	isStepComplete: (step: number) => boolean
	canNavigateToStep: (step: number) => boolean
	navigateToStep: (step: number) => void
	parseFile: (file: File) => Promise<void>
	cancelParsing: () => void
	retryParsing: () => Promise<void>
	canRetryParsing: ComputedRef<boolean>
	reviewLocalSources: (selection: LocalAudioReviewSelection) => Promise<void>
	selectSource: (source: TrackEnrichmentSourceKind) => void
	loadPreparedReview: (fileLabel: string, rows: TrackEnrichmentRow[]) => void
	loadResumedReview: (review: TrackEnrichmentResumedReview) => void
	setReviewReadOnly: (readOnly: boolean) => void
	returnToSource: () => void
	startAnotherSource: () => void
	setRowStaged: (row: TrackEnrichmentRow, checked: boolean) => void
	setFilteredRowsStaged: (checked: boolean) => void
	clearStagedRows: () => void
	openApplyReview: () => void
	applyStagedRows: () => Promise<void>
	cancelPendingApply: () => void
	returnToReview: () => void
}

export type TrackEnrichmentWorkflowDependencies = {
	captureApplyGuard?: () => () => boolean
	records: ReturnType<typeof useRecordsStore>
	tracks: ReturnType<typeof useTracksStore>
	onApplyAttempt?: (
		attempt: TrackEnrichmentApplyAttempt
	) => Promise<void> | void
}

export function isTrackEnrichmentEvidenceOnlyRow(
	row: TrackEnrichmentRow
): boolean {
	return Boolean(
		row.track &&
		!row.canFillBpm &&
		!row.canFillKeyMode &&
		!row.stagingBlockedReason
	)
}

export function canStageTrackEnrichmentWorkflowRow(
	row: TrackEnrichmentRow
): boolean {
	if (canStageTrackEnrichmentRow(row)) return true
	return Boolean(
		isTrackEnrichmentEvidenceOnlyRow(row) &&
		!row.applied &&
		row.track?.updated_at
	)
}

export function getTrackEnrichmentIntentKind(
	row: TrackEnrichmentRow
): 'fill-empty-fields' | 'evidence-only' {
	return row.canFillBpm || row.canFillKeyMode
		? 'fill-empty-fields'
		: 'evidence-only'
}

export function useTrackEnrichmentWorkflow(
	dependencies?: TrackEnrichmentWorkflowDependencies
): TrackEnrichmentWorkflow {
	const records = dependencies?.records ?? useRecordsStore()
	const tracks = dependencies?.tracks ?? useTracksStore()

	const activeSource = ref<TrackEnrichmentSourceKind>('rekordboxXml')
	const selectedFileName = ref<string | null>(null)
	const rows = ref<TrackEnrichmentRow[]>([])
	const stagedRowIds = ref<Set<string>>(new Set())
	const selectedFilter = ref<ReviewFilter>('ready')
	const currentPage = ref(1)
	const parseWarnings = ref<string[]>([])
	const parseErrors = ref<string[]>([])
	const parsePhase = ref<TrackEnrichmentParsePhase>('idle')
	const parseBytesCompleted = ref(0)
	const parseBytesTotal = ref(0)
	const isParsing = ref(false)
	const parseCompleted = ref(0)
	const parseTotal = ref(0)
	const isApplying = ref(false)
	const showApplyDialog = ref(false)
	const applyCompleted = ref(0)
	const applyTotal = ref(0)
	const lastApplySummary = ref<ApplySummary | null>(null)
	const workflowView = ref<TrackEnrichmentWorkflowView>('source')
	const changedRowIds = ref<Set<string>>(new Set())
	const resumeSummary = ref<TrackEnrichmentDraftResumeSummary | null>(null)
	const requiresSourceReconnect = ref(false)
	const isReviewReadOnly = ref(false)
	const retryRekordboxFile = shallowRef<File | null>(null)
	let applyPermissionGeneration = 0
	function cancelPendingApply() {
		applyPermissionGeneration++
	}
	watch(
		isReviewReadOnly,
		(readOnly) => {
			if (readOnly) cancelPendingApply()
		},
		{ flush: 'sync' }
	)
	onScopeDispose(cancelPendingApply)
	let reviewOperationGeneration = 0
	let applyOperationGeneration = 0
	let activeRekordboxParse: RekordboxXmlWorkerParseHandle | null = null

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
	const evidenceOnlyRows = computed(() =>
		rows.value.filter(
			(row) => !row.applied && isTrackEnrichmentEvidenceOnlyRow(row)
		)
	)
	const unmatchedRows = computed(() => rows.value.filter((row) => !row.track))
	const doneRows = computed(() =>
		rows.value.filter((row) => row.applied || row.alreadyComplete)
	)
	const changedRows = computed(() =>
		rows.value.filter((row) => changedRowIds.value.has(row.id))
	)
	const stagedRows = computed(() =>
		rows.value.filter(
			(row) =>
				stagedRowIds.value.has(row.id) &&
				canStageTrackEnrichmentWorkflowRow(row)
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
	const parseProgress = computed(() => {
		if (parsePhase.value === 'parsing') {
			return parseBytesTotal.value === 0
				? 0
				: Math.round((parseBytesCompleted.value / parseBytesTotal.value) * 100)
		}
		return parseTotal.value === 0
			? 0
			: Math.round((parseCompleted.value / parseTotal.value) * 100)
	})
	const canRetryParsing = computed(
		() =>
			!isParsing.value &&
			activeSource.value === 'rekordboxXml' &&
			retryRekordboxFile.value !== null
	)
	const visibleParseWarnings = computed(() => parseWarnings.value.slice(0, 5))
	const sourceLabel = computed(() =>
		activeSource.value === 'rekordboxXml' ? 'Rekordbox XML' : 'Local audio'
	)

	const filterOptions = computed<FilterOption[]>(() => [
		{ value: 'ready', label: 'Ready', count: readyRows.value.length },
		{ value: 'review', label: 'Needs review', count: reviewRows.value.length },
		...(changedRowIds.value.size > 0
			? [
					{
						value: 'changed' as const,
						label: 'Changed since last review',
						count: changedRows.value.length
					}
				]
			: []),
		{
			value: 'evidence',
			label: 'Evidence only',
			count: evidenceOnlyRows.value.length
		},
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
			case 'changed':
				return changedRows.value
			case 'evidence':
				return evidenceOnlyRows.value
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
		filteredRows.value.filter(canStageTrackEnrichmentWorkflowRow)
	)
	const stagedBpmCount = computed(
		() => stagedRows.value.filter((row) => row.canFillBpm).length
	)
	const stagedKeyModeCount = computed(
		() => stagedRows.value.filter((row) => row.canFillKeyMode).length
	)
	const stagedEvidenceCount = computed(() => stagedRows.value.length)
	const stagedEvidenceOnlyCount = computed(
		() => stagedRows.value.filter(isTrackEnrichmentEvidenceOnlyRow).length
	)

	watch(selectedFilter, () => {
		currentPage.value = 1
	})

	function loadPreparedReview(
		fileLabel: string,
		nextRows: TrackEnrichmentRow[]
	) {
		activeRekordboxParse?.cancel()
		activeRekordboxParse = null
		retryRekordboxFile.value = null
		applyOperationGeneration++
		isApplying.value = false
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
		changedRowIds.value = new Set()
		resumeSummary.value = null
		requiresSourceReconnect.value = false
		isReviewReadOnly.value = false
		showApplyDialog.value = false
		applyCompleted.value = 0
		applyTotal.value = 0
		workflowView.value = 'review'
	}

	function loadResumedReview(review: TrackEnrichmentResumedReview) {
		loadPreparedReview(review.fileLabel, review.rows)
		for (const row of rows.value) {
			if (review.doneRowIds.includes(row.id)) row.applied = true
		}
		stagedRowIds.value = new Set(review.stagedRowIds)
		changedRowIds.value = new Set(review.changedRowIds)
		resumeSummary.value = review.resumeSummary
		requiresSourceReconnect.value = review.requiresReconnect
		selectedFilter.value =
			review.selectedFilter === 'changed' && changedRowIds.value.size === 0
				? 'review'
				: review.selectedFilter
	}

	function setReviewReadOnly(readOnly: boolean) {
		isReviewReadOnly.value = readOnly
	}

	function resetWorkflow(nextSource?: TrackEnrichmentSourceKind) {
		activeRekordboxParse?.cancel()
		activeRekordboxParse = null
		retryRekordboxFile.value = null
		reviewOperationGeneration++
		applyOperationGeneration++
		if (nextSource) activeSource.value = nextSource
		selectedFileName.value = null
		rows.value = []
		stagedRowIds.value = new Set()
		selectedFilter.value = 'ready'
		currentPage.value = 1
		parseWarnings.value = []
		parseErrors.value = []
		parsePhase.value = 'idle'
		parseBytesCompleted.value = 0
		parseBytesTotal.value = 0
		isParsing.value = false
		parseCompleted.value = 0
		parseTotal.value = 0
		isApplying.value = false
		showApplyDialog.value = false
		applyCompleted.value = 0
		applyTotal.value = 0
		lastApplySummary.value = null
		changedRowIds.value = new Set()
		resumeSummary.value = null
		requiresSourceReconnect.value = false
		isReviewReadOnly.value = false
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
		applyOperationGeneration++
		isApplying.value = false
		workflowView.value = 'source'
		selectedFileName.value = fileLabel
		rows.value = []
		stagedRowIds.value = new Set()
		selectedFilter.value = 'ready'
		currentPage.value = 1
		parseWarnings.value = []
		parseErrors.value = []
		parsePhase.value = 'idle'
		parseBytesCompleted.value = 0
		parseBytesTotal.value = 0
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

	function cancelParsing() {
		if (!isParsing.value) return
		reviewOperationGeneration += 1
		activeRekordboxParse?.cancel()
		activeRekordboxParse = null
		isParsing.value = false
		parsePhase.value = 'idle'
		parseWarnings.value = [
			'Rekordbox XML parsing was cancelled. Retry when you are ready.'
		]
		parseErrors.value = []
	}

	async function retryParsing() {
		if (!canRetryParsing.value || !retryRekordboxFile.value) return
		await parseFile(retryRekordboxFile.value)
	}

	async function parseFile(file: File) {
		activeRekordboxParse?.cancel()
		activeRekordboxParse = null
		retryRekordboxFile.value = file
		const operationGeneration = beginReviewOperation(
			'rekordboxXml',
			file.name,
			0
		)
		parsePhase.value = 'parsing'
		parseBytesTotal.value = file.size

		try {
			await nextTick()
			if (!isCurrentReviewOperation(operationGeneration)) return
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve())
			)
			if (!isCurrentReviewOperation(operationGeneration)) return
			let parseOperationId: string | null = null
			const parseHandle = startRekordboxXmlWorkerParse(file, {
				onProgress: (progress) => {
					if (
						!isCurrentReviewOperation(operationGeneration) ||
						activeRekordboxParse?.operationId !== parseOperationId
					) {
						return
					}
					parseBytesCompleted.value = progress.bytesRead
					parseBytesTotal.value = progress.totalBytes
					parseCompleted.value = progress.parsedTracks
					parseTotal.value = progress.entriesDeclared ?? 0
				}
			})
			parseOperationId = parseHandle.operationId
			activeRekordboxParse = parseHandle
			const result = await parseHandle.promise
			if (!isCurrentReviewOperation(operationGeneration)) return
			if (activeRekordboxParse?.operationId !== parseHandle.operationId) return
			activeRekordboxParse = null
			parseWarnings.value = result.warnings
			parseErrors.value = result.errors

			if (result.errors.length > 0) return

			parsePhase.value = 'matching'
			parseCompleted.value = 0
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
			retryRekordboxFile.value = null
			loadPreparedReview(file.name, nextRows)
		} catch (error) {
			if (!isCurrentReviewOperation(operationGeneration)) return
			activeRekordboxParse = null
			parsePhase.value = 'idle'
			if (error instanceof RekordboxXmlWorkerCancelledError) {
				parseWarnings.value = [
					'Rekordbox XML parsing was cancelled. Retry when you are ready.'
				]
				parseErrors.value = []
			} else {
				if (error instanceof RekordboxXmlWorkerParseError && !error.retryable) {
					retryRekordboxFile.value = null
				}
				parseErrors.value = [
					error instanceof RekordboxXmlWorkerParseError
						? error.message
						: 'The Rekordbox XML file could not be parsed.'
				]
			}
		} finally {
			if (isCurrentReviewOperation(operationGeneration)) {
				isParsing.value = false
				if (parsePhase.value !== 'idle') parsePhase.value = 'idle'
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
		parsePhase.value = 'matching'

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
			loadPreparedReview(fileLabel, nextRows)
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
		if (isReviewReadOnly.value) return
		if (!canStageTrackEnrichmentWorkflowRow(row)) return
		const nextStagedIds = new Set(stagedRowIds.value)
		if (checked) nextStagedIds.add(row.id)
		else nextStagedIds.delete(row.id)
		stagedRowIds.value = nextStagedIds
	}

	function setFilteredRowsStaged(checked: boolean) {
		if (isReviewReadOnly.value) return
		const nextStagedIds = new Set(stagedRowIds.value)
		for (const row of stageableFilteredRows.value) {
			if (checked) nextStagedIds.add(row.id)
			else nextStagedIds.delete(row.id)
		}
		stagedRowIds.value = nextStagedIds
	}

	function clearStagedRows() {
		if (isReviewReadOnly.value) return
		stagedRowIds.value = new Set()
	}

	function openApplyReview() {
		if (isReviewReadOnly.value) {
			toast.warning('Take over this draft before changing or applying it.')
			return
		}
		if (stagedRows.value.length === 0) {
			toast.warning('Stage at least one match to apply.')
			return
		}
		showApplyDialog.value = true
	}

	async function applyStagedRows() {
		if (isApplying.value) return
		if (isReviewReadOnly.value) {
			toast.warning('Take over this draft before changing or applying it.')
			return
		}
		const operationGeneration = ++applyOperationGeneration
		const ownsOperation = () => operationGeneration === applyOperationGeneration
		const finishOwnedOperation = () => {
			if (!ownsOperation()) return
			isApplying.value = false
			showApplyDialog.value = false
		}
		const permissionGeneration = applyPermissionGeneration
		const isCurrentContext = dependencies?.captureApplyGuard?.() ?? (() => true)
		const mayDispatch = () =>
			ownsOperation() &&
			isCurrentContext() &&
			!isReviewReadOnly.value &&
			permissionGeneration === applyPermissionGeneration
		const rowsToApply = [...stagedRows.value]
		const fileLabel = selectedFileName.value ?? sourceLabel.value
		isApplying.value = true
		const importedAt = new Date().toISOString()
		const preparedUpdates: {
			row: TrackEnrichmentRow
			intentKind: 'fill-empty-fields' | 'evidence-only'
			update: NonNullable<
				Awaited<ReturnType<typeof buildTrackEnrichmentUpdate>>
			>
		}[] = []

		try {
			if (!mayDispatch()) return
			for (const row of rowsToApply) {
				const intentKind = getTrackEnrichmentIntentKind(row)
				const update = await buildTrackEnrichmentUpdate(
					row,
					fileLabel,
					importedAt,
					intentKind
				)
				if (!mayDispatch()) return
				if (update) {
					preparedUpdates.push({
						row,
						intentKind,
						update
					})
				}
			}

			if (!mayDispatch()) return
			if (preparedUpdates.length === 0) {
				toast.warning('No staged matches can be applied.')
				showApplyDialog.value = false
				return
			}

			applyCompleted.value = 0
			applyTotal.value = preparedUpdates.length
			rows.value = rows.value.map((row) =>
				stagedRowIds.value.has(row.id) ? { ...row, error: null } : row
			)

			const outcome = await tracks.updateTracksBatch(
				preparedUpdates.map((entry) => entry.update),
				{
					onProgress: (completed) => {
						if (!ownsOperation() || !isCurrentContext()) return
						applyCompleted.value = completed
					}
				}
			)
			if (!ownsOperation() || !isCurrentContext()) return
			const confirmedOutcome = outcome.cancelled
				? {
						...outcome,
						results: outcome.results.filter(
							(result) => result.status !== 'unattempted'
						)
					}
				: outcome
			await dependencies?.onApplyAttempt?.({
				rows: preparedUpdates.map(({ row, intentKind, update }) => ({
					row,
					intentKind,
					requested: {
						bpm: update.updates.bpm !== undefined,
						keyMode:
							update.updates.key !== undefined ||
							update.updates.mode !== undefined
					}
				})),
				outcome: confirmedOutcome,
				attemptedAt: importedAt
			})
			if (!ownsOperation() || !isCurrentContext()) return
			const results = confirmedOutcome.results
			const resultByTrackId = new Map(
				results.map((result) => [result.id, result])
			)
			const resultByRowId = new Map(
				preparedUpdates.map((entry) => [
					entry.row.id,
					entry.row.track ? resultByTrackId.get(entry.row.track.id) : undefined
				])
			)
			const currentTracksById = new Map(
				tracks.tracks.map((track) => [track.id, track])
			)

			rows.value = rows.value.map((row) => {
				const result = resultByRowId.get(row.id)
				if (!result) return row
				if (!result.success) {
					return {
						...row,
						track:
							currentTracksById.get(result.id) ?? result.track ?? row.track,
						applied: false,
						error: result.error,
						stagingBlockedReason: row.stagingBlockedReason
					}
				}

				return {
					...row,
					track: result.track,
					applied: true,
					error: null
				}
			})
			const preparedRowIds = new Set(
				preparedUpdates.flatMap((entry) =>
					resultByRowId.get(entry.row.id) ? [entry.row.id] : []
				)
			)
			stagedRowIds.value = new Set(
				[...stagedRowIds.value].filter((id) => !preparedRowIds.has(id))
			)

			const succeeded = results.filter((result) => result.success).length
			const failed = results.length - succeeded
			const remaining = Math.max(0, preparedUpdates.length - results.length)
			const successfulUpdates = preparedUpdates.filter((entry) =>
				entry.row.track
					? resultByTrackId.get(entry.row.track.id)?.success
					: false
			)
			lastApplySummary.value =
				results.length || remaining
					? {
							total: preparedUpdates.length,
							succeeded,
							failed,
							remaining,
							bpm: successfulUpdates.filter(
								(entry) => entry.update.updates.bpm !== undefined
							).length,
							keyMode: successfulUpdates.filter(
								(entry) => entry.update.updates.key !== undefined
							).length,
							evidence: successfulUpdates.length,
							evidenceOnly: successfulUpdates.filter(
								(entry) => entry.intentKind === 'evidence-only'
							).length
						}
					: null

			if (remaining > 0) {
				toast.warning(
					`Applied ${succeeded} of ${preparedUpdates.length}. ${remaining} remains to retry.`
				)
			} else if (failed > 0) {
				toast.error(
					`Applied ${succeeded} of ${results.length}. ${failed} failed.`
				)
			} else {
				toast.success(`Applied ${succeeded} of ${results.length}.`)
			}
		} finally {
			finishOwnedOperation()
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
		parsePhase,
		parseBytesCompleted,
		parseBytesTotal,
		isParsing,
		parseCompleted,
		parseTotal,
		isApplying,
		showApplyDialog,
		applyCompleted,
		applyTotal,
		lastApplySummary,
		workflowView,
		changedRowIds,
		resumeSummary,
		requiresSourceReconnect,
		isReviewReadOnly,
		currentStep,
		matchedRows,
		readyRows,
		reviewRows,
		evidenceOnlyRows,
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
		loadResumedReview,
		setReviewReadOnly,
		returnToSource,
		startAnotherSource,
		setRowStaged,
		setFilteredRowsStaged,
		clearStagedRows,
		openApplyReview,
		applyStagedRows,
		cancelPendingApply,
		returnToReview
	}
}
