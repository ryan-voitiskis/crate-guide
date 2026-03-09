import { corsHeaders } from '../_shared/cors.ts'
import { fetchAndSetIdentity } from '../_shared/discogs/fetchAndSetIdentity.ts'
import {
	PublicOAuthError,
	buildDiscogsOAuthHttpError,
	getPublicOAuthErrorMessage
} from '../_shared/discogs/oauthErrors.ts'
import { generateToken } from '../_shared/generateToken.ts'
import {
	createAuthedSupabaseClient,
	getUser,
	getUserProfile
} from '../_shared/supabaseHelpers.ts'
import type { Profile } from '../_shared/types/supabase.ts'

const headers = { ...corsHeaders, 'Content-Type': 'application/json' }

const oauth_consumer_key = Deno.env.get('DISCOGS_CONSUMER_KEY') || ''
const oauth_consumer_secret = Deno.env.get('DISCOGS_CONSUMER_SECRET') || ''
const userAgent = Deno.env.get('DISCOGS_USER_AGENT') || ''
const accessTokenURL = 'https://api.discogs.com/oauth/access_token'

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers })

	const authHeader = req.headers.get('Authorization')
	if (!authHeader) return new Response(null, { headers, status: 401 })

	try {
		const { oauth_token, oauth_verifier } = await req.json()
		if (!oauth_token || !oauth_verifier) {
			throw new PublicOAuthError(
				'Missing OAuth callback parameters from Discogs.'
			)
		}

		const supabase = createAuthedSupabaseClient(authHeader)
		const user = await getUser(supabase)
		const profile = await getUserProfile(supabase, user)
		const oauthSignature = generateOAuthSignature(
			oauth_consumer_secret,
			profile
		)

		const params = new URLSearchParams()
		params.append('oauth_consumer_key', oauth_consumer_key)
		params.append('oauth_nonce', await generateToken())
		params.append('oauth_token', oauth_token)
		params.append('oauth_signature', oauthSignature)
		params.append('oauth_signature_method', 'PLAINTEXT')
		params.append('oauth_timestamp', Math.floor(Date.now() / 1000).toString())
		params.append('oauth_verifier', oauth_verifier)

		const options = {
			method: 'POST',
			headers: { 'User-Agent': userAgent }
		}
		const response = await fetch(accessTokenURL + '?' + params, options)
		const responseText = await response.text()
		if (!response.ok) {
			console.error('Discogs access token error response:', {
				status: response.status,
				body: responseText
			})
			throw buildDiscogsOAuthHttpError('access_token', response.status)
		}
		const responseParams = new URLSearchParams(responseText)
		const discogsResponse = Object.fromEntries([...responseParams])

		if (!discogsResponse.oauth_token) {
			throw new PublicOAuthError(
				'Discogs did not return a complete OAuth access token. Please restart the Discogs connection and try again.'
			)
		}
		if (!discogsResponse.oauth_token_secret) {
			throw new PublicOAuthError(
				'Discogs did not return a complete OAuth access token. Please restart the Discogs connection and try again.'
			)
		}

		const { error } = await supabase
			.from('profiles')
			.update({
				discogs_access_token: discogsResponse.oauth_token,
				discogs_access_secret: discogsResponse.oauth_token_secret
			})
			.eq('id', profile.id)
		if (error) throw error

		await fetchAndSetIdentity(supabase, authHeader)

		return new Response(JSON.stringify({ success: true }), {
			headers,
			status: 200
		})
	} catch (e) {
		console.error('Function error:', e)
		const message = getPublicOAuthErrorMessage(e)
		return new Response(JSON.stringify({ error: message }), {
			headers,
			status: 500
		})
	}
})

function generateOAuthSignature(consumerSecret: string, profile: Profile) {
	if (!profile.discogs_request_secret) {
		throw new PublicOAuthError(
			'Discogs request state is missing. Please restart the Discogs connection and try again.'
		)
	}
	return `${consumerSecret}%26${profile.discogs_request_secret}`
}
