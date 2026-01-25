import oauthSignature from 'npm:oauth-signature@1.5.0'
import { generateToken } from '../generateToken.ts'
import {
	createAuthedSupabaseClient,
	getUser,
	getUserProfile
} from '../supabaseHelpers.ts'

const oauth_consumer_key = Deno.env.get('DISCOGS_CONSUMER_KEY') || ''
const oauth_consumer_secret = Deno.env.get('DISCOGS_CONSUMER_SECRET') || ''
const userAgent = Deno.env.get('DISCOGS_USER_AGENT') || ''

export async function makeAuthenticatedRequest(
	httpMethod: 'GET' | 'POST',
	url: string,
	authHeader: string,
	page?: number,
	per_page?: number
): Promise<Response> {
	const supabase = createAuthedSupabaseClient(authHeader)
	const user = await getUser(supabase)
	const profile = await getUserProfile(supabase, user)
	if (!profile.discogs_access_token)
		throw new Error('Missing Discogs access token.')
	if (!profile.discogs_access_secret)
		throw new Error('Missing Discogs access token secret.')

	const oauth_nonce = await generateToken(12)
	const oauth_timestamp = Math.floor(Date.now() / 1000).toString()

	let signatureParams = {
		oauth_consumer_key,
		oauth_token: profile.discogs_access_token,
		oauth_nonce,
		oauth_timestamp,
		oauth_signature_method: 'HMAC-SHA1',
		oauth_version: '1.0'
	}
	if (page) signatureParams = Object.assign(signatureParams, { page })
	if (per_page) signatureParams = Object.assign(signatureParams, { per_page })

	// generates a RFC 3986 encoded, BASE64 encoded HMAC-SHA1 hash
	const encodedSignature = oauthSignature.generate(
		httpMethod,
		url,
		signatureParams,
		oauth_consumer_secret,
		profile.discogs_access_secret
	)

	const URLParams = new URLSearchParams()
	URLParams.append('oauth_consumer_key', oauth_consumer_key)
	URLParams.append('oauth_token', profile.discogs_access_token)
	URLParams.append('oauth_signature', encodedSignature)
	URLParams.append('oauth_signature_method', 'HMAC-SHA1')
	URLParams.append('oauth_timestamp', oauth_timestamp)
	URLParams.append('oauth_nonce', oauth_nonce)
	URLParams.append('oauth_version', '1.0')
	if (page) URLParams.append('page', page.toString())
	if (per_page) URLParams.append('per_page', per_page.toString())

	const options = {
		method: httpMethod,
		headers: {
			'User-Agent': userAgent
		}
	}

	return await fetch(`${url}?${URLParams}`, options)
}
