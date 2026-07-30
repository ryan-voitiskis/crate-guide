import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiscogsAuthStore } from '../discogsAuthStore'

const mockUserStore = reactive({
	profile: null as {
		discogs_avatar_url?: string | null
		discogs_username?: string | null
	} | null,
	fetchProfile: vi.fn().mockResolvedValue(true)
})

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

const mockLocation = {
	href: ''
}

vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useDiscogsStore', () => mockDiscogsStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)
vi.stubGlobal('useRoute', () => mockRoute)
vi.stubGlobal('navigateTo', mockNavigateTo)

Object.defineProperty(global, 'window', {
	value: { location: mockLocation },
	writable: true
})

vi.mock('vue-sonner', () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn()
	}
}))

describe('discogsAuthStore authorization completion', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setActivePinia(createPinia())

		mockUserStore.profile = null
		mockUserStore.fetchProfile.mockResolvedValue(true)
		mockDiscogsStore.showGetFoldersDialog = false
		mockLocation.href = ''
		mockRoute.query = {
			oauth_token: 'test-token',
			oauth_verifier: 'test-verifier'
		}
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

		it('offers a credential-free retry when identity finalization is pending', async () => {
			const store = useDiscogsAuthStore()
			mockSupabaseClient.functions.invoke
				.mockResolvedValueOnce({
					data: null,
					error: {
						context: new Response(
							JSON.stringify({
								error:
									'Discogs access is saved, but profile setup is incomplete. Retry profile setup to finish connecting.',
								code: 'discogs_identity_pending',
								retryable: true
							}),
							{ headers: { 'Content-Type': 'application/json' } }
						)
					}
				})
				.mockResolvedValueOnce({ data: { success: true }, error: null })

			expect(await store.completeDiscogsOAuth()).toBe(false)
			expect(store.oAuthFinalizationPending).toBe(true)

			expect(await store.resumeDiscogsOAuth()).toBe(true)
			expect(mockSupabaseClient.functions.invoke).toHaveBeenLastCalledWith(
				'get-discogs-access-token',
				{ body: { resume: true } }
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
