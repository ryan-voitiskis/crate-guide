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
const mockRouter = harness.router
const mockSetTheme = harness.setTheme
const mockGetSavedAnonymousThemePreference =
	harness.getSavedAnonymousThemePreference
const mockSupabaseClient = harness.supabaseClient
const createUserStore = harness.createUserStore
const useUserStore = harness.useUserStore
let mockQueryBuilder = harness.queryBuilder
describe('userStore authentication', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockQueryBuilder = harness.reset()
	})

	afterEach(() => harness.dispose())

	describe('initial state', () => {
		it('derives the reactive user ID from JWT subject claims', () => {
			mockSupaUser.value = {
				sub: 'claims-user-id',
				email: 'claims@example.com'
			}

			const store = createUserStore({ preserveLifecycleCalls: true })

			expect(store.supaUserId).toBe('claims-user-id')
			expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'claims-user-id')
		})

		it('starts with null profile', () => {
			const store = useUserStore()
			expect(store.profile).toBeNull()
		})

		it('starts with userAlreadyRegistered as false', () => {
			const store = useUserStore()
			expect(store.userAlreadyRegistered).toBe(false)
		})

		it('starts with isUpdatingSettings as false', () => {
			const store = useUserStore()
			expect(store.isUpdatingSettings).toBe(false)
		})
	})

	describe('currentTheme computed', () => {
		it('returns auto when profile is null and no anonymous preference is saved', () => {
			const store = useUserStore()
			store.profile = null

			expect(store.currentTheme).toBe('auto')
		})

		it('returns the saved anonymous theme when profile is null', () => {
			mockGetSavedAnonymousThemePreference.mockReturnValue('dark')
			const store = useUserStore()
			store.profile = null

			expect(store.currentTheme).toBe('dark')
		})

		it('returns profile theme when set', () => {
			const store = useUserStore()
			store.profile = createMockProfile({ ui_theme: 'dark' })

			expect(store.currentTheme).toBe('dark')
		})

		it('returns auto when profile theme is auto', () => {
			const store = useUserStore()
			store.profile = createMockProfile({ ui_theme: 'auto' })

			expect(store.currentTheme).toBe('auto')
		})

		it('returns the anonymous theme when profile has no theme', () => {
			const store = useUserStore()
			store.profile = createMockProfile() as unknown as Profile
			store.profile.ui_theme = null as unknown as Profile['ui_theme']

			expect(store.currentTheme).toBe('auto')
		})
	})

	describe('currentKeyFormat computed', () => {
		it('defaults to key when profile is null', () => {
			const store = useUserStore()
			store.profile = null

			expect(store.currentKeyFormat).toBe('key')
		})

		it('returns profile key format when valid', () => {
			const store = useUserStore()
			store.profile = createMockProfile({ key_format: 'camelot' })

			expect(store.currentKeyFormat).toBe('camelot')
		})

		it('falls back to key when profile key format is invalid', () => {
			const store = useUserStore()
			store.profile = createMockProfile({
				key_format: 'invalid' as unknown as Profile['key_format']
			})

			expect(store.currentKeyFormat).toBe('key')
		})

		it('falls back to local preference when profile key format is invalid', async () => {
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
			store.profile = createMockProfile({
				key_format: 'invalid' as unknown as Profile['key_format']
			})

			expect(store.currentKeyFormat).toBe('camelot')
		})
	})

	describe('signUpWithEmail', () => {
		it('returns true and navigates to check-inbox when confirmation is required', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signUp.mockResolvedValue({
				data: { session: null },
				error: null
			})

			const result = await store.signUpWithEmail(
				'test@example.com',
				'Password123'
			)

			expect(result).toBe(true)
			expect(mockRouter.push).toHaveBeenCalledWith(
				'/auth/check-inbox?redirect=%2F'
			)
			expect(store.pendingSignup).toEqual({
				email: 'test@example.com',
				returnPath: '/'
			})
		})

		it('returns true and navigates to home when a session is created immediately', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signUp.mockResolvedValue({
				data: { session: { access_token: 'token' } },
				error: null
			})

			const result = await store.signUpWithEmail(
				'test@example.com',
				'Password123'
			)

			expect(result).toBe(true)
			expect(mockRouter.push).toHaveBeenCalledWith('/')
		})

		it('returns false when the user is already registered', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signUp.mockResolvedValue({
				data: null,
				error: { message: 'User already registered' }
			})

			const result = await store.signUpWithEmail(
				'test@example.com',
				'Password123'
			)

			expect(result).toBe(false)
			expect(store.userAlreadyRegistered).toBe(true)
			expect(mockRouter.push).toHaveBeenCalledWith('/login?redirect=%2F')
		})

		it('returns false on auth errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signUp.mockResolvedValue({
				data: null,
				error: { message: 'Invalid email' }
			})

			const result = await store.signUpWithEmail('invalid', 'password')

			expect(result).toBe(false)
			expect(mockRouter.push).not.toHaveBeenCalled()
			expect(store.authFeedback['email-signup']).toBe(
				'Your account could not be created. Check the details and try again.'
			)
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('preserves the requested destination through confirmation', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signUp.mockResolvedValue({
				data: { session: null },
				error: null
			})

			await store.signUpWithEmail(
				'test@example.com',
				'Password123',
				'/records?crate=house'
			)

			expect(mockRouter.push).toHaveBeenCalledWith(
				'/auth/check-inbox?redirect=%2Frecords%3Fcrate%3Dhouse'
			)
		})
	})

	describe('signInWithEmail', () => {
		it('returns true on success without navigating', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.signInWithEmail(
				'test@example.com',
				'Password123'
			)

			expect(result).toBe(true)
			expect(mockRouter.push).not.toHaveBeenCalled()
		})

		it('returns false on auth errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
				data: null,
				error: { message: 'Invalid credentials' }
			})

			const result = await store.signInWithEmail('test@example.com', 'wrong')

			expect(result).toBe(false)
			expect(store.authFeedback['email-login']).toBe(
				"We couldn't sign you in. Check your credentials and try again."
			)
			expect(mockToast.error).not.toHaveBeenCalled()
			expect(mockRouter.push).not.toHaveBeenCalled()
		})
	})

	describe('signInWithProvider', () => {
		it('returns true and calls signInWithOAuth with github', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.signInWithProvider('github')

			expect(result).toBe(true)
			expect(mockSupabaseClient.auth.signInWithOAuth).toHaveBeenCalledWith({
				provider: 'github',
				options: {
					redirectTo: 'https://example.com/auth/finalising?redirect=%2F'
				}
			})
		})

		it('returns true and calls signInWithOAuth with google', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.signInWithProvider(
				'google',
				'/records?crate=house#release-1'
			)

			expect(result).toBe(true)
			expect(mockSupabaseClient.auth.signInWithOAuth).toHaveBeenCalledWith({
				provider: 'google',
				options: {
					redirectTo:
						'https://example.com/auth/finalising?redirect=%2Frecords%3Fcrate%3Dhouse%23release-1'
				}
			})
		})

		it('falls back to home for an unsafe OAuth return target', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.signInWithProvider(
				'github',
				'https://evil.example/records'
			)

			expect(result).toBe(true)
			expect(mockSupabaseClient.auth.signInWithOAuth).toHaveBeenCalledWith({
				provider: 'github',
				options: {
					redirectTo: 'https://example.com/auth/finalising?redirect=%2F'
				}
			})
		})

		it('returns false on OAuth errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
				data: null,
				error: { message: 'OAuth error' }
			})

			await expect(store.signInWithProvider('github')).resolves.toBe(false)
			expect(store.authFeedback.github).toBe(
				"GitHub sign-in couldn't start. Please try again."
			)
			expect(store.authFeedback.google).toBeNull()
			expect(mockToast.error).not.toHaveBeenCalled()
		})
	})

	describe('signOut', () => {
		it('uses local scope, clears profile, replaces the route, and returns true', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			const routeReplacement = createDeferred<undefined>()
			mockRouter.replace.mockReturnValueOnce(routeReplacement.promise)
			mockSupabaseClient.auth.signOut.mockImplementationOnce(async () => {
				expect(store.isSigningOut).toBe(true)
				mockSupaUser.value = null
				return { error: null }
			})

			const signOutPromise = store.signOut()
			await drainLifecycleTasks()

			expect(store.isSigningOut).toBe(true)
			expect(mockSupabaseClient.auth.signOut).toHaveBeenCalledWith({
				scope: 'local'
			})
			expect(store.profile).toBeNull()
			expect(mockRouter.replace).toHaveBeenCalledOnce()
			expect(mockRouter.replace).toHaveBeenCalledWith('/login')

			routeReplacement.resolve(undefined)
			await expect(signOutPromise).resolves.toBe(true)
			expect(store.isSigningOut).toBe(false)
		})

		it('restores the anonymous theme on success', async () => {
			mockGetSavedAnonymousThemePreference.mockReturnValue('auto')
			const store = useUserStore()
			store.profile = createMockProfile({ ui_theme: 'dark' })

			await store.signOut()

			expect(mockSetTheme).toHaveBeenLastCalledWith('auto')
		})

		it('handles sign out errors', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockSupabaseClient.auth.signOut.mockResolvedValue({
				error: new Error('Sign out failed')
			})

			const result = await store.signOut()

			expect(result).toBe(false)
			expect(mockSupabaseClient.auth.signOut).toHaveBeenCalledWith({
				scope: 'local'
			})
			// Profile should not be cleared on error
			expect(store.profile).not.toBeNull()
			expect(store.profile?.id).toBe('test')
			expect(mockRouter.replace).not.toHaveBeenCalled()
			expect(store.isSigningOut).toBe(false)
		})

		it('reports route failure separately after a truthful sign out', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockRouter.replace.mockRejectedValueOnce(
				new Error('Navigation unavailable')
			)

			await expect(store.signOut()).resolves.toBe(true)

			expect(store.profile).toBeNull()
			expect(store.isSigningOut).toBe(false)
			expect(mockToast.success).not.toHaveBeenCalledWith(
				'You are now signed out.'
			)
			expect(mockToast.error).toHaveBeenCalledWith(
				'You are signed out, but the login page could not open.',
				{ duration: 30000 }
			)
		})
	})

	describe('pending signup confirmation', () => {
		it('consumes the existing-account notice exactly once', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signUp.mockResolvedValue({
				data: null,
				error: { message: 'User already registered' }
			})
			await store.signUpWithEmail('test@example.com', 'Password123')

			expect(store.consumeUserAlreadyRegistered()).toBe(true)
			expect(store.consumeUserAlreadyRegistered()).toBe(false)
		})

		it('resends only when ephemeral signup context exists', async () => {
			const store = useUserStore()
			expect(await store.resendSignupConfirmation()).toBe(false)

			mockSupabaseClient.auth.signUp.mockResolvedValue({
				data: { session: null },
				error: null
			})
			await store.signUpWithEmail('test@example.com', 'Password123', '/records')

			expect(await store.resendSignupConfirmation()).toBe(true)
			expect(mockSupabaseClient.auth.resend).toHaveBeenCalledWith({
				type: 'signup',
				email: 'test@example.com'
			})
		})
	})
})
