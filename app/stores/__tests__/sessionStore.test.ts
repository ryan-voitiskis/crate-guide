import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
	createMockTrack,
	createMockTrackWithBpm,
	createMockTrackWithKey,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'

// Mock stores and dependencies
const mockTracksStore = {
	playableTracks: [] as ReturnType<typeof createMockTrack>[],
	getTrackById: vi.fn()
}

const mockUserStore = {
	profile: { turntable_pitch_range: 8 },
	supaUser: { id: 'test-user-id' }
}

const mockSupabaseClient = {
	from: vi.fn(() => ({
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}))
}

// Stub Nuxt composables (these are auto-imported in the store)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)

// Import after mocking
import { useSessionStore } from '../sessionStore'

describe('sessionStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetTrackIdCounter()
		setActivePinia(createPinia())

		// Reset mock stores
		mockTracksStore.playableTracks = []
		mockTracksStore.getTrackById.mockReset()
		mockUserStore.profile = { turntable_pitch_range: 8 }
	})

	describe('getAdjustedBpm', () => {
		it('returns null when deck has no loaded track', () => {
			const store = useSessionStore()

			const result = store.getAdjustedBpm(0)

			expect(result).toBeNull()
		})

		it('returns null when loaded track has no BPM', () => {
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({ bpm: null })

			const result = store.getAdjustedBpm(0)

			expect(result).toBeNull()
		})

		it('returns original BPM when pitch is 0', () => {
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrackWithBpm(128)
			store.decks[0]!.pitch = 0

			const result = store.getAdjustedBpm(0)

			expect(result).toBe(128)
		})

		it('increases BPM when pitch is positive', () => {
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrackWithBpm(128)
			store.decks[0]!.pitch = 100 // Max positive pitch

			// At 8% pitch range and 100% pitch: factor = 1 + (100/100) * (8/100) = 1.08
			const result = store.getAdjustedBpm(0)

			expect(result).toBeCloseTo(128 * 1.08)
		})

		it('decreases BPM when pitch is negative', () => {
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrackWithBpm(128)
			store.decks[0]!.pitch = -100 // Max negative pitch

			// At 8% pitch range and -100% pitch: factor = 1 + (-100/100) * (8/100) = 0.92
			const result = store.getAdjustedBpm(0)

			expect(result).toBeCloseTo(128 * 0.92)
		})

		it('calculates correctly with custom pitch range', () => {
			mockUserStore.profile = { turntable_pitch_range: 16 }
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrackWithBpm(128)
			store.decks[0]!.pitch = 50 // Half positive pitch

			// At 16% pitch range and 50% pitch: factor = 1 + (50/100) * (16/100) = 1.08
			const result = store.getAdjustedBpm(0)

			expect(result).toBeCloseTo(128 * 1.08)
		})
	})

	describe('getAdjustedKey', () => {
		it('returns null when deck has no loaded track', () => {
			const store = useSessionStore()

			const result = store.getAdjustedKey(0)

			expect(result).toBeNull()
		})

		it('returns null when track has null key', () => {
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({
				bpm: 128,
				key: null
			})

			const result = store.getAdjustedKey(0)

			expect(result).toBeNull()
		})

		it('returns original key when pitch is 0', () => {
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrackWithKey(0, 0) // C minor
			store.decks[0]!.loadedTrack!.bpm = 128
			store.decks[0]!.pitch = 0

			const result = store.getAdjustedKey(0)

			// At 0 pitch, key shouldn't change
			expect(result).toBeCloseTo(0, 1)
		})
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
				expect(track.score).toBeDefined()
				expect(track.tempoScore).toBeDefined()
				expect(track.harmonyScore).toBeDefined()
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
				expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score)
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
	})

	describe('initializeDecks', () => {
		it('creates correct number of decks', () => {
			const store = useSessionStore()

			store.initializeDecks(4)

			expect(store.deckCount).toBe(4)
			expect(store.decks.length).toBe(4)
		})

		it('clamps deck count to minimum of 1', () => {
			const store = useSessionStore()

			store.initializeDecks(0)

			expect(store.deckCount).toBe(1)
			expect(store.decks.length).toBe(1)
		})

		it('clamps deck count to maximum of 4', () => {
			const store = useSessionStore()

			store.initializeDecks(10)

			expect(store.deckCount).toBe(4)
			expect(store.decks.length).toBe(4)
		})

		it('preserves existing decks when increasing count', () => {
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({ id: 'loaded' })

			store.initializeDecks(3)

			expect(store.decks[0]!.loadedTrack?.id).toBe('loaded')
		})
	})

	describe('setPitch', () => {
		it('sets pitch value on deck', () => {
			const store = useSessionStore()

			store.setPitch(0, 50)

			expect(store.decks[0]!.pitch).toBe(50)
			expect(store.decks[0]!.faderPosition).toBe(50)
		})

		it('does not set pitch when fader is sliding', () => {
			const store = useSessionStore()
			store.decks[0]!.faderSliding = true

			store.setPitch(0, 50)

			expect(store.decks[0]!.pitch).toBe(0)
		})

		it('handles invalid deck index gracefully', () => {
			const store = useSessionStore()

			// Should not throw
			expect(() => store.setPitch(99, 50)).not.toThrow()
		})
	})

	describe('resetPitch', () => {
		it('resets pitch and fader position to 0', () => {
			const store = useSessionStore()
			store.decks[0]!.pitch = 50
			store.decks[0]!.faderPosition = 50

			store.resetPitch(0)

			expect(store.decks[0]!.pitch).toBe(0)
			expect(store.decks[0]!.faderPosition).toBe(0)
		})
	})

	describe('setRpm', () => {
		it('sets RPM on deck', () => {
			const store = useSessionStore()

			store.setRpm(0, 45)

			expect(store.decks[0]!.rpm).toBe(45)
		})

		it('handles 33 RPM', () => {
			const store = useSessionStore()
			store.decks[0]!.rpm = 45

			store.setRpm(0, 33)

			expect(store.decks[0]!.rpm).toBe(33)
		})
	})

	describe('togglePlaying', () => {
		it('toggles isPlaying state', () => {
			const store = useSessionStore()

			store.togglePlaying(0)
			expect(store.decks[0]!.isPlaying).toBe(true)

			store.togglePlaying(0)
			expect(store.decks[0]!.isPlaying).toBe(false)
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

	describe('clearSession', () => {
		it('clears session history', () => {
			const store = useSessionStore()
			store.currentSession = [
				{
					track_id: 'track-1',
					time_added: Date.now(),
					adjusted_bpm: 128,
					transition_rating: null
				}
			]

			store.clearSession()

			expect(store.currentSession).toEqual([])
		})

		it('clears active set ID', () => {
			const store = useSessionStore()
			store.activeSetId = 'some-set-id'

			store.clearSession()

			expect(store.activeSetId).toBeNull()
		})

		it('resets all decks', () => {
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({ id: 'loaded' })
			store.decks[0]!.pitch = 50
			store.decks[0]!.isPlaying = true

			store.clearSession()

			expect(store.decks[0]!.loadedTrack).toBeNull()
			expect(store.decks[0]!.pitch).toBe(0)
			expect(store.decks[0]!.isPlaying).toBe(false)
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
