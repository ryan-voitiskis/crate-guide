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
		lt: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue({ data: [], error: null }),
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

async function flushAsyncWork() {
	for (let index = 0; index < 8; index += 1) {
		await Promise.resolve()
	}
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

		it('adjusts a known key even when BPM is unavailable', () => {
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({
				bpm: null,
				key: 0,
				mode: 0
			})
			store.decks[0]!.pitch = 0

			expect(store.getAdjustedKey(0)).toBeCloseTo(0, 1)
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

	describe('slideFader', () => {
		it('reaches the target and releases the fader after a normal animation', async () => {
			vi.useFakeTimers()
			const store = useSessionStore()

			try {
				const animation = store.slideFader(0, 10)
				expect(store.decks[0]!.faderSliding).toBe(true)

				await vi.runAllTimersAsync()
				await animation

				expect(store.decks[0]!.pitch).toBe(10)
				expect(store.decks[0]!.faderPosition).toBe(10)
				expect(store.decks[0]!.faderSliding).toBe(false)
			} finally {
				vi.useRealTimers()
			}
		})

		it('lets a second animation supersede the first target', async () => {
			vi.useFakeTimers()
			const store = useSessionStore()

			try {
				const firstAnimation = store.slideFader(0, 20)
				await vi.advanceTimersByTimeAsync(10)
				const secondAnimation = store.slideFader(0, -10)

				await vi.runAllTimersAsync()
				await Promise.all([firstAnimation, secondAnimation])

				expect(store.decks[0]!.pitch).toBe(-10)
				expect(store.decks[0]!.faderPosition).toBe(-10)
				expect(store.decks[0]!.faderSliding).toBe(false)
			} finally {
				vi.useRealTimers()
			}
		})

		it('keeps pitch reset after pending animation timers drain', async () => {
			vi.useFakeTimers()
			const store = useSessionStore()

			try {
				const animation = store.slideFader(0, 20)
				await vi.advanceTimersByTimeAsync(10)

				store.resetPitch(0)
				expect(store.decks[0]!.faderSliding).toBe(false)

				await vi.runAllTimersAsync()
				await animation

				expect(store.decks[0]!.pitch).toBe(0)
				expect(store.decks[0]!.faderPosition).toBe(0)
				expect(store.decks[0]!.faderSliding).toBe(false)
			} finally {
				vi.useRealTimers()
			}
		})

		it('keeps an unloaded deck reset after pending animation timers drain', async () => {
			vi.useFakeTimers()
			const store = useSessionStore()
			store.decks[0]!.loadedTrack = createMockTrack({ id: 'loaded' })
			store.decks[0]!.isPlaying = true

			try {
				const animation = store.slideFader(0, 20)
				await vi.advanceTimersByTimeAsync(10)

				store.unloadDeck(0)

				await vi.runAllTimersAsync()
				await animation

				expect(store.decks[0]!.loadedTrack).toBeNull()
				expect(store.decks[0]!.pitch).toBe(0)
				expect(store.decks[0]!.faderPosition).toBe(0)
				expect(store.decks[0]!.faderSliding).toBe(false)
				expect(store.decks[0]!.isPlaying).toBe(false)
			} finally {
				vi.useRealTimers()
			}
		})

		it.each(['clearSession', 'resetAccountState'] as const)(
			'%s prevents a pending animation from committing',
			async (resetAction) => {
				vi.useFakeTimers()
				const store = useSessionStore()

				try {
					const animation = store.slideFader(0, 20)
					await vi.advanceTimersByTimeAsync(10)

					store[resetAction]()

					await vi.runAllTimersAsync()
					await animation

					expect(store.decks[0]!.pitch).toBe(0)
					expect(store.decks[0]!.faderPosition).toBe(0)
					expect(store.decks[0]!.faderSliding).toBe(false)
				} finally {
					vi.useRealTimers()
				}
			}
		)

		it('protects a regrown deck slot from a removed deck animation', async () => {
			vi.useFakeTimers()
			const store = useSessionStore()
			store.initializeDecks(3)
			const removedDeck = store.decks[2]!

			try {
				const animation = store.slideFader(2, 20)
				await vi.advanceTimersByTimeAsync(10)

				store.initializeDecks(2)
				store.initializeDecks(3)
				const replacementDeck = store.decks[2]!
				expect(replacementDeck).not.toBe(removedDeck)

				await vi.runAllTimersAsync()
				await animation

				expect(replacementDeck.pitch).toBe(0)
				expect(replacementDeck.faderPosition).toBe(0)
				expect(replacementDeck.faderSliding).toBe(false)
			} finally {
				vi.useRealTimers()
			}
		})

		it('does not let an obsolete completion release a newer animation', async () => {
			vi.useFakeTimers()
			const store = useSessionStore()

			try {
				const firstAnimation = store.slideFader(0, 4)
				const secondAnimation = store.slideFader(0, 20)

				await vi.advanceTimersByTimeAsync(10)
				await firstAnimation
				expect(store.decks[0]!.faderSliding).toBe(true)
				expect(store.decks[0]!.pitch).toBe(0)

				await vi.runAllTimersAsync()
				await secondAnimation

				expect(store.decks[0]!.pitch).toBe(20)
				expect(store.decks[0]!.faderPosition).toBe(20)
				expect(store.decks[0]!.faderSliding).toBe(false)
			} finally {
				vi.useRealTimers()
			}
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

		it('cancels obsolete fader work when loading without tempo matching', async () => {
			vi.useFakeTimers()
			const replacementTrack = createMockTrack({
				id: 'replacement-track',
				bpm: 120
			})
			mockTracksStore.getTrackById.mockReturnValue(replacementTrack)
			const store = useSessionStore()
			const deck = store.decks[0]!
			deck.loadedTrack = createMockTrack({ id: 'original-track', bpm: 128 })
			deck.pitch = 7
			deck.faderPosition = 7

			try {
				const obsoleteAnimation = store.slideFader(0, 20)
				await vi.advanceTimersByTimeAsync(10)
				expect(deck.faderPosition).not.toBe(7)

				store.loadTrack(replacementTrack.id, 0)

				expect(deck.loadedTrack?.id).toBe(replacementTrack.id)
				expect(deck.pitch).toBe(7)
				expect(deck.faderPosition).toBe(7)
				expect(deck.faderSliding).toBe(false)

				await vi.advanceTimersByTimeAsync(200)
				await obsoleteAnimation

				expect(deck.pitch).toBe(7)
				expect(deck.faderPosition).toBe(7)
				expect(deck.faderSliding).toBe(false)
				expect(store.currentSession.at(-1)?.adjusted_bpm).toBe(120)
			} finally {
				vi.clearAllTimers()
				vi.useRealTimers()
			}
		})

		it('lets a requested tempo match own the replacement animation', async () => {
			vi.useFakeTimers()
			const replacementTrack = createMockTrack({
				id: 'replacement-track',
				bpm: 100
			})
			mockTracksStore.getTrackById.mockReturnValue(replacementTrack)
			const store = useSessionStore()
			const deck = store.decks[0]!
			deck.loadedTrack = createMockTrack({ id: 'original-track', bpm: 128 })
			deck.pitch = 10
			deck.faderPosition = 10
			store.decks[1]!.loadedTrack = createMockTrack({
				id: 'matching-track',
				bpm: 102
			})

			try {
				const obsoleteAnimation = store.slideFader(0, -20)
				await vi.advanceTimersByTimeAsync(10)

				store.loadTrack(replacementTrack.id, 0, true)

				expect(deck.loadedTrack?.id).toBe(replacementTrack.id)
				expect(deck.pitch).toBe(10)
				expect(deck.faderSliding).toBe(true)

				await vi.advanceTimersByTimeAsync(10)
				await obsoleteAnimation
				expect(deck.pitch).toBe(10)
				expect(deck.faderSliding).toBe(true)

				await vi.advanceTimersByTimeAsync(500)

				expect(deck.pitch).toBeCloseTo(25)
				expect(deck.faderPosition).toBeCloseTo(25)
				expect(deck.faderSliding).toBe(false)
				expect(store.currentSession.at(-1)?.adjusted_bpm).toBe(102)
			} finally {
				vi.clearAllTimers()
				vi.useRealTimers()
			}
		})

		it.each([
			{ label: 'missing track', trackExists: false, deckIndex: 0 },
			{ label: 'missing deck', trackExists: true, deckIndex: 99 }
		])(
			'leaves valid fader work untouched for a $label request',
			async ({ trackExists, deckIndex }) => {
				vi.useFakeTimers()
				const requestedTrack = createMockTrack({ id: 'requested-track' })
				mockTracksStore.getTrackById.mockReturnValue(
					trackExists ? requestedTrack : undefined
				)
				const store = useSessionStore()
				const deck = store.decks[0]!
				const originalTrack = createMockTrack({ id: 'original-track' })
				deck.loadedTrack = originalTrack

				try {
					const animation = store.slideFader(0, 10)
					await vi.advanceTimersByTimeAsync(10)

					store.loadTrack(requestedTrack.id, deckIndex)

					await vi.advanceTimersByTimeAsync(200)
					await animation

					expect(deck.loadedTrack?.id).toBe(originalTrack.id)
					expect(deck.pitch).toBe(10)
					expect(deck.faderPosition).toBe(10)
					expect(deck.faderSliding).toBe(false)
					expect(store.currentSession).toEqual([])
				} finally {
					vi.clearAllTimers()
					vi.useRealTimers()
				}
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

		it('drops a queued autosave update when the session is cleared', async () => {
			vi.useFakeTimers()
			const update = createDeferred<{ data: null; error: null }>()
			const firstEntry = {
				track_id: 'track-first',
				time_added: 1,
				adjusted_bpm: 128,
				transition_rating: null
			}
			const secondEntry = {
				track_id: 'track-second',
				time_added: 2,
				adjusted_bpm: 129,
				transition_rating: 4
			}
			mockQueryBuilder.eq.mockReturnValueOnce(update.promise)
			const store = useSessionStore()
			store.activeSetId = 'set-active'

			try {
				store.currentSession = [firstEntry]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)
				store.currentSession = [firstEntry, secondEntry]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)
				expect(mockQueryBuilder.update).toHaveBeenCalledOnce()

				store.clearSession()
				update.resolve({ data: null, error: null })
				await flushAsyncWork()

				expect(mockQueryBuilder.update).toHaveBeenCalledOnce()
				expect(store.currentSession).toEqual([])
				expect(store.activeSetId).toBeNull()
				expect(store.isAutoSaving).toBe(false)
				expect(store.autoSaveError).toBeNull()
				expect(mockToast.error).not.toHaveBeenCalled()
				expect(mockToast.success).not.toHaveBeenCalled()
			} finally {
				vi.useRealTimers()
			}
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
			mockQueryBuilder.limit
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
				store.currentSession = [
					playedEntry,
					{
						...playedEntry,
						track_id: 'track-b',
						time_added: 2
					}
				]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)
				const queuedManualSave = store.saveSession('Queued old account set')
				expect(mockQueryBuilder.insert).toHaveBeenCalledOnce()

				store.resetAccountState()
				await expect(queuedManualSave).resolves.toBeNull()
				mockUserStore.supaUser = { id: 'user-b' }
				store.activeSetId = 'set-b'
				autoSave.resolve({ data: { id: 'set-a' }, error: null })
				await flushAsyncWork()

				expect(mockQueryBuilder.insert).toHaveBeenCalledOnce()
				expect(mockQueryBuilder.update).not.toHaveBeenCalled()
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

		it('loads 1001 saved sets with stable ordering and exact keyset pages', async () => {
			const store = useSessionStore()
			const firstPage = Array.from({ length: 1000 }, (_, index) =>
				createSavedSetRow({
					id: `set-${String(1001 - index).padStart(4, '0')}`
				})
			)
			const secondPage = [createSavedSetRow({ id: 'set-0001' })]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({ data: firstPage, error: null })
				.mockResolvedValueOnce({ data: secondPage, error: null })

			await store.fetchSavedSets()

			expect(store.savedSets.map((set) => set.id)).toEqual([
				...firstPage.map((set) => set.id),
				'set-0001'
			])
			expect(mockQueryBuilder.order.mock.calls).toEqual([
				['id', { ascending: false }],
				['id', { ascending: false }]
			])
			expect(mockQueryBuilder.lt.mock.calls).toEqual([['id', 'set-0002']])
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])
		})

		it('restores exact timestamp presentation order after ID traversal', async () => {
			const store = useSessionStore()
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
					createSavedSetRow({
						id: 'set-z-invalid',
						created_at: 'invalid'
					}),
					createSavedSetRow({ id: 'set-y-null', created_at: null }),
					createSavedSetRow({
						id: 'set-x-tie',
						created_at: '2026-07-19T14:00:00.123456+10:00'
					}),
					createSavedSetRow({
						id: 'set-w-newest',
						created_at: '2026-07-19T04:00:00.123457Z'
					}),
					createSavedSetRow({
						id: 'set-v-tie',
						created_at: '2026-07-18 20:00:00.123456-08:00'
					}),
					createSavedSetRow({
						id: 'set-u-older',
						created_at: '2026-07-19T04:00:00.123455Z'
					})
				],
				error: null
			})

			await store.fetchSavedSets()

			expect(store.savedSets.map(({ id }) => id)).toEqual([
				'set-w-newest',
				'set-x-tie',
				'set-v-tie',
				'set-u-older',
				'set-z-invalid',
				'set-y-null'
			])
		})

		it('preserves prior saved sets when a later page fails', async () => {
			const store = useSessionStore()
			const existingSet = createSavedSet({ id: 'existing-set' })
			store.savedSets = [existingSet]
			mockQueryBuilder.limit
				.mockResolvedValueOnce({
					data: Array.from({ length: 1000 }, (_, index) =>
						createSavedSetRow({
							id: `set-${String(1000 - index).padStart(4, '0')}`
						})
					),
					error: null
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Second page failed')
				})

			await store.fetchSavedSets()

			expect(store.savedSets).toEqual([existingSet])
			expect(mockQueryBuilder.lt).toHaveBeenCalledWith('id', 'set-0001')
			expect(mockQueryBuilder.limit.mock.calls).toEqual([[1000], [1000]])
			expect(mockToast.error).toHaveBeenCalledWith('Failed to load saved sets')
		})

		it('preserves and deduplicates same-account saves on both sides of the cursor', async () => {
			const fetchResponse = createDeferred<{
				data: SavedSetRow[]
				error: null
			}>()
			const firstPage = Array.from({ length: 1000 }, (_, index) =>
				createSavedSetRow({
					id: `set-m-${String(1000 - index).padStart(4, '0')}`,
					created_at: '2026-07-12T00:00:00.000001Z'
				})
			)
			mockQueryBuilder.limit
				.mockResolvedValueOnce({ data: firstPage, error: null })
				.mockReturnValueOnce(fetchResponse.promise)
			const createdAboveCursor = createSavedSetRow({
				id: 'set-z-created-locally',
				created_at: '2026-07-12T00:00:00.000004Z',
				played_tracks: [firstEntry]
			})
			const createdBelowCursor = createSavedSetRow({
				id: 'set-a-local',
				created_at: '2026-07-12T00:00:00.000003Z',
				played_tracks: [firstEntry]
			})
			mockQueryBuilder.single
				.mockResolvedValueOnce({ data: createdAboveCursor, error: null })
				.mockResolvedValueOnce({ data: createdBelowCursor, error: null })
			const store = useSessionStore()
			store.currentSession = [firstEntry]

			const fetchPromise = store.fetchSavedSets()
			await vi.waitFor(() =>
				expect(mockQueryBuilder.limit).toHaveBeenCalledTimes(2)
			)
			await expect(store.saveSession('Above cursor')).resolves.toEqual(
				createdAboveCursor
			)
			store.activeSetId = null
			await expect(store.saveSession('Below cursor')).resolves.toEqual(
				createdBelowCursor
			)

			fetchResponse.resolve({
				data: [
					createSavedSetRow({
						id: 'set-a-local',
						name: 'Authoritative fetched copy',
						created_at: '2026-07-12T00:00:00.000003Z'
					}),
					createSavedSetRow({
						id: 'set-a-fetched',
						created_at: '2026-07-12T00:00:00.000001Z'
					})
				],
				error: null
			})
			await fetchPromise

			const ids = store.savedSets.map(({ id }) => id)
			expect(ids.slice(0, 2)).toEqual(['set-z-created-locally', 'set-a-local'])
			expect(ids).toContain('set-a-fetched')
			expect(ids.filter((id) => id === 'set-a-local')).toHaveLength(1)
			expect(store.savedSets.find(({ id }) => id === 'set-a-local')?.name).toBe(
				'Authoritative fetched copy'
			)
		})

		it('decodes fetched sets, preserves mixed-entry order, and warns once', async () => {
			const privateValue = 'SYNTHETIC_PRIVATE_VALUE'
			const consoleWarn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined)
			const store = useSessionStore()
			mockQueryBuilder.limit.mockResolvedValue({
				data: [
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
					}),
					createSavedSetRow({
						id: 'set-invalid-array',
						played_tracks: { privateValue }
					})
				],
				error: null
			})

			try {
				await store.fetchSavedSets()

				expect(store.savedSets[0]!.played_tracks).toEqual([
					firstEntry,
					secondEntry
				])
				expect(store.savedSets[1]!.played_tracks).toEqual([])
				expect(consoleWarn).toHaveBeenCalledOnce()
				expect(consoleWarn).toHaveBeenCalledWith(
					'Invalid saved data was reset to safe defaults',
					[
						{
							entity: 'saved-set',
							id: 'set-mixed-array',
							field: 'played_tracks'
						},
						{
							entity: 'saved-set',
							id: 'set-invalid-array',
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

	describe('session write queue', () => {
		const firstEntry = {
			track_id: 'track-first',
			time_added: 1,
			adjusted_bpm: 128,
			transition_rating: null
		}
		const secondEntry = {
			track_id: 'track-second',
			time_added: 2,
			adjusted_bpm: 129,
			transition_rating: 4
		}
		const thirdEntry = {
			track_id: 'track-third',
			time_added: 3,
			adjusted_bpm: null,
			transition_rating: 5
		}

		it('serializes a slow initial autosave and updates the created set with the latest snapshot', async () => {
			vi.useFakeTimers()
			const insert = createDeferred<{
				data: { id: string }
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(insert.promise)
			const store = useSessionStore()

			try {
				store.currentSession = [firstEntry]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)

				store.currentSession = [firstEntry, secondEntry]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)

				expect(mockQueryBuilder.insert).toHaveBeenCalledOnce()
				expect(mockQueryBuilder.insert).toHaveBeenCalledWith({
					user_id: 'test-user-id',
					name: null,
					played_tracks: [firstEntry]
				})
				insert.resolve({ data: { id: 'set-queued' }, error: null })
				await flushAsyncWork()

				expect(mockQueryBuilder.insert).toHaveBeenCalledOnce()
				expect(mockQueryBuilder.update).toHaveBeenCalledOnce()
				expect(mockQueryBuilder.update).toHaveBeenCalledWith({
					played_tracks: [firstEntry, secondEntry]
				})
				expect(store.activeSetId).toBe('set-queued')
			} finally {
				vi.useRealTimers()
			}
		})

		it('coalesces snapshots queued behind a slow update to one newest follow-up', async () => {
			vi.useFakeTimers()
			const firstUpdate = createDeferred<{ data: null; error: null }>()
			mockQueryBuilder.eq.mockReturnValueOnce(firstUpdate.promise)
			const store = useSessionStore()
			store.activeSetId = 'set-queued'

			try {
				store.currentSession = [firstEntry]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)

				store.currentSession = [firstEntry, secondEntry]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)
				store.currentSession = [firstEntry, secondEntry, thirdEntry]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)

				expect(mockQueryBuilder.update).toHaveBeenCalledOnce()
				expect(mockQueryBuilder.update).toHaveBeenCalledWith({
					played_tracks: [firstEntry]
				})
				expect(store.isAutoSaving).toBe(true)
				firstUpdate.resolve({ data: null, error: null })
				await flushAsyncWork()

				expect(mockQueryBuilder.update).toHaveBeenCalledTimes(2)
				expect(mockQueryBuilder.update).toHaveBeenLastCalledWith({
					played_tracks: [firstEntry, secondEntry, thirdEntry]
				})
				expect(store.isAutoSaving).toBe(false)
			} finally {
				vi.useRealTimers()
			}
		})

		it('orders a named manual save after autosave and preserves its captured latest snapshot', async () => {
			vi.useFakeTimers()
			const insert = createDeferred<{
				data: { id: string }
				error: null
			}>()
			mockQueryBuilder.single
				.mockReturnValueOnce(insert.promise)
				.mockResolvedValueOnce({
					data: createSavedSetRow({
						id: 'set-queued',
						name: 'Named session',
						played_tracks: [firstEntry, secondEntry]
					}),
					error: null
				})
			const store = useSessionStore()

			try {
				store.currentSession = [firstEntry]
				await nextTick()
				await vi.advanceTimersByTimeAsync(2000)
				store.currentSession = [firstEntry, secondEntry]
				await nextTick()

				const manualSave = store.saveSession('Named session')
				expect(mockQueryBuilder.insert).toHaveBeenCalledOnce()
				expect(store.isAutoSaving).toBe(true)
				expect(store.isSavingSession).toBe(true)

				insert.resolve({ data: { id: 'set-queued' }, error: null })
				await expect(manualSave).resolves.toMatchObject({
					id: 'set-queued',
					name: 'Named session',
					played_tracks: [firstEntry, secondEntry]
				})
				expect(mockQueryBuilder.insert).toHaveBeenCalledOnce()
				expect(mockQueryBuilder.update).toHaveBeenCalledWith({
					name: 'Named session',
					played_tracks: [firstEntry, secondEntry]
				})

				await vi.advanceTimersByTimeAsync(2000)
				expect(mockQueryBuilder.update).toHaveBeenLastCalledWith({
					played_tracks: [firstEntry, secondEntry]
				})
				expect(store.isAutoSaving).toBe(false)
				expect(store.isSavingSession).toBe(false)
			} finally {
				vi.useRealTimers()
			}
		})

		it('keeps multiple manual saves ordered with their own immutable snapshots', async () => {
			vi.useFakeTimers()
			const firstSaveResponse = createDeferred<{
				data: SavedSetRow
				error: null
			}>()
			mockQueryBuilder.single
				.mockReturnValueOnce(firstSaveResponse.promise)
				.mockResolvedValueOnce({
					data: createSavedSetRow({
						id: 'set-queued',
						name: 'Second manual',
						played_tracks: [firstEntry, secondEntry]
					}),
					error: null
				})
			const store = useSessionStore()
			store.activeSetId = 'set-queued'
			store.currentSession = [firstEntry]

			try {
				const firstSave = store.saveSession('First manual')
				store.currentSession = [firstEntry, secondEntry]
				const secondSave = store.saveSession('Second manual')

				expect(mockQueryBuilder.update).toHaveBeenCalledOnce()
				expect(mockQueryBuilder.update).toHaveBeenCalledWith({
					name: 'First manual',
					played_tracks: [firstEntry]
				})
				expect(store.isSavingSession).toBe(true)

				firstSaveResponse.resolve({
					data: createSavedSetRow({
						id: 'set-queued',
						name: 'First manual',
						played_tracks: [firstEntry]
					}),
					error: null
				})
				await expect(firstSave).resolves.toMatchObject({
					name: 'First manual',
					played_tracks: [firstEntry]
				})
				await expect(secondSave).resolves.toMatchObject({
					name: 'Second manual',
					played_tracks: [firstEntry, secondEntry]
				})

				expect(mockQueryBuilder.update).toHaveBeenCalledTimes(2)
				expect(mockQueryBuilder.update).toHaveBeenLastCalledWith({
					name: 'Second manual',
					played_tracks: [firstEntry, secondEntry]
				})
				expect(store.isSavingSession).toBe(false)
			} finally {
				vi.useRealTimers()
			}
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
				expect(mockToast.error).toHaveBeenCalledOnce()

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
				expect(mockToast.error).toHaveBeenCalledOnce()
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
				expect(mockToast.error).toHaveBeenCalledOnce()

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
				expect(mockToast.error).toHaveBeenCalledOnce()
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
