import {
	type EffectScope,
	computed,
	effectScope,
	nextTick,
	ref,
	watch
} from 'vue'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-sonner', () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn()
	}
}))

const mockToast = toast as unknown as {
	error: ReturnType<typeof vi.fn>
	success: ReturnType<typeof vi.fn>
}

const mockSupaUser = ref<{ id: string } | null>(null)
const mockUserStore = {
	get supaUser() {
		return mockSupaUser.value
	},
	resolveAuthenticatedUserId: vi.fn()
}

const mockRecordsStore = {
	isLoadingRecords: false,
	hasRecords: false,
	fetchAllRecords: vi.fn(),
	clearRecords: vi.fn()
}

const mockTracksStore = {
	isLoadingTracks: false,
	hasTracks: false,
	fetchAllTracks: vi.fn(),
	clearTracks: vi.fn()
}

const mockCratesStore = {
	isLoadingCrates: false,
	hasCrates: false,
	fetchAllCrates: vi.fn(),
	clearCrates: vi.fn()
}

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useRecordsStore', () => mockRecordsStore)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useCratesStore', () => mockCratesStore)

const { useUserData } = await import('../useUserData')

const activeScopes: EffectScope[] = []

function createUserData() {
	const scope = effectScope()
	const userData = scope.run(() => useUserData())
	if (!userData) throw new Error('Failed to create useUserData scope')
	activeScopes.push(scope)
	return userData
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

function deferNextStoreLoads(
	result: ReturnType<typeof createDeferred<boolean>>
) {
	mockRecordsStore.fetchAllRecords.mockImplementationOnce(async () => {
		const didLoad = await result.promise
		mockRecordsStore.hasRecords = didLoad
		return didLoad
	})
	mockTracksStore.fetchAllTracks.mockImplementationOnce(async () => {
		const didLoad = await result.promise
		mockTracksStore.hasTracks = didLoad
		return didLoad
	})
	mockCratesStore.fetchAllCrates.mockImplementationOnce(async () => {
		const didLoad = await result.promise
		mockCratesStore.hasCrates = didLoad
		return didLoad
	})
}

function makeFollowingStoreLoadsSucceed() {
	mockRecordsStore.fetchAllRecords.mockImplementation(async () => {
		mockRecordsStore.hasRecords = true
		return true
	})
	mockTracksStore.fetchAllTracks.mockImplementation(async () => {
		mockTracksStore.hasTracks = true
		return true
	})
	mockCratesStore.fetchAllCrates.mockImplementation(async () => {
		mockCratesStore.hasCrates = true
		return true
	})
}

describe('useUserData', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockSupaUser.value = null
		mockUserStore.resolveAuthenticatedUserId.mockImplementation(async () => {
			if (!mockSupaUser.value?.id) throw new Error('User not logged in.')
			return mockSupaUser.value.id
		})
		mockRecordsStore.isLoadingRecords = false
		mockRecordsStore.hasRecords = false
		mockRecordsStore.fetchAllRecords.mockResolvedValue(true)
		mockRecordsStore.clearRecords.mockImplementation(() => {
			mockRecordsStore.hasRecords = false
		})
		mockTracksStore.isLoadingTracks = false
		mockTracksStore.hasTracks = false
		mockTracksStore.fetchAllTracks.mockResolvedValue(true)
		mockTracksStore.clearTracks.mockImplementation(() => {
			mockTracksStore.hasTracks = false
		})
		mockCratesStore.isLoadingCrates = false
		mockCratesStore.hasCrates = false
		mockCratesStore.fetchAllCrates.mockResolvedValue(true)
		mockCratesStore.clearCrates.mockImplementation(() => {
			mockCratesStore.hasCrates = false
		})
	})

	afterEach(async () => {
		await Promise.resolve()
		await Promise.resolve()
		for (const scope of activeScopes.splice(0)) scope.stop()
	})

	describe('derived state', () => {
		it('starts with unloaded, idle state', () => {
			const { isLoadingUserData, hasLoadedData } = createUserData()

			expect(isLoadingUserData.value).toBe(false)
			expect(hasLoadedData.value).toBe(false)
		})

		it('reports when a store is loading', () => {
			mockTracksStore.isLoadingTracks = true
			const { isLoadingAny } = createUserData()

			expect(isLoadingAny.value).toBe(true)
		})

		it('reports when any store has data', () => {
			mockTracksStore.hasTracks = true

			const { hasAnyData } = createUserData()

			expect(hasAnyData.value).toBe(true)
		})
	})

	describe('loadAllUserData', () => {
		it('returns false without an authenticated or persisted user', async () => {
			const { loadAllUserData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(false)
			expect(mockRecordsStore.fetchAllRecords).not.toHaveBeenCalled()
			expect(mockTracksStore.fetchAllTracks).not.toHaveBeenCalled()
			expect(mockCratesStore.fetchAllCrates).not.toHaveBeenCalled()
		})

		it('returns true and marks loaded only when every store succeeds', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData, hasLoadedData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(true)

			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledOnce()
			expect(hasLoadedData.value).toBe(true)
		})

		it('returns false, stays unloaded, and adds no aggregate toast on failure', async () => {
			mockSupaUser.value = { id: 'user-123' }
			mockRecordsStore.fetchAllRecords.mockResolvedValue(false)
			const { loadAllUserData, hasLoadedData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(false)

			expect(hasLoadedData.value).toBe(false)
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('shares the exact in-flight promise and starts fresh after settlement', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const recordsResult = createDeferred<boolean>()
			mockRecordsStore.fetchAllRecords.mockReturnValue(recordsResult.promise)
			const { loadAllUserData, refreshAllUserData, isLoadingUserData } =
				createUserData()

			const firstLoad = loadAllUserData()
			const concurrentLoad = loadAllUserData()

			expect(concurrentLoad).toBe(firstLoad)
			expect(isLoadingUserData.value).toBe(true)

			recordsResult.resolve(true)
			await expect(firstLoad).resolves.toBe(true)
			expect(isLoadingUserData.value).toBe(false)

			const laterRefresh = refreshAllUserData()
			expect(laterRefresh).not.toBe(firstLoad)
			await expect(laterRefresh).resolves.toBe(true)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
		})

		it('returns true without refetching when data is already loaded', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(true)
			mockRecordsStore.fetchAllRecords.mockClear()

			await expect(loadAllUserData()).resolves.toBe(true)
			expect(mockRecordsStore.fetchAllRecords).not.toHaveBeenCalled()
		})

		it('catches unexpected throws at the coordinator boundary', async () => {
			mockSupaUser.value = { id: 'user-123' }
			mockRecordsStore.fetchAllRecords.mockRejectedValue(
				new Error('Unexpected failure')
			)
			const { loadAllUserData, hasLoadedData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(false)

			expect(hasLoadedData.value).toBe(false)
			expect(mockToast.error).toHaveBeenCalledWith('Error loading user data.')
			expect(mockToast.error).toHaveBeenCalledOnce()
		})
	})

	describe('refreshAllUserData', () => {
		it('shares an in-flight load instead of starting another', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const recordsResult = createDeferred<boolean>()
			mockRecordsStore.fetchAllRecords.mockReturnValue(recordsResult.promise)
			const { loadAllUserData, refreshAllUserData, hasLoadedData } =
				createUserData()

			const loadPromise = loadAllUserData()
			const refreshPromise = refreshAllUserData()

			expect(refreshPromise).toBe(loadPromise)
			expect(hasLoadedData.value).toBe(false)

			recordsResult.resolve(true)
			await expect(refreshPromise).resolves.toBe(true)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledOnce()

			const laterRefresh = refreshAllUserData()
			expect(laterRefresh).not.toBe(loadPromise)
			await expect(laterRefresh).resolves.toBe(true)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
		})

		it('can manually retry successfully after a failed load', async () => {
			mockSupaUser.value = { id: 'user-123' }
			mockRecordsStore.fetchAllRecords.mockResolvedValueOnce(false)
			const { loadAllUserData, refreshAllUserData, hasLoadedData } =
				createUserData()

			await expect(loadAllUserData()).resolves.toBe(false)
			expect(hasLoadedData.value).toBe(false)

			await expect(refreshAllUserData()).resolves.toBe(true)
			expect(hasLoadedData.value).toBe(true)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
		})
	})

	describe('authentication transitions', () => {
		it('does not clear stores during the initial no-user check', () => {
			createUserData()

			expect(mockRecordsStore.clearRecords).not.toHaveBeenCalled()
			expect(mockTracksStore.clearTracks).not.toHaveBeenCalled()
			expect(mockCratesStore.clearCrates).not.toHaveBeenCalled()
		})

		it('does not automatically retry a failed load while the user ID is unchanged', async () => {
			mockSupaUser.value = { id: 'user-123' }
			mockRecordsStore.fetchAllRecords.mockResolvedValue(false)
			const { loadAllUserData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(false)
			await nextTick()
			await Promise.resolve()

			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledOnce()
		})

		it('clears all stores on transition from a user ID to no user', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData, hasLoadedData } = createUserData()
			await loadAllUserData()
			vi.clearAllMocks()

			mockSupaUser.value = null
			await nextTick()

			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.clearTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.clearCrates).toHaveBeenCalledOnce()
			expect(hasLoadedData.value).toBe(false)
		})

		it('discards store results that settle after sign-out', async () => {
			mockSupaUser.value = { id: 'user-a' }
			const oldUserResult = createDeferred<boolean>()
			deferNextStoreLoads(oldUserResult)
			const { loadAllUserData, hasLoadedData, hasAnyData } = createUserData()
			const oldUserLoad = loadAllUserData()
			await vi.waitFor(() => {
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledOnce()
			})

			mockSupaUser.value = null
			await nextTick()
			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()

			oldUserResult.resolve(true)
			await expect(oldUserLoad).resolves.toBe(false)

			expect(mockRecordsStore.clearRecords).toHaveBeenCalledTimes(2)
			expect(mockTracksStore.clearTracks).toHaveBeenCalledTimes(2)
			expect(mockCratesStore.clearCrates).toHaveBeenCalledTimes(2)
			expect(hasLoadedData.value).toBe(false)
			expect(hasAnyData.value).toBe(false)
		})

		it('loads a new account once after discarding an in-flight old-account load', async () => {
			mockSupaUser.value = { id: 'user-a' }
			const oldUserResult = createDeferred<boolean>()
			deferNextStoreLoads(oldUserResult)
			makeFollowingStoreLoadsSucceed()
			const { loadAllUserData, hasLoadedData, hasAnyData } = createUserData()
			const oldUserLoad = loadAllUserData()
			await vi.waitFor(() => {
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledOnce()
			})

			mockSupaUser.value = { id: 'user-b' }
			await nextTick()
			oldUserResult.resolve(true)
			await expect(oldUserLoad).resolves.toBe(false)

			await vi.waitFor(() => {
				expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
				expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledTimes(2)
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledTimes(2)
				expect(hasLoadedData.value).toBe(true)
			})
			expect(hasAnyData.value).toBe(true)
			await expect(loadAllUserData()).resolves.toBe(true)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
		})

		it('loads a new account after an old-account load rejects unexpectedly', async () => {
			mockSupaUser.value = { id: 'user-a' }
			const recordsResult = createDeferred<boolean>()
			const tracksResult = createDeferred<boolean>()
			const cratesResult = createDeferred<boolean>()
			mockRecordsStore.fetchAllRecords.mockImplementationOnce(
				() => recordsResult.promise
			)
			mockTracksStore.fetchAllTracks.mockImplementationOnce(
				() => tracksResult.promise
			)
			mockCratesStore.fetchAllCrates.mockImplementationOnce(
				() => cratesResult.promise
			)
			makeFollowingStoreLoadsSucceed()
			const { loadAllUserData, hasLoadedData } = createUserData()
			const oldUserLoad = loadAllUserData()
			let oldUserLoadSettled = false
			void oldUserLoad.then(() => {
				oldUserLoadSettled = true
			})
			await vi.waitFor(() => {
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledOnce()
			})

			mockSupaUser.value = { id: 'user-b' }
			await nextTick()
			recordsResult.reject(new Error('Old account request failed'))
			await Promise.resolve()
			await Promise.resolve()
			expect(oldUserLoadSettled).toBe(false)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledOnce()

			tracksResult.resolve(true)
			await Promise.resolve()
			expect(oldUserLoadSettled).toBe(false)
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledOnce()

			cratesResult.resolve(true)
			await expect(oldUserLoad).resolves.toBe(false)

			await vi.waitFor(() => {
				expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
				expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledTimes(2)
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledTimes(2)
				expect(hasLoadedData.value).toBe(true)
			})
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('replaces a stale persisted-user load when a different user hydrates', async () => {
			mockUserStore.resolveAuthenticatedUserId
				.mockResolvedValueOnce('user-a')
				.mockResolvedValueOnce('user-a')
			const persistedUserResult = createDeferred<boolean>()
			deferNextStoreLoads(persistedUserResult)
			makeFollowingStoreLoadsSucceed()
			const { loadAllUserData, hasLoadedData, hasAnyData } = createUserData()
			await vi.waitFor(() => {
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledOnce()
			})
			const persistedUserLoad = loadAllUserData()

			mockSupaUser.value = { id: 'user-b' }
			await nextTick()
			persistedUserResult.resolve(true)
			await expect(persistedUserLoad).resolves.toBe(false)

			await vi.waitFor(() => {
				expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
				expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledTimes(2)
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledTimes(2)
				expect(hasLoadedData.value).toBe(true)
			})
			expect(hasAnyData.value).toBe(true)
			await expect(loadAllUserData()).resolves.toBe(true)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
		})

		it('reloads when a different user hydrates after persisted data completed', async () => {
			mockUserStore.resolveAuthenticatedUserId
				.mockResolvedValueOnce('user-a')
				.mockResolvedValueOnce('user-a')
			const { hasLoadedData } = createUserData()
			await vi.waitFor(() => {
				expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledOnce()
				expect(hasLoadedData.value).toBe(true)
			})

			mockSupaUser.value = { id: 'user-b' }
			await nextTick()

			await vi.waitFor(() => {
				expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
				expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledTimes(2)
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledTimes(2)
				expect(hasLoadedData.value).toBe(true)
			})
			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.clearTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.clearCrates).toHaveBeenCalledOnce()
		})

		it('does not duplicate store loads when bootstrap and sign-in race', async () => {
			mockUserStore.resolveAuthenticatedUserId.mockResolvedValue('user-123')
			const { loadAllUserData } = createUserData()

			mockSupaUser.value = { id: 'user-123' }
			await nextTick()
			await expect(loadAllUserData()).resolves.toBe(true)

			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledOnce()
		})
	})

	describe('clearAllUserData', () => {
		it('clears stores and resets loaded state', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData, clearAllUserData, hasLoadedData } =
				createUserData()
			await loadAllUserData()
			vi.clearAllMocks()

			clearAllUserData()

			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.clearTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.clearCrates).toHaveBeenCalledOnce()
			expect(hasLoadedData.value).toBe(false)
		})
	})
})
