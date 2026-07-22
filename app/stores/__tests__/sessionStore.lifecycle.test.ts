import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import {
	createMockTrack,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../sessionStore'
import {
	type SavedSetRow,
	createSavedSetRow,
	createSessionStoreHarness
} from './harness/sessionStoreHarness'

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
let mockQueryBuilder = harness.queryBuilder

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

describe('sessionStore lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetTrackIdCounter()
		setActivePinia(createPinia())

		mockQueryBuilder = harness.reset()
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
			const update = createDeferred<{
				data: { id: string; user_id: string }
				error: null
			}>()
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
			mockQueryBuilder.single.mockReturnValueOnce(update.promise)
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
				update.resolve({
					data: { id: 'set-active', user_id: 'test-user-id' },
					error: null
				})
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
			const oldDelete = createDeferred<{
				data: { id: string; user_id: string }
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(oldDelete.promise)
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
			oldDelete.resolve({
				data: { id: 'set-a', user_id: 'test-user-id' },
				error: null
			})
			await deletePromise

			expect(store.savedSets.map((set) => set.id)).toEqual(['set-b'])
			expect(store.activeSetId).toBe('set-b')
			expect(store.selectedSetId).toBe('set-b')
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('silences a late failed delete from the reset account', async () => {
			const oldDelete = createDeferred<{ data: null; error: Error }>()
			mockQueryBuilder.single.mockReturnValueOnce(oldDelete.promise)
			const store = useSessionStore()
			store.savedSets = [createSavedSet({ id: 'set-a' })]

			const deletePromise = store.deleteSet('set-a')
			store.resetAccountState()
			mockUserStore.supaUser = { id: 'user-b' }
			store.savedSets = [createSavedSet({ id: 'set-b', user_id: 'user-b' })]
			oldDelete.resolve({ data: null, error: new Error('Old delete failed') })
			await deletePromise

			expect(store.savedSets.map((set) => set.id)).toEqual(['set-b'])
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
		})
	})
})
