import { toast } from 'vue-sonner'
import { FunctionsError } from '@supabase/supabase-js'

export const useDiscogsAuthStore = defineStore('discogsAuth', () => {
	const user = useUserStore()
	const ui = useUiStore()

	const supabase = useSupabaseClient<Database>()

	const isDiscogsConnecting = ref(false)
	const oAuthCompletionFailed = ref(false)

	const isOAuthed = computed((): boolean => {
		return Boolean(
			user.profile?.discogs_access_secret && user.profile.discogs_access_token
		)
	})

	async function initDiscogsOAuthFlow() {
		isDiscogsConnecting.value = true
		const { data, error } = await supabase.functions.invoke(
			'get-discogs-request-token'
		)
		if (error) toast.error('Error authenticating with Discogs.')
		else if (data)
			window.location.href = `https://discogs.com/oauth/authorize?oauth_token=${data}`
	}

	async function completeDiscogsOAuth(): Promise<boolean> {
		oAuthCompletionFailed.value = false
		const route = useRoute()
		const oauth_token = route.query.oauth_token as string
		const oauth_verifier = route.query.oauth_verifier as string

		const { error } = await supabase.functions.invoke(
			'get-discogs-access-token',
			{ body: JSON.stringify({ oauth_token, oauth_verifier }) }
		)

		if (error instanceof FunctionsError) {
			oAuthCompletionFailed.value = true
			return false
		} else {
			user.fetchProfile()
			ui.setTab('collection')
			navigateTo('/')
			return true
		}
	}

	return {
		isDiscogsConnecting,
		isOAuthed,
		oAuthCompletionFailed,
		initDiscogsOAuthFlow,
		completeDiscogsOAuth
	}
})
