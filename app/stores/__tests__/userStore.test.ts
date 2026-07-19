import {
	type EffectScope,
	computed,
	effectScope,
	nextTick,
	readonly,
	ref,
	watch
} from 'vue'
import { toast } from 'vue-sonner'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '~/../../shared/types/supabase'
// Import after mocking
import { useUserStore as createPiniaUserStore } from '../userStore'

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

// Mock dependencies
const mockSupaUser = ref<{ email: string; id?: string; sub?: string } | null>({
	id: 'test-user-id',
	email: 'test@example.com'
})

const mockRouter = {
	push: vi.fn(),
	replace: vi.fn().mockResolvedValue(undefined)
}

const mockPasswordRecovery = {
	activate: vi.fn(),
	consume: vi.fn()
}

const mockUseRecordsStore = vi.fn()
const mockUseTracksStore = vi.fn()
const mockUseCratesStore = vi.fn()
const mockUseSessionStore = vi.fn()

const mockSetTheme = vi.fn()
const mockGetSavedAnonymousThemePreference = vi.fn().mockReturnValue(null)
const mockSaveAnonymousThemePreference = vi.fn()
const mockIsKeyFormat = vi.fn(
	(value: string | null | undefined) => value === 'key' || value === 'camelot'
)

function createMockProfile(overrides: Partial<Profile> = {}): Profile {
	return {
		discogs_avatar_url: null,
		discogs_uid: null,
		discogs_username: null,
		id: 'test',
		just_completed_discogs_oauth: false,
		key_format: 'camelot',
		list_layout: 'grid',
		name: null,
		selected_crate: 'all',
		turntable_pitch_range: 8,
		turntable_theme: 'silver',
		ui_theme: 'light',
		...overrides
	}
}

// Create a chainable mock query builder
function createMockQueryBuilder() {
	const builder = {
		select: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		upsert: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockReturnValue(new Promise(() => {}))
	}
	return builder
}

let mockQueryBuilder = createMockQueryBuilder()

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder),
	rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
	functions: {
		invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null })
	},
	auth: {
		getSession: vi.fn().mockImplementation(async () => ({
			data: {
				session: mockSupaUser.value
					? { user: { id: mockSupaUser.value.id ?? mockSupaUser.value.sub } }
					: null
			},
			error: null
		})),
		getUser: vi
			.fn()
			.mockImplementation(async () => ({ data: { user: mockSupaUser.value } })),
		signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
		signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
		signInWithOAuth: vi.fn().mockResolvedValue({ data: null, error: null }),
		signOut: vi.fn().mockResolvedValue({ error: null }),
		resetPasswordForEmail: vi
			.fn()
			.mockResolvedValue({ data: null, error: null }),
		updateUser: vi.fn().mockResolvedValue({ data: null, error: null }),
		verifyOtp: vi.fn().mockResolvedValue({ data: null, error: null })
	}
}

// Mock isError utility
const isError = (e: unknown): e is Error => e instanceof Error

// Stub globals before importing the store
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)
vi.stubGlobal('useSupabaseUser', () => mockSupaUser)
vi.stubGlobal('useRouter', () => mockRouter)
vi.stubGlobal('usePasswordRecovery', () => mockPasswordRecovery)
vi.stubGlobal('useRecordsStore', mockUseRecordsStore)
vi.stubGlobal('useTracksStore', mockUseTracksStore)
vi.stubGlobal('useCratesStore', mockUseCratesStore)
vi.stubGlobal('useSessionStore', mockUseSessionStore)
vi.stubGlobal('setTheme', mockSetTheme)
vi.stubGlobal(
	'getSavedAnonymousThemePreference',
	mockGetSavedAnonymousThemePreference
)
vi.stubGlobal('saveAnonymousThemePreference', mockSaveAnonymousThemePreference)
vi.stubGlobal('isKeyFormat', mockIsKeyFormat)
vi.stubGlobal('isError', isError)
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('readonly', readonly)
vi.stubGlobal('watch', watch)

// Mock process.env
vi.stubGlobal('process', { env: { SITE_URL: 'https://example.com' } })

const activeScopes: EffectScope[] = []
const activeStores: ReturnType<typeof createPiniaUserStore>[] = []

function clearQueryBuilderCalls() {
	for (const queryMethod of Object.values(mockQueryBuilder)) {
		queryMethod.mockClear()
	}
	mockSupabaseClient.from.mockClear()
}

