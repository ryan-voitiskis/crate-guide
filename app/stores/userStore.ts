import { toast } from 'vue-sonner'
import type { EmailOtpType } from '@supabase/supabase-js'
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
	const supabase = useSupabaseClient<Database>()
	const supaUser = useSupabaseUser()
	const router = useRouter()

	const profile = ref<Profile | null>(null)
	const userAlreadyRegistered = ref(false)
	const isUpdatingSettings = ref(false)
	const localThemePreference = ref<ThemeOptions>(
		getSavedThemePreference() ?? 'light'
	)
	let settingsUpdateQueue: Promise<boolean> = Promise.resolve(true)

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
	setTheme(currentTheme.value)

	async function signUpWithEmail(email: string, password: string) {
		try {
			const { error } = await supabase.auth.signUp({ email, password })
			if (error?.message === 'User already registered') {
				userAlreadyRegistered.value = true
				router.push('/login')
				toast.warning(`You've already created an account.`)
				return
			}
			if (error) throw error
			router.push('/')
			toast.success('Sign up successful!')
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error signing up.')
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

	async function signInWithProvider(provider: 'github' | 'google') {
		try {
			const { error } = await supabase.auth.signInWithOAuth({
				provider,
				options: { redirectTo: `${process.env.SITE_URL}/auth/finalising` }
			})
			if (error) throw error
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error signing in.')
		}
	}

	async function signOut() {
		try {
			const { error } = await supabase.auth.signOut()
			if (error) throw error
			profile.value = null
			toast.success('You are now signed out.')
		} catch {
			toast.error(`Error signing out.`, { duration: 30000 })
		}
	}

	async function sendPasswordResetEmail(email: string): Promise<boolean> {
		try {
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: `${process.env.SITE_URL}/update-password`
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
				.select()
				.eq('id', userId)
				.single()
			if (error) throw error
			profile.value = data as Profile
			const theme = profile.value.ui_theme ?? 'light'
			localThemePreference.value = theme
			saveThemePreference(theme)
			setTheme(theme)
			return true
		} catch {
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
					.select()
					.single()
				if (error) throw error
				// update with the server response to ensure consistency
				profile.value = data as Profile
				return true
			} catch {
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
		if (!supaUser.value?.id) return
		const didPersist = await updateSettings({ ui_theme: newTheme })
		if (!didPersist) {
			localThemePreference.value = previousTheme
			saveThemePreference(previousTheme)
			setTheme(previousTheme)
		}
	}

	async function deleteAllUserData(): Promise<boolean> {
		if (!supaUser.value?.id) {
			toast.error('You must be signed in to delete data.')
			return false
		}

		try {
			// Delete all records (tracks cascade automatically via FK)
			const { error: recordsError } = await supabase
				.from('records')
				.delete()
				.eq('user_id', supaUser.value.id)

			if (recordsError) throw recordsError

			// Clear all crates' records arrays (keep crate structure)
			const { error: cratesError } = await supabase
				.from('crates')
				.update({ records: [] })
				.eq('user_id', supaUser.value.id)

			if (cratesError) throw cratesError

			// Clear all sets' played_tracks arrays (keep set structure)
			const { error: setsError } = await supabase
				.from('sets')
				.update({ played_tracks: [] })
				.eq('user_id', supaUser.value.id)

			if (setsError) throw setsError

			// Clear local state in all stores
			const records = useRecordsStore()
			const tracks = useTracksStore()
			const crates = useCratesStore()

			records.clearRecords()
			tracks.clearTracks()
			// Refetch crates to get the updated (empty) records arrays
			await crates.fetchAllCrates()

			toast.success('All records and tracks have been deleted.')
			return true
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error deleting data.')
			return false
		}
	}

	watchEffect(() => {
		if (supaUser.value?.id) fetchProfile()
	})

	return {
		supaUser,
		profile,
		currentTheme,
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
		deleteAllUserData
	}
})
