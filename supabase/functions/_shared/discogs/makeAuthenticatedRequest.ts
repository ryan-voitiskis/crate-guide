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

/**
 * Make an authenticated Discogs GET request on behalf of the calling user.
 *
 * The signature base string includes every query parameter present on the
 * input URL plus the OAuth parameters. This matches RFC 5849 §3.4.1.3.2 and
 * is stricter than the Discogs server appears to require today, but future-
 * proofs us against them tightening validation.
 *
 * POST is intentionally not supported — no UI feature needs it, and removing
 * it keeps the blast radius of a coerced-client attack scoped to reads.
 */
export async function makeAuthenticatedRequest(
	url: string,
	authHeader: string
): Promise<Response> {
	const supabase = createAuthedSupabaseClient(authHeader)
	const user = await getUser(supabase)
	const profile = await getUserProfile(supabase, user)
	if (!profile.discogs_access_token)
		throw new Error('Missing Discogs access token.')
	if (!profile.discogs_access_secret)
		throw new Error('Missing Discogs access token secret.')

	const parsedUrl = new URL(url)
	const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`

	const oauth_nonce = await generateToken(12)
	const oauth_timestamp = Math.floor(Date.now() / 1000).toString()

	// Merge OAuth params with every query param present on the caller-supplied
	// URL. oauthSignature.generate encodes and sorts keys per the spec; we just
	// need to hand it the complete param set.
	const signatureParams: Record<string, string> = {
		oauth_consumer_key,
		oauth_token: profile.discogs_access_token,
		oauth_nonce,
		oauth_timestamp,
		oauth_signature_method: 'HMAC-SHA1',
		oauth_version: '1.0'
	}
	for (const [key, value] of parsedUrl.searchParams) {
		signatureParams[key] = value
	}

	const encodedSignature = oauthSignature.generate(
		'GET',
		baseUrl,
		signatureParams,
		oauth_consumer_secret,
		profile.discogs_access_secret
	)

	const finalParams = new URLSearchParams()
	for (const [key, value] of Object.entries(signatureParams)) {
		finalParams.append(key, value)
	}
	finalParams.append('oauth_signature', encodedSignature)

	return await fetch(`${baseUrl}?${finalParams}`, {
		method: 'GET',
		headers: { 'User-Agent': userAgent }
	})
}
