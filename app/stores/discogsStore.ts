import { toast } from 'vue-sonner'
import { getActivePinia } from 'pinia'
import type {
	DiscogsErrorCode,
	DiscogsImportFailure,
	DiscogsImportResults,
	DiscogsReleaseToFilter,
	DiscogsRetryStatus,
	DiscogsRetrySummary
} from '../../shared/types/discogs'
import { isDiscogsApiError, isDiscogsRequestId } from '../utils/discogs-errors'
import type { DiscogsReleaseTarget } from '../utils/discogs-import'

type TransferStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed'
type TransferMode = 'import' | 'retry' | null

type FolderLoadError = {
	message: string
	requestId?: string
}

const TRANSFER_SNAPSHOT_VERSION = 1
const TRANSFER_STORAGE_PREFIX = 'crate-guide:discogs-transfer'
const MAX_SNAPSHOT_FAILURES = 500
const SNAPSHOT_ERROR_CODES = new Set<DiscogsErrorCode>([
	'database_write_failed',
	'discogs_connection_required',
	'discogs_not_found',
	'discogs_rate_limited',
	'discogs_request_rejected',
	'discogs_timeout',
	'discogs_transport',
	'discogs_unavailable',
	'internal_error',
	'invalid_request',
	'invalid_upstream_response',
	'unknown_error'
])

interface TransferSnapshot {
	version: 1
	userId: string
	status: Exclude<TransferStatus, 'idle' | 'running'>
	mode: Exclude<TransferMode, null>
	results: DiscogsImportResults
	retrySummary: DiscogsRetrySummary | null
}

function createEmptyImportResults(): DiscogsImportResults {
	return { successful: 0, skipped: [], failed: [] }
}

function isSnapshotFailure(value: unknown): value is DiscogsImportFailure {
	if (!value || typeof value !== 'object') return false
	const failure = value as Record<string, unknown>
	return (
		(failure.releaseId === null ||
			(typeof failure.releaseId === 'number' &&
				Number.isInteger(failure.releaseId) &&
				failure.releaseId > 0)) &&
		typeof failure.label === 'string' &&
		failure.label.length > 0 &&
		failure.label.length <= 300 &&
		typeof failure.error === 'string' &&
		failure.error.length > 0 &&
		failure.error.length <= 300 &&
		typeof failure.code === 'string' &&
		SNAPSHOT_ERROR_CODES.has(failure.code as DiscogsErrorCode) &&
		(failure.stage === 'fetch' ||
			failure.stage === 'save' ||
			failure.stage === 'pipeline') &&
		typeof failure.retryable === 'boolean' &&
		typeof failure.attempts === 'number' &&
		Number.isInteger(failure.attempts) &&
		failure.attempts >= 1 &&
		failure.attempts <= 3 &&
		(failure.requestId === undefined || isDiscogsRequestId(failure.requestId))
	)
}

function isTransferSnapshot(
	value: unknown,
	userId: string
): value is TransferSnapshot {
	if (!value || typeof value !== 'object') return false
	const snapshot = value as Record<string, unknown>
	if (
		snapshot.version !== TRANSFER_SNAPSHOT_VERSION ||
		snapshot.userId !== userId ||
		(snapshot.status !== 'completed' &&
			snapshot.status !== 'cancelled' &&
			snapshot.status !== 'failed') ||
		(snapshot.mode !== 'import' && snapshot.mode !== 'retry') ||
		!snapshot.results ||
		typeof snapshot.results !== 'object'
	) {
		return false
	}
	const results = snapshot.results as Record<string, unknown>
	if (
		typeof results.successful !== 'number' ||
		!Number.isInteger(results.successful) ||
		results.successful < 0 ||
		!Array.isArray(results.skipped) ||
		results.skipped.length > 10_000 ||
		!results.skipped.every(
			(item) =>
				Boolean(item) &&
				typeof item === 'object' &&
				typeof (item as { label?: unknown }).label === 'string' &&
				(item as { label: string }).label.length <= 300
		) ||
		!Array.isArray(results.failed) ||
		results.failed.length > MAX_SNAPSHOT_FAILURES ||
		!results.failed.every(isSnapshotFailure)
	) {
		return false
	}
	if (snapshot.retrySummary !== null) {
		if (!snapshot.retrySummary || typeof snapshot.retrySummary !== 'object') {
			return false
		}
		const summary = snapshot.retrySummary as Record<string, unknown>
		if (
			!['attempted', 'recovered', 'remaining'].every(
				(key) =>
					typeof summary[key] === 'number' &&
					Number.isInteger(summary[key]) &&
					(summary[key] as number) >= 0
			)
		) {
			return false
		}
	}
	return true
}

