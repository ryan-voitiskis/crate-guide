import { toast } from 'vue-sonner'
import {
	type EmailOtpType,
	type SupabaseClient,
	createClient
} from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import {
	getWorkbenchStorePinia,
	isDemoWorkbenchPinia
} from '~/utils/workbenchPinia'
import {
	buildCheckInboxPath,
	buildLoginRedirectPath,
	buildUpdatePasswordPath,
	sanitizeAuthReturnPath
} from '../utils/authRoutes'

// Explicit column list for client-side profile reads. The Discogs OAuth
// secret columns were moved to public.discogs_credentials (no SELECT RLS) so
// this list simply enumerates every non-secret profile column the UI needs.
// Discogs connection state is derived from discogs_username (see
// discogsAuthStore isOAuthed).
export const PROFILE_SAFE_COLUMNS =
	'id, name, discogs_avatar_url, discogs_uid, discogs_username, just_completed_discogs_oauth'

export type IdentityProfile = Pick<
	Database['public']['Tables']['profiles']['Row'],
	| 'id'
	| 'name'
	| 'discogs_avatar_url'
	| 'discogs_uid'
	| 'discogs_username'
	| 'just_completed_discogs_oauth'
>

export type DeleteAccountResult =
	| { status: 'deleted'; coverCleanupComplete: boolean }
	| { status: 'recent-auth-required' }
	| { status: 'failed' }

export type AuthFeedbackAction =
	| 'email-login'
	| 'email-signup'
	| 'password-reset-request'
	| 'password-update'
	| 'github'
	| 'google'
	| 'signup-confirmation-resend'

export type PendingSignupContext = {
	email: string
	returnPath: string
}

const AUTH_FEEDBACK_ACTIONS: AuthFeedbackAction[] = [
	'email-login',
	'email-signup',
	'password-reset-request',
	'password-update',
	'github',
	'google',
	'signup-confirmation-resend'
]

