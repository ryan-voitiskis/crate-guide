import { type Ref, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import type {
	RepositoryConflictReason,
	RepositoryUnavailableReason,
	WorkspaceOperationContext
} from '~/repositories/library/contracts'
import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { reportDecodeIssues } from '~/utils/supabaseRows'
import type { WorkbenchRuntime } from '~/utils/workbenchPinia'
import type {
	LibraryPlayedTrackEntry,
	LibrarySavedSet
} from '~~/shared/types/library'

type WorkspacePersistenceContext = WorkspaceOperationContext & {
	generation: number
}

interface SavedSetMutationProvenance extends WorkspacePersistenceContext {
	revision: number
}

type PlayedTrackSnapshot = readonly Readonly<LibraryPlayedTrackEntry>[]

interface SessionWriteRequestBase {
	readonly context: WorkspacePersistenceContext
	readonly generation: number
	readonly playedTracks: PlayedTrackSnapshot
}

interface AutoSaveRequest extends SessionWriteRequestBase {
	readonly kind: 'auto'
}

interface ManualSaveRequest extends SessionWriteRequestBase {
	readonly kind: 'manual'
	readonly name: string | null
	readonly resolve: (savedSet: LibrarySavedSet | null) => void
}

type SessionWriteRequest = AutoSaveRequest | ManualSaveRequest

interface SessionSavedSetsDependencies {
	runtime: WorkbenchRuntime
	currentSession: Readonly<Ref<LibraryPlayedTrackEntry[]>>
}

export function createSessionSavedSets({
	runtime,
	currentSession
}: SessionSavedSetsDependencies) {
	const savedSets = ref<LibrarySavedSet[]>([])
	const activeSetId = ref<string | null>(null)
	const isLoadingSets = ref(false)
	const isSavingSession = ref(false)
	const isAutoSaving = ref(false)
	const autoSaveError = ref<string | null>(null)
	const autoSaveTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
	const showSetManager = ref(false)
	const showSaveDialog = ref(false)
	const selectedSetId = ref<string | null>(null)

	let persistenceGeneration = 0
	let sessionWriteGeneration = 0
	let activeSessionWrite: SessionWriteRequest | null = null
	const pendingSessionWrites: SessionWriteRequest[] = []
	let savedSetsFetchPromise: Promise<void> | null = null
	let savedSetsFetchContext: WorkspacePersistenceContext | null = null
	let savedSetMutationRevision = 0
	const savedSetSaveProvenance = new Map<string, SavedSetMutationProvenance>()
	const savedSetDeleteTombstones = new Map<string, SavedSetMutationProvenance>()

	function captureWorkspaceContext(): WorkspacePersistenceContext | null {
		const captured = runtime.capture()
		return captured.descriptor.capabilities.canPersistSessions &&
			!captured.descriptor.readOnly
			? { ...captured.context, generation: persistenceGeneration }
			: null
	}

	function isCurrentWorkspaceContext(
		context: WorkspacePersistenceContext
	): boolean {
		return (
			context.generation === persistenceGeneration && runtime.isCurrent(context)
		)
	}

	function repositoriesFor(context: WorkspacePersistenceContext) {
		if (!isCurrentWorkspaceContext(context)) return null
		const captured = runtime.capture()
		return runtime.isCurrent(context) ? captured.repositories : null
	}

	function nextSavedSetMutationRevision(): number {
		savedSetMutationRevision += 1
		return savedSetMutationRevision
	}

	function isSameWorkspaceContext(
		left: WorkspacePersistenceContext,
		right: WorkspacePersistenceContext
	): boolean {
		if (
			left.generation !== right.generation ||
			left.workspaceId !== right.workspaceId ||
			left.repositoryId !== right.repositoryId ||
			left.activationGeneration !== right.activationGeneration
		)
			return false
		return true
	}

	function outcomeError(
		outcome:
			| { status: 'conflict'; reason: RepositoryConflictReason }
			| {
					status: 'unavailable'
					reason: RepositoryUnavailableReason
					error?: unknown
			  }
	): Error | unknown {
		return outcome.status === 'unavailable'
			? (outcome.error ?? new Error(outcome.reason))
			: new Error(outcome.reason)
	}

	function acceptRepositoryRevision(
		context: WorkspacePersistenceContext,
		repositoryRevision: number
	): boolean {
		return (
			isCurrentWorkspaceContext(context) &&
			runtime.acceptRepositoryRevision(context, repositoryRevision)
		)
	}

	function publishSavedSet(
		savedSet: LibrarySavedSet,
		context: WorkspacePersistenceContext
	) {
		const otherSets = savedSets.value.filter(
			(existingSet) => existingSet.id !== savedSet.id
		)
		savedSets.value = sortCreatedAtDescIdDesc([...otherSets, savedSet])
		savedSetSaveProvenance.set(savedSet.id, {
			...context,
			revision: nextSavedSetMutationRevision()
		})
		savedSetDeleteTombstones.delete(savedSet.id)
	}

	function captureSessionSnapshot(): PlayedTrackSnapshot {
		return currentSession.value.map((entry) => ({ ...entry }))
	}

	function isCurrentSessionWrite(request: SessionWriteRequest): boolean {
		return (
			request.generation === sessionWriteGeneration &&
			isCurrentWorkspaceContext(request.context)
		)
	}

	function updateSessionWriteFlags() {
		isAutoSaving.value =
			activeSessionWrite?.kind === 'auto' &&
			isCurrentSessionWrite(activeSessionWrite)
		isSavingSession.value =
			(activeSessionWrite?.kind === 'manual' &&
				isCurrentSessionWrite(activeSessionWrite)) ||
			pendingSessionWrites.some(
				(request) => request.kind === 'manual' && isCurrentSessionWrite(request)
			)
	}

	function invalidateSessionWrites() {
		sessionWriteGeneration += 1
		if (autoSaveTimeout.value) {
			clearTimeout(autoSaveTimeout.value)
			autoSaveTimeout.value = null
		}

		const discardedRequests = pendingSessionWrites.splice(0)
		for (const request of discardedRequests) {
			if (request.kind === 'manual') request.resolve(null)
		}
		updateSessionWriteFlags()
	}

	function cloneSnapshotForWrite(
		playedTracks: PlayedTrackSnapshot
	): LibraryPlayedTrackEntry[] {
		return playedTracks.map((entry) => ({ ...entry }))
	}

	async function executeAutoSave(request: AutoSaveRequest) {
		if (!isCurrentSessionWrite(request) || request.playedTracks.length === 0)
			return

		const playedTracks = cloneSnapshotForWrite(request.playedTracks)
		try {
			const setId = activeSetId.value
			const repositories = repositoriesFor(request.context)
			if (!repositories) return
			const outcome = await repositories.savedSets.save(request.context, {
				setId,
				kind: 'auto',
				name: null,
				playedTracks
			})
			if (!isCurrentSessionWrite(request) || outcome.status === 'stale') return
			if (outcome.status !== 'success') throw outcomeError(outcome)
			if (
				!acceptRepositoryRevision(request.context, outcome.repositoryRevision)
			)
				return
			const savedSet = outcome.value
			if (!savedSet.id || (setId !== null && savedSet.id !== setId)) {
				throw new Error('Saved set auto-save integrity validation failed')
			}
			reportDecodeIssues(outcome.issues, (message) => toast.warning(message))
			if (setId === null) activeSetId.value = savedSet.id
			publishSavedSet(savedSet, request.context)
			autoSaveError.value = null
		} catch (error) {
			if (!isCurrentSessionWrite(request)) return
			console.error('Auto-save failed:', error)
			autoSaveError.value =
				'Auto-save failed. Your current session is not saved yet.'
			toast.error(autoSaveError.value)
		}
	}

	async function executeManualSave(
		request: ManualSaveRequest
	): Promise<LibrarySavedSet | null> {
		if (!isCurrentSessionWrite(request) || request.playedTracks.length === 0)
			return null

		const playedTracks = cloneSnapshotForWrite(request.playedTracks)
		try {
			const setId = activeSetId.value
			const repositories = repositoriesFor(request.context)
			if (!repositories) return null
			const outcome = await repositories.savedSets.save(request.context, {
				setId,
				kind: 'manual',
				name: request.name,
				playedTracks
			})
			if (!isCurrentSessionWrite(request) || outcome.status === 'stale') {
				return null
			}
			if (outcome.status !== 'success') throw outcomeError(outcome)
			if (
				!acceptRepositoryRevision(request.context, outcome.repositoryRevision)
			)
				return null
			const savedSet = outcome.value
			if (!savedSet.id || (setId !== null && savedSet.id !== setId)) {
				throw new Error('Saved set save integrity validation failed')
			}
			reportDecodeIssues(outcome.issues, (message) => toast.warning(message))
			if (setId === null) activeSetId.value = savedSet.id
			publishSavedSet(savedSet, request.context)

			toast.success('Session saved')
			showSaveDialog.value = false
			autoSaveError.value = null
			return savedSet
		} catch (error) {
			if (!isCurrentSessionWrite(request)) return null
			console.error('Failed to save session:', error)
			toast.error('Failed to save session')
			return null
		}
	}

	async function drainSessionWrites() {
		if (activeSessionWrite) return
		const request = pendingSessionWrites.shift()
		if (!request) return

		activeSessionWrite = request
		updateSessionWriteFlags()
		let manualResult: LibrarySavedSet | null = null
		try {
			if (request.kind === 'auto') {
				await executeAutoSave(request)
			} else {
				manualResult = await executeManualSave(request)
			}
		} finally {
			if (request.kind === 'manual') request.resolve(manualResult)
			const shouldUpdateFlags = isCurrentSessionWrite(request)
			activeSessionWrite = null
			if (shouldUpdateFlags) updateSessionWriteFlags()
			if (pendingSessionWrites.length > 0) void drainSessionWrites()
		}
	}

	function enqueueAutoSave(request: AutoSaveRequest) {
		const pendingAutoSaveIndex = pendingSessionWrites.findIndex(
			(pendingRequest) => pendingRequest.kind === 'auto'
		)
		if (pendingAutoSaveIndex !== -1) {
			pendingSessionWrites.splice(pendingAutoSaveIndex, 1)
		}
		pendingSessionWrites.push(request)
		updateSessionWriteFlags()
		void drainSessionWrites()
	}

	function enqueueManualSave(
		request: Omit<ManualSaveRequest, 'resolve'>
	): Promise<LibrarySavedSet | null> {
		return new Promise((resolve) => {
			pendingSessionWrites.push({ ...request, resolve })
			updateSessionWriteFlags()
			void drainSessionWrites()
		})
	}

	function scheduleAutoSave() {
		const context = captureWorkspaceContext()
		if (!context || currentSession.value.length === 0) return
		const generation = sessionWriteGeneration

		if (autoSaveTimeout.value) clearTimeout(autoSaveTimeout.value)
		autoSaveTimeout.value = setTimeout(() => {
			autoSaveTimeout.value = null
			if (
				generation !== sessionWriteGeneration ||
				!isCurrentWorkspaceContext(context) ||
				currentSession.value.length === 0
			)
				return

			enqueueAutoSave({
				context,
				generation,
				kind: 'auto',
				playedTracks: captureSessionSnapshot()
			})
		}, 2000)
	}

	watch(currentSession, scheduleAutoSave, { deep: true })

	async function performFetchSavedSets(context: WorkspacePersistenceContext) {
		isLoadingSets.value = true
		const startingRevision = savedSetMutationRevision
		try {
			const repositories = repositoriesFor(context)
			if (!repositories) return
			const outcome = await repositories.savedSets.list(context)
			if (!isCurrentWorkspaceContext(context) || outcome.status === 'stale') {
				return
			}
			if (outcome.status !== 'success') throw outcomeError(outcome)
			if (!acceptRepositoryRevision(context, outcome.repositoryRevision)) return
			reportDecodeIssues(outcome.issues, (message) => toast.warning(message))
			const fetchedSets = outcome.value
			const rawFetchedIds = new Set(fetchedSets.map((set) => set.id))
			const localSetsById = new Map(
				savedSets.value.map((savedSet) => [savedSet.id, savedSet])
			)
			const reconciledById = new Map<string, LibrarySavedSet>()
			for (const fetchedSet of fetchedSets) {
				const tombstone = savedSetDeleteTombstones.get(fetchedSet.id)
				if (tombstone && isSameWorkspaceContext(tombstone, context)) continue
				const provenance = savedSetSaveProvenance.get(fetchedSet.id)
				const localSet = localSetsById.get(fetchedSet.id)
				if (
					localSet &&
					provenance &&
					isSameWorkspaceContext(provenance, context) &&
					provenance.revision > startingRevision
				) {
					reconciledById.set(fetchedSet.id, localSet)
				} else {
					reconciledById.set(fetchedSet.id, fetchedSet)
				}
			}
			for (const [id, provenance] of savedSetSaveProvenance) {
				if (!isSameWorkspaceContext(provenance, context)) continue
				const localSet = localSetsById.get(id)
				const tombstone = savedSetDeleteTombstones.get(id)
				if (
					localSet &&
					provenance.revision > startingRevision &&
					(!tombstone || !isSameWorkspaceContext(tombstone, context))
				) {
					reconciledById.set(id, localSet)
				} else {
					savedSetSaveProvenance.delete(id)
				}
			}
			for (const [id, tombstone] of savedSetDeleteTombstones) {
				if (
					isSameWorkspaceContext(tombstone, context) &&
					tombstone.revision <= startingRevision &&
					!rawFetchedIds.has(id)
				) {
					savedSetDeleteTombstones.delete(id)
				}
			}
			savedSets.value = sortCreatedAtDescIdDesc([...reconciledById.values()])
		} catch (error) {
			if (!isCurrentWorkspaceContext(context)) return
			console.error(error)
			toast.error('Failed to load saved sets')
		} finally {
			if (isCurrentWorkspaceContext(context)) isLoadingSets.value = false
		}
	}

	function fetchSavedSets(): Promise<void> {
		const context = captureWorkspaceContext()
		if (!context) return Promise.resolve()
		if (
			savedSetsFetchPromise &&
			savedSetsFetchContext &&
			isSameWorkspaceContext(savedSetsFetchContext, context)
		) {
			return savedSetsFetchPromise
		}

		const createdPromise = performFetchSavedSets(context).finally(() => {
			if (savedSetsFetchPromise === createdPromise) {
				savedSetsFetchPromise = null
				savedSetsFetchContext = null
			}
		})
		savedSetsFetchContext = context
		savedSetsFetchPromise = createdPromise
		return createdPromise
	}

	function saveSession(name?: string): Promise<LibrarySavedSet | null> {
		const context = captureWorkspaceContext()
		if (!context || currentSession.value.length === 0) {
			return Promise.resolve(null)
		}

		return enqueueManualSave({
			context,
			generation: sessionWriteGeneration,
			kind: 'manual',
			name: name || null,
			playedTracks: captureSessionSnapshot()
		})
	}

	async function deleteSet(setId: string) {
		const context = captureWorkspaceContext()
		if (!context || !isCurrentWorkspaceContext(context)) return

		try {
			const repositories = repositoriesFor(context)
			if (!repositories) return
			const outcome = await repositories.savedSets.delete(context, {
				id: setId
			})
			if (!isCurrentWorkspaceContext(context) || outcome.status === 'stale') {
				return
			}
			if (outcome.status !== 'success') throw outcomeError(outcome)
			if (!acceptRepositoryRevision(context, outcome.repositoryRevision)) return
			if (outcome.value.id !== setId) {
				throw new Error('Saved set deletion integrity validation failed')
			}
			savedSets.value = savedSets.value.filter(
				(savedSet) => savedSet.id !== setId
			)
			savedSetSaveProvenance.delete(setId)
			savedSetDeleteTombstones.set(setId, {
				...context,
				revision: nextSavedSetMutationRevision()
			})
			if (activeSetId.value === setId) activeSetId.value = null
			if (selectedSetId.value === setId) selectedSetId.value = null
			toast.success('Set deleted')
		} catch (error) {
			if (!isCurrentWorkspaceContext(context)) return
			console.error(error)
			toast.error('Failed to delete set')
		}
	}

	function clearSavedSetTracks() {
		savedSets.value = savedSets.value.map((savedSet) => ({
			...savedSet,
			played_tracks: []
		}))
	}

	function clearSessionPersistence(clearPlayback: () => void) {
		invalidateSessionWrites()
		clearPlayback()
		activeSetId.value = null
		autoSaveError.value = null
	}

	function resetAccountPersistence(resetPlayback: () => void) {
		persistenceGeneration += 1
		invalidateSessionWrites()
		savedSetsFetchPromise = null
		savedSetsFetchContext = null
		savedSetSaveProvenance.clear()
		savedSetDeleteTombstones.clear()

		resetPlayback()
		savedSets.value = []
		activeSetId.value = null
		selectedSetId.value = null
		showSetManager.value = false
		showSaveDialog.value = false
		isLoadingSets.value = false
		isSavingSession.value = false
		isAutoSaving.value = false
		autoSaveError.value = null
	}

	return {
		savedSets,
		activeSetId,
		isLoadingSets,
		isSavingSession,
		isAutoSaving,
		autoSaveError,
		showSetManager,
		showSaveDialog,
		selectedSetId,
		fetchSavedSets,
		saveSession,
		deleteSet,
		clearSavedSetTracks,
		clearSessionPersistence,
		resetAccountPersistence
	}
}
