import { type Ref, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import { decodeSavedSetRow, reportDecodeIssues } from '~/utils/supabaseRows'
import type { Database } from '~~/shared/types/database'
import type { PlayedTrackEntry, SavedSet } from '~~/shared/types/supabase'

interface AccountOperationContext {
	generation: number
	userId: string
}

interface SavedSetMutationProvenance extends AccountOperationContext {
	revision: number
}

type PlayedTrackSnapshot = readonly Readonly<PlayedTrackEntry>[]

interface SessionWriteRequestBase {
	readonly context: AccountOperationContext
	readonly generation: number
	readonly playedTracks: PlayedTrackSnapshot
}

interface AutoSaveRequest extends SessionWriteRequestBase {
	readonly kind: 'auto'
}

interface ManualSaveRequest extends SessionWriteRequestBase {
	readonly kind: 'manual'
	readonly name: string | null
	readonly resolve: (savedSet: SavedSet | null) => void
}

type SessionWriteRequest = AutoSaveRequest | ManualSaveRequest

interface SessionSavedSetsDependencies {
	supabase: SupabaseClient<Database>
	isDemoStore: boolean
	currentSession: Readonly<Ref<PlayedTrackEntry[]>>
	getUserId(): string | null
}

export function createSessionSavedSets({
	supabase,
	isDemoStore,
	currentSession,
	getUserId
}: SessionSavedSetsDependencies) {
	const savedSets = ref<SavedSet[]>([])
	const activeSetId = ref<string | null>(null)
	const isLoadingSets = ref(false)
	const isSavingSession = ref(false)
	const isAutoSaving = ref(false)
	const autoSaveError = ref<string | null>(null)
	const autoSaveTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
	const showSetManager = ref(false)
	const showSaveDialog = ref(false)
	const selectedSetId = ref<string | null>(null)

	let accountGeneration = 0
	let sessionWriteGeneration = 0
	let activeSessionWrite: SessionWriteRequest | null = null
	const pendingSessionWrites: SessionWriteRequest[] = []
	let savedSetsFetchPromise: Promise<void> | null = null
	let savedSetsFetchContext: AccountOperationContext | null = null
	let savedSetMutationRevision = 0
	const savedSetSaveProvenance = new Map<string, SavedSetMutationProvenance>()
	const savedSetDeleteTombstones = new Map<string, SavedSetMutationProvenance>()

	function captureAccountContext(): AccountOperationContext | null {
		if (isDemoStore) return null
		const userId = getUserId()
		return userId ? { generation: accountGeneration, userId } : null
	}

	function isCurrentAccountContext(context: AccountOperationContext): boolean {
		return (
			context.generation === accountGeneration && getUserId() === context.userId
		)
	}

	function nextSavedSetMutationRevision(): number {
		savedSetMutationRevision += 1
		return savedSetMutationRevision
	}

	function isSameAccountContext(
		left: AccountOperationContext,
		right: AccountOperationContext
	): boolean {
		return left.generation === right.generation && left.userId === right.userId
	}

	function decodeOwnedSavedSetResponse(
		data: unknown,
		context: AccountOperationContext
	) {
		if (
			!data ||
			typeof data !== 'object' ||
			Array.isArray(data) ||
			(data as { user_id?: unknown }).user_id !== context.userId
		) {
			throw new Error('Saved set ownership validation failed')
		}
		return decodeSavedSetRow(
			data as Database['public']['Tables']['sets']['Row']
		)
	}

	function publishSavedSet(
		savedSet: SavedSet,
		context: AccountOperationContext
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
			isCurrentAccountContext(request.context)
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
	): PlayedTrackEntry[] {
		return playedTracks.map((entry) => ({ ...entry }))
	}

	async function executeAutoSave(request: AutoSaveRequest) {
		if (!isCurrentSessionWrite(request) || request.playedTracks.length === 0)
			return

		const playedTracks = cloneSnapshotForWrite(request.playedTracks)
		try {
			let savedSet: SavedSet
			const setId = activeSetId.value
			if (setId) {
				const { data, error } = await supabase
					.from('sets')
					.update({ played_tracks: playedTracks })
					.eq('id', setId)
					.eq('user_id', request.context.userId)
					.select()
					.single()

				if (!isCurrentSessionWrite(request)) return
				if (error) throw error
				const decoded = decodeOwnedSavedSetResponse(data, request.context)
				if (decoded.row.id !== setId) {
					throw new Error('Saved set auto-save ownership validation failed')
				}
				reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
				savedSet = decoded.row
			} else {
				const { data, error } = await supabase
					.from('sets')
					.insert({
						user_id: request.context.userId,
						name: null,
						played_tracks: playedTracks
					})
					.select()
					.single()

				if (!isCurrentSessionWrite(request)) return
				if (error) throw error
				const decoded = decodeOwnedSavedSetResponse(data, request.context)
				if (typeof decoded.row.id !== 'string' || !decoded.row.id) {
					throw new Error('Saved set auto-save ownership validation failed')
				}
				reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
				savedSet = decoded.row
				activeSetId.value = savedSet.id
			}
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
	): Promise<SavedSet | null> {
		if (!isCurrentSessionWrite(request) || request.playedTracks.length === 0)
			return null

		const playedTracks = cloneSnapshotForWrite(request.playedTracks)
		try {
			let savedSet: SavedSet
			const setId = activeSetId.value

			if (setId) {
				const { data, error } = await supabase
					.from('sets')
					.update({ name: request.name, played_tracks: playedTracks })
					.eq('id', setId)
					.eq('user_id', request.context.userId)
					.select()
					.single()

				if (!isCurrentSessionWrite(request)) return null
				if (error) throw error
				const decoded = decodeOwnedSavedSetResponse(data, request.context)
				reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
				savedSet = decoded.row
			} else {
				const { data, error } = await supabase
					.from('sets')
					.insert({
						user_id: request.context.userId,
						name: request.name,
						played_tracks: playedTracks
					})
					.select()
					.single()

				if (!isCurrentSessionWrite(request)) return null
				if (error) throw error
				const decoded = decodeOwnedSavedSetResponse(data, request.context)
				reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
				savedSet = decoded.row
				activeSetId.value = savedSet.id
			}
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
		let manualResult: SavedSet | null = null
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
	): Promise<SavedSet | null> {
		return new Promise((resolve) => {
			pendingSessionWrites.push({ ...request, resolve })
			updateSessionWriteFlags()
			void drainSessionWrites()
		})
	}

	function scheduleAutoSave() {
		const context = captureAccountContext()
		if (!context || currentSession.value.length === 0) return
		const generation = sessionWriteGeneration

		if (autoSaveTimeout.value) clearTimeout(autoSaveTimeout.value)
		autoSaveTimeout.value = setTimeout(() => {
			autoSaveTimeout.value = null
			if (
				generation !== sessionWriteGeneration ||
				!isCurrentAccountContext(context) ||
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

	async function performFetchSavedSets(context: AccountOperationContext) {
		isLoadingSets.value = true
		const startingRevision = savedSetMutationRevision
		try {
			const rows = await fetchAllSupabasePages(async (cursor, pageSize) => {
				let query = supabase
					.from('sets')
					.select('*')
					.eq('user_id', context.userId)
					.order('id', { ascending: false })
				if (cursor !== null) query = query.lt('id', cursor)
				return await query.limit(pageSize)
			})

			if (!isCurrentAccountContext(context)) return
			if (rows.some((row) => row.user_id !== context.userId)) {
				throw new Error('Saved set ownership validation failed')
			}
			const decodedRows = rows.map(decodeSavedSetRow)
			const issues = decodedRows.flatMap((decoded) => decoded.issues)
			reportDecodeIssues(issues, (message) => toast.warning(message))
			const fetchedSets = decodedRows.map((decoded) => decoded.row)
			const rawFetchedIds = new Set(fetchedSets.map((set) => set.id))
			const localSetsById = new Map(
				savedSets.value.map((savedSet) => [savedSet.id, savedSet])
			)
			const reconciledById = new Map<string, SavedSet>()
			for (const fetchedSet of fetchedSets) {
				const tombstone = savedSetDeleteTombstones.get(fetchedSet.id)
				if (tombstone && isSameAccountContext(tombstone, context)) continue
				const provenance = savedSetSaveProvenance.get(fetchedSet.id)
				const localSet = localSetsById.get(fetchedSet.id)
				if (
					localSet &&
					provenance &&
					isSameAccountContext(provenance, context) &&
					provenance.revision > startingRevision
				) {
					reconciledById.set(fetchedSet.id, localSet)
				} else {
					reconciledById.set(fetchedSet.id, fetchedSet)
				}
			}
			for (const [id, provenance] of savedSetSaveProvenance) {
				if (!isSameAccountContext(provenance, context)) continue
				const localSet = localSetsById.get(id)
				const tombstone = savedSetDeleteTombstones.get(id)
				if (
					localSet &&
					provenance.revision > startingRevision &&
					(!tombstone || !isSameAccountContext(tombstone, context))
				) {
					reconciledById.set(id, localSet)
				} else {
					savedSetSaveProvenance.delete(id)
				}
			}
			for (const [id, tombstone] of savedSetDeleteTombstones) {
				if (
					isSameAccountContext(tombstone, context) &&
					tombstone.revision <= startingRevision &&
					!rawFetchedIds.has(id)
				) {
					savedSetDeleteTombstones.delete(id)
				}
			}
			savedSets.value = sortCreatedAtDescIdDesc([...reconciledById.values()])
		} catch (error) {
			if (!isCurrentAccountContext(context)) return
			console.error(error)
			toast.error('Failed to load saved sets')
		} finally {
			if (isCurrentAccountContext(context)) isLoadingSets.value = false
		}
	}

	function fetchSavedSets(): Promise<void> {
		const context = captureAccountContext()
		if (!context) return Promise.resolve()
		if (
			savedSetsFetchPromise &&
			savedSetsFetchContext &&
			isSameAccountContext(savedSetsFetchContext, context)
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

	function saveSession(name?: string): Promise<SavedSet | null> {
		const context = captureAccountContext()
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
		const context = captureAccountContext()
		if (!context || !isCurrentAccountContext(context)) return

		try {
			const { data, error } = await supabase
				.from('sets')
				.delete()
				.eq('id', setId)
				.eq('user_id', context.userId)
				.select('id, user_id')
				.single()
			if (!isCurrentAccountContext(context)) return
			if (error) throw error
			if (!data || data.id !== setId || data.user_id !== context.userId) {
				throw new Error('Saved set deletion ownership validation failed')
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
			if (!isCurrentAccountContext(context)) return
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
		accountGeneration += 1
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