export const useUserStore = defineStore('user', () => {
	const supabase = useSupabaseClient<Database>()
	const isDemoStore = isDemoWorkbenchPinia(getWorkbenchStorePinia())
	const authenticatedUser = useSupabaseUser()
	const supaUser = computed(() =>
		isDemoStore ? null : authenticatedUser.value
	)
	const router = useRouter()
	const passwordRecovery = usePasswordRecovery()

	const profile = ref<IdentityProfile | null>(null)
	const userAlreadyRegistered = ref(false)
	const authFeedback = ref<Record<AuthFeedbackAction, string | null>>(
		Object.fromEntries(
			AUTH_FEEDBACK_ACTIONS.map((action) => [action, null])
		) as Record<AuthFeedbackAction, string | null>
	)
	const pendingSignup = ref<PendingSignupContext | null>(null)
	const isResendingSignupConfirmation = ref(false)
	const isSigningOut = ref(false)
	const isDeletingAccount = ref(false)
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

	type AuthenticatedWork = {
		userId: string
		generation: number
	}
	type ProfileReadOutcome = {
		didPublish: boolean
		didRead: boolean
	}
	type AccountBoundMutationClient = Pick<
		SupabaseClient<Database>,
		'functions' | 'rpc'
	>
	type AccountDeletionOperation = {
		id: number
		work: AuthenticatedWork
	}
	let accountDeletionSequence = 0
	let activeAccountDeletion: AccountDeletionOperation | null = null

	function isCurrentWork({ userId, generation }: AuthenticatedWork): boolean {
		return generation === authenticationGeneration && profileOwnerId === userId
	}

	function isSameWork(
		left: AuthenticatedWork,
		right: AuthenticatedWork
	): boolean {
		return left.generation === right.generation && left.userId === right.userId
	}

	function captureCurrentWork(): AuthenticatedWork | null {
		const userId = supaUserId.value ?? profileOwnerId
		if (!userId) return null
		const work = { userId, generation: authenticationGeneration }
		return isCurrentWork(work) ? work : null
	}

	function publishProfileForWork(
		work: AuthenticatedWork,
		nextProfile: IdentityProfile | null
	): boolean {
		if (!isCurrentWork(work)) return false

		profile.value = nextProfile
		return true
	}

	function syncAccountDeletionState() {
		isDeletingAccount.value = Boolean(
			activeAccountDeletion && isCurrentWork(activeAccountDeletion.work)
		)
	}

	function invalidateIdentity(nextUserId: string | null): number {
		authenticationGeneration += 1
		profileOwnerId = nextUserId
		profile.value = null
		syncAccountDeletionState()
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

	function clearAuthFeedback(action?: AuthFeedbackAction) {
		if (action) {
			authFeedback.value[action] = null
			return
		}
		for (const feedbackAction of AUTH_FEEDBACK_ACTIONS)
			authFeedback.value[feedbackAction] = null
	}

	function failAuthOperation(
		action: AuthFeedbackAction,
		message: string
	): false {
		authFeedback.value[action] = message
		return false
	}

	function consumeUserAlreadyRegistered(): boolean {
		const shouldShow = userAlreadyRegistered.value
		userAlreadyRegistered.value = false
		return shouldShow
	}

	function clearPendingSignup() {
		pendingSignup.value = null
		clearAuthFeedback('signup-confirmation-resend')
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

	const deviceTheme = computed((): ThemeOptions => {
		return anonymousThemePreference.value
	})

	async function signUpWithEmail(
		email: string,
		password: string,
		returnPath: unknown = '/'
	): Promise<boolean> {
		clearAuthFeedback('email-signup')
		userAlreadyRegistered.value = false
		const safeReturnPath = sanitizeAuthReturnPath(returnPath)
		try {
			const { data, error } = await supabase.auth.signUp({ email, password })
			if (error?.message === 'User already registered') {
				userAlreadyRegistered.value = true
				await router.push(buildLoginRedirectPath(safeReturnPath))
				return false
			}
			if (error) throw error
			// When email confirmations are enabled, signUp succeeds but no session
			// is created until the user clicks the link in their inbox.
			if (!data.session) {
				pendingSignup.value = { email, returnPath: safeReturnPath }
				await router.push(buildCheckInboxPath(safeReturnPath))
				return true
			}
			pendingSignup.value = null
			await router.push(safeReturnPath)
			toast.success('Sign up successful!')
			return true
		} catch {
			return failAuthOperation(
				'email-signup',
				'Your account could not be created. Check the details and try again.'
			)
		}
	}

	async function signInWithEmail(email: string, password: string) {
		clearAuthFeedback('email-login')
		userAlreadyRegistered.value = false
		try {
			const { error } = await supabase.auth.signInWithPassword({
				email,
				password
			})
			if (error) throw error
			return true
		} catch {
			return failAuthOperation(
				'email-login',
				"We couldn't sign you in. Check your credentials and try again."
			)
		}
	}

	async function signInWithProvider(
		provider: 'github' | 'google',
		returnPath: unknown = '/'
	): Promise<boolean> {
		clearAuthFeedback(provider)
		userAlreadyRegistered.value = false
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
				provider,
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
		const work = captureCurrentWork()
		if (!work) return { status: 'failed' }
		if (activeAccountDeletion && isSameWork(activeAccountDeletion.work, work))
			return { status: 'failed' }

		const operation: AccountDeletionOperation = {
			id: ++accountDeletionSequence,
			work
		}
		activeAccountDeletion = operation
		syncAccountDeletionState()
		try {
			// getUser performs a server-side session check immediately before the
			// destructive request instead of trusting only the hydrated JWT claims.
			const { data: userData, error: userError } = await supabase.auth.getUser()
			if (!isCurrentWork(work)) return { status: 'failed' }
			if (userError) throw userError
			if (userData.user?.id !== work.userId) return { status: 'failed' }
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

			const accountClient = await createAccountBoundMutationClient(work)
			if (!accountClient || !isCurrentWork(work)) return { status: 'failed' }
			const { data, error } = await accountClient.functions.invoke(
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
			const deletionResult: DeleteAccountResult = {
				status: 'deleted',
				coverCleanupComplete
			}
			if (!isCurrentWork(work)) return deletionResult

			// The server-side deletion has completed. Local cleanup failures must not
			// be reported as a failed account deletion.
			let signOutError: unknown = null
			try {
				const signOutResult = await supabase.auth.signOut({ scope: 'local' })
				signOutError = signOutResult.error
			} catch (error) {
				signOutError = error
			}
			const currentUserId = supaUserId.value
			if (currentUserId && currentUserId !== work.userId) return deletionResult
			if (currentUserId === work.userId && !isCurrentWork(work))
				return deletionResult
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
			if (profileOwnerId !== null) invalidateIdentity(null)

			try {
				await router.replace('/login')
			} catch {
				console.error('Deleted account, but login navigation failed')
				toast.warning(
					'Your account was deleted, but this page could not refresh. Reload the page to finish signing out.',
					{ duration: 30000 }
				)
				return deletionResult
			}

			if (signOutError) {
				toast.warning(
					'Your account was deleted. Reload the page if you still appear signed in.',
					{ duration: 30000 }
				)
			} else {
				toast.success('Your account and its data have been deleted.')
			}
			return deletionResult
		} catch (error) {
			if (!isCurrentWork(work)) return { status: 'failed' }
			console.error('Account deletion failed')
			toast.error(
				error instanceof Error
					? error.message
					: 'Your account could not be deleted. Please try again.',
				{ duration: 30000 }
			)
			return { status: 'failed' }
		} finally {
			if (activeAccountDeletion?.id === operation.id) {
				activeAccountDeletion = null
				syncAccountDeletionState()
			}
		}
	}

	async function sendPasswordResetEmail(
		email: string,
		returnPath: unknown = '/'
	): Promise<boolean> {
		clearAuthFeedback('password-reset-request')
		const safeReturnPath = sanitizeAuthReturnPath(returnPath)
		try {
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: `${getSiteUrl()}${buildUpdatePasswordPath(safeReturnPath)}`
			})
			if (error) throw error
			return true
		} catch {
			return failAuthOperation(
				'password-reset-request',
				"We couldn't send the reset link. Please try again."
			)
		}
	}

	async function resetPassword(
		password: string,
		returnPath: unknown = '/'
	): Promise<boolean> {
		clearAuthFeedback('password-update')
		const safeReturnPath = sanitizeAuthReturnPath(returnPath)
		try {
			const { error } = await supabase.auth.updateUser({ password })
			if (error) throw error
		} catch {
			return failAuthOperation(
				'password-update',
				"We couldn't update your password. Please check the requirements and try again."
			)
		}

		passwordRecovery.consume()
		try {
			await router.push(safeReturnPath)
			toast.success('Password reset successful!')
		} catch (e) {
			console.error(e)
			toast.error(
				`Your password was reset, but the requested page could not open.`,
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
		try {
			const { error } = await supabase.auth.verifyOtp({ token_hash, type })
			if (error) throw error
			if (type === 'recovery') {
				passwordRecovery.activate()
				await router.push(buildUpdatePasswordPath(returnPath))
				return true
			}
			await router.push(sanitizeAuthReturnPath(returnPath))
			return true
		} catch {
			return false
		}
	}

	async function resendSignupConfirmation(): Promise<boolean> {
		if (isResendingSignupConfirmation.value || !pendingSignup.value)
			return false
		clearAuthFeedback('signup-confirmation-resend')
		isResendingSignupConfirmation.value = true
		try {
			const { error } = await supabase.auth.resend({
				type: 'signup',
				email: pendingSignup.value.email
			})
			if (error) throw error
			return true
		} catch {
			return failAuthOperation(
				'signup-confirmation-resend',
				"We couldn't resend the confirmation email. Please wait and try again."
			)
		} finally {
			isResendingSignupConfirmation.value = false
		}
	}

	async function readProfileForWork(
		work: AuthenticatedWork,
		reportError: boolean
	): Promise<ProfileReadOutcome> {
		if (!isCurrentWork(work)) return { didPublish: false, didRead: false }
		try {
			const { data, error } = await supabase
				.from('profiles')
				.select(PROFILE_SAFE_COLUMNS)
				.eq('id', work.userId)
				.single()
			if (!isCurrentWork(work)) return { didPublish: false, didRead: false }
			if (error) throw error
			if (!data) throw new Error('Profile response was empty.')
			return {
				didPublish: publishProfileForWork(work, data as IdentityProfile),
				didRead: true
			}
		} catch (e) {
			if (!isCurrentWork(work)) return { didPublish: false, didRead: false }
			if (reportError) {
				console.error(e)
				toast.error(`Error getting your profile.`, { duration: 30000 })
			}
			return { didPublish: false, didRead: false }
		}
	}

	async function fetchProfileForWork(
		work: AuthenticatedWork
	): Promise<boolean> {
		const result = await readProfileForWork(work, true)
		return result.didRead
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

	function setLocalTheme(newTheme: ThemeOptions) {
		anonymousThemePreference.value = newTheme
		saveAnonymousThemePreference(newTheme)
		setTheme(newTheme)
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
		deviceTheme,
		userAlreadyRegistered: readonly(userAlreadyRegistered),
		authFeedback: readonly(authFeedback),
		pendingSignup: readonly(pendingSignup),
		isResendingSignupConfirmation: readonly(isResendingSignupConfirmation),
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
		resendSignupConfirmation,
		clearAuthFeedback,
		consumeUserAlreadyRegistered,
		clearPendingSignup,
		fetchProfile,
		setLocalTheme,
		deleteAllUserData
	}
})
