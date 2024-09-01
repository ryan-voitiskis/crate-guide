import { toast } from 'vue-sonner'
import { defineStore } from 'pinia'

export const useDiscogsStore = defineStore('discogs', () => {
	const config = useRuntimeConfig()
	const supabase = useSupabaseClient()

	const url =
		config.buildId === 'dev' ? 'http://localhost:3000' : 'https://crate.guide'

	// Doesn't return anything, but updates the user's Discogs token and secret
	async function getDiscogsRequestToken() {
		const { data, error } = await supabase.functions.invoke(
			'getDiscogsRequestToken'
		)
		if (error) toast.error('Error authenticating with Discogs.')
		else if (data) {
			window.location.href = `https://discogs.com/oauth/authorize?oauth_token=${data}`
			return true
		}
		return false
	}

	// Doesn't return anything, but updates the user's Discogs token and secret
	async function getDiscogsAccessToken(
		oauth_token: string,
		oauth_verifier: string
	) {
		const { error } = await supabase.functions.invoke('getDiscogsAccessToken', {
			body: JSON.stringify({ oauth_token, oauth_verifier })
		})
		if (error) toast.error('Error authenticating with Discogs.')
		else toast.success('Successfully authenticated with Discogs!')
	}

	return {
		getDiscogsRequestToken,
		getDiscogsAccessToken
	}
})
