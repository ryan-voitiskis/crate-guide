import { createPinia, setActivePinia } from 'pinia'
import {
	createMockTrack,
	createMockTrackWithBpm,
	createMockTrackWithKey,
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
const mockSupabaseClient = harness.supabaseClient

// Stub Nuxt composables (these are auto-imported in the store)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)

describe('sessionStore deck playback', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetTrackIdCounter()
		setActivePinia(createPinia())

		harness.reset()
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
			const track = createMockTrack({
				rpm: 45,
				title: 'Historical title',
				artists: [
					{ discogs_id: 1, name: 'Artist One', role: null },
					{ discogs_id: 2, name: 'Artist Two', role: null }
				]
			})
			mockTracksStore.getTrackById.mockReturnValue(track)
			const store = useSessionStore()

			store.loadTrack(track.id, 0)

			expect(store.decks[0]!.rpm).toBe(45)
			expect(store.currentSession[0]).toMatchObject({
				track_title: 'Historical title',
				artist_display: 'Artist One, Artist Two'
			})
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
				expect(store.currentSession.at(-1)?.adjusted_bpm).toBeCloseTo(
					120 * 1.0056
				)
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

				store.loadTrack(replacementTrack.id, 0, true, 1)

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

		it('records the BPM reachable at a clamped tempo-match pitch', async () => {
			vi.useFakeTimers()
			const replacementTrack = createMockTrack({
				id: 'replacement-track',
				bpm: 100
			})
			mockTracksStore.getTrackById.mockReturnValue(replacementTrack)
			const store = useSessionStore()
			store.decks[1]!.loadedTrack = createMockTrack({
				id: 'source-track',
				bpm: 140
			})

			try {
				store.loadTrack(replacementTrack.id, 0, true, 1)

				expect(store.currentSession.at(-1)?.adjusted_bpm).toBeCloseTo(108)
				await vi.runAllTimersAsync()
				expect(store.decks[0]!.pitch).toBe(100)
			} finally {
				vi.useRealTimers()
			}
		})

		it('does not mutate prior history while a replacement animation runs', async () => {
			vi.useFakeTimers()
			const firstTrack = createMockTrack({ id: 'first-track', bpm: 100 })
			const secondTrack = createMockTrack({ id: 'second-track', bpm: 120 })
			mockTracksStore.getTrackById.mockImplementation((trackId: string) =>
				trackId === firstTrack.id ? firstTrack : secondTrack
			)
			const store = useSessionStore()
			store.decks[1]!.loadedTrack = createMockTrack({
				id: 'source-track',
				bpm: 104
			})

			try {
				store.loadTrack(firstTrack.id, 0, true, 1)
				const firstHistoryEntry = { ...store.currentSession[0]! }
				store.loadTrack(secondTrack.id, 0, false)
				await vi.runAllTimersAsync()

				expect(store.currentSession[0]).toEqual(firstHistoryEntry)
			} finally {
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
})
