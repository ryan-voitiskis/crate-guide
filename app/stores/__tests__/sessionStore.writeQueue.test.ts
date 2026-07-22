import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { resetTrackIdCounter } from 'test/mocks/fixtures/tracks'
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

describe('sessionStore write queue', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetTrackIdCounter()
		setActivePinia(createPinia())

		mockQueryBuilder = harness.reset()
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
				data: SavedSetRow
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
				insert.resolve({
					data: createSavedSetRow({
						id: 'set-queued',
						played_tracks: [firstEntry]
					}),
					error: null
				})
				await flushAsyncWork()

				expect(mockQueryBuilder.insert).toHaveBeenCalledOnce()
				expect(mockQueryBuilder.update).toHaveBeenCalledOnce()
				expect(mockQueryBuilder.update).toHaveBeenCalledWith({
					played_tracks: [firstEntry, secondEntry]
				})
				expect(store.activeSetId).toBe('set-queued')
				expect(store.savedSets).toHaveLength(1)
				expect(store.savedSets[0]).toMatchObject({
					id: 'set-queued',
					played_tracks: [firstEntry, secondEntry]
				})
			} finally {
				vi.useRealTimers()
			}
		})

		it('coalesces snapshots queued behind a slow update to one newest follow-up', async () => {
			vi.useFakeTimers()
			const firstUpdate = createDeferred<{
				data: SavedSetRow
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(firstUpdate.promise)
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
				firstUpdate.resolve({
					data: createSavedSetRow({
						id: 'set-queued',
						played_tracks: [firstEntry]
					}),
					error: null
				})
				await flushAsyncWork()

				expect(mockQueryBuilder.update).toHaveBeenCalledTimes(2)
				expect(mockQueryBuilder.update).toHaveBeenLastCalledWith({
					played_tracks: [firstEntry, secondEntry, thirdEntry]
				})
				expect(store.savedSets).toHaveLength(1)
				expect(store.savedSets[0]!.played_tracks).toEqual([
					firstEntry,
					secondEntry,
					thirdEntry
				])
				expect(store.isAutoSaving).toBe(false)
			} finally {
				vi.useRealTimers()
			}
		})

		it('orders a named manual save after autosave and preserves its captured latest snapshot', async () => {
			vi.useFakeTimers()
			const insert = createDeferred<{
				data: SavedSetRow
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

				insert.resolve({
					data: createSavedSetRow({
						id: 'set-queued',
						played_tracks: [firstEntry]
					}),
					error: null
				})
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
		it('fails a zero-row owned auto-save update closed', async () => {
			vi.useFakeTimers()
			mockQueryBuilder.single.mockResolvedValueOnce({ data: null, error: null })
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
				expect(store.activeSetId).toBe('set-1')
				expect(mockQueryBuilder.eq.mock.calls).toContainEqual([
					'user_id',
					'test-user-id'
				])
				expect(mockQueryBuilder.select).toHaveBeenCalledWith()
				expect(mockToast.error).toHaveBeenCalledOnce()
			} finally {
				vi.useRealTimers()
			}
		})

		it('rejects an auto-save insert response owned by another account', async () => {
			vi.useFakeTimers()
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: { id: 'set-wrong-owner', user_id: 'user-b' },
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
				expect(mockQueryBuilder.select).toHaveBeenCalledWith()
				expect(mockToast.error).toHaveBeenCalledOnce()
			} finally {
				vi.useRealTimers()
			}
		})

		it('surfaces create auto-save failures and clears the error after a successful retry', async () => {
			vi.useFakeTimers()
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Insert failed')
				})
				.mockResolvedValueOnce({
					data: createSavedSetRow({ id: 'set-1' }),
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
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Update failed')
				})
				.mockResolvedValueOnce({
					data: createSavedSetRow({ id: 'set-1' }),
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
})
