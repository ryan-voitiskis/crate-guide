import {
	type EffectScope,
	computed,
	effectScope,
	nextTick,
	readonly,
	ref,
	watch
} from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import type { Profile } from '../../../../shared/types/supabase'
import type { useUserStore as usePiniaUserStore } from '../../userStore'

export function createMockProfile(overrides: Partial<Profile> = {}): Profile {
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

export function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, reject, resolve }
}

export async function drainLifecycleTasks() {
	await Promise.resolve()
	await Promise.resolve()
	await nextTick()
	await Promise.resolve()
}

function createQueryBuilder() {
	return {
		select: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		upsert: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockReturnValue(new Promise(() => {}))
	}
}

type HarnessOptions = {
	createAccountClient: ReturnType<typeof vi.fn>
	createStore: typeof usePiniaUserStore
}

export function createUserStoreHarness({
	createAccountClient,
	createStore
}: HarnessOptions) {
	const supaUser = ref<{ email: string; id?: string; sub?: string } | null>({
		id: 'test-user-id',
		email: 'test@example.com'
	})
	const router = {
		push: vi.fn(),
		replace: vi.fn().mockResolvedValue(undefined)
	}
	const passwordRecovery = {
		activate: vi.fn(),
		consume: vi.fn()
	}
	const useRecordsStore = vi.fn()
	const useTracksStore = vi.fn()
	const useCratesStore = vi.fn()
	const useSessionStore = vi.fn()
	const setTheme = vi.fn()
	const getSavedAnonymousThemePreference = vi.fn().mockReturnValue(null)
	const saveAnonymousThemePreference = vi.fn()
	const isKeyFormat = vi.fn(
		(value: string | null | undefined) => value === 'key' || value === 'camelot'
	)
	let queryBuilder = createQueryBuilder()
	const supabaseClient = {
		from: vi.fn(() => queryBuilder),
		rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
		functions: {
			invoke: vi
				.fn()
				.mockResolvedValue({ data: { success: true }, error: null })
		},
		auth: {
			getSession: vi.fn(),
			getUser: vi.fn(),
			signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
			signInWithPassword: vi
				.fn()
				.mockResolvedValue({ data: null, error: null }),
			signInWithOAuth: vi.fn().mockResolvedValue({ data: null, error: null }),
			signOut: vi.fn().mockResolvedValue({ error: null }),
			resetPasswordForEmail: vi
				.fn()
				.mockResolvedValue({ data: null, error: null }),
			resend: vi.fn().mockResolvedValue({ data: null, error: null }),
			updateUser: vi.fn().mockResolvedValue({ data: null, error: null }),
			verifyOtp: vi.fn().mockResolvedValue({ data: null, error: null })
		}
	}
	const accountBoundSupabaseClient = {
		functions: {
			invoke: vi.fn().mockResolvedValue({
				data: { success: true },
				error: null
			})
		},
		rpc: vi.fn().mockResolvedValue({ data: null, error: null })
	}
	const activeScopes: EffectScope[] = []
	const activeStores: ReturnType<typeof createStore>[] = []

	vi.stubGlobal('useSupabaseClient', () => supabaseClient)
	vi.stubGlobal('useRuntimeConfig', () => ({
		public: {
			supabase: {
				url: 'https://supabase.test.invalid',
				key: 'test-anon-key'
			}
		}
	}))
	vi.stubGlobal('useSupabaseUser', () => supaUser)
	vi.stubGlobal('useRouter', () => router)
	vi.stubGlobal('usePasswordRecovery', () => passwordRecovery)
	vi.stubGlobal('useRecordsStore', useRecordsStore)
	vi.stubGlobal('useTracksStore', useTracksStore)
	vi.stubGlobal('useCratesStore', useCratesStore)
	vi.stubGlobal('useSessionStore', useSessionStore)
	vi.stubGlobal('setTheme', setTheme)
	vi.stubGlobal(
		'getSavedAnonymousThemePreference',
		getSavedAnonymousThemePreference
	)
	vi.stubGlobal('saveAnonymousThemePreference', saveAnonymousThemePreference)
	vi.stubGlobal('isKeyFormat', isKeyFormat)
	vi.stubGlobal(
		'isError',
		(error: unknown): error is Error => error instanceof Error
	)
	vi.stubGlobal('ref', ref)
	vi.stubGlobal('computed', computed)
	vi.stubGlobal('readonly', readonly)
	vi.stubGlobal('watch', watch)
	vi.stubGlobal('process', { env: { SITE_URL: 'https://example.com' } })

	function clearQueryBuilderCalls() {
		for (const queryMethod of Object.values(queryBuilder))
			queryMethod.mockClear()
		supabaseClient.from.mockClear()
	}

	function createUserStore(options: { preserveLifecycleCalls?: boolean } = {}) {
		const scope = effectScope()
		const store = scope.run(() => createStore())
		if (!store) throw new Error('Failed to create user store scope')
		activeScopes.push(scope)
		activeStores.push(store)
		if (!options.preserveLifecycleCalls) clearQueryBuilderCalls()
		return store
	}

	function reset() {
		setActivePinia(createPinia())
		supaUser.value = { id: 'test-user-id', email: 'test@example.com' }
		queryBuilder = createQueryBuilder()
		supabaseClient.from.mockReturnValue(queryBuilder)
		supabaseClient.rpc.mockResolvedValue({ data: null, error: null })
		accountBoundSupabaseClient.rpc.mockResolvedValue({
			data: null,
			error: null
		})
		accountBoundSupabaseClient.functions.invoke.mockReset().mockResolvedValue({
			data: { success: true },
			error: null
		})
		createAccountClient.mockReturnValue(accountBoundSupabaseClient)
		supabaseClient.functions.invoke.mockResolvedValue({
			data: { success: true },
			error: null
		})
		supabaseClient.auth.getUser.mockImplementation(async () => ({
			data: { user: supaUser.value },
			error: null
		}))
		supabaseClient.auth.getSession.mockImplementation(async () => ({
			data: {
				session: supaUser.value
					? {
							access_token: `token:${supaUser.value.id ?? supaUser.value.sub}`,
							user: { id: supaUser.value.id ?? supaUser.value.sub }
						}
					: null
			},
			error: null
		}))
		supabaseClient.auth.signOut.mockResolvedValue({ error: null })
		router.replace.mockResolvedValue(undefined)
		getSavedAnonymousThemePreference.mockReturnValue(null)
		return queryBuilder
	}

	function dispose() {
		for (const store of activeStores.splice(0)) store.$dispose()
		for (const scope of activeScopes.splice(0)) scope.stop()
	}

	return {
		accountBoundSupabaseClient,
		createUserStore,
		dispose,
		get queryBuilder() {
			return queryBuilder
		},
		getSavedAnonymousThemePreference,
		isKeyFormat,
		passwordRecovery,
		reset,
		router,
		saveAnonymousThemePreference,
		setTheme,
		supaUser,
		supabaseClient,
		useCratesStore,
		useRecordsStore,
		useSessionStore,
		useTracksStore,
		useUserStore: () => createUserStore()
	}
}
