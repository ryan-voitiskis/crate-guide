import {
	type Ref,
	computed,
	nextTick,
	onScopeDispose,
	ref,
	shallowRef,
	watch
} from 'vue'
import type {
	ReviewFilter,
	TrackEnrichmentApplyAttempt,
	TrackEnrichmentWorkflow
} from '~/composables/useTrackEnrichmentWorkflow'
import type {
	BrowserClaimedDraft,
	BrowserDeviceDraftRepository,
	BrowserLibraryDependencies,
	BrowserWorkflowDraft,
	BrowserWorkflowDraftEntry,
	BrowserWorkspaceIdentity
} from '~/repositories/deviceDrafts/contracts'
import type { TrackEnrichmentDraftPartialOutcome } from '~/types/trackEnrichmentDraft'
import { hydrateTrackEnrichmentDraft } from '~/utils/trackEnrichmentDraftHydration'
import { mapTrackEnrichmentDraftBatchOutcome } from '~/utils/trackEnrichmentDraftOutcome'
import { createTrackEnrichmentDraftOwnership } from '~/utils/trackEnrichmentDraftOwnership'
import { projectTrackEnrichmentDraft } from '~/utils/trackEnrichmentDraftProjection'
import { createTrackEnrichmentDraftWorkspaceIdentity } from '~/utils/trackEnrichmentDraftWorkspaceIdentity'
import type { WorkbenchRuntime } from '~/utils/workbenchPinia'
import type { LibraryRecord, LibraryTrack } from '~~/shared/types/library'

const TRACK_ENRICHMENT_DRAFT_AUTOSAVE_DELAY_MS = 500

type DraftSessionTimer = ReturnType<typeof globalThis.setTimeout>
type DraftMutationQueue = { tail: Promise<void> }

export type TrackEnrichmentDraftSaveState =
	'idle' | 'saving' | 'saved' | 'failed'

export type TrackEnrichmentDraftDiscoveryState =
	'idle' | 'loading' | 'none' | 'ready' | 'invalid' | 'incompatible' | 'failed'

export type TrackEnrichmentDraftSessionDependencies = {
	runtime: WorkbenchRuntime
	workflow: TrackEnrichmentWorkflow
	records: { records: LibraryRecord[] }
	tracks: { tracks: LibraryTrack[] }
	density?: Ref<'compact' | 'comfortable'>
	sortKey?: Ref<
		'library' | 'source' | 'duration' | 'bpm' | 'key' | 'confidence' | null
	>
	sortDirection?: Ref<'asc' | 'desc'>
	openRepository?: (options: {
		identity: { workspaceId: string; repositoryId: string }
		dependencies?: BrowserLibraryDependencies
	}) => Promise<BrowserDeviceDraftRepository>
	repositoryDependencies?: BrowserLibraryDependencies
	now?: () => Date
	randomUUID?: () => string
	autosaveDelayMs?: number
	leaseRenewIntervalMs?: number
	setTimeout?: typeof globalThis.setTimeout
	clearTimeout?: typeof globalThis.clearTimeout
	setInterval?: typeof globalThis.setInterval
	clearInterval?: typeof globalThis.clearInterval
	hydrateDraft?: typeof hydrateTrackEnrichmentDraft
}

type ReplacementTarget = {
	draftId: string
	draftRevision: number
	observedLeaseRevision: number | null
}

function isConflict(error: unknown): boolean {
	return Boolean(
		error &&
		typeof error === 'object' &&
		'code' in error &&
		(error as { code?: unknown }).code === 'conflict'
	)
}

function errorCode(error: unknown): string | null {
	if (!error || typeof error !== 'object' || !('code' in error)) return null
	const code = (error as { code?: unknown }).code
	return typeof code === 'string' ? code : null
}

function observedLeaseRevision(
	entry: BrowserWorkflowDraftEntry | null
): number | null {
	if (!entry) return null
	return entry.lease.status === 'unclaimed'
		? entry.lease.leaseRevision
		: entry.lease.lease.leaseRevision
}

function normalizePersistedFilter(filter: ReviewFilter) {
	return filter === 'changed' ? ('review' as const) : filter
}

function payloadSignature(draft: BrowserWorkflowDraft['payload']): string {
	return JSON.stringify({
		...draft,
		draftRevision: 0,
		updatedAt: '',
		workspace: { ...draft.workspace, repositoryRevision: 0 }
	})
}

function formatSavedTime(value: string | null): string | null {
	if (!value) return null
	const date = new Date(value)
	if (!Number.isFinite(date.getTime())) return null
	return date.toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	})
}

