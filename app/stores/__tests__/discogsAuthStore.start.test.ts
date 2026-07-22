import { reactive } from 'vue'
import { toast } from 'vue-sonner'
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

describe('discogsAuthStore authorization start', () => {
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

		it('starts with no pending identity finalization', () => {
			const store = useDiscogsAuthStore()
			expect(store.oAuthFinalizationPending).toBe(false)
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
})
