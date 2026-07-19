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
const mockIsSigningOut = ref(false)
const mockUserStore = {
	get supaUser() {
		return mockSupaUser.value
	},
	get supaUserId() {
		return mockSupaUser.value?.id ?? null
	},
	get isSigningOut() {
		return mockIsSigningOut.value
	},
	resolveAuthenticatedUserId: vi.fn()
}

const mockRecordsStore = {
	isLoadingRecords: false,
	hasRecords: false,
	fetchAllRecords: vi.fn(),
	drainCoverCleanup: vi.fn(),
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

const mockSessionStore = {
	resetAccountState: vi.fn()
}

const mockDiscogsStore = {
	resetAccountState: vi.fn()
}

const mockRoute = { path: '/settings' }
const mockRouter = {
	replace: vi.fn().mockResolvedValue(undefined)
}

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useRecordsStore', () => mockRecordsStore)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useCratesStore', () => mockCratesStore)
vi.stubGlobal('useSessionStore', () => mockSessionStore)
vi.stubGlobal('useDiscogsStore', () => mockDiscogsStore)
vi.stubGlobal('useRoute', () => mockRoute)
vi.stubGlobal('useRouter', () => mockRouter)

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

function invocationOrder(
	mock: { mock: { invocationCallOrder: number[] } },
	index = 0
): number {
	const order = mock.mock.invocationCallOrder[index]
	if (order === undefined) throw new Error('Expected mock invocation')
	return order
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
		mockIsSigningOut.value = false
		mockRoute.path = '/settings'
		mockRouter.replace.mockResolvedValue(undefined)
		mockUserStore.resolveAuthenticatedUserId.mockImplementation(async () => {
			if (!mockSupaUser.value?.id) throw new Error('User not logged in.')
			return mockSupaUser.value.id
		})
		mockRecordsStore.isLoadingRecords = false
		mockRecordsStore.hasRecords = false
		mockRecordsStore.fetchAllRecords.mockResolvedValue(true)
		mockRecordsStore.drainCoverCleanup.mockResolvedValue(true)
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
		mockSessionStore.resetAccountState.mockImplementation(() => undefined)
		mockDiscogsStore.resetAccountState.mockImplementation(() => undefined)
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
			expect(mockRecordsStore.drainCoverCleanup).not.toHaveBeenCalled()
		})

		it('returns true and marks loaded only when every store succeeds', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData, hasLoadedData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(true)

			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledOnce()
			expect(mockRecordsStore.drainCoverCleanup).toHaveBeenCalledOnce()
			expect(hasLoadedData.value).toBe(true)
		})

		it('returns false, stays unloaded, and adds no aggregate toast on failure', async () => {
			mockSupaUser.value = { id: 'user-123' }
			mockRecordsStore.fetchAllRecords.mockResolvedValue(false)
			const { loadAllUserData, hasLoadedData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(false)

			expect(hasLoadedData.value).toBe(false)
			expect(mockToast.error).not.toHaveBeenCalled()
			expect(mockRecordsStore.drainCoverCleanup).not.toHaveBeenCalled()
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
			expect(mockRecordsStore.drainCoverCleanup).toHaveBeenCalledOnce()
		})

		it('does not block readiness on the best-effort cleanup drain', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const drainResult = createDeferred<boolean>()
			mockRecordsStore.drainCoverCleanup.mockReturnValue(drainResult.promise)
			const { loadAllUserData, hasLoadedData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(true)

			expect(hasLoadedData.value).toBe(true)
			expect(mockRecordsStore.drainCoverCleanup).toHaveBeenCalledOnce()
		})

		it('requests detached store-owned cleanup after each successful refresh', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData, refreshAllUserData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(true)
			await expect(refreshAllUserData()).resolves.toBe(true)

			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
			expect(mockRecordsStore.drainCoverCleanup).toHaveBeenCalledTimes(2)
		})

		it('requests a store-owned retry on refresh after cleanup failure', async () => {
			mockSupaUser.value = { id: 'user-123' }
			mockRecordsStore.drainCoverCleanup
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true)
			const { loadAllUserData, refreshAllUserData } = createUserData()

			await expect(loadAllUserData()).resolves.toBe(true)
			await expect(refreshAllUserData()).resolves.toBe(true)

			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
			expect(mockRecordsStore.drainCoverCleanup).toHaveBeenCalledTimes(2)
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
			expect(mockRecordsStore.drainCoverCleanup).not.toHaveBeenCalled()
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
			expect(mockRecordsStore.drainCoverCleanup).toHaveBeenCalledOnce()

			const laterRefresh = refreshAllUserData()
			expect(laterRefresh).not.toBe(loadPromise)
			await expect(laterRefresh).resolves.toBe(true)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
			expect(mockRecordsStore.drainCoverCleanup).toHaveBeenCalledTimes(2)
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
			expect(mockSessionStore.resetAccountState).not.toHaveBeenCalled()
			expect(mockDiscogsStore.resetAccountState).not.toHaveBeenCalled()
			expect(mockRouter.replace).not.toHaveBeenCalled()
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

		it('clears all account state before leaving Settings on user nullification', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData, hasLoadedData } = createUserData()
			await loadAllUserData()
			vi.clearAllMocks()

			mockSupaUser.value = null
			await nextTick()

			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.clearTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.clearCrates).toHaveBeenCalledOnce()
			expect(mockSessionStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockDiscogsStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockRouter.replace).toHaveBeenCalledOnce()
			expect(mockRouter.replace).toHaveBeenCalledWith('/login')
			const replaceOrder = invocationOrder(mockRouter.replace)
			for (const reset of [
				mockRecordsStore.clearRecords,
				mockTracksStore.clearTracks,
				mockCratesStore.clearCrates,
				mockSessionStore.resetAccountState,
				mockDiscogsStore.resetAccountState
			]) {
				expect(invocationOrder(reset)).toBeLessThan(replaceOrder)
			}
			expect(hasLoadedData.value).toBe(false)

			mockSupaUser.value = null
			await nextTick()
			expect(mockRouter.replace).toHaveBeenCalledOnce()
		})

		it('clears account state without redirecting away from a public route', async () => {
			mockRoute.path = '/auth/finalising'
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData } = createUserData()
			await loadAllUserData()
			vi.clearAllMocks()

			mockSupaUser.value = null
			await nextTick()

			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.clearTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.clearCrates).toHaveBeenCalledOnce()
			expect(mockSessionStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockDiscogsStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockRouter.replace).not.toHaveBeenCalled()
		})

		it('leaves explicit sign-out navigation to the user store', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData } = createUserData()
			await loadAllUserData()
			vi.clearAllMocks()

			mockIsSigningOut.value = true
			mockSupaUser.value = null
			await nextTick()

			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.clearTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.clearCrates).toHaveBeenCalledOnce()
			expect(mockSessionStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockDiscogsStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockRouter.replace).not.toHaveBeenCalled()

			await mockRouter.replace('/login')
			mockRoute.path = '/login'
			mockIsSigningOut.value = false
			expect(mockRouter.replace).toHaveBeenCalledOnce()
			expect(mockRouter.replace).toHaveBeenCalledWith('/login')
		})

		it('falls back to coordinator navigation when explicit replacement fails', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData } = createUserData()
			await loadAllUserData()
			vi.clearAllMocks()
			mockRouter.replace
				.mockRejectedValueOnce(new Error('Store navigation failed'))
				.mockResolvedValueOnce(undefined)

			mockIsSigningOut.value = true
			mockSupaUser.value = null
			await nextTick()
			expect(mockRouter.replace).not.toHaveBeenCalled()

			await expect(mockRouter.replace('/login')).rejects.toThrow(
				'Store navigation failed'
			)
			mockIsSigningOut.value = false
			await nextTick()

			expect(mockRouter.replace).toHaveBeenCalledTimes(2)
			expect(mockRouter.replace).toHaveBeenNthCalledWith(1, '/login')
			expect(mockRouter.replace).toHaveBeenNthCalledWith(2, '/login')
		})

		it('resets every account store once before loading a replacement user', async () => {
			mockSupaUser.value = { id: 'user-a' }
			const { loadAllUserData, hasLoadedData } = createUserData()
			await loadAllUserData()
			vi.clearAllMocks()

			mockSupaUser.value = { id: 'user-b' }
			await vi.waitFor(() => {
				expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledOnce()
				expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledOnce()
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledOnce()
				expect(hasLoadedData.value).toBe(true)
			})
			expect(mockRecordsStore.drainCoverCleanup).toHaveBeenCalledOnce()

			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.clearTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.clearCrates).toHaveBeenCalledOnce()
			expect(mockSessionStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockDiscogsStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockRouter.replace).not.toHaveBeenCalled()
			const replacementFetchOrder = invocationOrder(
				mockRecordsStore.fetchAllRecords
			)
			for (const reset of [
				mockRecordsStore.clearRecords,
				mockTracksStore.clearTracks,
				mockCratesStore.clearCrates,
				mockSessionStore.resetAccountState,
				mockDiscogsStore.resetAccountState
			]) {
				expect(invocationOrder(reset)).toBeLessThan(replacementFetchOrder)
			}
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

			oldUserResult.resolve(false)
			await expect(oldUserLoad).resolves.toBe(false)

			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.clearTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.clearCrates).toHaveBeenCalledOnce()
			expect(mockSessionStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockDiscogsStore.resetAccountState).toHaveBeenCalledOnce()
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
			expect(mockRecordsStore.drainCoverCleanup).toHaveBeenCalledOnce()
			expect(hasAnyData.value).toBe(true)
			expect(mockSessionStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockDiscogsStore.resetAccountState).toHaveBeenCalledOnce()
			await expect(loadAllUserData()).resolves.toBe(true)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
		})

		it('starts a replacement load before a signed-out account fetch settles', async () => {
			mockSupaUser.value = { id: 'user-a' }
			const oldUserResult = createDeferred<boolean>()
			deferNextStoreLoads(oldUserResult)
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

			mockSupaUser.value = null
			await nextTick()
			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.clearTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.clearCrates).toHaveBeenCalledOnce()

			mockSupaUser.value = { id: 'user-b' }
			await nextTick()
			await vi.waitFor(() => {
				expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
				expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledTimes(2)
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledTimes(2)
				expect(hasLoadedData.value).toBe(true)
			})
			expect(oldUserLoadSettled).toBe(false)

			oldUserResult.resolve(true)
			await expect(oldUserLoad).resolves.toBe(false)
			expect(hasLoadedData.value).toBe(true)
			expect(mockRecordsStore.clearRecords).toHaveBeenCalledOnce()
			expect(mockTracksStore.clearTracks).toHaveBeenCalledOnce()
			expect(mockCratesStore.clearCrates).toHaveBeenCalledOnce()
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
			await vi.waitFor(() => {
				expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
				expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledTimes(2)
				expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledTimes(2)
				expect(hasLoadedData.value).toBe(true)
			})
			recordsResult.reject(new Error('Old account request failed'))
			await Promise.resolve()
			await Promise.resolve()
			expect(oldUserLoadSettled).toBe(false)
			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalledTimes(2)
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledTimes(2)
			expect(mockCratesStore.fetchAllCrates).toHaveBeenCalledTimes(2)

			tracksResult.resolve(true)
			await Promise.resolve()
			expect(oldUserLoadSettled).toBe(false)
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalledTimes(2)

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
			expect(mockSessionStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockDiscogsStore.resetAccountState).toHaveBeenCalledOnce()
			const replacementFetchOrder = invocationOrder(
				mockRecordsStore.fetchAllRecords,
				1
			)
			for (const reset of [
				mockRecordsStore.clearRecords,
				mockTracksStore.clearTracks,
				mockCratesStore.clearCrates,
				mockSessionStore.resetAccountState,
				mockDiscogsStore.resetAccountState
			]) {
				expect(invocationOrder(reset)).toBeLessThan(replacementFetchOrder)
			}
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
			expect(mockSessionStore.resetAccountState).toHaveBeenCalledOnce()
			expect(mockDiscogsStore.resetAccountState).toHaveBeenCalledOnce()
			expect(hasLoadedData.value).toBe(false)
		})
	})
})
