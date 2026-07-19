import { toast } from 'vue-sonner'
import { getActivePinia } from 'pinia'
import { adjustKey } from '~/utils/keyFunctions'
import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import { decodeSavedSetRow, reportDecodeIssues } from '~/utils/supabaseRows'
import { getTrackSuggestions } from '~/utils/trackSuggestions'
import { isDemoWorkbenchPinia } from '~/utils/workbenchPinia'
import type { ScoredTrack } from '../../shared/types/session'

export interface Deck {
	loadedTrack: Track | null
	rpm: 33 | 45
	pitch: number // -100 to 100 (maps to pitch range %)
	faderPosition: number // Visual position during animation
	faderSliding: boolean // Animation in progress
	isPlaying: boolean // Platter spinning
}

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

function createEmptyDeck(): Deck {
	return {
		loadedTrack: null,
		rpm: 33,
		pitch: 0,
		faderPosition: 0,
		faderSliding: false,
		isPlaying: false
	}
}

export const useSessionStore = defineStore('session', () => {
	const supabase = useSupabaseClient<Database>()
	const pinia = getActivePinia()
	const isDemoStore = isDemoWorkbenchPinia(pinia)
	const user = useUserStore(pinia)
	const tracks = useTracksStore(pinia)
	const trackSource = ref<Track[] | null>(null)

	// === Deck State ===
	const deckCount = ref(2)
	const decks = ref<Deck[]>([createEmptyDeck(), createEmptyDeck()])
	const faderAnimationGenerations = new Map<number, number>()

	function beginFaderAnimation(deckIndex: number): number {
		const generation = (faderAnimationGenerations.get(deckIndex) ?? 0) + 1
		faderAnimationGenerations.set(deckIndex, generation)
		return generation
	}

	function cancelFaderAnimation(deckIndex: number) {
		faderAnimationGenerations.set(
			deckIndex,
			(faderAnimationGenerations.get(deckIndex) ?? 0) + 1
		)
	}

	function ownsFaderAnimation(
		deckIndex: number,
		deck: Deck,
		generation: number
	): boolean {
		return (
			faderAnimationGenerations.get(deckIndex) === generation &&
			decks.value[deckIndex] === deck
		)
	}

	// === Session State ===
	const currentSession = ref<PlayedTrackEntry[]>([])
	const savedSets = ref<SavedSet[]>([])
	const activeSetId = ref<string | null>(null) // The set being auto-saved to
	const isLoadingSets = ref(false)
	const isSavingSession = ref(false)
	const isAutoSaving = ref(false)
	const autoSaveError = ref<string | null>(null)
	const autoSaveTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
	let accountGeneration = 0
	let sessionWriteGeneration = 0
	let activeSessionWrite: SessionWriteRequest | null = null
	const pendingSessionWrites: SessionWriteRequest[] = []
	let savedSetsFetchPromise: Promise<void> | null = null
	let savedSetsFetchContext: AccountOperationContext | null = null
	let savedSetMutationRevision = 0
	const savedSetSaveProvenance = new Map<string, SavedSetMutationProvenance>()
	const savedSetDeleteTombstones = new Map<string, SavedSetMutationProvenance>()

	// === UI State ===
	const showTurntableSim = ref(true)
	const showHistory = ref(true)
	const loadTrackCrateId = ref<string | null>(null)
	const deckSelectDialog = ref<{
		open: boolean
		trackId: string
		sourceDeck: number
	}>({
		open: false,
		trackId: '',
		sourceDeck: -1
	})
	const showSetManager = ref(false)
	const showSaveDialog = ref(false)
	const selectedSetId = ref<string | null>(null)

	// === Computed: Pitch Range from User Settings ===
	const pitchRange = computed(() => user.profile?.turntable_pitch_range ?? 8)

	// === Methods: Adjusted BPM/Key ===
	function getAdjustedBpm(deckIndex: number): number | null {
		const deck = decks.value[deckIndex]
		if (!deck?.loadedTrack?.bpm) return null
		const factor = 1 + (deck.pitch / 100) * (pitchRange.value / 100)
		return deck.loadedTrack.bpm * factor
	}

	function getAdjustedKey(deckIndex: number): number | null {
		const deck = decks.value[deckIndex]
		if (!deck?.loadedTrack || deck.loadedTrack.key === null) return null
		const factor = 1 + (deck.pitch / 100) * (pitchRange.value / 100)
		return adjustKey(deck.loadedTrack.key, factor)
	}

	// === Computed: Suggestions per Deck ===
	function getSuggestionsForDeck(deckIndex: number): ScoredTrack[] {
		const deck = decks.value[deckIndex]
		if (!deck?.loadedTrack) return []

		const adjustedBpm = getAdjustedBpm(deckIndex)
		const adjustedKeyVal = getAdjustedKey(deckIndex)
		const sourceTrack = deck.loadedTrack
		const playedIds = new Set(currentSession.value.map((p) => p.track_id))

		const playableTracks = trackSource.value
			? trackSource.value.filter((track) => track.playable)
			: tracks.playableTracks
		return getTrackSuggestions(playableTracks, {
			targetBpm: adjustedBpm,
			targetKey: adjustedKeyVal,
			sourceMode: sourceTrack.mode,
			sourceRecordId: sourceTrack.record_id,
			sourceTrackId: sourceTrack.id,
			playedIds,
			pitchRange: pitchRange.value
		})
	}

	// === Actions: Deck Management ===
	function initializeDecks(count: number) {
		const clampedCount = Math.max(1, Math.min(4, count))
		deckCount.value = clampedCount

		// Adjust decks array
		while (decks.value.length < clampedCount) {
			decks.value.push(createEmptyDeck())
		}
		while (decks.value.length > clampedCount) {
			cancelFaderAnimation(decks.value.length - 1)
			decks.value.pop()
		}
	}

	function setTrackSource(source: Track[]) {
		trackSource.value = source
	}

	function loadTrack(trackId: string, deckIndex: number, matchTempo = false) {
		const track = trackSource.value
			? trackSource.value.find((candidate) => candidate.id === trackId)
			: tracks.getTrackById(trackId)
		if (!track) return

		const deck = decks.value[deckIndex]
		if (!deck) return

		cancelFaderAnimation(deckIndex)
		deck.faderSliding = false
		deck.faderPosition = deck.pitch
		deck.loadedTrack = track
		if (track.rpm === 33 || track.rpm === 45) {
			deck.rpm = track.rpm
		}

		let finalAdjustedBpm: number | null = track.bpm

		// Match tempo to the deck we're transitioning from
		if (matchTempo && deckCount.value >= 2) {
			// Find another deck with a loaded track to match
			const otherDeckIndex = decks.value.findIndex(
				(d, i) => i !== deckIndex && d.loadedTrack !== null
			)
			if (otherDeckIndex !== -1) {
				const otherBpm = getAdjustedBpm(otherDeckIndex)
				if (otherBpm && track.bpm) {
					const targetPitch =
						((otherBpm / track.bpm - 1) / (pitchRange.value / 100)) * 100
					const clampedPitch = Math.max(-100, Math.min(100, targetPitch))
					slideFader(deckIndex, clampedPitch)
					finalAdjustedBpm = otherBpm
				}
			}
		}

		// Add to session history
		currentSession.value.push({
			track_id: trackId,
			time_added: Date.now(),
			adjusted_bpm: finalAdjustedBpm,
			transition_rating: null
		})
	}

	async function slideFader(deckIndex: number, targetPitch: number) {
		const deck = decks.value[deckIndex]
		if (!deck) return
		const generation = beginFaderAnimation(deckIndex)

		deck.faderSliding = true

		const step = 2
		const delay = 10

		while (Math.abs(deck.faderPosition - targetPitch) > step) {
			deck.faderPosition += targetPitch > deck.faderPosition ? step : -step
			await new Promise((r) => setTimeout(r, delay))
			if (!ownsFaderAnimation(deckIndex, deck, generation)) return
		}

		if (!ownsFaderAnimation(deckIndex, deck, generation)) return
		deck.faderPosition = targetPitch
		deck.pitch = targetPitch
		deck.faderSliding = false
	}

	function resetPitch(deckIndex: number) {
		const deck = decks.value[deckIndex]
		if (!deck) return
		cancelFaderAnimation(deckIndex)
		deck.pitch = 0
		deck.faderPosition = 0
		deck.faderSliding = false
	}

	function setPitch(deckIndex: number, pitch: number) {
		const deck = decks.value[deckIndex]
		if (!deck || deck.faderSliding) return
		deck.pitch = pitch
		deck.faderPosition = pitch
	}

	function setRpm(deckIndex: number, rpm: 33 | 45) {
		const deck = decks.value[deckIndex]
		if (!deck) return
		deck.rpm = rpm
	}

	function togglePlaying(deckIndex: number) {
		const deck = decks.value[deckIndex]
		if (!deck) return
		deck.isPlaying = !deck.isPlaying
	}

	function unloadDeck(deckIndex: number) {
		const deck = decks.value[deckIndex]
		if (!deck) return
		cancelFaderAnimation(deckIndex)
		deck.loadedTrack = null
		deck.pitch = 0
		deck.faderPosition = 0
		deck.faderSliding = false
		deck.isPlaying = false
	}

	// === Actions: Suggestion Click Handling ===
	function handleSuggestionClick(trackId: string, sourceDeckIndex: number) {
		if (deckCount.value === 1) {
			// Load to same deck
			loadTrack(trackId, sourceDeckIndex, false)
		} else if (deckCount.value === 2) {
			// Load to other deck with tempo match
			const targetDeck = sourceDeckIndex === 0 ? 1 : 0
			loadTrack(trackId, targetDeck, true)
		} else {
			// 3-4 decks: show dialog
			deckSelectDialog.value = {
				open: true,
				trackId,
				sourceDeck: sourceDeckIndex
			}
		}
	}

	function loadToSelectedDeck(targetDeckIndex: number) {
		const { trackId } = deckSelectDialog.value
		loadTrack(trackId, targetDeckIndex, true)
		deckSelectDialog.value = { open: false, trackId: '', sourceDeck: -1 }
	}

	function closeDeckSelectDialog() {
		deckSelectDialog.value = { open: false, trackId: '', sourceDeck: -1 }
	}

	// === Actions: Session History ===
	function rateTransition(sessionIndex: number, rating: number | null) {
		if (currentSession.value[sessionIndex]) {
			currentSession.value[sessionIndex].transition_rating = rating
		}
	}

	function clearSession() {
		invalidateSessionWrites()
		currentSession.value = []
		activeSetId.value = null
		autoSaveError.value = null
		decks.value.forEach((deck, deckIndex) => {
			cancelFaderAnimation(deckIndex)
			deck.loadedTrack = null
			deck.pitch = 0
			deck.faderPosition = 0
			deck.faderSliding = false
			deck.isPlaying = false
		})
	}

	function resetAccountState() {
		accountGeneration += 1
		invalidateSessionWrites()
		savedSetsFetchPromise = null
		savedSetsFetchContext = null
		savedSetSaveProvenance.clear()
		savedSetDeleteTombstones.clear()

		currentSession.value = []
		savedSets.value = []
		activeSetId.value = null
		selectedSetId.value = null
		loadTrackCrateId.value = null
		decks.value.forEach((_, deckIndex) => {
			cancelFaderAnimation(deckIndex)
		})
		decks.value = Array.from({ length: deckCount.value }, createEmptyDeck)
		deckSelectDialog.value = { open: false, trackId: '', sourceDeck: -1 }
		showSetManager.value = false
		showSaveDialog.value = false
		isLoadingSets.value = false
		isSavingSession.value = false
		isAutoSaving.value = false
		autoSaveError.value = null
	}

	// === Actions: Auto-Save ===
	function captureAccountContext(): AccountOperationContext | null {
		if (isDemoStore) return null
		const userId = user.supaUserId
		return userId ? { generation: accountGeneration, userId } : null
	}

	function isCurrentAccountContext(context: AccountOperationContext): boolean {
		return (
			context.generation === accountGeneration &&
			user.supaUserId === context.userId
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
			const setId = activeSetId.value
			if (setId) {
				const { data, error } = await supabase
					.from('sets')
					.update({ played_tracks: playedTracks })
					.eq('id', setId)
					.eq('user_id', request.context.userId)
					.select('id, user_id')
					.single()

				if (!isCurrentSessionWrite(request)) return
				if (error) throw error
				if (
					!data ||
					data.id !== setId ||
					data.user_id !== request.context.userId
				) {
					throw new Error('Saved set auto-save ownership validation failed')
				}
			} else {
				const { data, error } = await supabase
					.from('sets')
					.insert({
						user_id: request.context.userId,
						name: null,
						played_tracks: playedTracks
					})
					.select('id, user_id')
					.single()

				if (!isCurrentSessionWrite(request)) return
				if (error) throw error
				if (
					!data ||
					typeof data.id !== 'string' ||
					!data.id ||
					data.user_id !== request.context.userId
				) {
					throw new Error('Saved set auto-save ownership validation failed')
				}
				activeSetId.value = data.id
			}

			autoSaveError.value = null
		} catch (e) {
			if (!isCurrentSessionWrite(request)) return
			console.error('Auto-save failed:', e)
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
					.update({
						name: request.name,
						played_tracks: playedTracks
					})
					.eq('id', setId)
					.eq('user_id', request.context.userId)
					.select()
					.single()

				if (!isCurrentSessionWrite(request)) return null
				if (error) throw error
				const decoded = decodeOwnedSavedSetResponse(data, request.context)
				reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
				savedSet = decoded.row

				const existingIndex = savedSets.value.findIndex(
					(saved) => saved.id === setId
				)
				if (existingIndex !== -1) {
					savedSets.value[existingIndex] = savedSet
				} else {
					savedSets.value.unshift(savedSet)
				}
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
				savedSets.value.unshift(savedSet)
				activeSetId.value = savedSet.id
			}
			savedSetSaveProvenance.set(savedSet.id, {
				...request.context,
				revision: nextSavedSetMutationRevision()
			})
			savedSetDeleteTombstones.delete(savedSet.id)

			toast.success('Session saved')
			showSaveDialog.value = false
			autoSaveError.value = null
			return savedSet
		} catch (e) {
			if (!isCurrentSessionWrite(request)) return null
			console.error('Failed to save session:', e)
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

		if (autoSaveTimeout.value) {
			clearTimeout(autoSaveTimeout.value)
		}

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
		}, 2000) // Debounce 2 seconds
	}

	// Watch session changes for auto-save
	watch(
		currentSession,
		() => {
			scheduleAutoSave()
		},
		{ deep: true }
	)

	// === Actions: Set Persistence ===
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
		} catch (e) {
			if (!isCurrentAccountContext(context)) return
			console.error(e)
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
		if (!context || currentSession.value.length === 0)
			return Promise.resolve(null)

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
			savedSets.value = savedSets.value.filter((s) => s.id !== setId)
			savedSetSaveProvenance.delete(setId)
			savedSetDeleteTombstones.set(setId, {
				...context,
				revision: nextSavedSetMutationRevision()
			})
			if (activeSetId.value === setId) {
				activeSetId.value = null
			}
			if (selectedSetId.value === setId) {
				selectedSetId.value = null
			}
			toast.success('Set deleted')
		} catch (e) {
			if (!isCurrentAccountContext(context)) return
			console.error(e)
			toast.error('Failed to delete set')
		}
	}

	function clearSavedSetTracks() {
		savedSets.value = savedSets.value.map((savedSet) => ({
			...savedSet,
			played_tracks: []
		}))
	}

	// === Getters ===
	const hasLoadedTrack = computed(() =>
		decks.value.some((d) => d.loadedTrack !== null)
	)

	const sessionTrackCount = computed(() => currentSession.value.length)

	return {
		// State
		deckCount,
		decks,
		currentSession,
		savedSets,
		activeSetId,
		isLoadingSets,
		isSavingSession,
		isAutoSaving,
		autoSaveError,
		showTurntableSim,
		showHistory,
		loadTrackCrateId,
		deckSelectDialog,
		showSetManager,
		showSaveDialog,
		selectedSetId,
		pitchRange,

		// Computed
		hasLoadedTrack,
		sessionTrackCount,

		// Methods
		getAdjustedBpm,
		getAdjustedKey,
		getSuggestionsForDeck,
		initializeDecks,
		setTrackSource,
		loadTrack,
		slideFader,
		resetPitch,
		setPitch,
		setRpm,
		togglePlaying,
		unloadDeck,
		handleSuggestionClick,
		loadToSelectedDeck,
		closeDeckSelectDialog,
		rateTransition,
		clearSession,
		resetAccountState,
		fetchSavedSets,
		saveSession,
		deleteSet,
		clearSavedSetTracks
	}
})
