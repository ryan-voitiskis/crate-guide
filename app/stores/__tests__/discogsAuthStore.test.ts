import { toast } from 'vue-sonner'
import { FunctionsError } from '@supabase/supabase-js'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useDiscogsAuthStore } from '../discogsAuthStore'

// Mock dependencies
const mockUserStore = {
	profile: null as {
		discogs_access_token?: string
		discogs_access_secret?: string
	} | null,
	fetchProfile: vi.fn().mockResolvedValue(true)
}

const mockDiscogsStore = {
	showGetFoldersDialog: false
}

const mockRoute = {
	query: {
		oauth_token: 'test-token',
		oauth_verifier: 'test-verifier'
	}
}

const mockNavigateTo = vi.fn()

const mockSupabaseClient = {
	functions: {
		invoke: vi.fn()
	}
}

// Mock window.location
const mockLocation = {
	href: ''
}

// Stub globals before importing the store
vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useDiscogsStore', () => mockDiscogsStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)
vi.stubGlobal('useRoute', () => mockRoute)
vi.stubGlobal('navigateTo', mockNavigateTo)

// Mock window.location
Object.defineProperty(global, 'window', {
	value: { location: mockLocation },
	writable: true
})

// Mock toast
vi.mock('vue-sonner', () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn()
	}
}))

describe('discogsAuthStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setActivePinia(createPinia())

		// Reset mock states
		mockUserStore.profile = null
		mockUserStore.fetchProfile.mockResolvedValue(true)
		mockDiscogsStore.showGetFoldersDialog = false
		mockLocation.href = ''
		mockRoute.query = {
			oauth_token: 'test-token',
			oauth_verifier: 'test-verifier'
		}
	})

	describe('initial state', () => {
		it('starts with isDiscogsConnecting as false', () => {
			const store = useDiscogsAuthStore()
			expect(store.isDiscogsConnecting).toBe(false)
		})

		it('starts with oAuthCompletionFailed as false', () => {
			const store = useDiscogsAuthStore()
			expect(store.oAuthCompletionFailed).toBe(false)
		})
	})

	describe('isOAuthed computed', () => {
		it('returns false when profile is null', () => {
			const store = useDiscogsAuthStore()
			mockUserStore.profile = null

			expect(store.isOAuthed).toBe(false)
		})

		it('returns false when tokens are missing', () => {
			const store = useDiscogsAuthStore()
			mockUserStore.profile = {}

			expect(store.isOAuthed).toBe(false)
		})

		it('returns false when only access_token exists', () => {
			const store = useDiscogsAuthStore()
			mockUserStore.profile = { discogs_access_token: 'token' }

			expect(store.isOAuthed).toBe(false)
		})

		it('returns false when only access_secret exists', () => {
			const store = useDiscogsAuthStore()
			mockUserStore.profile = { discogs_access_secret: 'secret' }

			expect(store.isOAuthed).toBe(false)
		})

		it('returns true when both tokens exist', () => {
			const store = useDiscogsAuthStore()
			mockUserStore.profile = {
				discogs_access_token: 'token',
				discogs_access_secret: 'secret'
			}

			expect(store.isOAuthed).toBe(true)
		})
	})

	describe('initDiscogsOAuthFlow', () => {
		it('sets isDiscogsConnecting to true', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: 'oauth-token',
				error: null
			})

			const promise = store.initDiscogsOAuthFlow()
			expect(store.isDiscogsConnecting).toBe(true)

			await promise
		})

		it('redirects to Discogs OAuth URL on success', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: 'test-oauth-token',
				error: null
			})

			await store.initDiscogsOAuthFlow()

			expect(mockLocation.href).toBe(
				'https://discogs.com/oauth/authorize?oauth_token=test-oauth-token'
			)
		})

		it('shows error toast on failure', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: new Error('Request failed')
			})

			await store.initDiscogsOAuthFlow()

			expect(toast.error).toHaveBeenCalledWith(
				'Error authenticating with Discogs.'
			)
		})

		it('does not redirect on failure', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: new Error('Request failed')
			})

			await store.initDiscogsOAuthFlow()

			expect(mockLocation.href).toBe('')
		})

		it('calls get-discogs-request-token function', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: 'token',
				error: null
			})

			await store.initDiscogsOAuthFlow()

			expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
				'get-discogs-request-token'
			)
		})
	})

	describe('completeDiscogsOAuth', () => {
		it('resets oAuthCompletionFailed to false at start', async () => {
			const store = useDiscogsAuthStore()
			store.oAuthCompletionFailed = true
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: { access_token: 'token' },
				error: null
			})

			await store.completeDiscogsOAuth()

			// It was reset at start (even though it may succeed)
			expect(store.oAuthCompletionFailed).toBe(false)
		})

		it('calls get-discogs-access-token with OAuth params', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: {},
				error: null
			})

			await store.completeDiscogsOAuth()

			expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
				'get-discogs-access-token',
				{
					body: JSON.stringify({
						oauth_token: 'test-token',
						oauth_verifier: 'test-verifier'
					})
				}
			)
		})

		it('returns true on success', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.completeDiscogsOAuth()

			expect(result).toBe(true)
		})

		it('navigates to /records on success', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: {},
				error: null
			})

			await store.completeDiscogsOAuth()

			expect(mockNavigateTo).toHaveBeenCalledWith('/records')
		})

		it('fetches profile on success', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: {},
				error: null
			})

			await store.completeDiscogsOAuth()

			expect(mockUserStore.fetchProfile).toHaveBeenCalled()
		})

		it('shows get folders dialog after successful profile fetch', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: {},
				error: null
			})
			mockUserStore.fetchProfile.mockResolvedValue(true)

			await store.completeDiscogsOAuth()

			expect(mockDiscogsStore.showGetFoldersDialog).toBe(true)
		})

		it('does not show get folders dialog if profile fetch fails', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: {},
				error: null
			})
			mockUserStore.fetchProfile.mockResolvedValue(false)

			await store.completeDiscogsOAuth()

			expect(mockDiscogsStore.showGetFoldersDialog).toBe(false)
		})

		it('returns false on FunctionsError', async () => {
			const store = useDiscogsAuthStore()
			const functionsError = new FunctionsError('OAuth failed', '400', {})
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: functionsError
			})

			const result = await store.completeDiscogsOAuth()

			expect(result).toBe(false)
		})

		it('sets oAuthCompletionFailed on FunctionsError', async () => {
			const store = useDiscogsAuthStore()
			const functionsError = new FunctionsError('OAuth failed', '400', {})
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: functionsError
			})

			await store.completeDiscogsOAuth()

			expect(store.oAuthCompletionFailed).toBe(true)
		})

		it('does not navigate on FunctionsError', async () => {
			const store = useDiscogsAuthStore()
			const functionsError = new FunctionsError('OAuth failed', '400', {})
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: functionsError
			})

			await store.completeDiscogsOAuth()

			expect(mockNavigateTo).not.toHaveBeenCalled()
		})
	})
})
