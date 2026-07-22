import { toast } from 'vue-sonner'
import { getWorkbenchStorePinia } from '~/utils/workbenchPinia'
import type {
	DiscogsImportFailure,
	DiscogsImportResults,
	DiscogsReleaseToFilter,
	DiscogsRetryStatus,
	DiscogsRetrySummary
} from '../../shared/types/discogs'
import { isDiscogsApiError, isDiscogsRequestId } from '../utils/discogs-errors'
import {
	type DiscogsTransferModePolicy,
	type DiscogsTransferOwnership,
	type DiscogsTransferResultsUpdate,
	type DiscogsTransferRunnerEvent,
	createDiscogsImportTransferPolicy,
	createDiscogsRetryTransferPolicy,
	runDiscogsTransfer
} from '../utils/discogsTransferRunner'
import {
	type DiscogsTransferMode,
	type DiscogsTransferSnapshotPayload,
	type DiscogsTransferTerminalStatus,
	createDiscogsTransferSnapshotPersistence
} from '../utils/discogsTransferSnapshot'

type TransferStatus = 'idle' | 'running' | DiscogsTransferTerminalStatus
type TransferMode = DiscogsTransferMode | null

type FolderLoadError = {
	message: string
	requestId?: string
}

function createEmptyImportResults(): DiscogsImportResults {
	return { successful: 0, skipped: [], failed: [] }
}

