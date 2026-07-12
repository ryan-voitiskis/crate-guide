import { toast } from 'vue-sonner'
import { adjustKey } from '~/utils/keyFunctions'
import { decodeSavedSetRow, reportDecodeIssues } from '~/utils/supabaseRows'
import { getTrackSuggestions } from '~/utils/trackSuggestions'
import type { ScoredTrack } from '../../shared/types/session'

export interface Deck {
	loadedTrack: Track | null
	rpm: 33 | 45
	pitch: number // -100 to 100 (maps to pitch range %)
	faderPosition: number // Visual position during animation
	faderSliding: boolean // Animation in progress
	isPlaying: boolean // Platter spinning
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
	const user = useUserStore()
	const tracks = useTracksStore()

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
		if (!deck?.loadedTrack?.bpm || deck.loadedTrack.key === null) return null
		const adjustedBpm = getAdjustedBpm(deckIndex)
		if (!adjustedBpm) return null
		return adjustKey(deck.loadedTrack.key, adjustedBpm / deck.loadedTrack.bpm)
	}

	// === Computed: Suggestions per Deck ===
	function getSuggestionsForDeck(deckIndex: number): ScoredTrack[] {
		const deck = decks.value[deckIndex]
		if (!deck?.loadedTrack) return []

		const adjustedBpm = getAdjustedBpm(deckIndex)
		const adjustedKeyVal = getAdjustedKey(deckIndex)
		const sourceTrack = deck.loadedTrack
		const playedIds = new Set(currentSession.value.map((p) => p.track_id))

		return getTrackSuggestions(tracks.playableTracks, {
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

	function loadTrack(trackId: string, deckIndex: number, matchTempo = false) {
		const track = tracks.getTrackById(trackId)
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

	// === Actions: Auto-Save ===
	const autoSaveTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

	async function createActiveSet(): Promise<string | null> {
		if (!user.supaUser?.id || currentSession.value.length === 0) return null

		isAutoSaving.value = true
		try {
			const { data, error } = await supabase
				.from('sets')
				.insert({
					user_id: user.supaUser.id,
					name: null,
					played_tracks: currentSession.value
				})
				.select('id')
				.single()

			if (error) throw error
			autoSaveError.value = null
			return data.id
		} catch (e) {
			console.error('Failed to create active set:', e)
			autoSaveError.value =
				'Auto-save failed. Your current session is not saved yet.'
			toast.error(autoSaveError.value)
			return null
		} finally {
			isAutoSaving.value = false
		}
	}

	async function updateActiveSet() {
		if (!activeSetId.value || currentSession.value.length === 0) return

		isAutoSaving.value = true
		try {
			const { error } = await supabase
				.from('sets')
				.update({ played_tracks: currentSession.value })
				.eq('id', activeSetId.value)

			if (error) throw error
			autoSaveError.value = null
		} catch (e) {
			console.error('Auto-save failed:', e)
			autoSaveError.value =
				'Auto-save failed. Your current session is not saved yet.'
			toast.error(autoSaveError.value)
		} finally {
			isAutoSaving.value = false
		}
	}

	function scheduleAutoSave() {
		if (!user.supaUser?.id) return

		if (autoSaveTimeout.value) {
			clearTimeout(autoSaveTimeout.value)
		}

		autoSaveTimeout.value = setTimeout(async () => {
			if (currentSession.value.length === 0) return

			// Create set if none exists
			if (!activeSetId.value) {
				activeSetId.value = await createActiveSet()
			} else {
				await updateActiveSet()
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
		if (!user.supaUser?.id) return

		isLoadingSets.value = true
		try {
			const { data, error } = await supabase
				.from('sets')
				.select('*')
				.eq('user_id', user.supaUser.id)
				.order('created_at', { ascending: false })

			if (error) throw error
			const decodedRows = (data ?? []).map(decodeSavedSetRow)
			const issues = decodedRows.flatMap((decoded) => decoded.issues)
			reportDecodeIssues(issues, (message) => toast.warning(message))
			savedSets.value = decodedRows.map((decoded) => decoded.row)
		} catch (e) {
			console.error(e)
			toast.error('Failed to load saved sets')
		} finally {
			isLoadingSets.value = false
		}
	}

	async function saveSession(name?: string): Promise<SavedSet | null> {
		if (!user.supaUser?.id || currentSession.value.length === 0) return null

		isSavingSession.value = true
		try {
			let savedSet: SavedSet

			if (activeSetId.value) {
				// Update existing auto-saved set with name
				const { data, error } = await supabase
					.from('sets')
					.update({
						name: name || null,
						played_tracks: currentSession.value
					})
					.eq('id', activeSetId.value)
					.select()
					.single()

				if (error) throw error
				const decoded = decodeSavedSetRow(data)
				reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
				savedSet = decoded.row

				// Update in savedSets if already fetched
				const existingIndex = savedSets.value.findIndex(
					(s) => s.id === activeSetId.value
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
						user_id: user.supaUser.id,
						name: name || null,
						played_tracks: currentSession.value
					})
					.select()
					.single()

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
			console.error('Failed to save session:', e)
			toast.error('Failed to save session')
			return null
		} finally {
			isSavingSession.value = false
		}
	}

	async function deleteSet(setId: string) {
		try {
			const { error } = await supabase.from('sets').delete().eq('id', setId)
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
		fetchSavedSets,
		saveSession,
		deleteSet,
		clearSavedSetTracks
	}
})
