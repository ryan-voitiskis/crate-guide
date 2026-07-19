import { toast } from 'vue-sonner'
import {
	type EmailOtpType,
	type SupabaseClient,
	createClient
} from '@supabase/supabase-js'
import { defineStore, getActivePinia } from 'pinia'
import { isDemoWorkbenchPinia } from '~/utils/workbenchPinia'
import {
	buildCheckInboxPath,
	buildLoginRedirectPath,
	sanitizeAuthReturnPath
} from '../utils/authRoutes'

// Explicit column list for client-side profile reads. The Discogs OAuth
// secret columns were moved to public.discogs_credentials (no SELECT RLS) so
// this list simply enumerates every non-secret profile column the UI needs.
// Discogs connection state is derived from discogs_username (see
// discogsAuthStore isOAuthed).
export const PROFILE_SAFE_COLUMNS =
	'id, name, discogs_avatar_url, discogs_uid, discogs_username, just_completed_discogs_oauth, key_format, list_layout, selected_crate, turntable_pitch_range, turntable_theme, ui_theme'

export type DeleteAccountResult =
	| { status: 'deleted'; coverCleanupComplete: boolean }
	| { status: 'recent-auth-required' }
	| { status: 'failed' }

export const useUserStore = defineStore('user', () => {
	const supabase = useSupabaseClient<Database>()
	const isDemoStore = isDemoWorkbenchPinia(getActivePinia())
	const authenticatedUser = useSupabaseUser()
	const supaUser = computed(() =>
		isDemoStore ? null : authenticatedUser.value
	)
	const router = useRouter()
	const passwordRecovery = usePasswordRecovery()

	const profile = ref<Profile | null>(null)
	const userAlreadyRegistered = ref(false)
	const authOperationError = ref<string | null>(null)
	const isUpdatingSettings = ref(false)
	const isSigningOut = ref(false)
	const isDeletingAccount = ref(false)
	const localKeyFormatPreference = ref<'key' | 'camelot'>('key')
	const anonymousThemePreference = ref<ThemeOptions>(
		getSavedAnonymousThemePreference() ?? 'auto'
	)
	const supaUserId = computed(() => {
		const subject = supaUser.value?.sub
		if (typeof subject === 'string' && subject) return subject

		// Keep compatibility with the User-shaped value exposed by earlier
		// @nuxtjs/supabase releases while current releases expose JWT claims.
		const legacyId = (supaUser.value as { id?: unknown } | null)?.id
		return typeof legacyId === 'string' && legacyId ? legacyId : null
	})
	let profileOwnerId: string | null = null
	let authenticationGeneration = 0
	let settingsUpdateQueue: Promise<boolean> = Promise.resolve(true)

	type AuthenticatedWork = {
		userId: string
		generation: number
	}
	type SettingsUpdateOutcome = {
		didPersist: boolean
		work: AuthenticatedWork | null
	}
	type AccountBoundMutationClient = Pick<SupabaseClient<Database>, 'rpc'>

	function isCurrentWork({ userId, generation }: AuthenticatedWork): boolean {
		return generation === authenticationGeneration && profileOwnerId === userId
	}

	function invalidateIdentity(nextUserId: string | null): number {
		authenticationGeneration += 1
		profileOwnerId = nextUserId
		profile.value = null
		isUpdatingSettings.value = false
		settingsUpdateQueue = Promise.resolve(true)
		setTheme(anonymousThemePreference.value)
		return authenticationGeneration
	}

	async function createAccountBoundMutationClient(
		work: AuthenticatedWork
	): Promise<AccountBoundMutationClient | null> {
		if (!isCurrentWork(work)) return null
		const { data, error } = await supabase.auth.getSession()
		if (!isCurrentWork(work)) return null
		const session = data.session
		if (
			error ||
			!session ||
			session.user.id !== work.userId ||
			!session.access_token
		) {
			throw new Error('Authenticated session is unavailable.')
		}

		const supabaseConfig = useRuntimeConfig().public.supabase as {
			key?: unknown
			url?: unknown
		}
		if (
			typeof supabaseConfig.url !== 'string' ||
			!supabaseConfig.url ||
			typeof supabaseConfig.key !== 'string' ||
			!supabaseConfig.key
		) {
			throw new Error('Authenticated session is unavailable.')
		}

		const accessToken = session.access_token
		return createClient<Database>(supabaseConfig.url, supabaseConfig.key, {
			accessToken: async () => accessToken
		})
	}

	function getSiteUrl(): string {
		if (typeof window !== 'undefined' && window.location.origin) {
			return window.location.origin
		}

		const configuredSiteUrl = process.env.SITE_URL?.trim()
		if (configuredSiteUrl) {
			return configuredSiteUrl.replace(/\/+$/, '')
		}

		throw new Error('SITE_URL is required when window.location is unavailable')
	}

	function clearAuthOperationError() {
		authOperationError.value = null
	}

	function failAuthOperation(message: string): false {
		authOperationError.value = message
		toast.error(message)
		return false
	}

	async function resolveAuthenticatedUserId(): Promise<string> {
		if (isDemoStore)
			throw new Error('Account actions are disabled in demo mode.')
		const reactiveUserId = supaUserId.value
		if (reactiveUserId) return reactiveUserId

		const { data: sessionData, error: sessionError } =
			await supabase.auth.getSession()
		if (sessionError) throw sessionError
		if (sessionData.session?.user?.id) return sessionData.session.user.id

		const { data, error } = await supabase.auth.getUser()
		if (error) throw error
		if (!data.user?.id) throw new Error('User not logged in.')
		return data.user.id
	}

	const currentTheme = computed((): ThemeOptions => {
		return profile.value?.ui_theme ?? anonymousThemePreference.value
	})
	const currentKeyFormat = computed((): 'key' | 'camelot' => {
		const stored = profile.value?.key_format
		return isKeyFormat(stored) ? stored : localKeyFormatPreference.value
	})
	setTheme(currentTheme.value)

	async function signUpWithEmail(
		email: string,
		password: string,
		returnPath: unknown = '/'
	): Promise<boolean> {
		clearAuthOperationError()
		const safeReturnPath = sanitizeAuthReturnPath(returnPath)
		try {
			const { data, error } = await supabase.auth.signUp({ email, password })
			if (error?.message === 'User already registered') {
				userAlreadyRegistered.value = true
				router.push(buildLoginRedirectPath(safeReturnPath))
				toast.warning(`You've already created an account.`)
				return false
			}
			if (error) throw error
			// When email confirmations are enabled, signUp succeeds but no session
			// is created until the user clicks the link in their inbox.
			if (!data.session) {
				router.push(buildCheckInboxPath(safeReturnPath))
				return true
			}
			router.push(safeReturnPath)
			toast.success('Sign up successful!')
			return true
		} catch {
			return failAuthOperation(
				'Your account could not be created. Check the details and try again.'
			)
		}
	}

	async function signInWithEmail(email: string, password: string) {
		clearAuthOperationError()
		try {
			const { error } = await supabase.auth.signInWithPassword({
				email,
				password
			})
			if (error) throw error
			toast.success('Sign in successful!')
			return true
		} catch {
			return failAuthOperation(
				"We couldn't sign you in. Check your credentials and try again."
			)
		}
	}

	async function signInWithProvider(
		provider: 'github' | 'google',
		returnPath: unknown = '/'
	): Promise<boolean> {
		clearAuthOperationError()
		try {
			const redirect = encodeURIComponent(sanitizeAuthReturnPath(returnPath))
			const { error } = await supabase.auth.signInWithOAuth({
				provider,
				options: {
					redirectTo: `${getSiteUrl()}/auth/finalising?redirect=${redirect}`
				}
			})
			if (error) throw error
			return true
		} catch {
			const providerLabel = provider === 'github' ? 'GitHub' : 'Google'
			return failAuthOperation(
				`${providerLabel} sign-in couldn't start. Please try again.`
			)
		}
	}

	async function signOut(): Promise<boolean> {
		if (isDemoStore) return false
		let didSignOut = false
		isSigningOut.value = true
		try {
			const { error } = await supabase.auth.signOut({ scope: 'local' })
			if (error) throw error
			didSignOut = true
			invalidateIdentity(null)
			await router.replace('/login')
			toast.success('You are now signed out.')
			return true
		} catch (e) {
			console.error(e)
			if (didSignOut) {
				toast.error(`You are signed out, but the login page could not open.`, {
					duration: 30000
				})
				return true
			}
			toast.error(`Error signing out.`, { duration: 30000 })
			return false
		} finally {
			isSigningOut.value = false
		}
	}

	async function signOutForReauthentication(): Promise<boolean> {
		if (isDemoStore) return false
		try {
			const { error } = await supabase.auth.signOut({ scope: 'local' })
			if (error) throw error
			authenticatedUser.value = null
			invalidateIdentity(null)
			return true
		} catch {
			console.error('Local sign out for reauthentication failed')
			return false
		}
	}

	async function getFunctionErrorDetails(
		error: unknown,
		fallback: string
	): Promise<{ code: string | null; message: string; status: number | null }> {
		const context = (error as { context?: unknown })?.context
		if (context instanceof Response) {
			try {
				const payload: unknown = await context.clone().json()
				if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
					const response = payload as Record<string, unknown>
					return {
						code: typeof response.code === 'string' ? response.code : null,
						message:
							typeof response.error === 'string' ? response.error : fallback,
						status: context.status
					}
				}
			} catch {
				// The Edge Function response was not JSON; use the safe fallback.
			}
		}
		return { code: null, message: fallback, status: null }
	}

	async function deleteAccount(
		emailConfirmation: string
	): Promise<DeleteAccountResult> {
		if (isDemoStore) return { status: 'failed' }
		if (isDeletingAccount.value) return { status: 'failed' }
		isDeletingAccount.value = true
		try {
			// getUser performs a server-side session check immediately before the
			// destructive request instead of trusting only the hydrated JWT claims.
			const { data: userData, error: userError } = await supabase.auth.getUser()
			if (userError) throw userError
			const email = userData.user?.email
			if (!email)
				throw new Error('Your signed-in account has no email address.')
			if (
				emailConfirmation.trim().toLocaleLowerCase('en-US') !==
				email.trim().toLocaleLowerCase('en-US')
			) {
				toast.error(
					'Enter the email address for this account to confirm deletion.'
				)
				return { status: 'failed' }
			}

			const { data, error } = await supabase.functions.invoke(
				'delete-account',
				{
					body: { confirmation: emailConfirmation }
				}
			)
			if (error) {
				const details = await getFunctionErrorDetails(
					error,
					'Your account could not be deleted. Please try again.'
				)
				if (
					details.status === 403 &&
					details.code === 'recent_authentication_required'
				) {
					return { status: 'recent-auth-required' }
				}
				throw new Error(details.message)
			}
			if (
				!data ||
				typeof data !== 'object' ||
				!('success' in data) ||
				data.success !== true
			) {
				throw new Error('Your account could not be deleted. Please try again.')
			}
			const coverCleanupComplete =
				(!('cover_cleanup_complete' in data) ||
					data.cover_cleanup_complete !== false) &&
				(!('cleanup_queue_complete' in data) ||
					data.cleanup_queue_complete !== false)

			// The server-side deletion has completed. Local cleanup failures must not
			// be reported as a failed account deletion.
			const { error: signOutError } = await supabase.auth.signOut({
				scope: 'local'
			})
			if (signOutError) {
				console.error('Deleted account, but local auth cleanup failed')
			}
			if (!coverCleanupComplete) {
				toast.warning(
					'Your account was deleted, but server-side cover cleanup did not finish. Contact the project owner if a cover remains accessible.',
					{ duration: 30000 }
				)
			}
			authenticatedUser.value = null
			invalidateIdentity(null)

			try {
				await router.replace('/login')
			} catch {
				console.error('Deleted account, but login navigation failed')
				toast.warning(
					'Your account was deleted, but this page could not refresh. Reload the page to finish signing out.',
					{ duration: 30000 }
				)
				return { status: 'deleted', coverCleanupComplete }
			}

			if (signOutError) {
				toast.warning(
					'Your account was deleted. Reload the page if you still appear signed in.',
					{ duration: 30000 }
				)
			} else {
				toast.success('Your account and its data have been deleted.')
			}
			return { status: 'deleted', coverCleanupComplete }
		} catch (error) {
			console.error('Account deletion failed')
			toast.error(
				error instanceof Error
					? error.message
					: 'Your account could not be deleted. Please try again.',
				{ duration: 30000 }
			)
			return { status: 'failed' }
		} finally {
			isDeletingAccount.value = false
		}
	}

	async function sendPasswordResetEmail(email: string): Promise<boolean> {
		clearAuthOperationError()
		try {
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: `${getSiteUrl()}/update-password`
			})
			if (error) throw error
			toast.success('Password reset email sent!')
			return true
		} catch {
			return failAuthOperation(
				"We couldn't send the reset link. Please try again."
			)
		}
	}

	async function resetPassword(password: string): Promise<boolean> {
		clearAuthOperationError()
		try {
			const { error } = await supabase.auth.updateUser({ password })
			if (error) throw error
		} catch {
			return failAuthOperation(
				"We couldn't update your password. Please check the requirements and try again."
			)
		}

		passwordRecovery.consume()
		try {
			await router.push('/')
			toast.success('Password reset successful!')
		} catch (e) {
			console.error(e)
			toast.error(
				`Your password was reset, but the home page could not open.`,
				{
					duration: 30000
				}
			)
		}
		return true
	}

	async function verifyOtp(
		token_hash: string,
		type: EmailOtpType,
		returnPath: unknown = '/'
	): Promise<boolean> {
		clearAuthOperationError()
		try {
			const { error } = await supabase.auth.verifyOtp({ token_hash, type })
			if (error) throw error
			if (type === 'recovery') {
				passwordRecovery.activate()
				router.push('/update-password')
				toast.success('Recovery link verified!')
				return true
			}
			router.push(sanitizeAuthReturnPath(returnPath))
			toast.success('Sign in successful!')
			return true
		} catch {
			return failAuthOperation(
				'This verification link could not be completed. It may have expired.'
			)
		}
	}

	async function fetchProfileForWork(
		work: AuthenticatedWork
	): Promise<boolean> {
		if (!isCurrentWork(work)) return false
		try {
			const { data, error } = await supabase
				.from('profiles')
				.select(PROFILE_SAFE_COLUMNS)
				.eq('id', work.userId)
				.single()
			if (!isCurrentWork(work)) return false
			if (error) throw error
			profile.value = data as Profile
			const theme = profile.value.ui_theme ?? 'auto'
			setTheme(theme)
			const keyFormat = profile.value.key_format
			localKeyFormatPreference.value = isKeyFormat(keyFormat)
				? keyFormat
				: 'key'
			return true
		} catch (e) {
			if (!isCurrentWork(work)) return false
			console.error(e)
			toast.error(`Error getting your profile.`, { duration: 30000 })
			return false
		}
	}

	async function fetchProfile(): Promise<boolean> {
		const resolutionGeneration = authenticationGeneration
		try {
			const userId = await resolveAuthenticatedUserId()
			if (resolutionGeneration !== authenticationGeneration) return false
			const reactiveUserId = supaUserId.value
			if (reactiveUserId && reactiveUserId !== userId) return false
			if (profileOwnerId !== userId) {
				if (profileOwnerId !== null) return false
				invalidateIdentity(userId)
			}
			return fetchProfileForWork({
				userId,
				generation: authenticationGeneration
			})
		} catch (e) {
			if (resolutionGeneration !== authenticationGeneration) return false
			console.error(e)
			toast.error(`Error getting your profile.`, { duration: 30000 })
			return false
		}
	}

	async function updateSettingsWithWork(
		settingsPartial: Partial<Profile>
	): Promise<SettingsUpdateOutcome> {
		const capturedUserId = supaUserId.value ?? profileOwnerId
		let work = capturedUserId
			? { userId: capturedUserId, generation: authenticationGeneration }
			: null
		if (work && !isCurrentWork(work)) return { didPersist: false, work }
		if (!work) {
			const resolutionGeneration = authenticationGeneration
			try {
				const userId = await resolveAuthenticatedUserId()
				if (resolutionGeneration !== authenticationGeneration)
					return { didPersist: false, work: null }
				const reactiveUserId = supaUserId.value
				if (reactiveUserId && reactiveUserId !== userId)
					return { didPersist: false, work: null }
				if (profileOwnerId !== userId) {
					if (profileOwnerId !== null) return { didPersist: false, work: null }
					invalidateIdentity(userId)
				}
				work = {
					userId,
					generation: authenticationGeneration
				}
			} catch (e) {
				if (resolutionGeneration !== authenticationGeneration)
					return { didPersist: false, work: null }
				console.error(e)
				toast.error(`Error updating your settings.`, { duration: 30000 })
				return { didPersist: false, work: null }
			}
		}
		if (!isCurrentWork(work)) return { didPersist: false, work }

		// Optimistically update only state owned by the captured identity.
		if (profile.value) profile.value = { ...profile.value, ...settingsPartial }
		const runUpdate = async (): Promise<boolean> => {
			if (!isCurrentWork(work)) return false
			isUpdatingSettings.value = true
			try {
				if (!isCurrentWork(work)) return false
				const { data, error } = await supabase
					.from('profiles')
					.update(settingsPartial)
					.eq('id', work.userId)
					.select(PROFILE_SAFE_COLUMNS)
					.single()
				if (!isCurrentWork(work)) return false
				if (!data) {
					if (error && error.code !== 'PGRST116') throw error
					if (!isCurrentWork(work)) return false
					const { data: upsertedData, error: upsertError } = await supabase
						.from('profiles')
						.upsert(
							{
								id: work.userId,
								...settingsPartial
							},
							{ onConflict: 'id' }
						)
						.select(PROFILE_SAFE_COLUMNS)
						.single()
					if (!isCurrentWork(work)) return false
					if (upsertError || !upsertedData) throw upsertError
					profile.value = upsertedData as Profile
					return true
				}
				if (error) throw error
				// update with the server response to ensure consistency
				profile.value = data as Profile
				return true
			} catch (e) {
				if (!isCurrentWork(work)) return false
				console.error(e)
				await fetchProfileForWork(work)
				if (!isCurrentWork(work)) return false
				toast.error(`Error updating your settings.`, { duration: 30000 })
				return false
			} finally {
				if (isCurrentWork(work)) isUpdatingSettings.value = false
			}
		}

		settingsUpdateQueue = settingsUpdateQueue.then(runUpdate, runUpdate)
		const didPersist = await settingsUpdateQueue
		return { didPersist, work }
	}

	async function updateSettings(
		settingsPartial: Partial<Profile>
	): Promise<boolean> {
		if (isDemoStore) {
			profile.value = profile.value
				? { ...profile.value, ...settingsPartial }
				: null
			return true
		}
		const { didPersist } = await updateSettingsWithWork(settingsPartial)
		return didPersist
	}

	function setLocalTheme(newTheme: ThemeOptions) {
		anonymousThemePreference.value = newTheme
		saveAnonymousThemePreference(newTheme)
		setTheme(newTheme)
	}

	async function updateTheme(newTheme: ThemeOptions) {
		const previousTheme = currentTheme.value
		setTheme(newTheme)
		const { didPersist, work } = await updateSettingsWithWork({
			ui_theme: newTheme
		})
		if (!work || !isCurrentWork(work)) return
		setTheme(didPersist ? newTheme : previousTheme)
	}

	async function updateKeyFormat(newKeyFormat: 'key' | 'camelot') {
		if (newKeyFormat === currentKeyFormat.value) return
		const previousKeyFormat = currentKeyFormat.value
		localKeyFormatPreference.value = newKeyFormat
		const { didPersist, work } = await updateSettingsWithWork({
			key_format: newKeyFormat
		})
		if (!didPersist && work && isCurrentWork(work))
			localKeyFormatPreference.value = previousKeyFormat
	}

	async function deleteAllUserData(expectedUserId?: string): Promise<boolean> {
		if (isDemoStore) return false
		const resolutionGeneration = authenticationGeneration
		let work: AuthenticatedWork | null = null
		try {
			const userId = await resolveAuthenticatedUserId()
			if (resolutionGeneration !== authenticationGeneration) return false
			if (expectedUserId !== undefined && expectedUserId !== userId)
				return false
			const reactiveUserId = supaUserId.value
			if (reactiveUserId && reactiveUserId !== userId) return false
			if (profileOwnerId !== userId) {
				if (profileOwnerId !== null) return false
				const generation = invalidateIdentity(userId)
				work = { userId, generation }
			} else {
				work = { userId, generation: authenticationGeneration }
			}
			if (!isCurrentWork(work)) return false
			const accountClient = await createAccountBoundMutationClient(work)
			if (!accountClient || !isCurrentWork(work)) return false

			const { error } = await accountClient.rpc('delete_all_user_data')
			if (!isCurrentWork(work)) return false
			if (error) throw error

			toast.success('All records and tracks have been deleted.')
			return true
		} catch (e) {
			if (
				work
					? !isCurrentWork(work)
					: resolutionGeneration !== authenticationGeneration
			)
				return false
			toast.error(isError(e) ? e.message : 'Error deleting data.')
			return false
		}
	}

	if (!isDemoStore)
		watch(
			() => supaUserId.value,
			(userId, previousUserId) => {
				if (userId === profileOwnerId) {
					if (userId !== null || previousUserId !== undefined) return
					void (async () => {
						const bootstrapGeneration = authenticationGeneration
						const { data: sessionData, error: sessionError } =
							await supabase.auth.getSession()
						const sessionUserId = sessionData.session?.user?.id ?? null
						if (sessionError || !sessionUserId) return
						if (
							bootstrapGeneration !== authenticationGeneration ||
							profileOwnerId !== null ||
							supaUserId.value
						)
							return
						const generation = invalidateIdentity(sessionUserId)
						await fetchProfileForWork({ userId: sessionUserId, generation })
					})()
					return
				}
				if (userId) {
					const generation = invalidateIdentity(userId)
					void fetchProfileForWork({ userId, generation })
					return
				}
				invalidateIdentity(null)
			},
			{ flush: 'sync', immediate: true }
		)

	return {
		supaUser,
		supaUserId,
		profile,
		currentTheme,
		currentKeyFormat,
		userAlreadyRegistered,
		authOperationError: readonly(authOperationError),
		isUpdatingSettings,
		isSigningOut: readonly(isSigningOut),
		isDeletingAccount: readonly(isDeletingAccount),
		resolveAuthenticatedUserId,
		signUpWithEmail,
		signInWithEmail,
		signInWithProvider,
		signOut,
		signOutForReauthentication,
		deleteAccount,
		sendPasswordResetEmail,
		resetPassword,
		verifyOtp,
		clearAuthOperationError,
		fetchProfile,
		updateSettings,
		setLocalTheme,
		updateTheme,
		updateKeyFormat,
		deleteAllUserData
	}
})