export function useTrackEnrichmentDraftSession(
	dependencies: TrackEnrichmentDraftSessionDependencies
) {
	const {
		runtime,
		workflow,
		records,
		tracks,
		density = ref<'compact' | 'comfortable'>('compact'),
		sortKey = ref(null),
		sortDirection = ref<'asc' | 'desc'>('asc')
	} = dependencies
	const openRepository =
		dependencies.openRepository ??
		(async (options) => {
			const { openBrowserDeviceDraftRepository } =
				await import('~/repositories/deviceDrafts')
			return openBrowserDeviceDraftRepository(options)
		})
	const now = dependencies.now ?? (() => new Date())
	const randomUUID =
		dependencies.randomUUID ?? (() => globalThis.crypto.randomUUID())
	const scheduleTimeout = dependencies.setTimeout ?? globalThis.setTimeout
	const cancelTimeout = dependencies.clearTimeout ?? globalThis.clearTimeout
	const autosaveDelayMs =
		dependencies.autosaveDelayMs ?? TRACK_ENRICHMENT_DRAFT_AUTOSAVE_DELAY_MS
	const hydrateDraft = dependencies.hydrateDraft ?? hydrateTrackEnrichmentDraft

	const discoveryState = ref<TrackEnrichmentDraftDiscoveryState>('idle')
	const saveState = ref<TrackEnrichmentDraftSaveState>('idle')
	const saveErrorCode = ref<string | null>(null)
	const activeEntry = shallowRef<BrowserWorkflowDraftEntry | null>(null)
	const isHydrating = ref(false)
	const isTakingOver = ref(false)
	const isTransitioning = ref(false)
	const isDraftMissingConflict = ref(false)
	const lastSavedAt = ref<string | null>(null)
	const hasUnsavedChanges = ref(false)
	const recoveryMessage = ref<string | null>(null)
	const sessionRevision = ref(0)
	const ownerToken = randomUUID()

	let repository: BrowserDeviceDraftRepository | null = null
	let unsubscribe: (() => void) | null = null
	let deviceRevision = 0
	let persistedDraft: BrowserWorkflowDraft | null = null
	let partialOutcomes: TrackEnrichmentDraftPartialOutcome[] = []
	let replacementTarget: ReplacementTarget | null = null
	let draftId: string | null = null
	let draftCreatedAt: string | null = null
	let dirtyRevision = 0
	let persistedDirtyRevision = 0
	let lastIssuedTimestamp = 0
	let lifecycleGeneration = 0
	let suppressAutosave = false
	let saveTimer: DraftSessionTimer | null = null
	let savePromise: Promise<void> | null = null
	let refreshPromise: Promise<void> | null = null
	let repositoryRuntimeIdentity: BrowserWorkspaceIdentity | null = null
	let sessionOperationEpoch = 0
	let destructiveTransitionRevision = 0
	let destructiveTransitionActive = false
	let locallyDeletingDraftId: string | null = null
	let mutationQueue: DraftMutationQueue = { tail: Promise.resolve() }
	const reviewedAtByRowId = new Map<string, string>()
	const ownership = createTrackEnrichmentDraftOwnership({
		ownerToken,
		getRepository: () => repository,
		getDeviceRevision: () => deviceRevision,
		setDeviceRevision: (revision) => {
			deviceRevision = revision
		},
		captureLifecycleGuard,
		runSerializedMutation,
		onChange: () => {
			sessionRevision.value += 1
		},
		onRenewed: (currentDraftId, lease) => {
			if (activeEntry.value?.draft.metadata.id === currentDraftId) {
				activeEntry.value = {
					...activeEntry.value,
					lease: { status: 'live', lease }
				}
			}
		},
		onRenewalFailed: (error) => {
			const hadUnsavedWork =
				hasUnsavedChanges.value || saveState.value === 'saving'
			resetOwnership()
			if (hadUnsavedWork) saveState.value = 'failed'
			saveErrorCode.value = errorCode(error)
			void refreshDiscovery()
		},
		leaseRenewIntervalMs: dependencies.leaseRenewIntervalMs,
		setInterval: dependencies.setInterval,
		clearInterval: dependencies.clearInterval
	})

	const hasDraft = computed(() => activeEntry.value !== null)
	const isOwned = computed(() => {
		void sessionRevision.value
		return (
			ownership.lease !== null &&
			ownership.draftId !== null &&
			activeEntry.value?.draft.metadata.id === ownership.draftId
		)
	})
	const isReadOnly = computed(
		() =>
			workflow.rows.value.length > 0 &&
			(isDraftMissingConflict.value || (hasDraft.value && !isOwned.value))
	)
	const isSourceBlockedByDraft = computed(() => {
		void sessionRevision.value
		return (
			isDraftMissingConflict.value ||
			(hasDraft.value && replacementTarget === null)
		)
	})
	const draftDetails = computed(() => {
		const entry = activeEntry.value
		if (!entry || entry.draft.status !== 'ready') return null
		const payload = entry.draft.draft.payload
		return {
			id: payload.id,
			sourceLabel: payload.source.label,
			sourceKind: payload.source.kind,
			observationCount: payload.observations.length,
			reviewedCount: payload.decisions.length,
			stagedCount: payload.decisions.filter(
				(decision) => decision.kind !== 'unknown' && decision.staged
			).length,
			doneCount: payload.partialOutcomes.filter(
				(outcome) => outcome.status === 'succeeded'
			).length,
			retryCount: payload.partialOutcomes.filter(
				(outcome) => outcome.status === 'failed'
			).length,
			updatedAt: payload.updatedAt,
			requiresReconnect: payload.source.requiresReconnect
		}
	})
	const savedTimeLabel = computed(() => formatSavedTime(lastSavedAt.value))
	const savedAtAccessibleLabel = computed(() => {
		if (!lastSavedAt.value) return null
		const date = new Date(lastSavedAt.value)
		return Number.isFinite(date.getTime()) ? date.toLocaleString() : null
	})
	const saveStatusLabel = computed(() => {
		if (saveState.value === 'failed') {
			return "Couldn't save—keep this tab open"
		}
		if (saveState.value === 'saving' || hasUnsavedChanges.value) {
			return 'Saving…'
		}
		if (saveState.value === 'saved' && savedTimeLabel.value) {
			return `Saved locally ${savedTimeLabel.value}`
		}
		return null
	})
	const shouldWarnBeforeUnload = computed(
		() =>
			workflow.isParsing.value ||
			workflow.isApplying.value ||
			hasUnsavedChanges.value ||
			saveState.value === 'saving' ||
			saveState.value === 'failed'
	)

	function nextTimestamp(): string {
		const requested = now().getTime()
		lastIssuedTimestamp = Math.max(requested, lastIssuedTimestamp + 1)
		return new Date(lastIssuedTimestamp).toISOString()
	}

	function observeTimestamp(value: string) {
		const observed = new Date(value).getTime()
		if (Number.isFinite(observed)) {
			lastIssuedTimestamp = Math.max(lastIssuedTimestamp, observed)
		}
	}

	function captureLifecycleGuard() {
		const generation = lifecycleGeneration
		const captured = runtime.capture()
		const capturedRepository = repository
		const capturedRuntimeIdentity = repositoryRuntimeIdentity
		return () =>
			generation === lifecycleGeneration &&
			capturedRepository === repository &&
			runtime.isCurrent(captured.context) &&
			(!capturedRepository ||
				(capturedRuntimeIdentity?.workspaceId ===
					captured.context.workspaceId &&
					capturedRuntimeIdentity.repositoryId ===
						captured.context.repositoryId))
	}

	function runSerializedMutation<T>(callback: () => Promise<T>): Promise<T> {
		const queue = mutationQueue
		const operation = queue.tail.then(callback)
		queue.tail = operation.then(
			() => undefined,
			() => undefined
		)
		return operation
	}

	async function drainMutationQueue(queue: DraftMutationQueue) {
		while (true) {
			const tail = queue.tail
			await tail
			if (queue.tail === tail) return
		}
	}

	function beginSessionOperation() {
		const operationEpoch = ++sessionOperationEpoch
		const isCurrentLifecycle = captureLifecycleGuard()
		isHydrating.value = false
		isTakingOver.value = false
		suppressAutosave = false
		return () =>
			isCurrentLifecycle() && operationEpoch === sessionOperationEpoch
	}

	function beginDestructiveTransition() {
		if (destructiveTransitionActive) return null
		destructiveTransitionActive = true
		isTransitioning.value = true
		const transitionRevision = ++destructiveTransitionRevision
		const isCurrentSessionOperation = beginSessionOperation()
		workflow.setReviewReadOnly(workflow.rows.value.length > 0)
		return {
			isCurrentOperation: () =>
				isCurrentSessionOperation() &&
				destructiveTransitionActive &&
				transitionRevision === destructiveTransitionRevision,
			finish: () => {
				if (transitionRevision !== destructiveTransitionRevision) return
				destructiveTransitionActive = false
				isTransitioning.value = false
				if (workflow.rows.value.length > 0) {
					workflow.setReviewReadOnly(
						isDraftMissingConflict.value || !ownership.lease
					)
				}
			}
		}
	}

	function clearSaveTimer() {
		if (saveTimer === null) return
		cancelTimeout(saveTimer)
		saveTimer = null
	}

	function resetOwnership() {
		ownership.reset()
		workflow.setReviewReadOnly(workflow.rows.value.length > 0)
	}

	function setClaimed(claimed: BrowserClaimedDraft) {
		ownership.accept(claimed.draft.id, claimed.lease)
		persistedDraft = claimed.draft
		observeTimestamp(claimed.draft.updatedAt)
		draftId = claimed.draft.id
		draftCreatedAt = claimed.draft.payload.createdAt
		partialOutcomes = claimed.draft.payload.partialOutcomes.map((outcome) =>
			structuredClone(outcome)
		)
		workflow.setReviewReadOnly(false)
		ownership.startRenewing()
	}

	function setActiveEntry(entry: BrowserWorkflowDraftEntry | null) {
		activeEntry.value = entry
		if (!entry) {
			discoveryState.value = 'none'
			lastSavedAt.value = null
			persistedDraft = null
			if (!replacementTarget) {
				draftId = null
				draftCreatedAt = null
				partialOutcomes = []
			}
			resetOwnership()
			return
		}
		discoveryState.value = entry.draft.status
		lastSavedAt.value = entry.draft.metadata.updatedAt
		observeTimestamp(entry.draft.metadata.updatedAt)
		if (entry.draft.status === 'ready') {
			persistedDraft = entry.draft.draft
			draftId = entry.draft.draft.id
			draftCreatedAt = entry.draft.draft.payload.createdAt
			partialOutcomes = entry.draft.draft.payload.partialOutcomes.map(
				(outcome) => structuredClone(outcome)
			)
		} else {
			persistedDraft = null
			draftId = entry.draft.metadata.id
			draftCreatedAt = null
			partialOutcomes = []
		}
	}

	async function refreshDiscovery(generation = lifecycleGeneration) {
		const isCurrentLifecycle = captureLifecycleGuard()
		if (
			!repository ||
			generation !== lifecycleGeneration ||
			!isCurrentLifecycle()
		) {
			return
		}
		if (refreshPromise) return await refreshPromise
		const currentRepository = repository
		const previousEntry = activeEntry.value
		const created = (async () => {
			try {
				const result = await currentRepository.listDrafts()
				if (
					generation !== lifecycleGeneration ||
					currentRepository !== repository ||
					!isCurrentLifecycle()
				) {
					return
				}
				if (result.deviceRevision < deviceRevision) return
				deviceRevision = result.deviceRevision
				if (result.value.length > 1) {
					discoveryState.value = 'failed'
					recoveryMessage.value =
						'Multiple device drafts were found. No draft was changed.'
					resetOwnership()
					return
				}
				const entry = result.value[0] ?? null
				const previousDraftId = previousEntry?.draft.metadata.id ?? null
				if (
					!entry &&
					previousDraftId &&
					previousDraftId !== locallyDeletingDraftId &&
					(workflow.rows.value.length > 0 || hasUnsavedChanges.value)
				) {
					clearSaveTimer()
					replacementTarget = null
					activeEntry.value = null
					persistedDraft = null
					draftId = null
					draftCreatedAt = null
					lastSavedAt.value = null
					discoveryState.value = 'none'
					resetOwnership()
					isDraftMissingConflict.value = true
					if (!hasUnsavedChanges.value) dirtyRevision += 1
					hasUnsavedChanges.value = true
					saveState.value = 'failed'
					saveErrorCode.value = 'conflict'
					recoveryMessage.value =
						'This saved review was deleted in another tab. Start fresh to continue; no review was recreated.'
					workflow.setReviewReadOnly(true)
					return
				}
				if (isDraftMissingConflict.value) {
					workflow.setReviewReadOnly(workflow.rows.value.length > 0)
					return
				}
				const currentOwnedRevision = ownership.lease?.leaseRevision ?? null
				const observedRevision = observedLeaseRevision(entry)
				if (
					ownership.draftId &&
					(!entry ||
						entry.draft.metadata.id !== ownership.draftId ||
						currentOwnedRevision !== observedRevision)
				) {
					resetOwnership()
				}
				const preserveDirtyOwnedProjection = Boolean(
					hasUnsavedChanges.value &&
					entry?.draft.status === 'ready' &&
					persistedDraft &&
					ownership.draftId === entry.draft.metadata.id &&
					ownership.lease &&
					observedRevision === ownership.lease.leaseRevision &&
					persistedDraft.id === entry.draft.metadata.id &&
					persistedDraft.draftRevision === entry.draft.metadata.draftRevision
				)
				if (preserveDirtyOwnedProjection && entry) {
					activeEntry.value = entry
					discoveryState.value = entry.draft.status
					lastSavedAt.value = entry.draft.metadata.updatedAt
					observeTimestamp(entry.draft.metadata.updatedAt)
				} else {
					setActiveEntry(entry)
				}
				if (workflow.rows.value.length > 0) {
					workflow.setReviewReadOnly(!ownership.lease)
				}
			} catch (error) {
				if (
					generation !== lifecycleGeneration ||
					currentRepository !== repository ||
					!isCurrentLifecycle()
				) {
					return
				}
				discoveryState.value = 'failed'
				recoveryMessage.value =
					'Device-local draft storage is unavailable in this browser.'
				saveErrorCode.value = errorCode(error)
				if (workflow.rows.value.length > 0) {
					if (!hasUnsavedChanges.value) dirtyRevision += 1
					hasUnsavedChanges.value = true
					saveState.value = 'failed'
				}
			}
		})().finally(() => {
			if (refreshPromise === created) refreshPromise = null
		})
		refreshPromise = created
		await created
	}

	async function releaseAndCloseRepository(
		outgoingQueue: DraftMutationQueue = mutationQueue,
		outgoingSave: Promise<void> | null = savePromise
	) {
		const currentRepository = repository
		if (!currentRepository) return
		clearSaveTimer()
		ownership.stopRenewing()
		unsubscribe?.()
		unsubscribe = null
		const preDrainDraftId =
			ownership.draftId ?? draftId ?? persistedDraft?.id ?? null
		ownership.reset()
		try {
			await outgoingSave
			await drainMutationQueue(outgoingQueue)
			const currentDraftId =
				ownership.draftId ?? draftId ?? persistedDraft?.id ?? preDrainDraftId
			ownership.stopRenewing()
			if (ownership.lease || ownership.draftId) ownership.reset()
			if (currentDraftId) {
				await ownership.releaseObserved(currentRepository, currentDraftId)
			}
		} catch {
			// A takeover or workspace replacement can legitimately fence this tab.
		} finally {
			ownership.stopRenewing()
			if (ownership.lease || ownership.draftId) ownership.reset()
			currentRepository.close()
			if (repository === currentRepository) {
				repository = null
				repositoryRuntimeIdentity = null
			}
		}
	}

	async function initialize() {
		const generation = ++lifecycleGeneration
		const outgoingQueue = mutationQueue
		const outgoingSave = savePromise
		sessionOperationEpoch += 1
		destructiveTransitionRevision += 1
		destructiveTransitionActive = false
		isTransitioning.value = false
		locallyDeletingDraftId = null
		refreshPromise = null
		isHydrating.value = false
		isTakingOver.value = false
		suppressAutosave = false
		discoveryState.value = 'loading'
		recoveryMessage.value = null
		isDraftMissingConflict.value = false
		await releaseAndCloseRepository(outgoingQueue, outgoingSave)
		savePromise = null
		mutationQueue = { tail: Promise.resolve() }
		deviceRevision = 0
		dirtyRevision = 0
		persistedDirtyRevision = 0
		hasUnsavedChanges.value = false
		saveState.value = 'idle'
		saveErrorCode.value = null
		reviewedAtByRowId.clear()
		replacementTarget = null
		activeEntry.value = null
		persistedDraft = null
		draftId = null
		draftCreatedAt = null
		partialOutcomes = []
		lastSavedAt.value = null
		const captured = runtime.capture()
		const runtimeIdentity = {
			workspaceId: captured.context.workspaceId,
			repositoryId: captured.context.repositoryId
		}
		let opened: BrowserDeviceDraftRepository
		try {
			const draftIdentity = await createTrackEnrichmentDraftWorkspaceIdentity(
				runtimeIdentity,
				captured.descriptor.location
			)
			if (
				generation !== lifecycleGeneration ||
				!runtime.isCurrent(captured.context)
			) {
				return
			}
			const candidate = await openRepository({
				identity: draftIdentity,
				dependencies: dependencies.repositoryDependencies
			})
			if (
				candidate.identity.workspaceId !== draftIdentity.workspaceId ||
				candidate.identity.repositoryId !== draftIdentity.repositoryId
			) {
				candidate.close()
				throw new Error('Device-local draft repository identity mismatch.')
			}
			opened = candidate
		} catch (error) {
			if (
				generation !== lifecycleGeneration ||
				!runtime.isCurrent(captured.context)
			) {
				return
			}
			discoveryState.value = 'failed'
			saveErrorCode.value = errorCode(error)
			recoveryMessage.value =
				'Device-local draft storage is unavailable in this browser.'
			if (workflow.rows.value.length > 0) {
				if (!hasUnsavedChanges.value) dirtyRevision += 1
				hasUnsavedChanges.value = true
				saveState.value = 'failed'
			}
			return
		}
		if (
			generation !== lifecycleGeneration ||
			!runtime.isCurrent(captured.context)
		) {
			opened.close()
			return
		}
		repository = opened
		repositoryRuntimeIdentity = runtimeIdentity
		unsubscribe = opened.subscribe((change) => {
			if (
				change.workspaceId !== opened.identity.workspaceId ||
				change.repositoryId !== opened.identity.repositoryId ||
				!change.invalidations.some(({ entity }) => entity === 'drafts')
			) {
				return
			}
			void refreshDiscovery(generation)
		})
		await refreshDiscovery(generation)
		if (
			generation === lifecycleGeneration &&
			workflow.rows.value.length > 0 &&
			!activeEntry.value
		) {
			scheduleSave()
		}
	}

	function ensureReviewedAt(rowId: string, fallback: string): string {
		const existing = reviewedAtByRowId.get(rowId)
		if (existing) return existing
		reviewedAtByRowId.set(rowId, fallback)
		return fallback
	}

	async function projectDraft(nextDraftRevision: number) {
		const captured = runtime.capture()
		const draftIdentity = repository?.identity
		if (!draftIdentity) {
			throw new Error('Device-local draft storage is unavailable.')
		}
		const updatedAt = nextTimestamp()
		const currentDraftId = draftId ?? randomUUID()
		const createdAt = draftCreatedAt ?? updatedAt
		draftId = currentDraftId
		draftCreatedAt = createdAt
		return await projectTrackEnrichmentDraft({
			id: currentDraftId,
			workspace: {
				workspaceId: draftIdentity.workspaceId,
				repositoryId: draftIdentity.repositoryId,
				repositoryRevision: captured.descriptor.repositoryRevision
			},
			draftRevision: nextDraftRevision,
			createdAt,
			updatedAt,
			sourceLabel:
				workflow.selectedFileName.value ?? workflow.sourceLabel.value,
			rows: workflow.rows.value.map((row) => ({
				row,
				staged: workflow.stagedRowIds.value.has(row.id),
				reviewedAt: ensureReviewedAt(row.id, createdAt)
			})),
			partialOutcomes,
			ui: {
				filter: normalizePersistedFilter(workflow.selectedFilter.value),
				sortKey: sortKey.value,
				sortDirection: sortDirection.value,
				density: density.value,
				anchorSourceIndex: null
			}
		})
	}

	async function persistDirtyDraftMutation() {
		const currentRepository = repository
		const generation = lifecycleGeneration
		if (workflow.rows.value.length === 0 || !hasUnsavedChanges.value) {
			return
		}
		if (isDraftMissingConflict.value) {
			saveState.value = 'failed'
			saveErrorCode.value = 'conflict'
			return
		}
		if (!currentRepository) {
			if (discoveryState.value === 'failed') saveState.value = 'failed'
			return
		}
		const captured = runtime.capture()
		const isCurrentOperation = () =>
			generation === lifecycleGeneration &&
			currentRepository === repository &&
			runtime.isCurrent(captured.context) &&
			repositoryRuntimeIdentity?.workspaceId === captured.context.workspaceId &&
			repositoryRuntimeIdentity.repositoryId === captured.context.repositoryId
		if (!isCurrentOperation()) return
		if (activeEntry.value && !ownership.lease && !replacementTarget) {
			workflow.setReviewReadOnly(true)
			return
		}
		saveState.value = 'saving'
		saveErrorCode.value = null
		const savingDirtyRevision = dirtyRevision
		try {
			const currentRevision = persistedDraft?.draftRevision ?? null
			const nextRevision = replacementTarget
				? 0
				: currentRevision === null
					? 0
					: currentRevision + 1
			const payload = await projectDraft(nextRevision)
			if (!isCurrentOperation()) return
			if (
				persistedDraft &&
				!replacementTarget &&
				payloadSignature(persistedDraft.payload) === payloadSignature(payload)
			) {
				persistedDirtyRevision = Math.max(
					persistedDirtyRevision,
					savingDirtyRevision
				)
				const isStable = dirtyRevision === savingDirtyRevision
				hasUnsavedChanges.value = !isStable
				saveState.value = isStable ? 'saved' : 'saving'
				return
			}
			const draft: BrowserWorkflowDraft = {
				id: payload.id,
				kind: 'track-enrichment',
				draftRevision: payload.draftRevision,
				updatedAt: payload.updatedAt,
				payload
			}
			let claimed: BrowserClaimedDraft
			if (replacementTarget) {
				const result = await currentRepository.replaceDraftAndClaim(
					draft,
					ownerToken,
					{
						deviceRevision,
						draftId: replacementTarget.draftId,
						draftRevision: replacementTarget.draftRevision,
						observedLeaseRevision: replacementTarget.observedLeaseRevision
					}
				)
				if (!isCurrentOperation()) return
				deviceRevision = result.deviceRevision
				claimed = result.value
				replacementTarget = null
			} else if (!persistedDraft) {
				const result = await currentRepository.createDraftAndClaim(
					draft,
					ownerToken,
					{ deviceRevision, draftRevision: null }
				)
				if (!isCurrentOperation()) return
				deviceRevision = result.deviceRevision
				claimed = result.value
			} else {
				if (!ownership.lease) throw new Error('Draft lease is not owned.')
				const result = await currentRepository.writeDraft(draft, ownerToken, {
					deviceRevision,
					draftRevision: persistedDraft.draftRevision,
					leaseRevision: ownership.lease.leaseRevision
				})
				if (!isCurrentOperation()) return
				deviceRevision = result.deviceRevision
				claimed = { draft: result.value, lease: ownership.lease }
			}
			if (!isCurrentOperation()) return
			setClaimed(claimed)
			activeEntry.value = {
				draft: {
					status: 'ready',
					metadata: {
						id: claimed.draft.id,
						kind: claimed.draft.kind,
						draftRevision: claimed.draft.draftRevision,
						updatedAt: claimed.draft.updatedAt
					},
					draft: claimed.draft
				},
				lease: { status: 'live', lease: claimed.lease }
			}
			discoveryState.value = 'ready'
			lastSavedAt.value = claimed.draft.updatedAt
			persistedDirtyRevision = Math.max(
				persistedDirtyRevision,
				savingDirtyRevision
			)
			const isStable = dirtyRevision === savingDirtyRevision
			hasUnsavedChanges.value = !isStable
			saveState.value = isStable ? 'saved' : 'saving'
		} catch (error) {
			if (!isCurrentOperation()) return
			hasUnsavedChanges.value = true
			saveState.value = 'failed'
			saveErrorCode.value = errorCode(error)
			if (isConflict(error)) {
				resetOwnership()
				void refreshDiscovery(generation)
			}
		}
	}

	async function persistDirtyDraft() {
		await runSerializedMutation(persistDirtyDraftMutation)
	}

	async function flushSave() {
		clearSaveTimer()
		while (hasUnsavedChanges.value) {
			const persistedBeforeSave = persistedDirtyRevision
			if (savePromise) {
				await savePromise
			} else {
				const created = persistDirtyDraft().finally(() => {
					if (savePromise === created) savePromise = null
				})
				savePromise = created
				await created
			}
			if (
				!hasUnsavedChanges.value ||
				saveState.value === 'failed' ||
				persistedDirtyRevision === persistedBeforeSave
			) {
				return
			}
		}
	}

	function scheduleSave() {
		if (
			suppressAutosave ||
			isDraftMissingConflict.value ||
			workflow.rows.value.length === 0 ||
			(activeEntry.value && !ownership.lease && !replacementTarget)
		) {
			return
		}
		dirtyRevision += 1
		hasUnsavedChanges.value = true
		saveState.value = discoveryState.value === 'failed' ? 'failed' : 'saving'
		if (!repository && discoveryState.value === 'failed') return
		clearSaveTimer()
		saveTimer = scheduleTimeout(() => {
			saveTimer = null
			void flushSave()
		}, autosaveDelayMs)
	}

	async function hydrateReadyDraftEntry(
		entry: BrowserWorkflowDraftEntry,
		isCurrentOperation: () => boolean
	): Promise<boolean> {
		if (entry.draft.status !== 'ready') return false
		const storedDraft = entry.draft.draft
		const expectedDraftId = storedDraft.id
		const expectedDraftRevision = storedDraft.draftRevision
		const isExactDraftCurrent = () =>
			isCurrentOperation() &&
			activeEntry.value?.draft.metadata.id === expectedDraftId &&
			activeEntry.value.draft.metadata.draftRevision === expectedDraftRevision
		const hydration = await hydrateDraft({
			draft: storedDraft.payload,
			tracks: tracks.tracks,
			records: records.records
		})
		if (!isExactDraftCurrent()) return false
		if (hydration.status !== 'ready') {
			recoveryMessage.value =
				hydration.status === 'reimport'
					? 'Re-import the source file to use this draft safely.'
					: 'Reconnect the source folder to use this draft safely.'
			return false
		}
		suppressAutosave = true
		workflow.loadResumedReview({
			fileLabel: storedDraft.payload.source.label,
			rows: hydration.rows,
			stagedRowIds: hydration.stagedRowIds,
			changedRowIds: hydration.changedRowIds,
			doneRowIds: hydration.doneRowIds,
			selectedFilter: hydration.ui.filter,
			resumeSummary: hydration.summary,
			requiresReconnect: storedDraft.payload.source.requiresReconnect
		})
		// loadResumedReview resets its normal editable state. Keep the exact
		// claimed revision locked until hydration has fully committed here.
		workflow.setReviewReadOnly(true)
		await nextTick()
		if (!isExactDraftCurrent()) {
			if (isCurrentOperation()) {
				suppressAutosave = false
				workflow.setReviewReadOnly(true)
			}
			return false
		}
		suppressAutosave = false
		const ownsCurrentLease =
			ownership.draftId === expectedDraftId &&
			ownership.lease !== null &&
			activeEntry.value?.lease.status === 'live' &&
			activeEntry.value.lease.lease.leaseRevision ===
				ownership.lease.leaseRevision
		workflow.setReviewReadOnly(!ownsCurrentLease)
		replacementTarget = null
		sessionRevision.value += 1
		persistedDraft = storedDraft
		partialOutcomes = storedDraft.payload.partialOutcomes.map((outcome) =>
			structuredClone(outcome)
		)
		dirtyRevision = 0
		persistedDirtyRevision = 0
		hasUnsavedChanges.value = false
		reviewedAtByRowId.clear()
		for (const [index, hydratedDecision] of hydration.decisions.entries()) {
			const storedDecision = storedDraft.payload.decisions[index]
			if (
				hydratedDecision.rowId &&
				storedDecision &&
				typeof storedDecision.reviewedAt === 'string'
			) {
				reviewedAtByRowId.set(hydratedDecision.rowId, storedDecision.reviewedAt)
			}
		}
		saveState.value = 'saved'
		lastSavedAt.value = entry.draft.metadata.updatedAt
		return true
	}

	async function resume() {
		if (destructiveTransitionActive || isDraftMissingConflict.value)
			return false
		const currentRepository = repository
		const initialEntry = activeEntry.value
		const generation = lifecycleGeneration
		const isCurrentOperation = beginSessionOperation()
		if (
			!currentRepository ||
			!initialEntry ||
			initialEntry.draft.status !== 'ready' ||
			!isCurrentOperation()
		) {
			return false
		}
		isHydrating.value = true
		workflow.setReviewReadOnly(true)
		recoveryMessage.value = null
		try {
			const read = await currentRepository.readDraft(
				initialEntry.draft.metadata.id
			)
			if (
				!isCurrentOperation() ||
				read.deviceRevision < deviceRevision ||
				!read.value ||
				read.value.draft.status !== 'ready'
			) {
				return false
			}
			deviceRevision = read.deviceRevision
			let entry = read.value
			setActiveEntry(entry)
			if (entry.lease.status !== 'live') {
				try {
					const claimed = await ownership.claim(
						entry.draft.metadata.id,
						isCurrentOperation
					)
					if (!claimed || !isCurrentOperation()) return false
					entry = {
						draft: claimed.draft,
						lease: { status: 'live', lease: claimed.lease }
					}
					if (entry.draft.status !== 'ready') return false
					ownership.startRenewing()
				} catch (error) {
					if (!isCurrentOperation()) return false
					if (!isConflict(error)) throw error
					await refreshDiscovery(generation)
					if (!isCurrentOperation()) return false
					const refreshed = activeEntry.value
					if (!refreshed || refreshed.draft.status !== 'ready') return false
					entry = refreshed
				}
			}
			setActiveEntry(entry)
			return await hydrateReadyDraftEntry(entry, isCurrentOperation)
		} catch (error) {
			if (!isCurrentOperation()) return false
			suppressAutosave = false
			recoveryMessage.value = 'The saved review could not be resumed safely.'
			saveErrorCode.value = errorCode(error)
			return false
		} finally {
			if (isCurrentOperation()) isHydrating.value = false
		}
	}

	async function takeOver() {
		if (destructiveTransitionActive || isDraftMissingConflict.value)
			return false
		const currentRepository = repository
		const entry = activeEntry.value
		const generation = lifecycleGeneration
		const isCurrentOperation = beginSessionOperation()
		if (!currentRepository || !entry || !isCurrentOperation()) return false
		const leaseRevision = observedLeaseRevision(entry)
		if (leaseRevision === null) return await resume()
		isTakingOver.value = true
		workflow.setReviewReadOnly(true)
		try {
			const claimed = await ownership.takeOver(
				entry.draft.metadata.id,
				leaseRevision,
				isCurrentOperation
			)
			if (!claimed || !isCurrentOperation()) return false
			if (claimed.draft.status === 'ready') {
				persistedDraft = claimed.draft.draft
			}
			const claimedEntry: BrowserWorkflowDraftEntry = {
				draft: claimed.draft,
				lease: { status: 'live', lease: claimed.lease }
			}
			setActiveEntry(claimedEntry)
			ownership.startRenewing()
			const hydrated = await hydrateReadyDraftEntry(
				claimedEntry,
				isCurrentOperation
			)
			return hydrated && isOwned.value
		} catch (error) {
			if (!isCurrentOperation()) return false
			saveErrorCode.value = errorCode(error)
			await refreshDiscovery(generation)
			return false
		} finally {
			if (isCurrentOperation()) isTakingOver.value = false
		}
	}

	async function ensureOwnedForDestructiveAction(
		isCurrentOperation: () => boolean
	) {
		try {
			return await ownership.ensureOwned(
				() => activeEntry.value,
				isCurrentOperation,
				(entry) => {
					activeEntry.value = entry
				}
			)
		} catch {
			if (!isCurrentOperation()) return false
			await refreshDiscovery()
			return false
		}
	}

	async function deleteDraftForOperation(isCurrentOperation: () => boolean) {
		if (!repository || !activeEntry.value || !isCurrentOperation()) return false
		const previousAutosaveSuppression = suppressAutosave
		suppressAutosave = true
		clearSaveTimer()
		if (!(await ensureOwnedForDestructiveAction(isCurrentOperation))) {
			if (isCurrentOperation()) {
				suppressAutosave = previousAutosaveSuppression
			}
			return false
		}
		if (!isCurrentOperation()) return false
		const deletingDraftId = activeEntry.value?.draft.metadata.id ?? null
		if (!deletingDraftId) return false
		locallyDeletingDraftId = deletingDraftId
		try {
			const result = await runSerializedMutation(async () => {
				const currentRepository = repository
				const entry = activeEntry.value
				const lease = ownership.lease
				if (
					!currentRepository ||
					!entry ||
					entry.draft.metadata.id !== deletingDraftId ||
					!lease ||
					!isCurrentOperation()
				) {
					return null
				}
				return await currentRepository.deleteDraft(
					deletingDraftId,
					ownerToken,
					{
						deviceRevision,
						draftRevision: entry.draft.metadata.draftRevision,
						leaseRevision: lease.leaseRevision
					}
				)
			})
			if (!result || !isCurrentOperation()) {
				if (isCurrentOperation()) {
					suppressAutosave = previousAutosaveSuppression
				}
				return false
			}
			deviceRevision = result.deviceRevision
			replacementTarget = null
			persistedDirtyRevision = dirtyRevision
			hasUnsavedChanges.value = false
			saveState.value = 'idle'
			setActiveEntry(null)
			workflow.startAnotherSource()
			await nextTick()
			if (!isCurrentOperation()) return false
			suppressAutosave = false
			return true
		} catch (error) {
			if (!isCurrentOperation()) return false
			suppressAutosave = previousAutosaveSuppression
			saveErrorCode.value = errorCode(error)
			if (locallyDeletingDraftId === deletingDraftId) {
				locallyDeletingDraftId = null
			}
			await refreshDiscovery()
			return false
		} finally {
			if (locallyDeletingDraftId === deletingDraftId) {
				locallyDeletingDraftId = null
			}
		}
	}

	async function deleteDraft() {
		const transition = beginDestructiveTransition()
		if (!transition) return false
		try {
			return await deleteDraftForOperation(transition.isCurrentOperation)
		} finally {
			transition.finish()
		}
	}

	async function startFresh() {
		const transition = beginDestructiveTransition()
		if (!transition) return false
		const { isCurrentOperation } = transition
		try {
			if (!isCurrentOperation()) return false
			if (isDraftMissingConflict.value) {
				suppressAutosave = true
				clearSaveTimer()
				isDraftMissingConflict.value = false
				replacementTarget = null
				persistedDraft = null
				draftId = null
				draftCreatedAt = null
				partialOutcomes = []
				dirtyRevision = 0
				persistedDirtyRevision = 0
				reviewedAtByRowId.clear()
				hasUnsavedChanges.value = false
				saveState.value = 'idle'
				saveErrorCode.value = null
				recoveryMessage.value = null
				workflow.startAnotherSource()
				await nextTick()
				if (!isCurrentOperation()) return false
				suppressAutosave = false
				workflow.setReviewReadOnly(false)
				await refreshDiscovery()
				return isCurrentOperation()
			}
			await flushSave()
			if (!isCurrentOperation()) return false
			if (
				hasUnsavedChanges.value ||
				saveState.value === 'saving' ||
				saveState.value === 'failed'
			) {
				return false
			}
			const entry = activeEntry.value
			if (!entry) {
				workflow.startAnotherSource()
				return true
			}
			if (!(await ensureOwnedForDestructiveAction(isCurrentOperation)))
				return false
			if (!isCurrentOperation()) return false
			const currentEntry = activeEntry.value
			if (!currentEntry) return false
			replacementTarget = {
				draftId: currentEntry.draft.metadata.id,
				draftRevision: currentEntry.draft.metadata.draftRevision,
				observedLeaseRevision:
					ownership.lease?.leaseRevision ?? observedLeaseRevision(currentEntry)
			}
			sessionRevision.value += 1
			persistedDraft = null
			draftId = null
			draftCreatedAt = null
			partialOutcomes = []
			dirtyRevision = 0
			persistedDirtyRevision = 0
			reviewedAtByRowId.clear()
			hasUnsavedChanges.value = false
			saveState.value = 'saved'
			suppressAutosave = true
			workflow.startAnotherSource()
			await nextTick()
			if (!isCurrentOperation()) return false
			suppressAutosave = false
			workflow.setReviewReadOnly(false)
			return true
		} finally {
			transition.finish()
		}
	}

	async function keepForLater() {
		const transition = beginDestructiveTransition()
		if (!transition) return false
		const { isCurrentOperation } = transition
		try {
			if (!isCurrentOperation()) return false
			await flushSave()
			if (!isCurrentOperation()) return false
			if (
				hasUnsavedChanges.value ||
				saveState.value === 'saving' ||
				saveState.value === 'failed'
			) {
				return false
			}
			try {
				if (!(await ownership.release(isCurrentOperation))) return false
			} catch {
				return false
			}
			if (!isCurrentOperation()) return false
			resetOwnership()
			suppressAutosave = true
			workflow.startAnotherSource()
			await nextTick()
			if (!isCurrentOperation()) return false
			suppressAutosave = false
			await refreshDiscovery()
			if (!isCurrentOperation()) return false
			return true
		} finally {
			transition.finish()
		}
	}

	async function acknowledgeCompleteAndDelete() {
		const transition = beginDestructiveTransition()
		if (!transition) return false
		const { isCurrentOperation } = transition
		try {
			if (!isCurrentOperation()) return false
			const summary = workflow.lastApplySummary.value
			if (
				!summary ||
				summary.total <= 0 ||
				summary.failed !== 0 ||
				summary.remaining !== 0 ||
				summary.succeeded !== summary.total ||
				workflow.stagedRowIds.value.size !== 0
			) {
				return false
			}
			await flushSave()
			if (!isCurrentOperation()) return false
			if (saveState.value === 'failed') return false
			if (!(await deleteDraftForOperation(isCurrentOperation))) return false
			return true
		} finally {
			transition.finish()
		}
	}

	async function recordApplyAttempt(attempt: TrackEnrichmentApplyAttempt) {
		if (destructiveTransitionActive || isDraftMissingConflict.value) return
		const isCurrentOperation = beginSessionOperation()
		if (!isCurrentOperation()) return
		try {
			await flushSave()
			if (!isCurrentOperation()) return
			let base = persistedDraft?.payload ?? null
			if (!base && workflow.rows.value.length > 0) {
				base = await projectDraft(0)
				if (!isCurrentOperation()) return
			}
			if (!base) return
			const observationByOrdinal = new Map(
				base.observations.map((observation) => [
					observation.ordinal,
					observation
				])
			)
			const bindings = attempt.rows.flatMap(
				({ row, intentKind, requested }) => {
					const observation = observationByOrdinal.get(row.source.index)
					return observation && row.track
						? [
								{
									intentKind,
									sourceFingerprint: observation.sourceFingerprint,
									targetTrackId: row.track.id,
									requested
								}
							]
						: []
				}
			)
			if (bindings.length !== attempt.rows.length) {
				throw new Error('Draft outcome bindings no longer match the review.')
			}
			const mapped = mapTrackEnrichmentDraftBatchOutcome({
				bindings,
				outcome: attempt.outcome,
				attemptedAt: attempt.attemptedAt
			})
			const byBinding = new Map(
				partialOutcomes.map((outcome) => [
					`${outcome.sourceFingerprint}\n${outcome.targetTrackId}`,
					outcome
				])
			)
			for (const outcome of mapped) {
				byBinding.set(
					`${outcome.sourceFingerprint}\n${outcome.targetTrackId}`,
					outcome
				)
			}
			partialOutcomes = [...byBinding.values()]
			dirtyRevision += 1
			hasUnsavedChanges.value = true
			saveState.value = 'saving'
			await flushSave()
		} catch (error) {
			if (!isCurrentOperation()) return
			if (!hasUnsavedChanges.value) dirtyRevision += 1
			hasUnsavedChanges.value = true
			saveState.value = 'failed'
			saveErrorCode.value = errorCode(error)
		}
	}

	watch(
		() => [
			workflow.rows.value,
			[...workflow.stagedRowIds.value].sort().join('\n'),
			workflow.selectedFilter.value,
			density.value,
			sortKey.value,
			sortDirection.value
		],
		() => scheduleSave(),
		{ flush: 'sync' }
	)

	watch(
		() => [runtime.descriptor.value.id, runtime.descriptor.value.repositoryId],
		([workspaceId, repositoryId], previous) => {
			if (!previous) return
			if (workspaceId === previous[0] && repositoryId === previous[1]) return
			suppressAutosave = true
			workflow.startAnotherSource()
			void nextTick().then(() => {
				suppressAutosave = false
				return initialize()
			})
		}
	)

	onScopeDispose(() => {
		clearSaveTimer()
		ownership.stopRenewing()
		void flushSave().finally(() => {
			lifecycleGeneration += 1
			return releaseAndCloseRepository()
		})
	})

	return {
		discoveryState,
		saveState,
		saveErrorCode,
		activeEntry,
		hasDraft,
		draftDetails,
		isHydrating,
		isTakingOver,
		isTransitioning,
		isDraftMissingConflict,
		isOwned,
		isReadOnly,
		isSourceBlockedByDraft,
		lastSavedAt,
		savedTimeLabel,
		savedAtAccessibleLabel,
		saveStatusLabel,
		hasUnsavedChanges,
		shouldWarnBeforeUnload,
		recoveryMessage,
		initialize,
		refreshDiscovery,
		flushSave,
		resume,
		takeOver,
		deleteDraft,
		startFresh,
		keepForLater,
		acknowledgeCompleteAndDelete,
		recordApplyAttempt
	}
}
