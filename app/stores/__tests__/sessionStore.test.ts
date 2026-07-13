import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import {
	createMockTrack,
	createMockTrackWithBpm,
	createMockTrackWithKey,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../../../shared/types/database'
// Import after mocking
import { useSessionStore } from '../sessionStore'

const mockToast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: mockToast
}))

// Mock stores and dependencies
const mockTracksStore = {
	playableTracks: [] as ReturnType<typeof createMockTrack>[],
	getTrackById: vi.fn()
}

const mockUserStore = {
	profile: { turntable_pitch_range: 8 },
	supaUser: { id: 'test-user-id' } as { id: string } | null,
	get supaUserId() {
		return this.supaUser?.id ?? null
	}
}

function createMockQueryBuilder() {
	return {
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
}

let mockQueryBuilder = createMockQueryBuilder()

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder)
}

type SavedSetRow = Database['public']['Tables']['sets']['Row']

function createSavedSetRow(overrides: Partial<SavedSetRow> = {}): SavedSetRow {
	return {
		id: 'set-synthetic',
		user_id: 'test-user-id',
		name: 'Synthetic set',
		played_tracks: [],
		created_at: '2026-07-12T00:00:00.000Z',
		updated_at: '2026-07-12T00:00:00.000Z',
		...overrides
	}
}

function createSavedSet(overrides: Partial<SavedSetRow> = {}) {
	return { ...createSavedSetRow(overrides), played_tracks: [] }
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, reject, resolve }
}

// Stub Nuxt composables (these are auto-imported in the store)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)

