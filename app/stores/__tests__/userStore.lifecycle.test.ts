import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '~/../../shared/types/supabase'
import { useUserStore as createPiniaUserStore } from '../userStore'
import {
	createDeferred,
	createMockProfile,
	createUserStoreHarness,
	drainLifecycleTasks
} from './harness/userStoreHarness'

const mockCreateSupabaseClient = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@supabase/supabase-js')>()),
	createClient: mockCreateSupabaseClient
}))

vi.mock('vue-sonner', () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
		warning: vi.fn()
	}
}))

const mockToast = toast as unknown as {
	error: ReturnType<typeof vi.fn>
	success: ReturnType<typeof vi.fn>
	warning: ReturnType<typeof vi.fn>
}

const harness = createUserStoreHarness({
	createAccountClient: mockCreateSupabaseClient,
	createStore: createPiniaUserStore
})
const mockSupaUser = harness.supaUser
const mockSetTheme = harness.setTheme
const mockSupabaseClient = harness.supabaseClient
const createUserStore = harness.createUserStore
const useUserStore = harness.useUserStore
let mockQueryBuilder = harness.queryBuilder
describe('userStore auth lifecycle and profile', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockQueryBuilder = harness.reset()
	})

	afterEach(() => harness.dispose())

	describe('authentication lifecycle', () => {
		it('clears profile and ignores a stale profile response after sign-out', async () => {
			const profileRequest = createDeferred<{
				data: Profile
				error: null
			}>()
			mockQueryBuilder.single.mockReturnValueOnce(profileRequest.promise)
			const store = createUserStore({ preserveLifecycleCalls: true })

			expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'test-user-id')
			mockSupaUser.value = null

			expect(store.profile).toBeNull()
			expect(mockSetTheme).toHaveBeenLastCalledWith('auto')

			profileRequest.resolve({
				data: createMockProfile({ id: 'test-user-id', ui_theme: 'dark' }),
				error: null
			})
			await drainLifecycleTasks()

			expect(store.profile).toBeNull()
			expect(mockSetTheme).not.toHaveBeenCalledWith('dark')
			expect(mockSetTheme).toHaveBeenLastCalledWith('auto')
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('loads a replacement identity once and ignores the stale prior response', async () => {
			const firstProfileRequest = createDeferred<{
				data: Profile
				error: null
			}>()
			const replacementProfile = createMockProfile({
				id: 'replacement-user-id',
				key_format: 'key',
				ui_theme: 'light'
			})
			mockQueryBuilder.single
				.mockReturnValueOnce(firstProfileRequest.promise)
				.mockResolvedValueOnce({ data: replacementProfile, error: null })
			const store = createUserStore({ preserveLifecycleCalls: true })

			mockSupaUser.value = {
				id: 'replacement-user-id',
				email: 'replacement@example.com'
			}
			await drainLifecycleTasks()

			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				1,
				'id',
				'test-user-id'
			)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				2,
				'id',
				'replacement-user-id'
			)
			expect(store.profile).toEqual(replacementProfile)
			expect(mockSetTheme).toHaveBeenLastCalledWith('light')

			firstProfileRequest.resolve({
				data: createMockProfile({ id: 'test-user-id', ui_theme: 'dark' }),
				error: null
			})
			await drainLifecycleTasks()

			expect(store.profile).toEqual(replacementProfile)
			expect(mockSetTheme).toHaveBeenLastCalledWith('light')
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('hydrates one persisted-session profile without a duplicate reactive load', async () => {
			mockSupaUser.value = null
			mockSupabaseClient.auth.getSession.mockResolvedValue({
				data: { session: { user: { id: 'session-user-id' } } },
				error: null
			})
			const sessionProfile = createMockProfile({
				id: 'session-user-id',
				ui_theme: 'dark'
			})
			mockQueryBuilder.single.mockResolvedValueOnce({
				data: sessionProfile,
				error: null
			})
			const store = createUserStore({ preserveLifecycleCalls: true })
			await drainLifecycleTasks()

			expect(mockSupabaseClient.auth.getSession).toHaveBeenCalledTimes(1)
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1)
			expect(store.profile).toEqual(sessionProfile)

			mockSupaUser.value = {
				id: 'session-user-id',
				email: 'session@example.com'
			}
			await drainLifecycleTasks()

			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1)
			expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'session-user-id')
		})
	})

	describe('fetchProfile', () => {
		it('returns false when user is not logged in', async () => {
			const store = useUserStore()
			mockSupaUser.value = null

			const result = await store.fetchProfile()

			expect(result).toBe(false)
		})

		it('falls back to auth.getUser when reactive user is unavailable', async () => {
			const store = useUserStore()
			mockSupaUser.value = null
			mockSupabaseClient.auth.getUser.mockResolvedValue({
				data: {
					user: { id: 'fallback-user-id', email: 'fallback@example.com' }
				},
				error: null
			})
			const mockProfile = { id: 'fallback-user-id', ui_theme: 'dark' }
			mockQueryBuilder.single.mockResolvedValue({
				data: mockProfile,
				error: null
			})

			const result = await store.fetchProfile()

			expect(result).toBe(true)
			expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'fallback-user-id')
		})

		it('returns true and sets profile on success', async () => {
			const store = useUserStore()
			const mockProfile = {
				id: 'test-user-id',
				ui_theme: 'dark',
				key_format: 'camelot'
			}
			mockQueryBuilder.single.mockResolvedValue({
				data: mockProfile,
				error: null
			})

			const result = await store.fetchProfile()

			expect(result).toBe(true)
			expect(store.profile).toEqual(mockProfile)
			expect(store.currentKeyFormat).toBe('camelot')
		})

		it('calls setTheme with profile theme', async () => {
			const store = useUserStore()
			const mockProfile = { id: 'test-user-id', ui_theme: 'dark' }
			mockQueryBuilder.single.mockResolvedValue({
				data: mockProfile,
				error: null
			})

			await store.fetchProfile()

			expect(mockSetTheme).toHaveBeenCalledWith('dark')
		})

		it('returns false on fetch error', async () => {
			const store = useUserStore()
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Database error')
			})

			const result = await store.fetchProfile()

			expect(result).toBe(false)
		})
	})
})
