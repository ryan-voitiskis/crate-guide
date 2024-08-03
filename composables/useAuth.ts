import { toast } from 'vue-sonner'

export function useAuth() {
	const supabase = useSupabaseClient()
	const router = useRouter()

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
			router.push('/')
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
			router.push('/')
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
			router.push('/')
		} catch (e) {
			toast.error(`Error signing in${isError(e) ? `: ${e.message}` : ''}.`)
		}
		signingInRef.value = false
	}

	return {
		signingUpWithEmail,
		signingInWithEmail,
		signingInWithGithub,
		signingInWithGoogle,
		signUpWithEmail,
		signInWithEmail,
		signInWithProvider
	}
}