export const useDiscogsStore = defineStore('discogs', () => {
	const pinia = getWorkbenchStorePinia()
	const user = useUserStore(pinia)
	const discogsApi = useDiscogsApi(user)
	let accountGeneration = 0
	let folderReviewGeneration = 0
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
	const libraryRefreshFailed = ref(false)
	const shouldCancelImport = ref(false)
	const importResults = ref<DiscogsImportResults>(createEmptyImportResults())
	let snapshotUserId: string | null = null
	let hydratedUserId: string | null = null

	const hasTransferActivity = computed(() => transferStatus.value !== 'idle')
	const hasActiveTransfer = computed(
		() => isImporting.value || transferStatus.value === 'running'
	)
	const isRetrying = computed(
		() => transferMode.value === 'retry' && transferStatus.value === 'running'
	)
	const retryableFailures = computed(() =>
		importResults.value.failed.filter(
			(failure): failure is DiscogsImportFailure & { releaseId: number } =>
				failure.retryable && failure.releaseId !== null
		)
	)
	const canRetryFailed = computed(
		() => !isImporting.value && retryableFailures.value.length > 0
	)
	const transferTone = computed<'active' | 'success' | 'warning'>(() => {
		if (transferStatus.value === 'running') return 'active'
		if (
			transferStatus.value === 'completed' &&
			importResults.value.failed.length === 0 &&
			!libraryRefreshFailed.value
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
				: null,
			libraryRefreshFailed.value ? 'refresh needed' : null
		].filter((part): part is string => Boolean(part))

		return resultParts.length > 0
			? `Discogs · ${resultParts.join(' · ')}`
			: 'Discogs · Import complete'
	})

	type AccountOperationContext = {
		generation: number
		userId: string
	}
	type TransferOperationContext = DiscogsTransferOwnership

	function currentUserId(): string | null {
		return user.supaUserId ?? user.profile?.id ?? null
	}

	function transferSnapshotPersistence() {
		return typeof window === 'undefined'
			? null
			: createDiscogsTransferSnapshotPersistence(window.sessionStorage)
	}

	function clearTransferSnapshot(userId: string | null) {
		if (!userId) return
		try {
			transferSnapshotPersistence()?.remove(userId)
		} catch {
			// In-memory ownership must still be released when storage is unavailable.
		}
		if (snapshotUserId === userId) snapshotUserId = null
	}

	function persistTransferSnapshot(
		userId: string,
		terminal: DiscogsTransferSnapshotPayload
	) {
		const persistence = transferSnapshotPersistence()
		if (!persistence) return
		persistence.write(userId, terminal)
		snapshotUserId = userId
	}

	function restoreTransferSnapshot(userId: string) {
		if (hydratedUserId === userId) return
		hydratedUserId = userId
		const persistence = transferSnapshotPersistence()
		if (!persistence) return
		let storedSnapshot: ReturnType<typeof persistence.read>
		try {
			storedSnapshot = persistence.read(userId)
		} catch {
			return
		}
		if (storedSnapshot.kind === 'missing') return
		if (storedSnapshot.kind === 'invalid') {
			clearTransferSnapshot(userId)
			return
		}
		const { snapshot } = storedSnapshot
		transferStatus.value = snapshot.status
		transferMode.value = snapshot.mode
		importResults.value = snapshot.results
		retrySummary.value = snapshot.retrySummary
		libraryRefreshFailed.value = snapshot.libraryRefreshFailed ?? false
		snapshotUserId = userId
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

	function captureTransferContext(): TransferOperationContext | null {
		const ownerId = currentUserId()
		return ownerId
			? {
					ownerId,
					accountGeneration,
					folderGeneration: folderReviewGeneration
				}
			: null
	}

	function isCurrentTransferContext(
		context: TransferOperationContext
	): boolean {
		// The folder generation records which immutable selection produced the
		// targets. Once started, that copied selection remains owned by the account;
		// a later folder review does not retarget or cancel the active transfer.
		return (
			context.accountGeneration === accountGeneration &&
			currentUserId() === context.ownerId
		)
	}

	function resetAccountState(
		outgoingUserId = hydratedUserId ?? snapshotUserId ?? currentUserId()
	) {
		clearTransferSnapshot(outgoingUserId)
		accountGeneration += 1
		folderReviewGeneration += 1
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
		libraryRefreshFailed.value = false
		importResults.value = createEmptyImportResults()
		hydratedUserId = null
		snapshotUserId = null
	}

	function openTransferMonitor() {
		if (hasTransferActivity.value || hasActiveTransfer.value) {
			showImportProgressDialog.value = true
		}
	}

	function openCollectionImport() {
		if (hasActiveTransfer.value) {
			showGetFoldersDialog.value = false
			showFilterDialog.value = false
			openTransferMonitor()
			return
		}

		showGetFoldersDialog.value = true
	}

	function minimizeTransferMonitor() {
		showImportProgressDialog.value = false
	}

	function dismissTransferMonitor() {
		showImportProgressDialog.value = false
		if (isImporting.value) return
		clearTransferSnapshot(snapshotUserId ?? hydratedUserId ?? currentUserId())
		transferStatus.value = 'idle'
		transferMode.value = null
		retryStatus.value = null
		retrySummary.value = null
		libraryRefreshFailed.value = false
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
		const selectedFolderValue = selectedFolder.value
		const folderById = folders.value.find(
			(candidate) => String(candidate.id) === selectedFolder.value
		)
		const foldersByLegacyName = folderById
			? []
			: folders.value.filter(
					(candidate) => candidate.name === selectedFolderValue
				)
		const folder =
			folderById ??
			(foldersByLegacyName.length === 1 ? foldersByLegacyName[0] : undefined)
		if (!folder) return
		const reviewGeneration = ++folderReviewGeneration
		const ownsReview = () =>
			isCurrentAccountContext(context) &&
			reviewGeneration === folderReviewGeneration &&
			selectedFolder.value === selectedFolderValue
		isLoadingSelectedFolder.value = true
		releasesToImport.value = []
		try {
			const releases: DiscogsRelease[] = []
			let allReleasesFetched = false
			let page = 1
			while (!allReleasesFetched) {
				if (!ownsReview()) return
				const data = await discogsApi.getFolderReleases(folder.id, page, 100)
				if (!ownsReview()) return
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
				if (!ownsReview()) return
				toast.warning(
					'Could not compare this folder with your library. Existing records will still be skipped safely.'
				)
			}
			if (!ownsReview()) return
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
			if (!ownsReview()) return
			toast.error(isError(e) ? e.message : 'Error fetching folder.')
		} finally {
			if (ownsReview()) {
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

	async function refreshImportedLibrary(): Promise<boolean> {
		const recordsStore = useRecordsStore(pinia)
		const tracksStore = useTracksStore(pinia)
		const results = await Promise.allSettled([
			recordsStore.fetchAllRecords({ fresh: true }),
			tracksStore.fetchAllTracks({ fresh: true })
		])
		return results.every(
			(result) => result.status === 'fulfilled' && result.value === true
		)
	}

	function applyTerminalState(
		context: TransferOperationContext,
		terminal: Extract<
			DiscogsTransferRunnerEvent,
			{ type: 'completed' | 'provider-cancelled' | 'unexpected-failure' }
		>['terminal']
	) {
		if (!isCurrentTransferContext(context)) return
		transferStatus.value = terminal.status
		transferMode.value = terminal.mode
		importResults.value = terminal.results
		retrySummary.value = terminal.retrySummary
		libraryRefreshFailed.value = terminal.libraryRefreshFailed
	}

	function applyResultsUpdate(update: DiscogsTransferResultsUpdate) {
		if (update.kind === 'replace') importResults.value = update.results
	}

	function applyTransferEvent(
		context: TransferOperationContext,
		event: DiscogsTransferRunnerEvent
	) {
		if (!isCurrentTransferContext(context)) return
		switch (event.type) {
			case 'started':
				showImportProgressDialog.value = true
				isImporting.value = true
				transferStatus.value = 'running'
				transferMode.value = event.mode
				shouldCancelImport.value = false
				importProgress.value = 0
				importPhase.value = 'fetching'
				retryStatus.value = null
				retrySummary.value = null
				libraryRefreshFailed.value = false
				applyResultsUpdate(event.resultsUpdate)
				return
			case 'prepared':
				applyResultsUpdate(event.resultsUpdate)
				return
			case 'progress':
				importProgress.value = event.progress
				releaseBeingImported.value = event.release
				return
			case 'attempt-status':
				retryStatus.value = event.status
				return
			case 'saving':
				importPhase.value = 'saving'
				retryStatus.value = null
				return
			case 'refreshing':
				return
			case 'refresh-failed':
				libraryRefreshFailed.value = true
				toast.warning(
					'Discogs changes were saved, but your library could not be refreshed.'
				)
				return
			case 'provider-cancelled':
				applyTerminalState(context, event.terminal)
				retryStatus.value = null
				toast.info(event.message)
				showImportProgressDialog.value = false
				return
			case 'completed':
				applyTerminalState(context, event.terminal)
				return
			case 'unexpected-failure':
				applyTerminalState(context, event.terminal)
				toast.error(event.message)
				return
			case 'settled':
				isImporting.value = false
				importProgress.value = 0
				importPhase.value = null
				releaseBeingImported.value = null
				retryStatus.value = null
				return
			case 'stale-owner':
			case 'snapshot-persist-failed':
				return
		}
	}

	async function runTransfer(
		context: TransferOperationContext,
		policy: DiscogsTransferModePolicy
	) {
		await runDiscogsTransfer({
			ownership: context,
			policy,
			isCurrentOwnership: isCurrentTransferContext,
			isCancellationRequested: () => shouldCancelImport.value,
			fetch: fetchReleaseDetails,
			save: importFetchedReleases,
			refresh: refreshImportedLibrary,
			persist: (terminal) => persistTransferSnapshot(context.ownerId, terminal),
			onEvent: (event) => applyTransferEvent(context, event)
		})
	}

	async function importSelectedReleases() {
		if (hasActiveTransfer.value) {
			showGetFoldersDialog.value = false
			showFilterDialog.value = false
			openTransferMonitor()
			return
		}

		const context = captureTransferContext()
		const selectedReleases = releasesToImport.value.filter((r) => r.selected)
		if (selectedReleases.length === 0) {
			toast.error('No releases selected for import')
			return
		}
		if (!context || !user.profile || user.profile.id !== context.ownerId) {
			toast.error('Profile not loaded.')
			return
		}

		showFilterDialog.value = false
		await runTransfer(
			context,
			createDiscogsImportTransferPolicy({
				selectedReleases,
				previousResults: importResults.value,
				prepareTargets: filterOutExistingReleases,
				formatTargetLabel: (target) => formatReleaseDisplayTitle(target)
			})
		)
	}

	async function retryFailedReleases() {
		if (isImporting.value) return
		const context = captureTransferContext()
		if (!context || !user.profile || user.profile.id !== context.ownerId) {
			toast.error('Profile not loaded.')
			return
		}
		const failuresToRetry = retryableFailures.value
		if (failuresToRetry.length === 0) return

		await runTransfer(
			context,
			createDiscogsRetryTransferPolicy({
				failuresToRetry,
				previousResults: importResults.value
			})
		)
	}

	watch(
		selectedFolder,
		() => {
			folderReviewGeneration += 1
			isLoadingSelectedFolder.value = false
			releasesToImport.value = []
		},
		{ flush: 'sync' }
	)
	watch(
		showGetFoldersDialog,
		(newValue) => {
			folderReviewGeneration += 1
			isLoadingSelectedFolder.value = false
			if (!newValue) return
			if (hasActiveTransfer.value) {
				showGetFoldersDialog.value = false
				openTransferMonitor()
				return
			}
			if (folders.value.length === 0) getFolders()
		},
		{ flush: 'sync' }
	)
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
		hasActiveTransfer,
		transferTone,
		transferLabel,
		isRetrying,
		retryStatus,
		retrySummary,
		libraryRefreshFailed,
		retryableFailures,
		canRetryFailed,
		importResults,
		getFolders,
		fetchFolderReleases,
		importSelectedReleases,
		retryFailedReleases,
		cancelImport,
		openCollectionImport,
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
