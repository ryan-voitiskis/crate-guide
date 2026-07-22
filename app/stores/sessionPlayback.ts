import { type Ref, computed, ref } from 'vue'
import { adjustKey } from '~/utils/keyFunctions'
import { getTrackSuggestions } from '~/utils/trackSuggestions'
import type { ScoredTrack } from '~~/shared/types/session'
import type { PlayedTrackEntry, Track } from '~~/shared/types/supabase'
import type { SessionDeck as Deck } from './sessionTypes'

interface SessionPlaybackDependencies {
	pitchRange: Readonly<Ref<number>>
	getTrackById(trackId: string): Track | undefined
	getPlayableTracks(): Track[]
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

export function createSessionPlayback({
	pitchRange,
	getTrackById,
	getPlayableTracks
}: SessionPlaybackDependencies) {
	const trackSource = ref<Track[] | null>(null)
	const deckCount = ref(2)
	const decks = ref<Deck[]>([createEmptyDeck(), createEmptyDeck()])
	const currentSession = ref<PlayedTrackEntry[]>([])
	const deckSelectDialog = ref({
		open: false,
		trackId: '',
		sourceDeck: -1
	})
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

	function getSuggestionsForDeck(deckIndex: number): ScoredTrack[] {
		const deck = decks.value[deckIndex]
		if (!deck?.loadedTrack) return []

		const sourceTrack = deck.loadedTrack
		const playedIds = new Set(
			currentSession.value.map((entry) => entry.track_id)
		)
		const playableTracks = trackSource.value
			? trackSource.value.filter((track) => track.playable)
			: getPlayableTracks()

		return getTrackSuggestions(playableTracks, {
			targetBpm: getAdjustedBpm(deckIndex),
			targetKey: getAdjustedKey(deckIndex),
			sourceMode: sourceTrack.mode,
			sourceRecordId: sourceTrack.record_id,
			sourceTrackId: sourceTrack.id,
			playedIds,
			pitchRange: pitchRange.value
		})
	}

	function initializeDecks(count: number) {
		const clampedCount = Math.max(1, Math.min(4, count))
		deckCount.value = clampedCount

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

	function loadTrack(
		trackId: string,
		deckIndex: number,
		matchTempo = false,
		sourceDeckIndex: number | null = null
	) {
		const track = trackSource.value
			? trackSource.value.find((candidate) => candidate.id === trackId)
			: getTrackById(trackId)
		if (!track) return

		const deck = decks.value[deckIndex]
		if (!deck) return

		cancelFaderAnimation(deckIndex)
		deck.faderSliding = false
		deck.faderPosition = deck.pitch
		deck.loadedTrack = track
		if (track.rpm === 33 || track.rpm === 45) deck.rpm = track.rpm

		const adjustedBpmAtPitch = (pitch: number): number | null => {
			if (track.bpm === null) return null
			const factor = 1 + (pitch / 100) * (pitchRange.value / 100)
			return track.bpm * factor
		}
		let finalAdjustedBpm = adjustedBpmAtPitch(deck.pitch)

		if (
			matchTempo &&
			deckCount.value >= 2 &&
			sourceDeckIndex !== null &&
			sourceDeckIndex !== deckIndex
		) {
			const sourceBpm = getAdjustedBpm(sourceDeckIndex)
			if (sourceBpm !== null && track.bpm !== null) {
				const pitchRangeFactor = pitchRange.value / 100
				const targetPitch =
					pitchRangeFactor === 0
						? 0
						: ((sourceBpm / track.bpm - 1) / pitchRangeFactor) * 100
				const clampedPitch = Math.max(-100, Math.min(100, targetPitch))
				void slideFader(deckIndex, clampedPitch)
				finalAdjustedBpm = adjustedBpmAtPitch(clampedPitch)
			}
		}

		currentSession.value.push({
			track_id: trackId,
			time_added: Date.now(),
			adjusted_bpm: finalAdjustedBpm,
			transition_rating: null,
			track_title: track.title,
			artist_display: track.artists.map((artist) => artist.name).join(', ')
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
			await new Promise((resolve) => setTimeout(resolve, delay))
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
		if (deck) deck.rpm = rpm
	}

	function togglePlaying(deckIndex: number) {
		const deck = decks.value[deckIndex]
		if (deck) deck.isPlaying = !deck.isPlaying
	}

	function resetDeck(deck: Deck, deckIndex: number) {
		cancelFaderAnimation(deckIndex)
		deck.loadedTrack = null
		deck.pitch = 0
		deck.faderPosition = 0
		deck.faderSliding = false
		deck.isPlaying = false
	}

	function unloadDeck(deckIndex: number) {
		const deck = decks.value[deckIndex]
		if (deck) resetDeck(deck, deckIndex)
	}

	function handleSuggestionClick(trackId: string, sourceDeckIndex: number) {
		if (deckCount.value === 1) {
			loadTrack(trackId, sourceDeckIndex, false)
		} else if (deckCount.value === 2) {
			loadTrack(trackId, sourceDeckIndex === 0 ? 1 : 0, true, sourceDeckIndex)
		} else {
			deckSelectDialog.value = {
				open: true,
				trackId,
				sourceDeck: sourceDeckIndex
			}
		}
	}

	function loadToSelectedDeck(targetDeckIndex: number) {
		loadTrack(
			deckSelectDialog.value.trackId,
			targetDeckIndex,
			true,
			deckSelectDialog.value.sourceDeck
		)
		closeDeckSelectDialog()
	}

	function closeDeckSelectDialog() {
		deckSelectDialog.value = { open: false, trackId: '', sourceDeck: -1 }
	}

	function rateTransition(sessionIndex: number, rating: number | null) {
		const entry = currentSession.value[sessionIndex]
		if (entry) entry.transition_rating = rating
	}

	function clearPlaybackSession() {
		currentSession.value = []
		decks.value.forEach(resetDeck)
	}

	function resetAccountPlayback() {
		currentSession.value = []
		decks.value.forEach((_, deckIndex) => cancelFaderAnimation(deckIndex))
		decks.value = Array.from({ length: deckCount.value }, createEmptyDeck)
		closeDeckSelectDialog()
	}

	const hasLoadedTrack = computed(() =>
		decks.value.some((deck) => deck.loadedTrack !== null)
	)
	const sessionTrackCount = computed(() => currentSession.value.length)

	return {
		deckCount,
		decks,
		currentSession,
		deckSelectDialog,
		hasLoadedTrack,
		sessionTrackCount,
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
		clearPlaybackSession,
		resetAccountPlayback
	}
}
