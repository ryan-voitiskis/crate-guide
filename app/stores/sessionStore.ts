import { computed, ref } from 'vue'
import {
	ensureWorkbenchRuntime,
	getWorkbenchRuntime,
	getWorkbenchStorePinia
} from '~/utils/workbenchPinia'
import { createSessionPlayback } from './sessionPlayback'
import { createSessionSavedSets } from './sessionSavedSets'
import type { SessionDeck } from './sessionTypes'

export type Deck = SessionDeck

export const useSessionStore = defineStore('session', () => {
	const pinia = getWorkbenchStorePinia()
	const runtime = getWorkbenchRuntime(pinia) ?? ensureWorkbenchRuntime(pinia!)
	const preferences = useLibraryPreferencesStore(pinia)
	const tracks = useTracksStore(pinia)
	const pitchRange = computed(
		() => preferences.preferences.turntable_pitch_range
	)

	const playback = createSessionPlayback({
		pitchRange,
		getTrackById: (trackId) => tracks.getTrackById(trackId),
		getPlayableTracks: () => tracks.playableTracks
	})
	const savedSets = createSessionSavedSets({
		runtime,
		currentSession: playback.currentSession
	})

	const showTurntableSim = ref(true)
	const showHistory = ref(true)
	const loadTrackCrateId = ref<string | null>(null)

	function clearSession() {
		savedSets.clearSessionPersistence(playback.clearPlaybackSession)
	}

	function resetAccountState() {
		savedSets.resetAccountPersistence(playback.resetAccountPlayback)
		loadTrackCrateId.value = null
	}

	return {
		deckCount: playback.deckCount,
		decks: playback.decks,
		currentSession: playback.currentSession,
		savedSets: savedSets.savedSets,
		activeSetId: savedSets.activeSetId,
		isLoadingSets: savedSets.isLoadingSets,
		isSavingSession: savedSets.isSavingSession,
		isAutoSaving: savedSets.isAutoSaving,
		autoSaveError: savedSets.autoSaveError,
		showTurntableSim,
		showHistory,
		loadTrackCrateId,
		deckSelectDialog: playback.deckSelectDialog,
		showSetManager: savedSets.showSetManager,
		showSaveDialog: savedSets.showSaveDialog,
		selectedSetId: savedSets.selectedSetId,
		pitchRange,
		hasLoadedTrack: playback.hasLoadedTrack,
		sessionTrackCount: playback.sessionTrackCount,
		getAdjustedBpm: playback.getAdjustedBpm,
		getAdjustedKey: playback.getAdjustedKey,
		getSuggestionsForDeck: playback.getSuggestionsForDeck,
		initializeDecks: playback.initializeDecks,
		setTrackSource: playback.setTrackSource,
		loadTrack: playback.loadTrack,
		slideFader: playback.slideFader,
		resetPitch: playback.resetPitch,
		setPitch: playback.setPitch,
		setRpm: playback.setRpm,
		togglePlaying: playback.togglePlaying,
		unloadDeck: playback.unloadDeck,
		handleSuggestionClick: playback.handleSuggestionClick,
		loadToSelectedDeck: playback.loadToSelectedDeck,
		closeDeckSelectDialog: playback.closeDeckSelectDialog,
		rateTransition: playback.rateTransition,
		clearSession,
		resetAccountState,
		fetchSavedSets: savedSets.fetchSavedSets,
		saveSession: savedSets.saveSession,
		deleteSet: savedSets.deleteSet,
		clearSavedSetTracks: savedSets.clearSavedSetTracks
	}
})
