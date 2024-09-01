import { toast } from 'vue-sonner'
import { defineStore } from 'pinia'

export const useDiscogsStore = defineStore('discogs', () => {
	const config = useRuntimeConfig()
	const supabase = useSupabaseClient()

	const url =
		config.buildId === 'dev' ? 'http://localhost:3000' : 'https://crate.guide'

	async function getDiscogsRequestToken() {
		const { data, error } = await supabase.functions.invoke(
			'getDiscogsRequestToken'
		)
		console.log('data', data)
		console.log('error', error)
	}

	return {
		getDiscogsRequestToken
	}
})