function createUserStore(options: { preserveLifecycleCalls?: boolean } = {}) {
	const scope = effectScope()
	const store = scope.run(() => createPiniaUserStore())
	if (!store) throw new Error('Failed to create user store scope')
	activeScopes.push(scope)
	activeStores.push(store)
	if (!options.preserveLifecycleCalls) clearQueryBuilderCalls()
	return store
}

function useUserStore() {
	return createUserStore()
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

async function drainLifecycleTasks() {
	await Promise.resolve()
	await Promise.resolve()
	await nextTick()
	await Promise.resolve()
}

describe('userStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setActivePinia(createPinia())
		mockSupaUser.value = {
			id: 'test-user-id',
			email: 'test@example.com'
		}

		// Reset mock query builder
		mockQueryBuilder = createMockQueryBuilder()
		mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
		mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null })
		mockSupabaseClient.functions.invoke.mockResolvedValue({
			data: { success: true },
			error: null
		})
		mockSupabaseClient.auth.getUser.mockImplementation(async () => ({
			data: { user: mockSupaUser.value },
			error: null
		}))
		mockSupabaseClient.auth.getSession.mockImplementation(async () => ({
			data: {
				session: mockSupaUser.value
					? { user: { id: mockSupaUser.value.id ?? mockSupaUser.value.sub } }
					: null
			},
			error: null
		}))
		mockSupabaseClient.auth.signOut.mockResolvedValue({ error: null })
		mockRouter.replace.mockResolvedValue(undefined)

		mockGetSavedAnonymousThemePreference.mockReturnValue(null)
	})

	afterEach(() => {
		for (const store of activeStores.splice(0)) store.$dispose()
		for (const scope of activeScopes.splice(0)) scope.stop()
	})

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
			expect(store.authOperationError).toBe(
				'Your account could not be created. Check the details and try again.'
			)
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
			expect(store.authOperationError).toBe(
				"We couldn't sign you in. Check your credentials and try again."
			)
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

	describe('deleteAccount', () => {
		it('signs out locally for reauthentication without normal login navigation', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()

			const result = await store.signOutForReauthentication()

			expect(result).toBe(true)
			expect(mockSupabaseClient.auth.signOut).toHaveBeenCalledWith({
				scope: 'local'
			})
			expect(mockSupaUser.value).toBeNull()
			expect(store.profile).toBeNull()
			expect(mockRouter.replace).not.toHaveBeenCalled()
		})

		it('preserves account state when reauthentication sign-out fails', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockSupabaseClient.auth.signOut.mockResolvedValue({
				error: new Error('Sign out failed')
			})

			const result = await store.signOutForReauthentication()

			expect(result).toBe(false)
			expect(mockSupaUser.value).not.toBeNull()
			expect(store.profile).not.toBeNull()
			expect(mockRouter.replace).not.toHaveBeenCalled()
		})

		it('revalidates the user and requires their account email', async () => {
			const store = useUserStore()

			const result = await store.deleteAccount('someone@example.com')

			expect(result).toEqual({ status: 'failed' })
			expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledOnce()
			expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled()
			expect(mockToast.error).toHaveBeenCalledWith(
				'Enter the email address for this account to confirm deletion.'
			)
		})

		it('deletes the account, clears the local session and opens login', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()

			const result = await store.deleteAccount(' TEST@example.com ')

			expect(result).toEqual({
				status: 'deleted',
				coverCleanupComplete: true
			})
			expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
				'delete-account',
				{ body: { confirmation: ' TEST@example.com ' } }
			)
			expect(mockSupabaseClient.auth.signOut).toHaveBeenCalledWith({
				scope: 'local'
			})
			expect(mockSupaUser.value).toBeNull()
			expect(store.profile).toBeNull()
			expect(mockRouter.replace).toHaveBeenCalledWith('/login')
			expect(mockToast.success).toHaveBeenCalledWith(
				'Your account and its data have been deleted.'
			)
		})

		it('shows the safe partial-failure message returned by the function', async () => {
			const store = useUserStore()
			const response = new Response(
				JSON.stringify({
					error:
						'Your account was not deleted. Some cover images may already have been removed. Please try again.'
				}),
				{ status: 503 }
			)
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: { context: response }
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({ status: 'failed' })
			expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled()
			expect(mockSupaUser.value).not.toBeNull()
			expect(mockToast.error).toHaveBeenCalledWith(
				'Your account was not deleted. Some cover images may already have been removed. Please try again.',
				{ duration: 30000 }
			)
		})

		it('truthfully reports success when local sign-out cleanup fails', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signOut.mockResolvedValue({
				error: new Error('Local sign out failed')
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({
				status: 'deleted',
				coverCleanupComplete: true
			})
			expect(mockSupaUser.value).toBeNull()
			expect(mockToast.warning).toHaveBeenCalledWith(
				'Your account was deleted. Reload the page if you still appear signed in.',
				{ duration: 30000 }
			)
		})

		it('warns when the deleted account has a cover cleanup race', async () => {
			const store = useUserStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: { success: true, cover_cleanup_complete: false },
				error: null
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({
				status: 'deleted',
				coverCleanupComplete: false
			})
			expect(mockToast.warning).toHaveBeenCalledWith(
				'Your account was deleted, but a recently uploaded cover may still need cleanup. Contact the project owner if it remains accessible.',
				{ duration: 30000 }
			)
		})

		it('returns a controlled result when recent authentication is required', async () => {
			const store = useUserStore()
			const response = new Response(
				JSON.stringify({
					error: 'Sign in again before deleting your account.',
					code: 'recent_authentication_required'
				}),
				{ status: 403 }
			)
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: { context: response }
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({ status: 'recent-auth-required' })
			expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled()
			expect(mockSupaUser.value).not.toBeNull()
			expect(mockToast.error).not.toHaveBeenCalledWith(
				'Your account could not be deleted. Please try again.',
				{ duration: 30000 }
			)
		})

		it('rejects the recent-auth code when the response is not HTTP 403', async () => {
			const store = useUserStore()
			const response = new Response(
				JSON.stringify({
					error: 'Your account could not be deleted. Please try again.',
					code: 'recent_authentication_required'
				}),
				{ status: 500 }
			)
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: { context: response }
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({ status: 'failed' })
			expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled()
			expect(mockSupaUser.value).not.toBeNull()
			expect(mockToast.error).toHaveBeenCalledWith(
				'Your account could not be deleted. Please try again.',
				{ duration: 30000 }
			)
		})

		it('does not infer recent authentication from an uncontrolled error', async () => {
			const store = useUserStore()
			const response = new Response(
				JSON.stringify({
					error: 'Sign in again before deleting your account.'
				}),
				{ status: 403 }
			)
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: { context: response }
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({ status: 'failed' })
			expect(mockToast.error).toHaveBeenCalledWith(
				'Sign in again before deleting your account.',
				{ duration: 30000 }
			)
		})

		it('keeps account deletion single-flight', async () => {
			const store = useUserStore()
			const deletion = createDeferred<{
				data: { success: true }
				error: null
			}>()
			mockSupabaseClient.functions.invoke.mockReturnValueOnce(deletion.promise)

			const firstResult = store.deleteAccount('test@example.com')
			await Promise.resolve()
			await Promise.resolve()
			const secondResult = await store.deleteAccount('test@example.com')

			expect(secondResult).toEqual({ status: 'failed' })
			expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledOnce()

			deletion.resolve({ data: { success: true }, error: null })
			await expect(firstResult).resolves.toEqual({
				status: 'deleted',
				coverCleanupComplete: true
			})
		})
	})

	describe('sendPasswordResetEmail', () => {
		it('returns true on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.sendPasswordResetEmail('test@example.com')

			expect(result).toBe(true)
		})

		it('sends to correct redirect URL', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
				data: {},
				error: null
			})

			await store.sendPasswordResetEmail('test@example.com')

			expect(
				mockSupabaseClient.auth.resetPasswordForEmail
			).toHaveBeenCalledWith('test@example.com', {
				redirectTo: 'https://example.com/update-password'
			})
		})

		it('returns false on error', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
				data: null,
				error: { message: 'Email not found' }
			})

			const result = await store.sendPasswordResetEmail('unknown@example.com')

			expect(result).toBe(false)
		})
	})

	describe('resetPassword', () => {
		it('returns true, navigates home, and consumes recovery on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.updateUser.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.resetPassword('Password123')

			expect(result).toBe(true)
			expect(mockRouter.push).toHaveBeenCalledWith('/')
			expect(mockPasswordRecovery.consume).toHaveBeenCalledOnce()
		})

		it('returns false and keeps recovery active on update errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.updateUser.mockResolvedValue({
				data: null,
				error: { message: 'Password too weak' }
			})

			const result = await store.resetPassword('weak')

			expect(result).toBe(false)
			expect(mockRouter.push).not.toHaveBeenCalled()
			expect(mockPasswordRecovery.consume).not.toHaveBeenCalled()
		})

		it('returns true and consumes recovery when navigation fails after update', async () => {
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			const store = useUserStore()
			mockSupabaseClient.auth.updateUser.mockResolvedValue({
				data: {},
				error: null
			})
			mockRouter.push.mockRejectedValueOnce(new Error('Navigation unavailable'))

			try {
				const result = await store.resetPassword('Password123')

				expect(result).toBe(true)
				expect(mockPasswordRecovery.consume).toHaveBeenCalledOnce()
				expect(mockToast.success).not.toHaveBeenCalledWith(
					'Password reset successful!'
				)
				expect(mockToast.error).toHaveBeenCalledWith(
					'Your password was reset, but the home page could not open.',
					{ duration: 30000 }
				)
			} finally {
				consoleError.mockRestore()
			}
		})
	})

	describe('verifyOtp', () => {
		it('navigates to home on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.verifyOtp('token-hash', 'email')

			expect(result).toBe(true)
			expect(mockRouter.push).toHaveBeenCalledWith('/')
			expect(mockPasswordRecovery.activate).not.toHaveBeenCalled()
		})

		it('navigates to a safe requested destination on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.verifyOtp(
				'token-hash',
				'email',
				'/records?crate=house'
			)

			expect(result).toBe(true)
			expect(mockRouter.push).toHaveBeenCalledWith('/records?crate=house')
		})

		it('activates recovery and navigates to password update for recovery OTPs', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.verifyOtp('recovery-token-hash', 'recovery')

			expect(result).toBe(true)
			expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledWith({
				token_hash: 'recovery-token-hash',
				type: 'recovery'
			})
			expect(mockPasswordRecovery.activate).toHaveBeenCalledOnce()
			expect(mockRouter.push).toHaveBeenCalledWith('/update-password')
			expect(mockRouter.push).not.toHaveBeenCalledWith('/')
			expect(mockToast.success).toHaveBeenCalledWith('Recovery link verified!')
		})

		it('handles verification errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
				data: null,
				error: { message: 'Invalid OTP' }
			})

			const result = await store.verifyOtp('invalid', 'email')

			expect(result).toBe(false)
			expect(mockRouter.push).not.toHaveBeenCalled()
		})
	})

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

	describe('updateSettings', () => {
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

		it('rolls back after an adopted session setting fails', async () => {
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
			expect(mockSetTheme).toHaveBeenLastCalledWith('light')
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

	describe('deleteAllUserData', () => {
		it('returns false when user is not signed in', async () => {
			const store = useUserStore()
			mockSupaUser.value = null

			const result = await store.deleteAllUserData()

			expect(result).toBe(false)
		})

		it('calls the transactional delete-all RPC', async () => {
			const store = useUserStore()

			await store.deleteAllUserData()

			expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
				'delete_all_user_data'
			)
		})

		it('does not construct or mutate unrelated stores on success', async () => {
			const store = useUserStore()

			await store.deleteAllUserData()

			expect(mockUseRecordsStore).not.toHaveBeenCalled()
			expect(mockUseTracksStore).not.toHaveBeenCalled()
			expect(mockUseCratesStore).not.toHaveBeenCalled()
			expect(mockUseSessionStore).not.toHaveBeenCalled()
		})

		it('returns true on success', async () => {
			const store = useUserStore()

			const result = await store.deleteAllUserData()

			expect(result).toBe(true)
		})

		it('returns false on rpc error', async () => {
			const store = useUserStore()
			mockSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: new Error('Delete failed')
			})

			const result = await store.deleteAllUserData()

			expect(result).toBe(false)
			expect(mockUseRecordsStore).not.toHaveBeenCalled()
			expect(mockUseTracksStore).not.toHaveBeenCalled()
			expect(mockUseCratesStore).not.toHaveBeenCalled()
			expect(mockUseSessionStore).not.toHaveBeenCalled()
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
