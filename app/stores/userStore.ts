import { toast } from 'vue-sonner'
import type { EmailOtpType } from '@supabase/supabase-js'
import { defineStore } from 'pinia'

// Explicit column list for client-side profile reads. The Discogs OAuth
// secret columns were moved to public.discogs_credentials (no SELECT RLS) so
// this list simply enumerates every non-secret profile column the UI needs.
// Discogs connection state is derived from discogs_username (see
// discogsAuthStore isOAuthed).
export const PROFILE_SAFE_COLUMNS =
	'id, name, discogs_avatar_url, discogs_uid, discogs_username, just_completed_discogs_oauth, key_format, list_layout, selected_crate, turntable_pitch_range, turntable_theme, ui_theme'

export const useUserStore = defineStore('user', () => {
	const supabase = useSupabaseClient<Database>()
	const supaUser = useSupabaseUser()
	const router = useRouter()

	const profile = ref<Profile | null>(null)
	const userAlreadyRegistered = ref(false)
	const isUpdatingSettings = ref(false)
	const localKeyFormatPreference = ref<'key' | 'camelot'>('key')
	const localThemePreference = ref<ThemeOptions>(
		getSavedThemePreference() ?? 'light'
	)
	let settingsUpdateQueue: Promise<boolean> = Promise.resolve(true)

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

	async function resolveAuthenticatedUserId(): Promise<string> {
		const reactiveUserId = supaUser.value?.id
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
		return profile.value?.ui_theme ?? localThemePreference.value
	})
	const currentKeyFormat = computed((): 'key' | 'camelot' => {
		const stored = profile.value?.key_format
		return isKeyFormat(stored) ? stored : localKeyFormatPreference.value
	})
	setTheme(currentTheme.value)

	async function signUpWithEmail(
		email: string,
		password: string
	): Promise<boolean> {
		try {
			const { data, error } = await supabase.auth.signUp({ email, password })
			if (error?.message === 'User already registered') {
				userAlreadyRegistered.value = true
				router.push('/login')
				toast.warning(`You've already created an account.`)
				return false
			}
			if (error) throw error
			// When email confirmations are enabled, signUp succeeds but no session
			// is created until the user clicks the link in their inbox.
			if (!data.session) {
				router.push('/auth/check-inbox')
				return true
			}
			router.push('/')
			toast.success('Sign up successful!')
			return true
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error signing up.')
			return false
		}
	}

	async function signInWithEmail(email: string, password: string) {
		try {
			const { error } = await supabase.auth.signInWithPassword({
				email,
				password
			})
			if (error) throw error
			toast.success('Sign in successful!')
			return true
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error signing in.')
			return false
		}
	}

	async function signInWithProvider(
		provider: 'github' | 'google'
	): Promise<boolean> {
		try {
			const { error } = await supabase.auth.signInWithOAuth({
				provider,
				options: { redirectTo: `${getSiteUrl()}/auth/finalising` }
			})
			if (error) throw error
			return true
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error signing in.')
			return false
		}
	}

	async function signOut() {
		try {
			const { error } = await supabase.auth.signOut()
			if (error) throw error
			profile.value = null
			toast.success('You are now signed out.')
		} catch (e) {
			console.error(e)
			toast.error(`Error signing out.`, { duration: 30000 })
		}
	}

	async function sendPasswordResetEmail(email: string): Promise<boolean> {
		try {
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: `${getSiteUrl()}/update-password`
			})
			if (error) throw error
			toast.success('Password reset email sent!')
			return true
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error sending link.')
			return false
		}
	}

	async function resetPassword(password: string) {
		try {
			const { error } = await supabase.auth.updateUser({ password })
			if (error) throw error
			router.push('/')
			toast.success('Password reset successful!')
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error resetting password.')
		}
	}

	async function verifyOtp(token_hash: string, type: EmailOtpType) {
		try {
			const { error } = await supabase.auth.verifyOtp({ token_hash, type })
			if (error) throw error
			router.push('/')
			toast.success('Sign in successful!')
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error verifying OTP.')
		}
	}

	async function fetchProfile(): Promise<boolean> {
		try {
			const userId = await resolveAuthenticatedUserId()
			const { data, error } = await supabase
				.from('profiles')
				.select(PROFILE_SAFE_COLUMNS)
				.eq('id', userId)
				.single()
			if (error) throw error
			profile.value = data as Profile
			const theme = profile.value.ui_theme ?? 'light'
			localThemePreference.value = theme
			saveThemePreference(theme)
			setTheme(theme)
			const keyFormat = profile.value.key_format
			localKeyFormatPreference.value = isKeyFormat(keyFormat)
				? keyFormat
				: 'key'
			return true
		} catch (e) {
			console.error(e)
			toast.error(`Error getting your profile.`, { duration: 30000 })
			return false
		}
	}

	async function updateSettings(settingsPartial: Partial<Profile>) {
		// optimistically update the local state
		if (profile.value) profile.value = { ...profile.value, ...settingsPartial }
		const runUpdate = async (): Promise<boolean> => {
			isUpdatingSettings.value = true
			try {
				const userId = await resolveAuthenticatedUserId()
				const { data, error } = await supabase
					.from('profiles')
					.update(settingsPartial)
					.eq('id', userId)
					.select(PROFILE_SAFE_COLUMNS)
					.single()
				if (!data) {
					if (error && error.code !== 'PGRST116') throw error
					const { data: upsertedData, error: upsertError } = await supabase
						.from('profiles')
						.upsert(
							{
								id: userId,
								...settingsPartial
							},
							{ onConflict: 'id' }
						)
						.select(PROFILE_SAFE_COLUMNS)
						.single()
					if (upsertError || !upsertedData) throw upsertError
					profile.value = upsertedData as Profile
					return true
				}
				if (error) throw error
				// update with the server response to ensure consistency
				profile.value = data as Profile
				return true
			} catch (e) {
				console.error(e)
				await fetchProfile()
				toast.error(`Error updating your settings.`, { duration: 30000 })
				return false
			} finally {
				isUpdatingSettings.value = false
			}
		}

		settingsUpdateQueue = settingsUpdateQueue.then(runUpdate, runUpdate)
		return settingsUpdateQueue
	}

	async function updateTheme(newTheme: ThemeOptions) {
		const previousTheme = currentTheme.value
		localThemePreference.value = newTheme
		saveThemePreference(newTheme)
		setTheme(newTheme)
		if (!supaUser.value?.id) {
			try {
				await resolveAuthenticatedUserId()
			} catch {
				return
			}
		}
		const didPersist = await updateSettings({ ui_theme: newTheme })
		if (!didPersist) {
			localThemePreference.value = previousTheme
			saveThemePreference(previousTheme)
			setTheme(previousTheme)
		}
	}

	async function updateKeyFormat(newKeyFormat: 'key' | 'camelot') {
		if (newKeyFormat === currentKeyFormat.value) return
		const previousKeyFormat = currentKeyFormat.value
		localKeyFormatPreference.value = newKeyFormat
		if (!supaUser.value?.id) {
			try {
				await resolveAuthenticatedUserId()
			} catch {
				return
			}
		}
		const didPersist = await updateSettings({ key_format: newKeyFormat })
		if (!didPersist) localKeyFormatPreference.value = previousKeyFormat
	}

	async function deleteAllUserData(): Promise<boolean> {
		try {
			await resolveAuthenticatedUserId()
			const { error } = await supabase.rpc('delete_all_user_data')

			if (error) throw error

			// Clear local state in all stores
			const records = useRecordsStore()
			const tracks = useTracksStore()
			const crates = useCratesStore()
			const session = useSessionStore()

			records.clearRecords()
			tracks.clearTracks()
			crates.crates = crates.crates.map((crate) => ({
				...crate,
				records: []
			}))
			session.savedSets = session.savedSets.map((savedSet) => ({
				...savedSet,
				played_tracks: []
			}))
			session.clearSession()

			toast.success('All records and tracks have been deleted.')
			return true
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error deleting data.')
			return false
		}
	}

	watchEffect(() => {
		if (profile.value) return
		if (supaUser.value?.id) {
			void fetchProfile()
			return
		}
		void (async () => {
			const { data: sessionData, error: sessionError } =
				await supabase.auth.getSession()
			if (sessionError) return
			if (!sessionData.session?.user?.id) return
			await fetchProfile()
		})()
	})

	return {
		supaUser,
		profile,
		currentTheme,
		currentKeyFormat,
		userAlreadyRegistered,
		isUpdatingSettings,
		resolveAuthenticatedUserId,
		signUpWithEmail,
		signInWithEmail,
		signInWithProvider,
		signOut,
		sendPasswordResetEmail,
		resetPassword,
		verifyOtp,
		fetchProfile,
		updateSettings,
		updateTheme,
		updateKeyFormat,
		deleteAllUserData
	}
})
