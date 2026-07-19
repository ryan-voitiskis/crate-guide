import { toast } from 'vue-sonner'
import { getActivePinia } from 'pinia'
import { adjustKey } from '~/utils/keyFunctions'
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

		deck.faderSliding = true

		const step = 2
		const delay = 10

		while (Math.abs(deck.faderPosition - targetPitch) > step) {
			deck.faderPosition += targetPitch > deck.faderPosition ? step : -step
			await new Promise((r) => setTimeout(r, delay))
		}

		deck.faderPosition = targetPitch
		deck.pitch = targetPitch
		deck.faderSliding = false
	}

	function resetPitch(deckIndex: number) {
		const deck = decks.value[deckIndex]
		if (!deck) return
		deck.pitch = 0
		deck.faderPosition = 0
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
		currentSession.value = []
		activeSetId.value = null
		autoSaveError.value = null
		if (autoSaveTimeout.value) {
			clearTimeout(autoSaveTimeout.value)
			autoSaveTimeout.value = null
		}
		decks.value.forEach((deck) => {
			deck.loadedTrack = null
			deck.pitch = 0
			deck.faderPosition = 0
			deck.faderSliding = false
			deck.isPlaying = false
		})
	}

	function resetAccountState() {
		accountGeneration += 1
		if (autoSaveTimeout.value) {
			clearTimeout(autoSaveTimeout.value)
			autoSaveTimeout.value = null
		}

		currentSession.value = []
		savedSets.value = []
		activeSetId.value = null
		selectedSetId.value = null
		loadTrackCrateId.value = null
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

	async function createActiveSet(
		context: AccountOperationContext
	): Promise<string | null> {
		if (!isCurrentAccountContext(context) || currentSession.value.length === 0)
			return null

		const playedTracks = currentSession.value.map((entry) => ({ ...entry }))
		isAutoSaving.value = true
		try {
			const { data, error } = await supabase
				.from('sets')
				.insert({
					user_id: context.userId,
					name: null,
					played_tracks: playedTracks
				})
				.select('id')
				.single()

			if (!isCurrentAccountContext(context)) return null
			if (error) throw error
			autoSaveError.value = null
			return data.id
		} catch (e) {
			if (!isCurrentAccountContext(context)) return null
			console.error('Failed to create active set:', e)
			autoSaveError.value =
				'Auto-save failed. Your current session is not saved yet.'
			toast.error(autoSaveError.value)
			return null
		} finally {
			if (isCurrentAccountContext(context)) isAutoSaving.value = false
		}
	}

	async function updateActiveSet(
		context: AccountOperationContext,
		setId: string
	) {
		if (!isCurrentAccountContext(context) || currentSession.value.length === 0)
			return

		const playedTracks = currentSession.value.map((entry) => ({ ...entry }))
		isAutoSaving.value = true
		try {
			const { error } = await supabase
				.from('sets')
				.update({ played_tracks: playedTracks })
				.eq('id', setId)

			if (!isCurrentAccountContext(context)) return
			if (error) throw error
			autoSaveError.value = null
		} catch (e) {
			if (!isCurrentAccountContext(context)) return
			console.error('Auto-save failed:', e)
			autoSaveError.value =
				'Auto-save failed. Your current session is not saved yet.'
			toast.error(autoSaveError.value)
		} finally {
			if (isCurrentAccountContext(context)) isAutoSaving.value = false
		}
	}

	function scheduleAutoSave() {
		const context = captureAccountContext()
		if (!context || currentSession.value.length === 0) return

		if (autoSaveTimeout.value) {
			clearTimeout(autoSaveTimeout.value)
		}

		autoSaveTimeout.value = setTimeout(async () => {
			autoSaveTimeout.value = null
			if (
				!isCurrentAccountContext(context) ||
				currentSession.value.length === 0
			)
				return

			// Create set if none exists
			const setId = activeSetId.value
			if (!setId) {
				const createdSetId = await createActiveSet(context)
				if (isCurrentAccountContext(context)) {
					activeSetId.value = createdSetId
				}
			} else {
				await updateActiveSet(context, setId)
			}
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
	async function fetchSavedSets() {
		const context = captureAccountContext()
		if (!context) return

		isLoadingSets.value = true
		try {
			const rows = await fetchAllSupabasePages(async (from, to) => {
				return await supabase
					.from('sets')
					.select('*')
					.eq('user_id', context.userId)
					.order('created_at', { ascending: false })
					.order('id', { ascending: false })
					.range(from, to)
			})

			if (!isCurrentAccountContext(context)) return
			const decodedRows = rows.map(decodeSavedSetRow)
			const issues = decodedRows.flatMap((decoded) => decoded.issues)
			reportDecodeIssues(issues, (message) => toast.warning(message))
			savedSets.value = decodedRows.map((decoded) => decoded.row)
		} catch (e) {
			if (!isCurrentAccountContext(context)) return
			console.error(e)
			toast.error('Failed to load saved sets')
		} finally {
			if (isCurrentAccountContext(context)) isLoadingSets.value = false
		}
	}

	async function saveSession(name?: string): Promise<SavedSet | null> {
		const context = captureAccountContext()
		if (!context || currentSession.value.length === 0) return null

		const activeSetIdAtStart = activeSetId.value
		const playedTracks = currentSession.value.map((entry) => ({ ...entry }))
		isSavingSession.value = true
		try {
			let savedSet: SavedSet

			if (!isCurrentAccountContext(context)) return null
			if (activeSetIdAtStart) {
				// Update existing auto-saved set with name
				const { data, error } = await supabase
					.from('sets')
					.update({
						name: name || null,
						played_tracks: playedTracks
					})
					.eq('id', activeSetIdAtStart)
					.select()
					.single()

				if (!isCurrentAccountContext(context)) return null
				if (error) throw error
				const decoded = decodeSavedSetRow(data)
				reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
				savedSet = decoded.row

				// Update in savedSets if already fetched
				const existingIndex = savedSets.value.findIndex(
					(s) => s.id === activeSetIdAtStart
				)
				if (existingIndex !== -1) {
					savedSets.value[existingIndex] = savedSet
				} else {
					savedSets.value.unshift(savedSet)
				}
			} else {
				// Create new set
				const { data, error } = await supabase
					.from('sets')
					.insert({
						user_id: context.userId,
						name: name || null,
						played_tracks: playedTracks
					})
					.select()
					.single()

				if (!isCurrentAccountContext(context)) return null
				if (error) throw error
				const decoded = decodeSavedSetRow(data)
				reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
				savedSet = decoded.row
				savedSets.value.unshift(savedSet)
				activeSetId.value = savedSet.id
			}

			toast.success('Session saved')
			showSaveDialog.value = false
			autoSaveError.value = null
			return savedSet
		} catch (e) {
			if (!isCurrentAccountContext(context)) return null
			console.error('Failed to save session:', e)
			toast.error('Failed to save session')
			return null
		} finally {
			if (isCurrentAccountContext(context)) isSavingSession.value = false
		}
	}

	async function deleteSet(setId: string) {
		const context = captureAccountContext()
		if (!context || !isCurrentAccountContext(context)) return

		try {
			const { error } = await supabase.from('sets').delete().eq('id', setId)
			if (!isCurrentAccountContext(context)) return
			if (error) throw error
			savedSets.value = savedSets.value.filter((s) => s.id !== setId)
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
