import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { resetTrackIdCounter } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryPlayedTrackEntry } from '~~/shared/types/library'
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
let mockQueryBuilder = harness.queryBuilder

vi.stubGlobal('useTracksStore', () => harness.tracksStore)
vi.stubGlobal('useLibraryPreferencesStore', () => harness.preferencesStore)
vi.stubGlobal('useUserStore', () => harness.userStore)
vi.stubGlobal('useSupabaseClient', () => harness.supabaseClient)

function entry(
	trackId: string,
	rating: number | null
): LibraryPlayedTrackEntry {
	return {
		track_id: trackId,
		time_added: trackId.charCodeAt(0),
		adjusted_bpm: 120,
		transition_rating: rating
	}
}

function seed(store: ReturnType<typeof useSessionStore>) {
	store.currentSession = [
		entry('A', null),
		entry('B', 4),
		entry('C', 5),
		entry('D', 3)
	]
}

function ratings(store: ReturnType<typeof useSessionStore>) {
	return store.currentSession.map(
		(item) => `${item.track_id}:${item.transition_rating}`
	)
}

describe('sessionStore history editing', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetTrackIdCounter()
		setActivePinia(createPinia())
		mockQueryBuilder = harness.reset()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('moves an entry and clears only the ratings of broken pairs', () => {
		const store = useSessionStore()
		seed(store)

		const result = store.moveHistoryEntry(3, 1)

		expect(result).toEqual({ clearedRatings: 2, removedEntry: null })
		expect(ratings(store)).toEqual(['A:null', 'D:null', 'B:null', 'C:5'])
	})

	it('keeps a later rating attached to its pair after a move above it', () => {
		const store = useSessionStore()
		seed(store)

		store.moveHistoryEntry(0, 1)

		// B A C D: B is now first and C now follows A, so both lose their
		// ratings; D still follows C and keeps its rating.
		expect(ratings(store)).toEqual(['B:null', 'A:null', 'C:null', 'D:3'])
	})

	it('rates the transition at the moved position, not the old one', () => {
		const store = useSessionStore()
		seed(store)
		store.moveHistoryEntry(3, 1)

		store.rateTransition(1, 2)

		expect(store.currentSession[1]!.track_id).toBe('D')
		expect(store.currentSession[1]!.transition_rating).toBe(2)
	})

	it('removes an entry and clears the rating of the one after it', () => {
		const store = useSessionStore()
		seed(store)

		const result = store.removeHistoryEntry(1)

		expect(result?.clearedRatings).toBe(1)
		expect(result?.removedEntry).toEqual(entry('B', 4))
		expect(ratings(store)).toEqual(['A:null', 'C:null', 'D:3'])
		expect(store.sessionTrackCount).toBe(3)
	})

	it('ignores out-of-range edits without touching the history', () => {
		const store = useSessionStore()
		seed(store)
		const before = store.currentSession

		expect(store.moveHistoryEntry(0, 4)).toBeNull()
		expect(store.moveHistoryEntry(2, 2)).toBeNull()
		expect(store.removeHistoryEntry(-1)).toBeNull()
		expect(store.currentSession).toBe(before)
	})

	it('undoes the last edit and restores the cleared ratings', () => {
		const store = useSessionStore()
		seed(store)
		store.moveHistoryEntry(3, 1)

		expect(store.undoHistoryEdit()).toBe(true)
		expect(ratings(store)).toEqual(['A:null', 'B:4', 'C:5', 'D:3'])
		// One level only.
		expect(store.undoHistoryEdit()).toBe(false)
	})

	it('refuses to undo once the history changed after the edit', () => {
		const store = useSessionStore()
		seed(store)
		store.removeHistoryEntry(0)
		store.rateTransition(1, 1)

		expect(store.undoHistoryEdit()).toBe(false)
		expect(store.currentSession).toHaveLength(3)
		expect(store.currentSession[1]!.transition_rating).toBe(1)
	})

	it('drops the undo snapshot when the session is cleared', () => {
		const store = useSessionStore()
		seed(store)
		store.moveHistoryEntry(0, 3)
		store.clearSession()

		expect(store.undoHistoryEdit()).toBe(false)
		expect(store.currentSession).toEqual([])
	})

	it('autosaves the reordered set with its adjusted ratings', async () => {
		vi.useFakeTimers()
		const store = useSessionStore()
		seed(store)
		await nextTick()
		await vi.advanceTimersByTimeAsync(2000)
		expect(mockQueryBuilder.insert).toHaveBeenCalledOnce()

		store.moveHistoryEntry(3, 1)
		await nextTick()
		await vi.advanceTimersByTimeAsync(2000)

		expect(mockQueryBuilder.update).toHaveBeenLastCalledWith(
			expect.objectContaining({
				played_tracks: [
					entry('A', null),
					{ ...entry('D', 3), transition_rating: null },
					{ ...entry('B', 4), transition_rating: null },
					entry('C', 5)
				]
			})
		)
	})
})
