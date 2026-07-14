import oauthSignature from 'npm:oauth-signature@1.5.0'
import { generateToken } from '../generateToken.ts'
import { getDiscogsConfig } from './config.ts'
import type { DiscogsCredentialRepository } from './credentials.ts'

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
	credentials: DiscogsCredentialRepository,
	fetcher: typeof fetch = fetch
): Promise<Response> {
	const config = getDiscogsConfig()
	const creds = await credentials.getCredentials()
	if (!creds?.access_token) throw new Error('Missing Discogs access token.')
	if (!creds.access_secret)
		throw new Error('Missing Discogs access token secret.')

	const parsedUrl = new URL(url)
	const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`

	const oauth_nonce = await generateToken(12)
	const oauth_timestamp = Math.floor(Date.now() / 1000).toString()

	// Merge OAuth params with every query param present on the caller-supplied
	// URL. oauthSignature.generate encodes and sorts keys per the spec; we just
	// need to hand it the complete param set.
	const signatureParams: Record<string, string> = {
		oauth_consumer_key: config.consumerKey,
		oauth_token: creds.access_token,
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
		config.consumerSecret,
		creds.access_secret
	)

	const finalParams = new URLSearchParams()
	for (const [key, value] of Object.entries(signatureParams)) {
		finalParams.append(key, value)
	}
	finalParams.append('oauth_signature', encodedSignature)

	return await fetcher(`${baseUrl}?${finalParams}`, {
		method: 'GET',
		headers: { 'User-Agent': config.userAgent }
	})
}
