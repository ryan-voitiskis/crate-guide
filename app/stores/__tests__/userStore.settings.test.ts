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
const mockGetSavedAnonymousThemePreference =
	harness.getSavedAnonymousThemePreference
const mockSaveAnonymousThemePreference = harness.saveAnonymousThemePreference
const mockSupabaseClient = harness.supabaseClient
const useUserStore = harness.useUserStore
let mockQueryBuilder = harness.queryBuilder
describe('userStore settings', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockQueryBuilder = harness.reset()
	})

	afterEach(() => harness.dispose())

	describe('updateSettings', () => {
		it('does not let an older profile fetch overwrite a completed write', async () => {
			const staleFetch = createDeferred<{
				data: Profile
				error: null
			}>()
			const originalProfile = createMockProfile({
				id: 'test-user-id',
				key_format: 'key',
				turntable_pitch_range: 8,
				ui_theme: 'light'
			})
			const updatedProfile = createMockProfile({
				id: 'test-user-id',
				key_format: 'camelot',
				turntable_pitch_range: 16,
				ui_theme: 'dark'
			})
			const store = useUserStore()
			store.profile = originalProfile
			mockQueryBuilder.single
				.mockReturnValueOnce(staleFetch.promise)
				.mockResolvedValueOnce({ data: updatedProfile, error: null })

			const fetchResult = store.fetchProfile()
			await drainLifecycleTasks()
			await expect(
				store.updateSettings({
					key_format: 'camelot',
					turntable_pitch_range: 16,
					ui_theme: 'dark'
				})
			).resolves.toBe(true)
			staleFetch.resolve({ data: originalProfile, error: null })
			await expect(fetchResult).resolves.toBe(true)

			expect(store.profile).toEqual(updatedProfile)
			expect(store.currentKeyFormat).toBe('camelot')
			expect(mockSetTheme).toHaveBeenLastCalledWith('dark')
		})

		it('preserves an optimistic write when an older fetch resolves first', async () => {
			const staleFetch = createDeferred<{
				data: Profile
				error: null
			}>()
			const updateRequest = createDeferred<{
				data: Profile
				error: null
			}>()
			const originalProfile = createMockProfile({
				id: 'test-user-id',
				turntable_pitch_range: 8
			})
			const updatedProfile = createMockProfile({
				id: 'test-user-id',
				turntable_pitch_range: 16
			})
			const store = useUserStore()
			store.profile = originalProfile
			mockQueryBuilder.single
				.mockReturnValueOnce(staleFetch.promise)
				.mockReturnValueOnce(updateRequest.promise)

			const fetchResult = store.fetchProfile()
			await drainLifecycleTasks()
			const updateResult = store.updateSettings({ turntable_pitch_range: 16 })
			await drainLifecycleTasks()
			expect(store.profile?.turntable_pitch_range).toBe(16)

			staleFetch.resolve({ data: originalProfile, error: null })
			await expect(fetchResult).resolves.toBe(true)
			expect(store.profile?.turntable_pitch_range).toBe(16)

			updateRequest.resolve({ data: updatedProfile, error: null })
			await expect(updateResult).resolves.toBe(true)
			expect(store.profile).toEqual(updatedProfile)
		})

		it('does not let failed-write recovery clobber a later queued write', async () => {
			const firstUpdateRequest = createDeferred<{
				data: null
				error: Error
			}>()
			const secondUpdateRequest = createDeferred<{
				data: Profile
				error: null
			}>()
			const originalProfile = createMockProfile({
				id: 'test-user-id',
				key_format: 'key',
				turntable_pitch_range: 8
			})
			const finalProfile = createMockProfile({
				id: 'test-user-id',
				key_format: 'camelot',
				turntable_pitch_range: 8
			})
			const store = useUserStore()
			store.profile = originalProfile
			mockQueryBuilder.single
				.mockReturnValueOnce(firstUpdateRequest.promise)
				.mockResolvedValueOnce({ data: originalProfile, error: null })
				.mockReturnValueOnce(secondUpdateRequest.promise)

			const firstUpdate = store.updateSettings({ turntable_pitch_range: 16 })
			await drainLifecycleTasks()
			const secondUpdate = store.updateSettings({ key_format: 'camelot' })
			expect(store.profile).toMatchObject({
				key_format: 'camelot',
				turntable_pitch_range: 16
			})

			firstUpdateRequest.resolve({
				data: null,
				error: new Error('Update failed')
			})
			await drainLifecycleTasks()
			expect(store.profile).toMatchObject({
				key_format: 'camelot',
				turntable_pitch_range: 16
			})

			secondUpdateRequest.resolve({ data: finalProfile, error: null })
			await expect(Promise.all([firstUpdate, secondUpdate])).resolves.toEqual([
				false,
				true
			])
			expect(store.profile).toEqual(finalProfile)
		})

		it('does not let an earlier write response clobber a later queued write', async () => {
			const firstUpdateRequest = createDeferred<{
				data: Profile
				error: null
			}>()
			const secondUpdateRequest = createDeferred<{
				data: Profile
				error: null
			}>()
			const originalProfile = createMockProfile({
				id: 'test-user-id',
				key_format: 'key',
				turntable_pitch_range: 8
			})
			const firstServerProfile = createMockProfile({
				id: 'test-user-id',
				key_format: 'key',
				turntable_pitch_range: 16
			})
			const finalProfile = createMockProfile({
				id: 'test-user-id',
				key_format: 'camelot',
				turntable_pitch_range: 16
			})
			const store = useUserStore()
			store.profile = originalProfile
			mockQueryBuilder.single
				.mockReturnValueOnce(firstUpdateRequest.promise)
				.mockReturnValueOnce(secondUpdateRequest.promise)

			const firstUpdate = store.updateSettings({ turntable_pitch_range: 16 })
			await drainLifecycleTasks()
			const secondUpdate = store.updateSettings({ key_format: 'camelot' })
			expect(store.profile).toMatchObject({
				key_format: 'camelot',
				turntable_pitch_range: 16
			})

			firstUpdateRequest.resolve({ data: firstServerProfile, error: null })
			await drainLifecycleTasks()
			expect(store.profile).toMatchObject({
				key_format: 'camelot',
				turntable_pitch_range: 16
			})

			secondUpdateRequest.resolve({ data: finalProfile, error: null })
			await expect(Promise.all([firstUpdate, secondUpdate])).resolves.toEqual([
				true,
				true
			])
			expect(store.profile).toEqual(finalProfile)
		})

		it('uses a fresh failed-write recovery profile for derived theme state', async () => {
			const recoveredProfile = createMockProfile({
				id: 'test-user-id',
				ui_theme: 'auto'
			})
			const store = useUserStore()
			store.profile = createMockProfile({
				id: 'test-user-id',
				ui_theme: 'light'
			})
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Update failed')
				})
				.mockResolvedValueOnce({ data: recoveredProfile, error: null })

			await store.updateTheme('dark')

			expect(store.profile).toEqual(recoveredProfile)
			expect(mockSetTheme).toHaveBeenLastCalledWith('auto')
		})

		it('performs optimistic update', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ turntable_pitch_range: 8 })
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'test', turntable_pitch_range: 16 },
				error: null
			})

			const updatePromise = store.updateSettings({ turntable_pitch_range: 16 })

			// Optimistic update should happen immediately
			expect(store.profile?.turntable_pitch_range).toBe(16)

			await updatePromise
		})

		it('updates with server response', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ turntable_pitch_range: 8 })
			const serverResponse = {
				id: 'test',
				turntable_pitch_range: 16,
				updated_at: '2024-01-01'
			}
			mockQueryBuilder.single.mockResolvedValue({
				data: serverResponse,
				error: null
			})

			await store.updateSettings({ turntable_pitch_range: 16 })

			expect(store.profile).toEqual(serverResponse)
		})

		it('sends key_format in update payload', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ key_format: 'key' })
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'test', key_format: 'camelot' },
				error: null
			})

			await store.updateSettings({ key_format: 'camelot' })

			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				key_format: 'camelot'
			})
		})

		it('upserts profile when update finds no row', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ key_format: 'key' })
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: null,
					error: { code: 'PGRST116', message: 'No rows found' }
				})
				.mockResolvedValueOnce({
					data: { id: 'test-user-id', key_format: 'camelot' },
					error: null
				})

			const result = await store.updateSettings({ key_format: 'camelot' })

			expect(result).toBe(true)
			expect(mockQueryBuilder.upsert).toHaveBeenCalledWith(
				{
					id: 'test-user-id',
					key_format: 'camelot'
				},
				{ onConflict: 'id' }
			)
		})

		it('sets isUpdatingSettings during update', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'test' },
				error: null
			})

			const updatePromise = store.updateSettings({ turntable_pitch_range: 16 })
			await Promise.resolve()
			expect(store.isUpdatingSettings).toBe(true)

			await updatePromise
			expect(store.isUpdatingSettings).toBe(false)
		})

		it('queues concurrent updates instead of dropping them', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: { id: 'test', turntable_pitch_range: 16 },
					error: null
				})
				.mockResolvedValueOnce({
					data: { id: 'test', key_format: 'camelot' },
					error: null
				})

			const firstUpdate = store.updateSettings({ turntable_pitch_range: 16 })
			const secondUpdate = store.updateSettings({ key_format: 'camelot' })
			await Promise.all([firstUpdate, secondUpdate])

			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
			expect(mockQueryBuilder.update).toHaveBeenNthCalledWith(1, {
				turntable_pitch_range: 16
			})
			expect(mockQueryBuilder.update).toHaveBeenNthCalledWith(2, {
				key_format: 'camelot'
			})
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				1,
				'id',
				'test-user-id'
			)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				2,
				'id',
				'test-user-id'
			)
		})

		it('drops queued and settling updates when the identity changes', async () => {
			const firstUpdateRequest = createDeferred<{
				data: Profile
				error: null
			}>()
			const replacementProfile = createMockProfile({
				id: 'replacement-user-id',
				key_format: 'key',
				turntable_pitch_range: 8,
				ui_theme: 'light'
			})
			const store = useUserStore()
			store.profile = createMockProfile({
				id: 'test-user-id',
				key_format: 'key',
				turntable_pitch_range: 8
			})
			mockQueryBuilder.single
				.mockReturnValueOnce(firstUpdateRequest.promise)
				.mockResolvedValueOnce({ data: replacementProfile, error: null })

			const settlingUpdate = store.updateSettings({
				turntable_pitch_range: 16
			})
			await drainLifecycleTasks()
			expect(mockQueryBuilder.update).toHaveBeenCalledTimes(1)

			const queuedUpdate = store.updateSettings({ key_format: 'camelot' })
			expect(store.profile?.key_format).toBe('camelot')

			mockSupaUser.value = {
				id: 'replacement-user-id',
				email: 'replacement@example.com'
			}
			await drainLifecycleTasks()

			expect(store.profile).toEqual(replacementProfile)
			expect(store.isUpdatingSettings).toBe(false)

			firstUpdateRequest.resolve({
				data: createMockProfile({
					id: 'test-user-id',
					turntable_pitch_range: 16
				}),
				error: null
			})

			await expect(
				Promise.all([settlingUpdate, queuedUpdate])
			).resolves.toEqual([false, false])
			expect(mockQueryBuilder.update).toHaveBeenCalledTimes(1)
			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				turntable_pitch_range: 16
			})
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
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('refetches profile on error', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockQueryBuilder.single.mockResolvedValue({
				data: null,
				error: new Error('Update failed')
			})

			await store.updateSettings({ turntable_pitch_range: 16 })

			// fetchProfile should be called (which triggers another from() call)
			expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2)
		})

		it('does nothing when user not logged in', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockSupaUser.value = null

			await store.updateSettings({ turntable_pitch_range: 16 })

			// The unauthenticated call settles without leaving loading state behind.
			expect(store.isUpdatingSettings).toBe(false)
		})

		it('does not re-resolve a conflicting reactive identity after invalidation', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ id: 'test-user-id' })

			await store.signOut()
			mockSupabaseClient.auth.getSession.mockClear()
			mockSupabaseClient.auth.getUser.mockClear()

			await expect(
				store.updateSettings({ turntable_pitch_range: 16 })
			).resolves.toBe(false)
			expect(mockSupabaseClient.auth.getSession).not.toHaveBeenCalled()
			expect(mockSupabaseClient.auth.getUser).not.toHaveBeenCalled()
			expect(mockQueryBuilder.update).not.toHaveBeenCalled()
			expect(store.profile).toBeNull()
		})
	})

	describe('updateTheme', () => {
		it('calls setTheme with new theme', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ ui_theme: 'light' })
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'test', ui_theme: 'dark' },
				error: null
			})

			await store.updateTheme('dark')

			expect(mockSetTheme).toHaveBeenCalledWith('dark')
		})

		it('calls updateSettings with new theme', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ ui_theme: 'light' })
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'test', ui_theme: 'dark' },
				error: null
			})

			await store.updateTheme('dark')

			expect(mockQueryBuilder.update).toHaveBeenCalledWith({ ui_theme: 'dark' })
		})

		it('does not overwrite the anonymous preference', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ ui_theme: 'light' })
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'test', ui_theme: 'dark' },
				error: null
			})

			await store.updateTheme('dark')

			expect(mockSaveAnonymousThemePreference).not.toHaveBeenCalled()
		})

		it('persists auto theme preference', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ ui_theme: 'light' })
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'test', ui_theme: 'auto' },
				error: null
			})

			await store.updateTheme('auto')

			expect(mockSetTheme).toHaveBeenCalledWith('auto')
			expect(mockQueryBuilder.update).toHaveBeenCalledWith({ ui_theme: 'auto' })
		})

		it('persists using session fallback when reactive user is unavailable', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ ui_theme: 'light' })
			mockSupaUser.value = null
			mockSupabaseClient.auth.getSession.mockResolvedValue({
				data: { session: { user: { id: 'session-user-id' } } },
				error: null
			})
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'session-user-id', ui_theme: 'dark' },
				error: null
			})

			await store.updateTheme('dark')

			expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'session-user-id')
			expect(mockQueryBuilder.update).toHaveBeenCalledWith({ ui_theme: 'dark' })
		})

		it('uses recovered profile state after an adopted session setting fails', async () => {
			mockGetSavedAnonymousThemePreference.mockReturnValue('light')
			const store = useUserStore()
			mockSupaUser.value = null
			mockSupabaseClient.auth.getSession.mockResolvedValue({
				data: { session: { user: { id: 'session-user-id' } } },
				error: null
			})
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Update failed')
				})
				.mockResolvedValueOnce({
					data: createMockProfile({
						id: 'session-user-id',
						ui_theme: 'auto'
					}),
					error: null
				})

			await store.updateTheme('dark')

			expect(mockQueryBuilder.update).toHaveBeenCalledWith({ ui_theme: 'dark' })
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				1,
				'id',
				'session-user-id'
			)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				2,
				'id',
				'session-user-id'
			)
			expect(mockSetTheme).toHaveBeenLastCalledWith('auto')
		})

		it('does not roll an adopted session theme into a replacement identity', async () => {
			mockGetSavedAnonymousThemePreference.mockReturnValue('light')
			const store = useUserStore()
			mockSupaUser.value = null
			mockSupabaseClient.auth.getSession.mockResolvedValue({
				data: { session: { user: { id: 'session-user-id' } } },
				error: null
			})
			const updateRequest = createDeferred<{
				data: null
				error: Error
			}>()
			const replacementProfile = createMockProfile({
				id: 'replacement-user-id',
				ui_theme: 'dark'
			})
			mockQueryBuilder.single
				.mockReturnValueOnce(updateRequest.promise)
				.mockResolvedValueOnce({ data: replacementProfile, error: null })

			const updatePromise = store.updateTheme('dark')
			await drainLifecycleTasks()
			mockSupaUser.value = {
				id: 'replacement-user-id',
				email: 'replacement@example.com'
			}
			await drainLifecycleTasks()
			updateRequest.resolve({ data: null, error: new Error('Update failed') })
			await updatePromise

			expect(store.profile).toEqual(replacementProfile)
			expect(mockQueryBuilder.update).toHaveBeenCalledTimes(1)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				1,
				'id',
				'session-user-id'
			)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				2,
				'id',
				'replacement-user-id'
			)
			expect(mockSetTheme).toHaveBeenLastCalledWith('dark')
			expect(mockToast.error).not.toHaveBeenCalled()
		})
	})

	describe('updateKeyFormat', () => {
		it('uses a fresh failed-write recovery profile for derived key state', async () => {
			const recoveredProfile = createMockProfile({
				id: 'test-user-id',
				key_format: 'camelot'
			})
			const store = useUserStore()
			store.profile = createMockProfile({
				id: 'test-user-id',
				key_format: 'key'
			})
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Update failed')
				})
				.mockResolvedValueOnce({ data: recoveredProfile, error: null })

			await store.updateKeyFormat('camelot')

			expect(store.profile).toEqual(recoveredProfile)
			expect(store.currentKeyFormat).toBe('camelot')
		})

		it('updates key format when changed', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ key_format: 'key' })
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'test', key_format: 'camelot' },
				error: null
			})

			await store.updateKeyFormat('camelot')

			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				key_format: 'camelot'
			})
			expect(store.currentKeyFormat).toBe('camelot')
		})

		it('persists using session fallback when reactive user is unavailable', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ key_format: 'key' })
			mockSupaUser.value = null
			mockSupabaseClient.auth.getSession.mockResolvedValue({
				data: { session: { user: { id: 'session-user-id' } } },
				error: null
			})
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'session-user-id', key_format: 'camelot' },
				error: null
			})

			await store.updateKeyFormat('camelot')

			expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'session-user-id')
			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				key_format: 'camelot'
			})
		})

		it('rolls back after an adopted session key format fails', async () => {
			const store = useUserStore()
			mockSupaUser.value = null
			mockSupabaseClient.auth.getSession.mockResolvedValue({
				data: { session: { user: { id: 'session-user-id' } } },
				error: null
			})
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Update failed')
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Refetch failed')
				})

			await store.updateKeyFormat('camelot')

			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				key_format: 'camelot'
			})
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				1,
				'id',
				'session-user-id'
			)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				2,
				'id',
				'session-user-id'
			)
			expect(store.currentKeyFormat).toBe('key')
		})

		it('does not roll an adopted key format into a replacement identity', async () => {
			const store = useUserStore()
			mockSupaUser.value = null
			mockSupabaseClient.auth.getSession.mockResolvedValue({
				data: { session: { user: { id: 'session-user-id' } } },
				error: null
			})
			const updateRequest = createDeferred<{
				data: null
				error: Error
			}>()
			const replacementProfile = createMockProfile({
				id: 'replacement-user-id',
				key_format: 'camelot'
			})
			mockQueryBuilder.single
				.mockReturnValueOnce(updateRequest.promise)
				.mockResolvedValueOnce({ data: replacementProfile, error: null })

			const updatePromise = store.updateKeyFormat('camelot')
			await drainLifecycleTasks()
			mockSupaUser.value = {
				id: 'replacement-user-id',
				email: 'replacement@example.com'
			}
			await drainLifecycleTasks()
			updateRequest.resolve({ data: null, error: new Error('Update failed') })
			await updatePromise

			expect(store.profile).toEqual(replacementProfile)
			expect(mockQueryBuilder.update).toHaveBeenCalledTimes(1)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				1,
				'id',
				'session-user-id'
			)
			expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(
				2,
				'id',
				'replacement-user-id'
			)
			store.profile = createMockProfile({
				id: 'replacement-user-id',
				key_format: 'invalid' as unknown as Profile['key_format']
			})
			expect(store.currentKeyFormat).toBe('camelot')
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('keeps local preference and skips db update when unauthenticated', async () => {
			const store = useUserStore()
			store.profile = null
			mockSupaUser.value = null
			mockSupabaseClient.auth.getSession.mockResolvedValue({
				data: { session: null },
				error: null
			})
			mockSupabaseClient.auth.getUser.mockResolvedValue({
				data: { user: null },
				error: null
			})

			await store.updateKeyFormat('camelot')

			expect(mockQueryBuilder.update).not.toHaveBeenCalled()
			expect(store.currentKeyFormat).toBe('camelot')
		})

		it('does not update when value is unchanged', async () => {
			const store = useUserStore()
			store.profile = createMockProfile({ key_format: 'camelot' })

			await store.updateKeyFormat('camelot')

			expect(mockQueryBuilder.update).not.toHaveBeenCalled()
		})

		it('rolls back local preference when persistence fails', async () => {
			const store = useUserStore()
			store.profile = null
			mockQueryBuilder.single
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Update failed')
				})
				.mockResolvedValueOnce({
					data: null,
					error: new Error('Fetch failed')
				})

			await store.updateKeyFormat('camelot')

			expect(mockQueryBuilder.update).toHaveBeenCalledWith({
				key_format: 'camelot'
			})
			expect(store.currentKeyFormat).toBe('key')
		})
	})

	describe('setLocalTheme', () => {
		it('persists and applies an explicit anonymous preference', () => {
			mockSupaUser.value = null
			const store = useUserStore()

			store.setLocalTheme('dark')

			expect(store.currentTheme).toBe('dark')
			expect(mockSaveAnonymousThemePreference).toHaveBeenCalledWith('dark')
			expect(mockSetTheme).toHaveBeenLastCalledWith('dark')
		})
	})
})
