import { corsHeaders } from '../_shared/cors.ts'
import {
	PublicOAuthError,
	buildDiscogsOAuthHttpError,
	getPublicOAuthErrorMessage
} from '../_shared/discogs/oauthErrors.ts'
import { generateToken } from '../_shared/generateToken.ts'
import {
	createAuthedSupabaseClient,
	getUser
} from '../_shared/supabaseHelpers.ts'

const headers = { ...corsHeaders, 'Content-Type': 'application/json' }
const oauth_consumer_key = Deno.env.get('DISCOGS_CONSUMER_KEY') || ''
const oauth_consumer_secret = Deno.env.get('DISCOGS_CONSUMER_SECRET') || ''
const userAgent = Deno.env.get('DISCOGS_USER_AGENT') || ''
const requestTokenURL = 'https://api.discogs.com/oauth/request_token'

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers })

	const authHeader = req.headers.get('Authorization')
	if (!authHeader) return new Response(null, { headers, status: 401 })

	try {
		const supabase = createAuthedSupabaseClient(authHeader)
		const user = await getUser(supabase)

		const oauthCallback = buildOAuthCallback()

		const params = new URLSearchParams()
		params.append('oauth_consumer_key', oauth_consumer_key)
		params.append('oauth_nonce', await generateToken())
		params.append('oauth_version', '1.0')
		params.append('oauth_signature_method', 'PLAINTEXT')
		params.append('oauth_timestamp', Math.floor(Date.now() / 1000).toString())
		params.append('oauth_signature', `${oauth_consumer_secret}%26`)
		params.append('oauth_callback', oauthCallback)

		const options = {
			method: 'GET',
			headers: { 'User-Agent': userAgent }
		}
		const response = await fetch(requestTokenURL + '?' + params, options)
		const responseText = await response.text()
		if (!response.ok) {
			console.error('Discogs request token error response:', {
				status: response.status,
				body: responseText
			})
			throw buildDiscogsOAuthHttpError('request_token', response.status)
		}
		const responseParams = new URLSearchParams(responseText)
		const discogsResponse = Object.fromEntries([...responseParams])

		if (!discogsResponse.oauth_token)
			throw new PublicOAuthError(
				'Discogs did not provide an OAuth request token. Please try again.'
			)
		if (!discogsResponse.oauth_token_secret)
			throw new PublicOAuthError(
				'Discogs did not provide an OAuth request token secret. Please try again.'
			)

		const { error } = await supabase
			.from('profiles')
			.update({
				discogs_request_token: discogsResponse.oauth_token,
				discogs_request_secret: discogsResponse.oauth_token_secret
			})
			.eq('id', user.id)
		if (error) throw error

		return new Response(JSON.stringify(discogsResponse.oauth_token), {
			headers,
			status: 200
		})
	} catch (e) {
		console.error('Function error:', e)
		const message = getPublicOAuthErrorMessage(
			e,
			'Could not start Discogs authorization. Please try again.'
		)
		const status = e instanceof PublicOAuthError ? 400 : 500
		return new Response(JSON.stringify({ error: message }), {
			headers,
			status
		})
	}
})

function buildOAuthCallback() {
	const siteURL = Deno.env.get('SITE_URL')?.trim()
	if (!siteURL) {
		throw new PublicOAuthError(
			'Server configuration error: SITE_URL is required for Discogs authorization.'
		)
	}

	let parsedSiteURL: URL
	try {
		parsedSiteURL = new URL(siteURL)
	} catch {
		throw new PublicOAuthError(
			'Server configuration error: SITE_URL must be a valid absolute URL.'
		)
	}

	// Preserve any configured base path and make trailing slash optional.
	parsedSiteURL.pathname = parsedSiteURL.pathname.endsWith('/')
		? parsedSiteURL.pathname
		: `${parsedSiteURL.pathname}/`
	parsedSiteURL.search = ''
	parsedSiteURL.hash = ''

	return new URL('auth/discogs/capture-verifier', parsedSiteURL).toString()
}
