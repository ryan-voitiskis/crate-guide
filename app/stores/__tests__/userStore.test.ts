import { createPinia, setActivePinia } from 'pinia'
import type { Profile } from '~/../../shared/types/supabase'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useUserStore } from '../userStore'

// Mock dependencies
const mockSupaUser: {
	value: { id: string; email: string } | null
} = {
	value: { id: 'test-user-id', email: 'test@example.com' }
}

const mockRouter = {
	push: vi.fn()
}

const mockRecordsStore = {
	clearRecords: vi.fn()
}

const mockTracksStore = {
	clearTracks: vi.fn()
}

const mockCratesStore = {
	fetchAllCrates: vi.fn().mockResolvedValue(undefined)
}

const mockSetTheme = vi.fn()

function createMockProfile(overrides: Partial<Profile> = {}): Profile {
	return {
		discogs_access_secret: null,
		discogs_access_token: null,
		discogs_avatar_url: null,
		discogs_request_secret: null,
		discogs_request_token: null,
		discogs_uid: null,
		discogs_username: null,
		id: 'test',
		just_completed_discogs_oauth: false,
		key_format: 'camelot',
		list_layout: 'grid',
		name: null,
		selected_crate: 'all',
		turntable_pitch_range: 8,
		turntable_theme: 'classic',
		ui_theme: 'light',
		...overrides
	}
}