describe('sessionStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetTrackIdCounter()
		setActivePinia(createPinia())

		// Reset mock stores
		mockQueryBuilder = createMockQueryBuilder()
		mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
		mockTracksStore.playableTracks = []
		mockTracksStore.getTrackById.mockReset()
		mockUserStore.profile = { turntable_pitch_range: 8 }
		mockUserStore.supaUser = { id: 'test-user-id' }
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

	describe('loadTrack', () => {
		it('sets the target deck to 45 RPM for a 45 RPM track', () => {
			const track = createMockTrack({ rpm: 45 })
			mockTracksStore.getTrackById.mockReturnValue(track)
			const store = useSessionStore()

			store.loadTrack(track.id, 0)

			expect(store.decks[0]!.rpm).toBe(45)
		})

		it('sets the target deck to 33 RPM for a 33 RPM track', () => {
			const track = createMockTrack({ rpm: 33 })
			mockTracksStore.getTrackById.mockReturnValue(track)
			const store = useSessionStore()
			store.decks[0]!.rpm = 45

			store.loadTrack(track.id, 0)

			expect(store.decks[0]!.rpm).toBe(33)
		})

		it.each([null, 78])(
			'preserves the target deck RPM for an unsupported %s RPM value',
			(rpm) => {
				const track = createMockTrack({ rpm })
				mockTracksStore.getTrackById.mockReturnValue(track)
				const store = useSessionStore()
				store.decks[0]!.rpm = 45

				store.loadTrack(track.id, 0)

				expect(store.decks[0]!.rpm).toBe(45)
			}
		)
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
		it('defaults load-track crate scope to all records', () => {
			const store = useSessionStore()

			expect(store.loadTrackCrateId).toBeNull()
		})

		it('preserves load-track crate scope', () => {
			const store = useSessionStore()
			store.loadTrackCrateId = 'crate-1'

			store.clearSession()

			expect(store.loadTrackCrateId).toBe('crate-1')
		})

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
			store.autoSaveError = 'Auto-save failed'

			store.clearSession()

			expect(store.decks[0]!.loadedTrack).toBeNull()
			expect(store.decks[0]!.pitch).toBe(0)
			expect(store.decks[0]!.isPlaying).toBe(false)
			expect(store.autoSaveError).toBeNull()
		})

		it('preserves saved-set selections and dialogs', () => {
			const store = useSessionStore()
			store.savedSets = [createSavedSet({ id: 'set-1' })]
			store.selectedSetId = 'set-1'
			store.showSetManager = true
			store.showSaveDialog = true

			store.clearSession()

			expect(store.savedSets).toHaveLength(1)
			expect(store.selectedSetId).toBe('set-1')
			expect(store.showSetManager).toBe(true)
			expect(store.showSaveDialog).toBe(true)
		})
	})

	describe('resetAccountState', () => {
		const playedEntry = {
			track_id: 'track-a',
			time_added: 1,
			adjusted_bpm: 128,
			transition_rating: 4
		}

		it('clears all account data while preserving device and panel preferences', () => {
			const store = useSessionStore()
			store.initializeDecks(3)
			store.showTurntableSim = false
			store.showHistory = false
			store.decks[0] = {
				loadedTrack: createMockTrack({ id: 'track-a' }),
				rpm: 45,
				pitch: 50,
				faderPosition: 50,
				faderSliding: true,
				isPlaying: true
			}
			store.currentSession = [playedEntry]
			store.savedSets = [createSavedSet({ id: 'set-a' })]
			store.activeSetId = 'set-a'
			store.selectedSetId = 'set-a'
			store.loadTrackCrateId = 'crate-a'
			store.deckSelectDialog = {
				open: true,
				trackId: 'track-a',
				sourceDeck: 0
			}
			store.showSetManager = true
			store.showSaveDialog = true
			store.isLoadingSets = true
			store.isSavingSession = true
			store.isAutoSaving = true
			store.autoSaveError = 'Old account error'

			store.resetAccountState()

			expect(store.currentSession).toEqual([])
			expect(store.savedSets).toEqual([])
			expect(store.activeSetId).toBeNull()
			expect(store.selectedSetId).toBeNull()
			expect(store.loadTrackCrateId).toBeNull()
			expect(store.deckSelectDialog).toEqual({
				open: false,
				trackId: '',
				sourceDeck: -1
			})
			expect(store.showSetManager).toBe(false)
			expect(store.showSaveDialog).toBe(false)
			expect(store.isLoadingSets).toBe(false)
			expect(store.isSavingSession).toBe(false)
			expect(store.isAutoSaving).toBe(false)
			expect(store.autoSaveError).toBeNull()
			expect(store.decks).toEqual([
				{
					loadedTrack: null,
					rpm: 33,
					pitch: 0,
					faderPosition: 0,
					faderSliding: false,
					isPlaying: false
				},
				{
					loadedTrack: null,
					rpm: 33,
					pitch: 0,
					faderPosition: 0,
					faderSliding: false,
					isPlaying: false
				},
				{
					loadedTrack: null,
					rpm: 33,
					pitch: 0,
					faderPosition: 0,
					faderSliding: false,
					isPlaying: false
				}
			])
			expect(store.deckCount).toBe(3)
			expect(store.showTurntableSim).toBe(false)
			expect(store.showHistory).toBe(false)
		})

		it('cancels a scheduled auto-save before it can write', async () => {
			vi.useFakeTimers()
			const store = useSessionStore()

			try {
				store.currentSession = [playedEntry]
				await nextTick()
				expect(vi.getTimerCount()).toBe(1)

				store.resetAccountState()
				await vi.advanceTimersByTimeAsync(2000)

				expect(mockSupabaseClient.from).not.toHaveBeenCalled()
				expect(mockQueryBuilder.insert).not.toHaveBeenCalled()
				expect(mockQueryBuilder.update).not.toHaveBeenCalled()
				expect(mockToast.error).not.toHaveBeenCalled()
				expect(mockToast.success).not.toHaveBeenCalled()
			} finally {
				vi.useRealTimers()
			}
		})

		it('keeps the new account fetch when an old fetch settles last', async () => {
			const oldFetch = createDeferred<{
				data: SavedSetRow[]
				error: null
			}>()
			const newFetch = createDeferred<{
				data: SavedSetRow[]
				error: null
			}>()
			mockQueryBuilder.order
				.mockReturnValueOnce(oldFetch.promise)
				.mockReturnValueOnce(newFetch.promise)
			const store = useSessionStore()

			const oldPromise = store.fetchSavedSets()
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				1,
				'user_id',
				'test-user-id'
			)

			store.resetAccountState()
			mockUserStore.supaUser = { id: 'user-b' }
			const newPromise = store.fetchSavedSets()
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				2,
				'user_id',
				'user-b'
			)

			newFetch.resolve({
				data: [createSavedSetRow({ id: 'set-b', user_id: 'user-b' })],
				error: null
			})
			await newPromise
			expect(store.savedSets.map((set) => set.id)).toEqual(['set-b'])

			oldFetch.resolve({
				data: [createSavedSetRow({ id: 'set-a' })],
				error: null
			})
			await oldPromise

			expect(store.savedSets.map((set) => set.id)).toEqual(['set-b'])
			expect(store.isLoadingSets).toBe(false)
			expect(mockToast.error).not.toHaveBeenCalled()
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('ignores a late auto-save response from the reset account', async () => {
			vi.useFakeTimers()
			const autoSave = createDeferred<{
				data: { id: string }
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(autoSave.promise)
			const store = useSessionStore()

			try {
				store.currentSession = [playedEntry]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)
				expect(mockQueryBuilder.insert).toHaveBeenCalledWith({
					user_id: 'test-user-id',
					name: null,
					played_tracks: [playedEntry]
				})

				store.resetAccountState()
				mockUserStore.supaUser = { id: 'user-b' }
				store.activeSetId = 'set-b'
				autoSave.resolve({ data: { id: 'set-a' }, error: null })
				await Promise.resolve()
				await Promise.resolve()

				expect(store.activeSetId).toBe('set-b')
				expect(store.isAutoSaving).toBe(false)
				expect(store.autoSaveError).toBeNull()
				expect(mockToast.error).not.toHaveBeenCalled()
			} finally {
				vi.useRealTimers()
			}
		})

		it('ignores a late manual save from the reset account', async () => {
			const oldSave = createDeferred<{
				data: SavedSetRow
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(oldSave.promise)
			const store = useSessionStore()
			store.currentSession = [playedEntry]
			store.activeSetId = 'set-a'
			store.showSaveDialog = true

			const savePromise = store.saveSession('Old account set')
			expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'set-a')
			store.resetAccountState()
			mockUserStore.supaUser = { id: 'user-b' }
			store.savedSets = [createSavedSet({ id: 'set-b', user_id: 'user-b' })]
			store.activeSetId = 'set-b'
			store.showSaveDialog = true
			store.isSavingSession = true

			oldSave.resolve({
				data: createSavedSetRow({ id: 'set-a' }),
				error: null
			})

			await expect(savePromise).resolves.toBeNull()
			expect(store.savedSets.map((set) => set.id)).toEqual(['set-b'])
			expect(store.activeSetId).toBe('set-b')
			expect(store.showSaveDialog).toBe(true)
			expect(store.isSavingSession).toBe(true)
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('ignores a late delete from the reset account', async () => {
			const oldDelete = createDeferred<{ data: null; error: null }>()
			mockQueryBuilder.eq.mockReturnValueOnce(oldDelete.promise)
			const store = useSessionStore()
			store.savedSets = [createSavedSet({ id: 'set-a' })]
			store.activeSetId = 'set-a'
			store.selectedSetId = 'set-a'

			const deletePromise = store.deleteSet('set-a')
			store.resetAccountState()
			mockUserStore.supaUser = { id: 'user-b' }
			store.savedSets = [createSavedSet({ id: 'set-b', user_id: 'user-b' })]
			store.activeSetId = 'set-b'
			store.selectedSetId = 'set-b'
			oldDelete.resolve({ data: null, error: null })
			await deletePromise

			expect(store.savedSets.map((set) => set.id)).toEqual(['set-b'])
			expect(store.activeSetId).toBe('set-b')
			expect(store.selectedSetId).toBe('set-b')
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
		})
	})

	describe('saved-set persistence', () => {
		const firstEntry = {
			track_id: 'track-first',
			time_added: 0,
			adjusted_bpm: 0,
			transition_rating: 1
		}
		const secondEntry = {
			track_id: 'track-second',
			time_added: 1,
			adjusted_bpm: null,
			transition_rating: 5
		}

		it('decodes fetched sets, preserves mixed-entry order, and warns once', async () => {
			const privateValue = 'SYNTHETIC_PRIVATE_VALUE'
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useSessionStore()
			mockQueryBuilder.order.mockResolvedValue({
				data: [
					createSavedSetRow({
						id: 'set-invalid-array',
						played_tracks: { privateValue }
					}),
					createSavedSetRow({
						id: 'set-mixed-array',
						played_tracks: [
							firstEntry,
							{
								track_id: '',
								time_added: 2,
								adjusted_bpm: null,
								transition_rating: null,
								privateValue
							},
							secondEntry
						]
					})
				],
				error: null
			})

			try {
				await store.fetchSavedSets()

				expect(store.savedSets[0]!.played_tracks).toEqual([])
				expect(store.savedSets[1]!.played_tracks).toEqual([
					firstEntry,
					secondEntry
				])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(consoleWarn).toHaveBeenCalledWith(
					'Invalid saved data was reset to safe defaults',
					[
						{
							entity: 'saved-set',
							id: 'set-invalid-array',
							field: 'played_tracks'
						},
						{
							entity: 'saved-set',
							id: 'set-mixed-array',
							field: 'played_tracks'
						}
					]
				)
				expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain(
					privateValue
				)
				expect(mockToast.warning).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledWith(
					'Some saved data was reset to safe defaults.'
				)
			} finally {
				consoleWarn.mockRestore()
			}
		})

		it('decodes an updated save response before assignment', async () => {
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useSessionStore()
			store.activeSetId = 'set-update'
			store.currentSession = [firstEntry]
			mockQueryBuilder.single.mockResolvedValue({
				data: createSavedSetRow({
					id: 'set-update',
					played_tracks: 'invalid'
				}),
				error: null
			})

			try {
				const savedSet = await store.saveSession('Updated set')

				expect(savedSet?.played_tracks).toEqual([])
				expect(store.savedSets[0]!.played_tracks).toEqual([])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledOnce()
			} finally {
				consoleWarn.mockRestore()
			}
		})

		it('decodes an inserted save response and retains valid mixed entries', async () => {
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useSessionStore()
			store.currentSession = [firstEntry]
			mockQueryBuilder.single.mockResolvedValue({
				data: createSavedSetRow({
					id: 'set-insert',
					played_tracks: [
						firstEntry,
						{
							track_id: 'invalid',
							time_added: -1,
							adjusted_bpm: null,
							transition_rating: null
						},
						secondEntry
					]
				}),
				error: null
			})

			try {
				const savedSet = await store.saveSession('Inserted set')

				expect(savedSet?.played_tracks).toEqual([firstEntry, secondEntry])
				expect(store.savedSets[0]!.played_tracks).toEqual([
					firstEntry,
					secondEntry
				])
				expect(store.activeSetId).toBe('set-insert')
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(mockToast.warning).toHaveBeenCalledOnce()
			} finally {
				consoleWarn.mockRestore()
			}
		})
	})

	describe('clearSavedSetTracks', () => {
		it('empties played tracks while preserving set rows and metadata', () => {
			const store = useSessionStore()
			store.savedSets = [
				{
					...createSavedSetRow({ id: 'set-1', name: 'Keep this name' }),
					played_tracks: [
						{
							track_id: 'track-1',
							time_added: 10,
							adjusted_bpm: 128,
							transition_rating: 4
						}
					]
				},
				{
					...createSavedSetRow({ id: 'set-2', name: null }),
					played_tracks: []
				}
			]
			const originalSets = store.savedSets

			store.clearSavedSetTracks()

			expect(store.savedSets).not.toBe(originalSets)
			expect(store.savedSets).toHaveLength(2)
			expect(store.savedSets.map((set) => set.played_tracks)).toEqual([[], []])
			expect(store.savedSets[0]).toMatchObject({
				id: 'set-1',
				name: 'Keep this name'
			})
		})
	})

	describe('auto-save failures', () => {
		it('surfaces create auto-save failures and clears the error after a successful retry', async () => {
			vi.useFakeTimers()
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Insert failed')
				})
				.mockResolvedValueOnce({
					data: { id: 'set-1' },
					error: null
				})
			const store = useSessionStore()

			try {
				store.currentSession = [
					{
						track_id: 'track-1',
						time_added: Date.now(),
						adjusted_bpm: 128,
						transition_rating: null
					}
				]
				await vi.advanceTimersByTimeAsync(2000)

				expect(store.autoSaveError).toBe(
					'Auto-save failed. Your current session is not saved yet.'
				)
				expect(store.activeSetId).toBeNull()

				store.currentSession = [
					...store.currentSession,
					{
						track_id: 'track-2',
						time_added: Date.now(),
						adjusted_bpm: 129,
						transition_rating: null
					}
				]
				await vi.advanceTimersByTimeAsync(2000)

				expect(store.activeSetId).toBe('set-1')
				expect(store.autoSaveError).toBeNull()
			} finally {
				vi.useRealTimers()
			}
		})

		it('surfaces update auto-save failures and clears the error after a successful retry', async () => {
			vi.useFakeTimers()
			mockQueryBuilder.eq
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Update failed')
				})
				.mockResolvedValueOnce({
					data: null,
					error: null
				})
			const store = useSessionStore()
			store.activeSetId = 'set-1'

			try {
				store.currentSession = [
					{
						track_id: 'track-1',
						time_added: Date.now(),
						adjusted_bpm: 128,
						transition_rating: null
					}
				]
				await vi.advanceTimersByTimeAsync(2000)

				expect(store.autoSaveError).toBe(
					'Auto-save failed. Your current session is not saved yet.'
				)

				store.currentSession = [
					...store.currentSession,
					{
						track_id: 'track-2',
						time_added: Date.now(),
						adjusted_bpm: 129,
						transition_rating: null
					}
				]
				await vi.advanceTimersByTimeAsync(2000)

				expect(store.autoSaveError).toBeNull()
			} finally {
				vi.useRealTimers()
			}
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
