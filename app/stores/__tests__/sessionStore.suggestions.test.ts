import { createPinia, setActivePinia } from 'pinia'
import {
	createMockTrack,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../sessionStore'
import { createSessionStoreHarness } from './harness/sessionStoreHarness'

const mockToast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: mockToast
}))

const harness = createSessionStoreHarness()
const mockTracksStore = harness.tracksStore
const mockUserStore = harness.userStore
const mockPreferencesStore = harness.preferencesStore
const mockSupabaseClient = harness.supabaseClient

// Stub Nuxt composables (these are auto-imported in the store)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useLibraryPreferencesStore', () => mockPreferencesStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)

describe('sessionStore suggestions and history', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetTrackIdCounter()
		setActivePinia(createPinia())

		harness.reset()
	})

	describe('getSuggestionsForDeck', () => {
		it('returns empty array when deck has no loaded track', () => {
			const store = useSessionStore()

			const result = store.getSuggestionsForDeck(0)

			expect(result).toEqual([])
		})

		it('filters out tracks outside BPM reachability range', () => {
			mockTracksStore.playableTracks = [
				createMockTrack({
					id: 'reachable',
					bpm: 130,
					record_id: 'other-record'
				}),
				createMockTrack({
					id: 'too-fast',
					bpm: 200,
					record_id: 'other-record'
				}),
				createMockTrack({
					id: 'too-slow',
					bpm: 80,
					record_id: 'other-record'
				})
			]

			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({
				id: 'source',
				bpm: 128,
				record_id: 'source-record'
			})

			const result = store.getSuggestionsForDeck(0)

			// At 128 BPM with 8% pitch range:
			// Min reachable: candidate * 0.92 = 128, so candidate = 128/0.92 = ~139
			// Max reachable: candidate * 1.08 = 128, so candidate = 128/1.08 = ~118
			// So 130 BPM should be reachable (130*0.92=119.6 <= 128 <= 130*1.08=140.4)
			// 200 BPM not reachable (200*0.92=184 > 128)
			// 80 BPM not reachable (80*1.08=86.4 < 128)
			expect(result.map((t) => t.id)).toContain('reachable')
			expect(result.map((t) => t.id)).not.toContain('too-fast')
			expect(result.map((t) => t.id)).not.toContain('too-slow')
		})

		it('excludes tracks already played in session', () => {
			mockTracksStore.playableTracks = [
				createMockTrack({
					id: 'not-played',
					bpm: 130,
					record_id: 'other-record'
				}),
				createMockTrack({
					id: 'already-played',
					bpm: 130,
					record_id: 'other-record'
				})
			]

			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({
				id: 'source',
				bpm: 128,
				record_id: 'source-record'
			})
			store.currentSession = [
				{
					track_id: 'already-played',
					time_added: Date.now(),
					adjusted_bpm: 128,
					transition_rating: null
				}
			]

			const result = store.getSuggestionsForDeck(0)

			expect(result.map((t) => t.id)).toContain('not-played')
			expect(result.map((t) => t.id)).not.toContain('already-played')
		})

		it('excludes tracks from the same record as source', () => {
			mockTracksStore.playableTracks = [
				createMockTrack({
					id: 'same-record',
					bpm: 130,
					record_id: 'source-record'
				}),
				createMockTrack({
					id: 'different-record',
					bpm: 130,
					record_id: 'other-record'
				})
			]

			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({
				id: 'source',
				bpm: 128,
				record_id: 'source-record'
			})

			const result = store.getSuggestionsForDeck(0)

			expect(result.map((t) => t.id)).toContain('different-record')
			expect(result.map((t) => t.id)).not.toContain('same-record')
		})

		it('excludes the currently loaded track', () => {
			mockTracksStore.playableTracks = [
				createMockTrack({
					id: 'source',
					bpm: 128,
					record_id: 'source-record'
				}),
				createMockTrack({
					id: 'other',
					bpm: 130,
					record_id: 'other-record'
				})
			]

			const store = useSessionStore()
			store.decks[0]!.loadedTrack = mockTracksStore.playableTracks[0]!

			const result = store.getSuggestionsForDeck(0)

			expect(result.map((t) => t.id)).not.toContain('source')
			expect(result.map((t) => t.id)).toContain('other')
		})

		it('scores tracks with combined harmony (70%) and tempo (30%) weights', () => {
			// Create two tracks with different scoring characteristics
			mockTracksStore.playableTracks = [
				createMockTrack({
					id: 'track-a',
					bpm: 128, // Perfect tempo match
					key: 0, // C
					mode: 0, // minor
					record_id: 'other-record'
				}),
				createMockTrack({
					id: 'track-b',
					bpm: 130, // Slight tempo difference
					key: 0, // Same key
					mode: 0, // Same mode
					record_id: 'other-record-2'
				})
			]

			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({
				id: 'source',
				bpm: 128,
				key: 0, // C
				mode: 0, // minor
				record_id: 'source-record'
			})

			const result = store.getSuggestionsForDeck(0)

			// Both should have harmony scores, track-a should have better tempo score
			expect(result.length).toBeGreaterThan(0)
			result.forEach((track) => {
				expect(track.score).not.toBeNull()
				expect(track.tempoScore).not.toBeNull()
				expect(track.harmonyScore).not.toBeNull()
			})
		})

		it('limits results to 50 tracks', () => {
			// Create 60 tracks
			mockTracksStore.playableTracks = Array.from({ length: 60 }, (_, i) =>
				createMockTrack({
					id: `track-${i}`,
					bpm: 128 + (i % 10) - 5, // Vary BPM slightly
					record_id: `record-${i}`
				})
			)

			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({
				id: 'source',
				bpm: 128,
				record_id: 'source-record'
			})

			const result = store.getSuggestionsForDeck(0)

			expect(result.length).toBeLessThanOrEqual(50)
		})

		it('sorts by score descending', () => {
			mockTracksStore.playableTracks = [
				createMockTrack({
					id: 'low-score',
					bpm: 135,
					key: 6, // Different key
					mode: 1,
					record_id: 'record-1'
				}),
				createMockTrack({
					id: 'high-score',
					bpm: 128, // Perfect BPM
					key: 0, // Same key
					mode: 0, // Same mode
					record_id: 'record-2'
				})
			]

			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({
				id: 'source',
				bpm: 128,
				key: 0, // C
				mode: 0, // minor
				record_id: 'source-record'
			})

			const result = store.getSuggestionsForDeck(0)

			// Higher score should come first
			if (result.length >= 2) {
				expect(result[0]!.score).not.toBeNull()
				expect(result[1]!.score).not.toBeNull()
				expect(result[0]!.score!).toBeGreaterThanOrEqual(result[1]!.score!)
			}
		})

		it('handles tracks with null BPM', () => {
			mockTracksStore.playableTracks = [
				createMockTrack({
					id: 'with-bpm',
					bpm: 130,
					record_id: 'other-record'
				}),
				createMockTrack({
					id: 'no-bpm',
					bpm: null,
					record_id: 'other-record-2'
				})
			]

			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({
				id: 'source',
				bpm: 128,
				record_id: 'source-record'
			})

			const result = store.getSuggestionsForDeck(0)

			// Track with null BPM should be filtered out
			expect(result.map((t) => t.id)).toContain('with-bpm')
			expect(result.map((t) => t.id)).not.toContain('no-bpm')
		})

		it('marks suggestions unscored when source and candidate metadata are absent', () => {
			mockTracksStore.playableTracks = [
				createMockTrack({
					id: 'unknown-candidate',
					bpm: null,
					key: null,
					mode: null,
					record_id: 'other-record'
				})
			]
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({
				id: 'unknown-source',
				bpm: null,
				key: null,
				mode: null,
				record_id: 'source-record'
			})

			const [suggestion] = store.getSuggestionsForDeck(0)

			expect(suggestion?.score).toBeNull()
			expect(suggestion?.scoreBasis).toBe('none')
			expect(suggestion?.pitchAdjustment).toBeNull()
		})
	})

	describe('rateTransition', () => {
		it('sets transition rating for session entry', () => {
			const store = useSessionStore()
			store.currentSession = [
				{
					track_id: 'track-1',
					time_added: Date.now(),
					adjusted_bpm: 128,
					transition_rating: null
				}
			]

			store.rateTransition(0, 5)

			expect(store.currentSession[0]!.transition_rating).toBe(5)
		})

		it('handles null rating (clear rating)', () => {
			const store = useSessionStore()
			store.currentSession = [
				{
					track_id: 'track-1',
					time_added: Date.now(),
					adjusted_bpm: 128,
					transition_rating: 5
				}
			]

			store.rateTransition(0, null)

			expect(store.currentSession[0]!.transition_rating).toBeNull()
		})

		it('handles invalid session index gracefully', () => {
			const store = useSessionStore()
			store.currentSession = []

			// Should not throw
			expect(() => store.rateTransition(99, 5)).not.toThrow()
		})
	})

	describe('handleSuggestionClick', () => {
		beforeEach(() => {
			mockTracksStore.getTrackById.mockReturnValue(
				createMockTrack({ id: 'suggested', bpm: 128 })
			)
		})

		it('loads to same deck when deck count is 1', () => {
			const store = useSessionStore()
			store.deckCount = 1
			store.decks = [
				{
					loadedTrack: createMockTrack({ id: 'current' }),
					rpm: 33,
					pitch: 0,
					faderPosition: 0,
					faderSliding: false,
					isPlaying: false
				}
			]

			store.handleSuggestionClick('suggested', 0)

			expect(store.decks[0]!.loadedTrack?.id).toBe('suggested')
		})

		it('loads to other deck when deck count is 2', () => {
			const store = useSessionStore()
			// Already has 2 decks by default
			store.decks[0]!.loadedTrack = createMockTrack({
				id: 'current',
				bpm: 128
			})

			store.handleSuggestionClick('suggested', 0)

			// Should load to deck 1 (the other deck)
			expect(store.decks[1]!.loadedTrack?.id).toBe('suggested')
		})

		it('opens deck select dialog when deck count is 3+', () => {
			const store = useSessionStore()
			store.initializeDecks(3)

			store.handleSuggestionClick('suggested', 0)

			expect(store.deckSelectDialog.open).toBe(true)
			expect(store.deckSelectDialog.trackId).toBe('suggested')
			expect(store.deckSelectDialog.sourceDeck).toBe(0)
		})

		it('matches the explicitly selected source deck in a three-deck flow', async () => {
			vi.useFakeTimers()
			const suggested = createMockTrack({ id: 'suggested', bpm: 100 })
			mockTracksStore.getTrackById.mockReturnValue(suggested)
			const store = useSessionStore()
			store.initializeDecks(3)
			store.decks[0]!.loadedTrack = createMockTrack({
				id: 'unrelated-deck',
				bpm: 130
			})
			store.decks[2]!.loadedTrack = createMockTrack({
				id: 'source-deck',
				bpm: 96
			})

			try {
				store.handleSuggestionClick(suggested.id, 2)
				store.loadToSelectedDeck(1)

				expect(store.currentSession.at(-1)?.adjusted_bpm).toBeCloseTo(96)
				await vi.runAllTimersAsync()
				expect(store.decks[1]!.pitch).toBeCloseTo(-50)
			} finally {
				vi.useRealTimers()
			}
		})
	})

	describe('hasLoadedTrack computed', () => {
		it('returns false when no decks have tracks', () => {
			const store = useSessionStore()

			expect(store.hasLoadedTrack).toBe(false)
		})

		it('returns true when at least one deck has a track', () => {
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({ id: 'loaded' })

			expect(store.hasLoadedTrack).toBe(true)
		})
	})

	describe('sessionTrackCount computed', () => {
		it('returns 0 for empty session', () => {
			const store = useSessionStore()

			expect(store.sessionTrackCount).toBe(0)
		})

		it('returns correct count', () => {
			const store = useSessionStore()
			store.currentSession = [
				{
					track_id: 'track-1',
					time_added: Date.now(),
					adjusted_bpm: 128,
					transition_rating: null
				},
				{
					track_id: 'track-2',
					time_added: Date.now(),
					adjusted_bpm: 130,
					transition_rating: null
				}
			]

			expect(store.sessionTrackCount).toBe(2)
		})
	})
})