// Create a chainable mock query builder
function createMockQueryBuilder() {
	const builder = {
		select: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
	return builder
}

let mockQueryBuilder = createMockQueryBuilder()

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder),
	auth: {
		getSession: vi.fn().mockImplementation(async () => ({
			data: {
				session: mockSupaUser.value
					? { user: { id: mockSupaUser.value.id } }
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
vi.stubGlobal('useRecordsStore', () => mockRecordsStore)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('useCratesStore', () => mockCratesStore)
vi.stubGlobal('setTheme', mockSetTheme)
vi.stubGlobal('isError', isError)
vi.stubGlobal('watchEffect', vi.fn()) // Disable watchEffect to prevent auto-fetch

// Mock process.env
vi.stubGlobal('process', { env: { SITE_URL: 'https://example.com' } })

describe('userStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setActivePinia(createPinia())

		// Reset mock query builder
		mockQueryBuilder = createMockQueryBuilder()
		mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
		mockSupabaseClient.auth.getUser.mockImplementation(async () => ({
			data: { user: mockSupaUser.value },
			error: null
		}))
		mockSupabaseClient.auth.getSession.mockImplementation(async () => ({
			data: {
				session: mockSupaUser.value
					? { user: { id: mockSupaUser.value.id } }
					: null
			},
			error: null
		}))

		// Reset supaUser
		mockSupaUser.value = { id: 'test-user-id', email: 'test@example.com' }
	})

	describe('initial state', () => {
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
		it('returns light when profile is null', () => {
			const store = useUserStore()
			store.profile = null

			expect(store.currentTheme).toBe('light')
		})

		it('returns profile theme when set', () => {
			const store = useUserStore()
			store.profile = createMockProfile({ ui_theme: 'dark' })

			expect(store.currentTheme).toBe('dark')
		})

		it('returns light when profile has no theme', () => {
			const store = useUserStore()
			store.profile = createMockProfile() as unknown as Profile
			store.profile.ui_theme = null as unknown as Profile['ui_theme']

			expect(store.currentTheme).toBe('light')
		})
	})

	describe('signUpWithEmail', () => {
		it('navigates to home on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signUp.mockResolvedValue({
				data: {},
				error: null
			})

			await store.signUpWithEmail('test@example.com', 'password123')

			expect(mockRouter.push).toHaveBeenCalledWith('/')
		})

		it('handles already registered user', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signUp.mockResolvedValue({
				data: null,
				error: { message: 'User already registered' }
			})

			await store.signUpWithEmail('test@example.com', 'password123')

			expect(store.userAlreadyRegistered).toBe(true)
			expect(mockRouter.push).toHaveBeenCalledWith('/login')
		})

		it('handles auth errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signUp.mockResolvedValue({
				data: null,
				error: { message: 'Invalid email' }
			})

			await store.signUpWithEmail('invalid', 'password')

			expect(mockRouter.push).not.toHaveBeenCalled()
		})
	})

	describe('signInWithEmail', () => {
		it('returns true on success without navigating', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.signInWithEmail('test@example.com', 'password123')

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
			expect(mockRouter.push).not.toHaveBeenCalled()
		})
	})

	describe('signInWithProvider', () => {
		it('calls signInWithOAuth with github', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
				data: {},
				error: null
			})

			await store.signInWithProvider('github')

			expect(mockSupabaseClient.auth.signInWithOAuth).toHaveBeenCalledWith({
				provider: 'github',
				options: { redirectTo: 'https://example.com/auth/finalising' }
			})
		})

		it('calls signInWithOAuth with google', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
				data: {},
				error: null
			})

			await store.signInWithProvider('google')

			expect(mockSupabaseClient.auth.signInWithOAuth).toHaveBeenCalledWith({
				provider: 'google',
				options: { redirectTo: 'https://example.com/auth/finalising' }
			})
		})

		it('handles OAuth errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
				data: null,
				error: { message: 'OAuth error' }
			})

			// Should not throw
			await expect(store.signInWithProvider('github')).resolves.not.toThrow()
		})
	})

	describe('signOut', () => {
		it('clears profile on success', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockSupabaseClient.auth.signOut.mockResolvedValue({ error: null })

			await store.signOut()

			expect(store.profile).toBeNull()
		})

		it('handles sign out errors', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockSupabaseClient.auth.signOut.mockResolvedValue({
				error: new Error('Sign out failed')
			})

			await store.signOut()

			// Profile should not be cleared on error
			expect(store.profile).not.toBeNull()
			expect(store.profile?.id).toBe('test')
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
		it('navigates to home on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.updateUser.mockResolvedValue({
				data: {},
				error: null
			})

			await store.resetPassword('newPassword123')

			expect(mockRouter.push).toHaveBeenCalledWith('/')
		})

		it('handles update errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.updateUser.mockResolvedValue({
				data: null,
				error: { message: 'Password too weak' }
			})

			await store.resetPassword('weak')

			expect(mockRouter.push).not.toHaveBeenCalled()
		})
	})

	describe('verifyOtp', () => {
		it('navigates to home on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
				data: {},
				error: null
			})

			await store.verifyOtp('token-hash', 'email')

			expect(mockRouter.push).toHaveBeenCalledWith('/')
		})

		it('handles verification errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
				data: null,
				error: { message: 'Invalid OTP' }
			})

			await store.verifyOtp('invalid', 'email')

			expect(mockRouter.push).not.toHaveBeenCalled()
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
				data: { user: { id: 'fallback-user-id', email: 'fallback@example.com' } },
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
			const mockProfile = { id: 'test-user-id', ui_theme: 'dark' }
			mockQueryBuilder.single.mockResolvedValue({
				data: mockProfile,
				error: null
			})

			const result = await store.fetchProfile()

			expect(result).toBe(true)
			expect(store.profile).toEqual(mockProfile)
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

		it('sets isUpdatingSettings during update', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockQueryBuilder.single.mockResolvedValue({
				data: { id: 'test' },
				error: null
			})

			const updatePromise = store.updateSettings({ turntable_pitch_range: 16 })
			expect(store.isUpdatingSettings).toBe(true)

			await updatePromise
			expect(store.isUpdatingSettings).toBe(false)
		})

		it('prevents concurrent updates', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			store.isUpdatingSettings = true

			await store.updateSettings({ turntable_pitch_range: 16 })

			// Should not call the API
			expect(mockSupabaseClient.from).not.toHaveBeenCalled()
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

			// Should still try to update optimistically then fail
			expect(store.isUpdatingSettings).toBe(false)
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
	})

	describe('deleteAllUserData', () => {
		it('returns false when user is not signed in', async () => {
			const store = useUserStore()
			mockSupaUser.value = null

			const result = await store.deleteAllUserData()

			expect(result).toBe(false)
		})

		it('deletes records, clears crates and sets', async () => {
			const store = useUserStore()
			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })

			await store.deleteAllUserData()

			// Should call from with records, crates, sets
			expect(mockSupabaseClient.from).toHaveBeenCalledWith('records')
			expect(mockSupabaseClient.from).toHaveBeenCalledWith('crates')
			expect(mockSupabaseClient.from).toHaveBeenCalledWith('sets')
		})

		it('clears local stores on success', async () => {
			const store = useUserStore()
			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })

			await store.deleteAllUserData()

			expect(mockRecordsStore.clearRecords).toHaveBeenCalled()
			expect(mockTracksStore.clearTracks).toHaveBeenCalled()
			expect(mockCratesStore.fetchAllCrates).toHaveBeenCalled()
		})

		it('returns true on success', async () => {
			const store = useUserStore()
			mockQueryBuilder.eq.mockResolvedValue({ data: null, error: null })

			const result = await store.deleteAllUserData()

			expect(result).toBe(true)
		})

		it('returns false on database error', async () => {
			const store = useUserStore()
			mockQueryBuilder.eq.mockResolvedValue({
				data: null,
				error: new Error('Delete failed')
			})

			const result = await store.deleteAllUserData()

			expect(result).toBe(false)
		})
	})
})
