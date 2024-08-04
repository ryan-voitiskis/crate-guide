import { toast } from 'vue-sonner'
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
	const supabase = useSupabaseClient()
	const supaUser = useSupabaseUser()
	const router = useRouter()

	const profile = ref<Profile | null>(null)

	const signingUpWithEmail = ref(false)
	const signingInWithEmail = ref(false)
	const signingInWithGithub = ref(false)
	const signingInWithGoogle = ref(false)
	const userAlreadyRegistered = ref(false)

	async function signUpWithEmail(email: string, password: string) {
		signingUpWithEmail.value = true
		try {
			const { error } = await supabase.auth.signUp({ email, password })
			if (error?.message === 'User already registered') {
				userAlreadyRegistered.value = true
				signingUpWithEmail.value = false
				router.push('/login')
				toast.warning(`You've already created an account.`)
				return
			}
			if (error) throw error
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error signing up.', {
				duration: 30000
			})
		}
		signingUpWithEmail.value = false
	}

	async function signInWithEmail(email: string, password: string) {
		signingInWithEmail.value = true
		try {
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password
			})
			if (error) throw error
			if (!data.user) throw Error('No user id returned.')
			fetchProfile(data.user.id)
			toast.success('Sign in successful!')
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error signing in.', {
				duration: 30000
			})
		}
		signingInWithEmail.value = false
	}

	async function signInWithProvider(provider: 'github' | 'google') {
		const signingInRef =
			provider === 'github' ? signingInWithGithub : signingInWithGoogle
		signingInRef.value = true
		try {
			const { error } = await supabase.auth.signInWithOAuth({ provider })
			if (error) throw error
			toast.success('Sign in successful!')
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error signing in.', {
				duration: 30000
			})
		}
		signingInRef.value = false
	}

	async function signOut() {
		try {
			const { error } = await supabase.auth.signOut()
			if (error) throw error
			toast.success('You are now signed out.')
		} catch (e) {
			toast.error(`Error signing out.`, { duration: 30000 })
		}
	}

	async function fetchProfile(id: string) {
		try {
			const { data, error } = await supabase
				.from('profiles')
				.select()
				.eq('id', id)
				.single()
			if (error) throw error
			profile.value = data
		} catch (e) {
			toast.error(`Error getting your profile.`, { duration: 30000 })
		}
	}

	watch(
		supaUser,
		() => {
			if (supaUser.value?.id) fetchProfile(supaUser.value.id)
		},
		{ immediate: true }
	)

	return {
		supaUser,
		profile,
		signingUpWithEmail,
		signingInWithEmail,
		signingInWithGithub,
		signingInWithGoogle,
		userAlreadyRegistered,
		signUpWithEmail,
		signInWithEmail,
		signInWithProvider,
		signOut
	}
})
