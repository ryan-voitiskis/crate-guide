import { toast } from 'vue-sonner'
import { adjustKey, scoreHarmony } from '~/utils/keyFunctions'

export interface Deck {
	loadedTrack: Track | null
	rpm: 33 | 45
	pitch: number // -100 to 100 (maps to pitch range %)
	faderPosition: number // Visual position during animation
	faderSliding: boolean // Animation in progress
	isPlaying: boolean // Platter spinning
}

export interface PlayedTrackEntry {
	track_id: string
	time_added: number // Unix timestamp ms
	adjusted_bpm: number | null
	transition_rating: number | null // 1-5 or null
}

export interface SavedSet {
	id: string
	user_id: string
	name: string | null
	played_tracks: PlayedTrackEntry[]
	created_at: string | null
	updated_at: string | null
}

export interface ScoredTrack extends Track {
	score: number
	tempoScore: number
	harmonyScore: number
	pitchAdjustment: number // -1 to 1 representing pitch shift needed
	keyCombination: number // index of keyCombinations or -1
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

	// === UI State ===
	const showTurntableSim = ref(true)
	const showHistory = ref(true)
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

		// Get playable tracks
		let candidates = tracks.playableTracks

		// Filter: BPM range (candidate must be reachable with pitch adjustment)
		if (adjustedBpm) {
			candidates = candidates.filter((t) => {
				if (!t.bpm) return false
				const minReachable = t.bpm * (1 - pitchRange.value / 100)
				const maxReachable = t.bpm * (1 + pitchRange.value / 100)
				return adjustedBpm >= minReachable && adjustedBpm <= maxReachable
			})
		}

		// Filter: Already played in session
		const playedIds = new Set(currentSession.value.map((p) => p.track_id))
		candidates = candidates.filter((t) => !playedIds.has(t.id))

		// Filter: Same record as source
		candidates = candidates.filter((t) => t.record_id !== sourceTrack.record_id)

		// Filter: Not the currently loaded track
		candidates = candidates.filter((t) => t.id !== sourceTrack.id)

		// Score and sort
		const scored = candidates.map((track): ScoredTrack => {
			let tempoScore = 0
			let harmonyScore = 0
			let pitchAdjustment = 0
			let keyCombination = -1

			// Tempo scoring
			if (adjustedBpm && track.bpm) {
				// pitchAdjustment: how much to shift candidate to match source BPM.
				// Inverted to match turntable pitch fader orientation (up = slower, down = faster).
				pitchAdjustment = (adjustedBpm / track.bpm - 1) * -1
				const tempoCloseness =
					1 - (Math.abs(1 - adjustedBpm / track.bpm) * 100) / pitchRange.value
				tempoScore = Math.max(0, tempoCloseness)
			}

			// Harmony scoring
			if (
				adjustedKeyVal !== null &&
				track.key !== null &&
				sourceTrack.mode !== null &&
				track.mode !== null
			) {
				// Adjust candidate key for pitch shift
				const trackAdjustedKey =
					adjustedBpm && track.bpm
						? adjustKey(track.key, adjustedBpm / track.bpm)
						: track.key

				const harmony = scoreHarmony(
					{ key: adjustedKeyVal, mode: sourceTrack.mode },
					{ key: trackAdjustedKey, mode: track.mode }
				)
				harmonyScore = harmony.harmonicAffinity ?? 0
				keyCombination = harmony.keyCombination
			}

			// Combined score (weighted: harmony more important)
			const score = harmonyScore * 0.7 + tempoScore * 0.3

			return {
				...track,
				score,
				tempoScore,
				harmonyScore,
				pitchAdjustment,
				keyCombination
			}
		})

		// Sort by score descending, limit to 50
		return scored.sort((a, b) => b.score - a.score).slice(0, 50)
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
			return data.id
		} catch (e) {
			console.error('Failed to create active set:', e)
			return null
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
		} catch {
			// Silent fail for auto-save - don't interrupt user flow
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
			savedSets.value = (data as unknown as SavedSet[]) ?? []
		} catch {
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
				savedSet = data as unknown as SavedSet

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
				savedSet = data as unknown as SavedSet
				savedSets.value.unshift(savedSet)
				activeSetId.value = savedSet.id
			}

			toast.success('Session saved')
			showSaveDialog.value = false
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
		} catch {
			toast.error('Failed to delete set')
		}
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
		showTurntableSim,
		showHistory,
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
		handleSuggestionClick,
		loadToSelectedDeck,
		closeDeckSelectDialog,
		rateTransition,
		clearSession,
		fetchSavedSets,
		saveSession,
		deleteSet
	}
})
