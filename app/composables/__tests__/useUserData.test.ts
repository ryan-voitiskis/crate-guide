import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

// Mock vue-sonner module
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

// Mock stores - use refs to allow reactive updates
const mockSupaUser = ref<{ id: string } | null>(null)
const mockUserStore = {
	get supaUser() {
		return mockSupaUser.value
	}
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

// Stub globals - don't execute watchEffect callbacks automatically
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('watchEffect', vi.fn()) // No-op to prevent auto-load during setup
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useRecordsStore', () => mockRecordsStore)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useCratesStore', () => mockCratesStore)

// Import after mocks
const { useUserData } = await import('../useUserData')

describe('useUserData', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockSupaUser.value = null
		mockRecordsStore.isLoadingRecords = false
		mockRecordsStore.hasRecords = false
		mockRecordsStore.fetchAllRecords.mockResolvedValue(undefined)
		mockTracksStore.isLoadingTracks = false
		mockTracksStore.hasTracks = false
		mockTracksStore.fetchAllTracks.mockResolvedValue(undefined)
		mockCratesStore.isLoadingCrates = false
		mockCratesStore.hasCrates = false
		mockCratesStore.fetchAllCrates.mockResolvedValue(undefined)
	})

	describe('initial state', () => {
		it('starts with isLoadingUserData false', () => {
			const { isLoadingUserData } = useUserData()
			expect(isLoadingUserData.value).toBe(false)
		})

		it('starts with hasLoadedData false', () => {
			const { hasLoadedData } = useUserData()
			expect(hasLoadedData.value).toBe(false)
		})
	})

	describe('isLoadingAny', () => {
		it('returns false when nothing is loading', () => {
			const { isLoadingAny } = useUserData()
			expect(isLoadingAny.value).toBe(false)
		})

		it('returns true when records are loading', () => {
			mockRecordsStore.isLoadingRecords = true
			const { isLoadingAny } = useUserData()
			expect(isLoadingAny.value).toBe(true)
		})

		it('returns true when tracks are loading', () => {
			mockTracksStore.isLoadingTracks = true
			const { isLoadingAny } = useUserData()
			expect(isLoadingAny.value).toBe(true)
		})

		it('returns true when crates are loading', () => {
			mockCratesStore.isLoadingCrates = true
			const { isLoadingAny } = useUserData()
			expect(isLoadingAny.value).toBe(true)
		})
	})

	describe('hasAnyData', () => {
		it('returns false when no data', () => {
			const { hasAnyData } = useUserData()
			expect(hasAnyData.value).toBe(false)
		})

		it('returns true when has records', () => {
			mockRecordsStore.hasRecords = true
			const { hasAnyData } = useUserData()
			expect(hasAnyData.value).toBe(true)
		})

		it('returns true when has tracks', () => {
			mockTracksStore.hasTracks = true
			const { hasAnyData } = useUserData()
			expect(hasAnyData.value).toBe(true)
		})

		it('returns true when has crates', () => {
			mockCratesStore.hasCrates = true
			const { hasAnyData } = useUserData()
			expect(hasAnyData.value).toBe(true)
		})
	})

	describe('loadAllUserData', () => {
		it('does nothing when no user', async () => {
			mockSupaUser.value = null
			const { loadAllUserData } = useUserData()

			await loadAllUserData()

			expect(mockRecordsStore.fetchAllRecords).not.toHaveBeenCalled()
			expect(mockTracksStore.fetchAllTracks).not.toHaveBeenCalled()
			expect(mockCratesStore.fetchAllCrates).not.toHaveBeenCalled()
		})

		it('fetches all data in parallel when user exists', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData } = useUserData()

			await loadAllUserData()

			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalled()
			expect(mockTracksStore.fetchAllTracks).toHaveBeenCalled()
			expect(mockCratesStore.fetchAllCrates).toHaveBeenCalled()
		})

		it('sets hasLoadedData true on success', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData, hasLoadedData } = useUserData()

			await loadAllUserData()

			expect(hasLoadedData.value).toBe(true)
		})

		it('shows error toast when already loaded', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData, hasLoadedData } = useUserData()

			// First load succeeds
			await loadAllUserData()
			expect(hasLoadedData.value).toBe(true)

			vi.clearAllMocks()

			// Second load shows error
			await loadAllUserData()

			expect(mockToast.error).toHaveBeenCalledWith('User data already loaded')
			expect(mockRecordsStore.fetchAllRecords).not.toHaveBeenCalled()
		})

		it('shows error toast when records fetch fails', async () => {
			mockSupaUser.value = { id: 'user-123' }
			mockRecordsStore.fetchAllRecords.mockRejectedValue(
				new Error('Records failed')
			)
			const { loadAllUserData } = useUserData()

			await loadAllUserData()

			expect(mockToast.error).toHaveBeenCalledWith('Failed to load: records')
		})

		it('shows error toast with multiple failures', async () => {
			mockSupaUser.value = { id: 'user-123' }
			mockRecordsStore.fetchAllRecords.mockRejectedValue(new Error('Failed'))
			mockTracksStore.fetchAllTracks.mockRejectedValue(new Error('Failed'))
			const { loadAllUserData } = useUserData()

			await loadAllUserData()

			expect(mockToast.error).toHaveBeenCalledWith(
				'Failed to load: records, tracks'
			)
		})

		it('does not set hasLoadedData when any fetch fails', async () => {
			mockSupaUser.value = { id: 'user-123' }
			mockRecordsStore.fetchAllRecords.mockRejectedValue(new Error('Failed'))
			const { loadAllUserData, hasLoadedData } = useUserData()

			await loadAllUserData()

			expect(hasLoadedData.value).toBe(false)
		})

		it('sets isLoadingUserData during fetch', async () => {
			mockSupaUser.value = { id: 'user-123' }
			let resolveRecords: (value: unknown) => void
			mockRecordsStore.fetchAllRecords.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveRecords = resolve
					})
			)

			const { loadAllUserData, isLoadingUserData } = useUserData()

			const loadPromise = loadAllUserData()
			// Need to await a tick for the async function to start
			await Promise.resolve()
			expect(isLoadingUserData.value).toBe(true)

			resolveRecords!(undefined)
			await loadPromise
			expect(isLoadingUserData.value).toBe(false)
		})
	})

	describe('refreshAllUserData', () => {
		it('resets hasLoadedData and reloads', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData, refreshAllUserData, hasLoadedData } =
				useUserData()

			await loadAllUserData()
			expect(hasLoadedData.value).toBe(true)

			vi.clearAllMocks()
			await refreshAllUserData()

			expect(mockRecordsStore.fetchAllRecords).toHaveBeenCalled()
			expect(hasLoadedData.value).toBe(true)
		})
	})

	describe('clearAllUserData', () => {
		it('clears all store data', () => {
			const { clearAllUserData } = useUserData()

			clearAllUserData()

			expect(mockRecordsStore.clearRecords).toHaveBeenCalled()
			expect(mockTracksStore.clearTracks).toHaveBeenCalled()
			expect(mockCratesStore.clearCrates).toHaveBeenCalled()
		})

		it('resets hasLoadedData', async () => {
			mockSupaUser.value = { id: 'user-123' }
			const { loadAllUserData, clearAllUserData, hasLoadedData } = useUserData()

			await loadAllUserData()
			expect(hasLoadedData.value).toBe(true)

			clearAllUserData()
			expect(hasLoadedData.value).toBe(false)
		})
	})
})
