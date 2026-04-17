import { toast } from 'vue-sonner'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useDiscogsAuthStore } from '../discogsAuthStore'

// Mock dependencies
const mockUserStore = {
	profile: null as {
		discogs_username?: string | null
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

		it('starts with oAuthCompletionError as null', () => {
			const store = useDiscogsAuthStore()
			expect(store.oAuthCompletionError).toBe(null)
		})
	})

	describe('isOAuthed computed', () => {
		it('returns false when profile is null', () => {
			const store = useDiscogsAuthStore()
			mockUserStore.profile = null

			expect(store.isOAuthed).toBe(false)
		})

		it('returns false when discogs_username is missing', () => {
			const store = useDiscogsAuthStore()
			mockUserStore.profile = {}

			expect(store.isOAuthed).toBe(false)
		})

		it('returns false when discogs_username is null', () => {
			const store = useDiscogsAuthStore()
			mockUserStore.profile = { discogs_username: null }

			expect(store.isOAuthed).toBe(false)
		})

		it('returns true when discogs_username is set', () => {
			const store = useDiscogsAuthStore()
			mockUserStore.profile = { discogs_username: 'some-user' }

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
					body: {
						oauth_token: 'test-token',
						oauth_verifier: 'test-verifier'
					}
				}
			)
		})

		it('fails when callback params are missing', async () => {
			const store = useDiscogsAuthStore()
			mockRoute.query = {
				oauth_token: undefined as unknown as string,
				oauth_verifier: undefined as unknown as string
			}

			const result = await store.completeDiscogsOAuth()

			expect(result).toBe(false)
			expect(store.oAuthCompletionFailed).toBe(true)
			expect(store.oAuthCompletionError).toBe(
				'Missing OAuth callback parameters from Discogs.'
			)
			expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled()
		})

		it('sets oAuthCompletionError from invoke context json payload', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: {
					context: new Response(
						JSON.stringify({
							error:
								'Discogs rejected the OAuth callback. Please restart the Discogs connection and try again.'
						}),
						{ headers: { 'Content-Type': 'application/json' } }
					)
				}
			})

			await store.completeDiscogsOAuth()

			expect(store.oAuthCompletionError).toBe(
				'Discogs rejected the OAuth callback. Please restart the Discogs connection and try again.'
			)
		})

		it('sanitizes sensitive invoke context text', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: {
					context: new Response(
						'Discogs access token failed: oauth_token=abc123&oauth_verifier=xyz'
					)
				}
			})

			await store.completeDiscogsOAuth()

			expect(store.oAuthCompletionError).toBe(
				'Failed to authenticate with Discogs. Please try again.'
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

		it('returns false when invoke returns an error', async () => {
			const store = useDiscogsAuthStore()
			const invokeError = new Error('OAuth failed')
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: invokeError
			})

			const result = await store.completeDiscogsOAuth()

			expect(result).toBe(false)
		})

		it('sets oAuthCompletionFailed when invoke returns an error', async () => {
			const store = useDiscogsAuthStore()
			const invokeError = new Error('OAuth failed')
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: invokeError
			})

			await store.completeDiscogsOAuth()

			expect(store.oAuthCompletionFailed).toBe(true)
		})

		it('resets stale oAuthCompletionError before each attempt', async () => {
			const store = useDiscogsAuthStore()
			store.oAuthCompletionError = 'Previous OAuth error'
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: {},
				error: null
			})

			await store.completeDiscogsOAuth()

			expect(store.oAuthCompletionError).toBe(null)
		})

		it('does not navigate when invoke returns an error', async () => {
			const store = useDiscogsAuthStore()
			const invokeError = new Error('OAuth failed')
			mockSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: invokeError
			})

			await store.completeDiscogsOAuth()

			expect(mockNavigateTo).not.toHaveBeenCalled()
		})
	})
})