export const useDiscogsStore = defineStore('discogs', () => {
	const pinia = getActivePinia()
	const user = useUserStore(pinia)
	const discogsApi = useDiscogsApi()
	let accountGeneration = 0
	const folders = ref<DiscogsFolder[]>([])
	const selectedFolder = ref<string | undefined>(undefined)
	const releasesToImport = ref<DiscogsReleaseToFilter[]>([])
	const releaseBeingImported = ref<DiscogsReleaseToFilter | null>(null)
	const folderError = ref<FolderLoadError | null>(null)

	const isLoadingFolders = ref(false)
	const isLoadingSelectedFolder = ref(false)
	const isDisconnecting = ref(false)

	const showFilterDialog = ref(false)
	const showImportProgressDialog = ref(false)
	const showGetFoldersDialog = ref(false)

	const importProgress = ref(0)
	const isImporting = ref(false)
	const importPhase = ref<'fetching' | 'saving' | null>(null)
	const transferStatus = ref<TransferStatus>('idle')
	const transferMode = ref<TransferMode>(null)
	const retryStatus = ref<DiscogsRetryStatus | null>(null)
	const retrySummary = ref<DiscogsRetrySummary | null>(null)
	const shouldCancelImport = ref(false)
	const importResults = ref<DiscogsImportResults>(createEmptyImportResults())
	let snapshotUserId: string | null = null
	let hydratedUserId: string | null = null

	const hasTransferActivity = computed(() => transferStatus.value !== 'idle')
	const isRetrying = computed(
		() => transferMode.value === 'retry' && transferStatus.value === 'running'
	)
	const retryableFailures = computed(() =>
		importResults.value.failed.filter(
			(failure) => failure.retryable && failure.releaseId !== null
		)
	)
	const canRetryFailed = computed(
		() => !isImporting.value && retryableFailures.value.length > 0
	)
	const transferTone = computed<'active' | 'success' | 'warning'>(() => {
		if (transferStatus.value === 'running') return 'active'
		if (
			transferStatus.value === 'completed' &&
			importResults.value.failed.length === 0
		)
			return 'success'
		return 'warning'
	})
	const transferLabel = computed(() => {
		if (transferStatus.value === 'running') {
			if (transferMode.value === 'retry') {
				return `Discogs · Retrying · ${importProgress.value}%`
			}
			return importPhase.value === 'saving'
				? 'Discogs · Writing library'
				: `Discogs · Fetching · ${importProgress.value}%`
		}
		if (transferStatus.value === 'cancelled')
			return 'Discogs · Import cancelled'
		if (transferStatus.value === 'failed') return 'Discogs · Import failed'

		const resultParts = [
			importResults.value.successful > 0
				? `${importResults.value.successful} imported`
				: null,
			importResults.value.skipped.length > 0
				? `${importResults.value.skipped.length} skipped`
				: null,
			importResults.value.failed.length > 0
				? `${importResults.value.failed.length} failed`
				: null
		].filter((part): part is string => Boolean(part))

		return resultParts.length > 0
			? `Discogs · ${resultParts.join(' · ')}`
			: 'Discogs · Import complete'
	})

	type AccountOperationContext = {
		generation: number
		userId: string
	}

	function currentUserId(): string | null {
		return user.supaUserId ?? user.profile?.id ?? null
	}

	function transferStorageKey(userId: string): string {
		return `${TRANSFER_STORAGE_PREFIX}:${encodeURIComponent(userId)}`
	}

	function clearTransferSnapshot(userId = currentUserId() ?? snapshotUserId) {
		if (typeof window === 'undefined' || !userId) return
		window.sessionStorage.removeItem(transferStorageKey(userId))
		if (snapshotUserId === userId) snapshotUserId = null
	}

	function persistTransferSnapshot() {
		if (typeof window === 'undefined') return
		const userId = currentUserId()
		if (
			!userId ||
			transferStatus.value === 'idle' ||
			transferStatus.value === 'running' ||
			transferMode.value === null
		) {
			return
		}
		const snapshot: TransferSnapshot = {
			version: TRANSFER_SNAPSHOT_VERSION,
			userId,
			status: transferStatus.value,
			mode: transferMode.value,
			results: importResults.value,
			retrySummary: retrySummary.value
		}
		try {
			window.sessionStorage.setItem(
				transferStorageKey(userId),
				JSON.stringify(snapshot)
			)
			snapshotUserId = userId
		} catch {
			// Transfer state remains available in memory if storage is unavailable.
		}
	}

	function restoreTransferSnapshot(userId: string) {
		if (typeof window === 'undefined' || hydratedUserId === userId) return
		hydratedUserId = userId
		let rawSnapshot: string | null = null
		try {
			rawSnapshot = window.sessionStorage.getItem(transferStorageKey(userId))
		} catch {
			return
		}
		if (!rawSnapshot) return
		try {
			const snapshot: unknown = JSON.parse(rawSnapshot)
			if (!isTransferSnapshot(snapshot, userId)) {
				clearTransferSnapshot(userId)
				return
			}
			transferStatus.value = snapshot.status
			transferMode.value = snapshot.mode
			importResults.value = snapshot.results
			retrySummary.value = snapshot.retrySummary
			snapshotUserId = userId
		} catch {
			clearTransferSnapshot(userId)
		}
	}

	function captureAccountContext(): AccountOperationContext | null {
		const userId = currentUserId()
		return userId ? { generation: accountGeneration, userId } : null
	}

	function isCurrentAccountContext(context: AccountOperationContext): boolean {
		return (
			context.generation === accountGeneration &&
			currentUserId() === context.userId
		)
	}

	function resetAccountState() {
		clearTransferSnapshot()
		accountGeneration += 1
		shouldCancelImport.value = true
		folders.value = []
		folderError.value = null
		selectedFolder.value = undefined
		releasesToImport.value = []
		releaseBeingImported.value = null
		isLoadingFolders.value = false
		isLoadingSelectedFolder.value = false
		isDisconnecting.value = false
		showFilterDialog.value = false
		showImportProgressDialog.value = false
		showGetFoldersDialog.value = false
		importProgress.value = 0
		isImporting.value = false
		importPhase.value = null
		transferStatus.value = 'idle'
		transferMode.value = null
		retryStatus.value = null
		retrySummary.value = null
		importResults.value = createEmptyImportResults()
		hydratedUserId = null
	}

	function openTransferMonitor() {
		if (hasTransferActivity.value) showImportProgressDialog.value = true
	}

	function minimizeTransferMonitor() {
		showImportProgressDialog.value = false
	}

	function dismissTransferMonitor() {
		showImportProgressDialog.value = false
		if (isImporting.value) return
		clearTransferSnapshot()
		transferStatus.value = 'idle'
		transferMode.value = null
		retryStatus.value = null
		retrySummary.value = null
		importResults.value = createEmptyImportResults()
	}

	async function getFolders() {
		const context = captureAccountContext()
		if (!context) return
		isLoadingFolders.value = true
		folders.value = []
		folderError.value = null
		try {
			const data = await discogsApi.getFolders()
			if (!isCurrentAccountContext(context)) return
			if (!Array.isArray(data.folders)) {
				throw new Error('Invalid folders response')
			}
			folders.value = data.folders
		} catch (e) {
			if (!isCurrentAccountContext(context)) return
			const message = isDiscogsApiError(e)
				? e.message
				: 'Could not load your Discogs folders.'
			folderError.value = {
				message,
				...(isDiscogsApiError(e) &&
				e.requestId &&
				isDiscogsRequestId(e.requestId)
					? { requestId: e.requestId }
					: {})
			}
			toast.error(message)
		} finally {
			if (isCurrentAccountContext(context)) isLoadingFolders.value = false
		}
	}

	async function fetchFolderReleases() {
		const context = captureAccountContext()
		if (!context) return
		if (!selectedFolder.value) return
		if (isLoadingSelectedFolder.value) return
		const folder = folders.value.find((f) => f.name === selectedFolder.value)
		if (!folder) return
		isLoadingSelectedFolder.value = true
		try {
			const releases: DiscogsRelease[] = []
			let allReleasesFetched = false
			let page = 1
			while (!allReleasesFetched) {
				if (!isCurrentAccountContext(context)) return
				const data = await discogsApi.getFolderReleases(folder.id, page, 100)
				if (!isCurrentAccountContext(context)) return
				if (!data.releases) throw new Error('No releases found.')
				if (!data.pagination) throw new Error('No pagination on response.')
				releases.push(...data.releases)
				allReleasesFetched = page >= data.pagination.pages
				page++
			}
			let existingDiscogsIds = new Set<number>()
			try {
				existingDiscogsIds = await getExistingDiscogsIds(releases)
			} catch {
				if (!isCurrentAccountContext(context)) return
				toast.warning(
					'Could not compare this folder with your library. Existing records will still be skipped safely.'
				)
			}
			if (!isCurrentAccountContext(context)) return
			releasesToImport.value = releases.map((release) => {
				const alreadyImported = existingDiscogsIds.has(release.id)
				return {
					...release,
					alreadyImported,
					selected: !alreadyImported
				}
			})
			showGetFoldersDialog.value = false
			showFilterDialog.value = true
		} catch (e) {
			if (!isCurrentAccountContext(context)) return
			toast.error(isError(e) ? e.message : 'Error fetching folder.')
		} finally {
			if (isCurrentAccountContext(context)) {
				isLoadingSelectedFolder.value = false
			}
		}
	}

	async function disconnectDiscogs() {
		const context = captureAccountContext()
		if (!user.profile) {
			toast.error('Profile not loaded.')
			return
		}
		if (!context || user.profile.id !== context.userId) return
		isDisconnecting.value = true
		try {
			const supabase = useSupabaseClient<Database>()
			const { error } = await supabase.rpc('disconnect_discogs')
			if (!isCurrentAccountContext(context)) return
			if (error) {
				toast.error('Error disconnecting Discogs.')
				return
			}
			const refreshed = await user.fetchProfile()
			if (!isCurrentAccountContext(context)) return
			if (refreshed) {
				clearTransferSnapshot(context.userId)
				transferStatus.value = 'idle'
				transferMode.value = null
				importResults.value = createEmptyImportResults()
				toast.success('Discogs disconnected.')
			} else toast.error('Error disconnecting Discogs.')
		} catch {
			if (!isCurrentAccountContext(context)) return
			toast.error('Error disconnecting Discogs.')
		} finally {
			if (isCurrentAccountContext(context)) isDisconnecting.value = false
		}
	}

	function cancelImport() {
		shouldCancelImport.value = true
	}

	function labelForTarget(target: DiscogsReleaseTarget): string {
		return 'label' in target ? target.label : formatReleaseDisplayTitle(target)
	}

	function mergeReplacementFailures(
		existing: DiscogsImportFailure[],
		replacements: DiscogsImportFailure[]
	): DiscogsImportFailure[] {
		const replacedIds = new Set(
			replacements
				.map((failure) => failure.releaseId)
				.filter((releaseId): releaseId is number => releaseId !== null)
		)
		return [
			...existing.filter(
				(failure) =>
					failure.releaseId === null || !replacedIds.has(failure.releaseId)
			),
			...replacements
		]
	}

	function reconcileCompletedFailures(
		existing: DiscogsImportFailure[],
		attemptedIds: Set<number>,
		current: DiscogsImportFailure[]
	): DiscogsImportFailure[] {
		return [
			...existing.filter(
				(failure) =>
					failure.releaseId !== null && !attemptedIds.has(failure.releaseId)
			),
			...current
		]
	}

	function updateAttemptStatus(
		context: AccountOperationContext,
		targets: DiscogsReleaseTarget[],
		status: {
			target: DiscogsReleaseTarget
			attempt: number
			maxAttempts: number
			waitingMs: number | null
		}
	) {
		if (!isCurrentAccountContext(context)) return
		const currentIndex = targets.findIndex(
			(target) => target.id === status.target.id
		)
		retryStatus.value = {
			current: Math.max(1, currentIndex + 1),
			total: targets.length,
			label: labelForTarget(status.target),
			attempt: status.attempt,
			maxAttempts: status.maxAttempts,
			waitingMs: status.waitingMs
		}
	}

	async function refreshImportedLibrary(context: AccountOperationContext) {
		const recordsStore = useRecordsStore(pinia)
		const tracksStore = useTracksStore(pinia)
		await Promise.all([
			recordsStore.fetchAllRecords(),
			tracksStore.fetchAllTracks()
		])
		return isCurrentAccountContext(context)
	}

	async function importSelectedReleases() {
		const context = captureAccountContext()
		const selectedReleases = releasesToImport.value.filter((r) => r.selected)
		if (selectedReleases.length === 0) {
			toast.error('No releases selected for import')
			return
		}
		if (!context || !user.profile || user.profile.id !== context.userId) {
			toast.error('Profile not loaded.')
			return
		}
		showFilterDialog.value = false
		showImportProgressDialog.value = true
		const previousFailures = [...importResults.value.failed]
		const selectedIds = new Set(selectedReleases.map((release) => release.id))

		isImporting.value = true
		transferStatus.value = 'running'
		transferMode.value = 'import'
		shouldCancelImport.value = false
		importProgress.value = 0
		importPhase.value = 'fetching'
		retryStatus.value = null
		retrySummary.value = null
		importResults.value = {
			successful: 0,
			skipped: [],
			failed: previousFailures
		}

		try {
			// Step 1: Handle existing releases
			const { releasesToFetch, skipped } =
				await filterOutExistingReleases(selectedReleases)
			if (!isCurrentAccountContext(context)) return
			importResults.value.skipped = skipped
			const fetchTargets: DiscogsReleaseTarget[] = releasesToFetch

			// Step 2: Fetch details with progress tracking
			const {
				releases,
				failed: fetchFailed,
				cancelled
			} = await fetchReleaseDetails(
				fetchTargets,
				(progress, current) => {
					if (!isCurrentAccountContext(context)) return
					importProgress.value = progress
					releaseBeingImported.value =
						'basic_information' in current ? current : null
				},
				() => shouldCancelImport.value || !isCurrentAccountContext(context),
				{
					onAttemptStatus: (status) =>
						updateAttemptStatus(context, fetchTargets, status)
				}
			)
			if (!isCurrentAccountContext(context)) return
			retryStatus.value = null

			if (cancelled) {
				importResults.value.failed = mergeReplacementFailures(
					previousFailures,
					fetchFailed
				)
				transferStatus.value = 'cancelled'
				toast.info('Import of Discogs records cancelled')
				showImportProgressDialog.value = false
				persistTransferSnapshot()
				return
			}

			// Step 3: Import to database
			if (!isCurrentAccountContext(context)) return
			importPhase.value = 'saving'
			const { successful, failed: importFailed } = await importFetchedReleases(
				releases,
				context.userId,
				() => shouldCancelImport.value || !isCurrentAccountContext(context)
			)
			if (!isCurrentAccountContext(context)) return
			importResults.value.successful = successful
			importResults.value.failed = reconcileCompletedFailures(
				previousFailures,
				selectedIds,
				[...fetchFailed, ...importFailed]
			)

			// Refresh local stores with newly imported data
			if (successful > 0) {
				if (!(await refreshImportedLibrary(context))) return
			}
			transferStatus.value = 'completed'
			persistTransferSnapshot()
		} catch {
			if (!isCurrentAccountContext(context)) return
			transferStatus.value = 'failed'
			importResults.value.failed = [
				...previousFailures,
				{
					releaseId: null,
					label: 'Discogs import',
					error: 'The transfer stopped unexpectedly. Please try again.',
					code: 'internal_error',
					stage: 'pipeline',
					retryable: false,
					attempts: 1
				}
			]
			toast.error('Discogs import failed. Open Transfers for details.')
			persistTransferSnapshot()
		} finally {
			if (isCurrentAccountContext(context)) {
				isImporting.value = false
				importProgress.value = 0
				importPhase.value = null
				releaseBeingImported.value = null
				retryStatus.value = null
			}
		}
	}

	async function retryFailedReleases() {
		if (isImporting.value) return
		const context = captureAccountContext()
		if (!context || !user.profile || user.profile.id !== context.userId) {
			toast.error('Profile not loaded.')
			return
		}
		const failuresToRetry = retryableFailures.value
		if (failuresToRetry.length === 0) return

		const previousFailures = [...importResults.value.failed]
		const targets: DiscogsReleaseTarget[] = failuresToRetry.map((failure) => ({
			id: failure.releaseId!,
			label: failure.label
		}))
		const attemptedIds = new Set(targets.map((target) => target.id))

		showImportProgressDialog.value = true
		isImporting.value = true
		transferStatus.value = 'running'
		transferMode.value = 'retry'
		shouldCancelImport.value = false
		importProgress.value = 0
		importPhase.value = 'fetching'
		retryStatus.value = null
		retrySummary.value = null

		try {
			const {
				releases,
				failed: fetchFailed,
				cancelled
			} = await fetchReleaseDetails(
				targets,
				(progress) => {
					if (!isCurrentAccountContext(context)) return
					importProgress.value = progress
					releaseBeingImported.value = null
				},
				() => shouldCancelImport.value || !isCurrentAccountContext(context),
				{
					onAttemptStatus: (status) =>
						updateAttemptStatus(context, targets, status)
				}
			)
			if (!isCurrentAccountContext(context)) return
			retryStatus.value = null

			if (cancelled) {
				importResults.value.failed = mergeReplacementFailures(
					previousFailures,
					fetchFailed
				)
				transferStatus.value = 'cancelled'
				retrySummary.value = {
					attempted: failuresToRetry.length,
					recovered: 0,
					remaining: importResults.value.failed.length
				}
				toast.info('Retry of Discogs records cancelled')
				showImportProgressDialog.value = false
				persistTransferSnapshot()
				return
			}

			importPhase.value = 'saving'
			const { successful, failed: importFailed } = await importFetchedReleases(
				releases,
				context.userId,
				() => shouldCancelImport.value || !isCurrentAccountContext(context)
			)
			if (!isCurrentAccountContext(context)) return
			const currentFailures = [...fetchFailed, ...importFailed]
			importResults.value.failed = reconcileCompletedFailures(
				previousFailures,
				attemptedIds,
				currentFailures
			)
			const failedAttemptIds = new Set(
				currentFailures
					.map((failure) => failure.releaseId)
					.filter((releaseId): releaseId is number => releaseId !== null)
			)
			const recovered = [...attemptedIds].filter(
				(releaseId) => !failedAttemptIds.has(releaseId)
			).length
			importResults.value.successful += recovered
			retrySummary.value = {
				attempted: failuresToRetry.length,
				recovered,
				remaining: importResults.value.failed.length
			}

			if (successful > 0) {
				if (!(await refreshImportedLibrary(context))) return
			}
			transferStatus.value = 'completed'
			persistTransferSnapshot()
		} catch {
			if (!isCurrentAccountContext(context)) return
			transferStatus.value = 'failed'
			importResults.value.failed = [
				...previousFailures,
				{
					releaseId: null,
					label: 'Discogs retry',
					error: 'The retry stopped unexpectedly. Please try again.',
					code: 'internal_error',
					stage: 'pipeline',
					retryable: false,
					attempts: 1
				}
			]
			retrySummary.value = {
				attempted: failuresToRetry.length,
				recovered: 0,
				remaining: importResults.value.failed.length
			}
			toast.error('Discogs retry failed. Open Transfers for details.')
			persistTransferSnapshot()
		} finally {
			if (isCurrentAccountContext(context)) {
				isImporting.value = false
				importProgress.value = 0
				importPhase.value = null
				releaseBeingImported.value = null
				retryStatus.value = null
			}
		}
	}

	watch(showGetFoldersDialog, (newValue) => {
		if (newValue && folders.value.length === 0) getFolders()
	})
	watch(
		() => currentUserId(),
		(userId) => {
			if (userId) restoreTransferSnapshot(userId)
		},
		{ immediate: true }
	)

	return {
		folders,
		folderError,
		releasesToImport,
		isLoadingFolders,
		isLoadingSelectedFolder,
		isDisconnecting,
		selectedFolder,
		showFilterDialog,
		importProgress,
		isImporting,
		importPhase,
		transferStatus,
		transferMode,
		hasTransferActivity,
		transferTone,
		transferLabel,
		isRetrying,
		retryStatus,
		retrySummary,
		retryableFailures,
		canRetryFailed,
		importResults,
		getFolders,
		fetchFolderReleases,
		importSelectedReleases,
		retryFailedReleases,
		cancelImport,
		openTransferMonitor,
		minimizeTransferMonitor,
		dismissTransferMonitor,
		resetAccountState,
		disconnectDiscogs,
		showImportProgressDialog,
		showGetFoldersDialog,
		releaseBeingImported
	}
})
