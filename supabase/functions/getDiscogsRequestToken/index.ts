import { corsHeaders } from '../_shared/corsHeaders.ts'
import { generateToken } from '../_shared/generateToken.ts'
import { getAuthedSupabaseClient } from '../_shared/supabaseClient.ts'

const oauth_consumer_key = Deno.env.get('DISCOGS_CONSUMER_KEY') || ''
const oauth_consumer_secret = Deno.env.get('DISCOGS_CONSUMER_SECRET') || ''
const requestTokenURL = 'https://api.discogs.com/oauth/request_token'
const oauthCallback = Deno.env.get('SITE_URL') + '/api/discogs/capture_verifier'
const userAgent = 'CrateGuide/0.2'

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS')
		return new Response(null, { status: 204, headers: corsHeaders })

	const authHeader = req.headers.get('Authorization')
	if (!authHeader)
		return new Response(null, { status: 401, headers: corsHeaders })

	try {
		const params = new URLSearchParams()
		params.append('oauth_consumer_key', oauth_consumer_key)
		params.append('oauth_nonce', await generateToken())
		params.append('oauth_version', '1.0')
		params.append('oauth_signature_method', 'PLAINTEXT')
		params.append('oauth_timestamp', Date.now().toString())
		params.append('oauth_signature', oauth_consumer_secret + '%26')
		params.append('oauth_callback', oauthCallback)

		const options = {
			method: 'GET',
			headers: { 'User-Agent': userAgent }
		}
		const response = await fetch(requestTokenURL + '?' + params, options)
		const responseText = await response.text()
		const responseParams = new URLSearchParams(responseText)
		const discogsResponse = Object.fromEntries([...responseParams])

		if (!discogsResponse.oauth_token)
			throw new Error('Discogs did not provide OAuth token.')

		const supabase = getAuthedSupabaseClient(authHeader)

		const { data } = await supabase.auth.getUser()
		const user = data.user
		if (!user) throw new Error('Crate Guide user not found')

		const { error } = await supabase
			.from('profiles')
			.update({
				discogs_token: discogsResponse.oauth_token,
				discogs_token_secret: discogsResponse.oauth_token_secret
			})
			.eq('id', user.id)
		if (error) throw error

		return new Response(JSON.stringify(discogsResponse.oauth_token), {
			headers: corsHeaders,
			status: 200
		})
	} catch (e) {
		console.error(e)
		return new Response(JSON.stringify(e), {
			headers: corsHeaders,
			status: 400
		})
	}
})
