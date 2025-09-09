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

	const currentTheme = computed((): ThemeOptions => {
		return profile.value?.ui_theme ?? 'light'
	})

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
			router.push('/')
			toast.success('Sign in successful!')
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error signing in.')
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
		} catch (e) {
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

	async function fetchProfile() {
		try {
			if (!supaUser.value) throw new Error('User not logged in.')
			const { data, error } = await supabase
				.from('profiles')
				.select()
				.eq('id', supaUser.value.id)
				.single()
			if (error) throw error
			profile.value = data as Profile
			setTheme(profile.value.ui_theme ?? 'light')
		} catch (e) {
			toast.error(`Error getting your profile.`, { duration: 30000 })
		}
	}

	async function updateSettings(settingsPartial: Partial<Profile>) {
		if (isUpdatingSettings.value) return
		isUpdatingSettings.value = true
		// optimistically update the local state
		if (profile.value) profile.value = { ...profile.value, ...settingsPartial }
		try {
			if (!supaUser.value) throw new Error('User not logged in.')
			const { data, error } = await supabase
				.from('profiles')
				.update(settingsPartial)
				.eq('id', supaUser.value?.id)
				.select()
				.single()
			if (error) throw error
			// update with the server response to ensure consistency
			profile.value = data as Profile
		} catch (e) {
			fetchProfile()
			toast.error(`Error updating your settings.`, { duration: 30000 })
		} finally {
			isUpdatingSettings.value = false
		}
	}

	async function updateTheme(newTheme: ThemeOptions) {
		setTheme(newTheme)
		try {
			await updateSettings({ ui_theme: newTheme })
		} catch (e) {
			setTheme(currentTheme.value)
			throw e
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
		signUpWithEmail,
		signInWithEmail,
		signInWithProvider,
		signOut,
		sendPasswordResetEmail,
		resetPassword,
		verifyOtp,
		fetchProfile,
		updateSettings,
		updateTheme
	}
})
