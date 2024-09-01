import { corsHeaders } from '../_shared/corsHeaders.ts'
import { generateToken } from '../_shared/generateToken.ts'
import {
	getAuthedSupabaseClient,
	getUserProfile
} from '../_shared/supabaseHelpers.ts'

const oauth_consumer_key = Deno.env.get('DISCOGS_CONSUMER_KEY') || ''
const oauth_consumer_secret = Deno.env.get('DISCOGS_CONSUMER_SECRET') || ''
const accessTokenURL = 'https://api.discogs.com/oauth/access_token'
const userAgent = 'CrateGuide/0.2'

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS')
		return new Response(null, { status: 204, headers: corsHeaders })

	const authHeader = req.headers.get('Authorization')
	if (!authHeader)
		return new Response(null, { status: 401, headers: corsHeaders })

	try {
		const { oauth_token, oauth_verifier } = await req.json()
		if (!oauth_token) throw new Error('Missing oauth_token')
		if (!oauth_verifier) throw new Error('Missing oauth_verifier')

		const supabase = getAuthedSupabaseClient(authHeader)
		const profile = await getUserProfile(authHeader)

		const params = new URLSearchParams()
		params.append('oauth_consumer_key', oauth_consumer_key)
		params.append('oauth_nonce', await generateToken())
		params.append('oauth_token', oauth_token)
		params.append(
			'oauth_signature',
			`${oauth_consumer_secret}%26${profile.discogs_token_secret}`
		)
		params.append('oauth_signature_method', 'PLAINTEXT')
		params.append('oauth_timestamp', Date.now().toString())
		params.append('oauth_verifier', oauth_verifier)

		const options = {
			method: 'POST',
			headers: { 'User-Agent': userAgent }
		}
		const response = await fetch(accessTokenURL + '?' + params, options)
		const responseParams = new URLSearchParams(await response.text())
		const discogsResponse = Object.fromEntries([...responseParams])

		if (!discogsResponse.oauth_token)
			throw new Error('Discogs did not provide OAuth token.')
		if (!discogsResponse.oauth_token_secret)
			throw new Error('Discogs did not provide OAuth token secret.')

		const { error } = await supabase
			.from('profiles')
			.update({
				discogs_token: discogsResponse.oauth_token,
				discogs_token_secret: discogsResponse.oauth_token_secret
			})
			.eq('id', profile.id)
		if (error) throw error

		return new Response(null, { headers: corsHeaders, status: 200 })
	} catch (e) {
		console.error(e)
		return new Response(JSON.stringify(e), {
			headers: corsHeaders,
			status: 400
		})
	}
})
