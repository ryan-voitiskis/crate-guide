import { toast } from 'vue-sonner'
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
	const supabase = useSupabaseClient()
	const supaUser = useSupabaseUser()

	const profile = ref<Profile | null>(null)

	const signingUpWithEmail = ref(false)
	const signingInWithEmail = ref(false)
	const signingInWithGithub = ref(false)
	const signingInWithGoogle = ref(false)

	async function signUpWithEmail(email: string, password: string) {
		signingUpWithEmail.value = true
		try {
			const { error } = await supabase.auth.signUp({ email, password })
			if (error) throw error
			toast.success('Account creation successful!')
		} catch (e) {
			toast.error(`Error signing up${isError(e) ? `: ${e.message}` : ''}.`)
		}
		signingUpWithEmail.value = false
	}

	async function signInWithEmail(email: string, password: string) {
		signingInWithEmail.value = true
		try {
			const { error } = await supabase.auth.signInWithPassword({
				email,
				password
			})
			if (error) throw error
			toast.success('Sign in successful!')
		} catch (e) {
			toast.error(`Error signing in${isError(e) ? `: ${e.message}` : ''}.`)
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
			toast.error(`Error signing in${isError(e) ? `: ${e.message}` : ''}.`)
		}
		signingInRef.value = false
	}

	async function signOut() {
		try {
			const { error } = await supabase.auth.signOut()
			if (error) throw error
			toast.success('You are now signed out.')
		} catch (e) {
			toast.error(`Error signing out.`)
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
			toast.error(`Error getting your profile.`)
		}
	}

	watch(
		supaUser,
		() => {
			if (supaUser.value.id) fetchProfile(supaUser.value.id)
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
		signUpWithEmail,
		signInWithEmail,
		signInWithProvider,
		signOut
	}
})
