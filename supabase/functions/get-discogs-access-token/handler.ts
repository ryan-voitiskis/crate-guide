import {
	type DiscogsConfig,
	getDiscogsConfig
} from '../_shared/discogs/config.ts'
import {
	type DiscogsCredentialRepository,
	createDiscogsCredentialRepository
} from '../_shared/discogs/credentials.ts'
import { fetchAndSetIdentity } from '../_shared/discogs/fetchAndSetIdentity.ts'
import {
	PublicOAuthError,
	buildDiscogsOAuthHttpError,
	getPublicOAuthErrorMessage
} from '../_shared/discogs/oauthErrors.ts'
import { generateToken } from '../_shared/generateToken.ts'
import { validateDiscogsCallbackCredentials } from './validateCredentials.ts'

const accessTokenUrl = 'https://api.discogs.com/oauth/access_token'

interface HandlerDependencies {
	createCredentials(authHeader: string): Promise<DiscogsCredentialRepository>
	fetcher: typeof fetch
	generateNonce(): Promise<string>
	getConfig(): DiscogsConfig
	fetchIdentity(
		credentials: DiscogsCredentialRepository,
		fetcher: typeof fetch
	): Promise<void>
}

const defaultDependencies: HandlerDependencies = {
	createCredentials: createDiscogsCredentialRepository,
	fetcher: fetch,
	generateNonce: generateToken,
	getConfig: getDiscogsConfig,
	fetchIdentity: fetchAndSetIdentity
}

function jsonResponse(
	body: unknown,
	headers: HeadersInit,
	status: number
): Response {
	return new Response(JSON.stringify(body), { headers, status })
}

export function createDiscogsAccessTokenHandler(
	headers: HeadersInit,
	dependencies: HandlerDependencies = defaultDependencies
): (request: Request) => Promise<Response> {
	return async (request) => {
		if (request.method === 'OPTIONS') return new Response('ok', { headers })
		const authHeader = request.headers.get('Authorization')
		if (!authHeader) return new Response(null, { headers, status: 401 })

		try {
			let body: unknown
			try {
				body = await request.json()
			} catch {
				throw new PublicOAuthError(
					'Missing OAuth callback parameters from Discogs.'
				)
			}
			if (!body || typeof body !== 'object') {
				throw new PublicOAuthError(
					'Missing OAuth callback parameters from Discogs.'
				)
			}
			const { oauth_token: oauthToken, oauth_verifier: oauthVerifier } =
				body as {
					oauth_token?: unknown
					oauth_verifier?: unknown
				}
			if (
				typeof oauthToken !== 'string' ||
				oauthToken.length === 0 ||
				typeof oauthVerifier !== 'string' ||
				oauthVerifier.length === 0
			) {
				throw new PublicOAuthError(
					'Missing OAuth callback parameters from Discogs.'
				)
			}

			const config = dependencies.getConfig()
			const credentials = await dependencies.createCredentials(authHeader)
			const requestSecret = validateDiscogsCallbackCredentials(
				await credentials.getCredentials(),
				oauthToken
			)
			const params = new URLSearchParams({
				oauth_consumer_key: config.consumerKey,
				oauth_nonce: await dependencies.generateNonce(),
				oauth_token: oauthToken,
				oauth_signature: `${config.consumerSecret}%26${requestSecret}`,
				oauth_signature_method: 'PLAINTEXT',
				oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
				oauth_verifier: oauthVerifier
			})
			const response = await dependencies.fetcher(
				`${accessTokenUrl}?${params}`,
				{
					method: 'POST',
					headers: { 'User-Agent': config.userAgent }
				}
			)
			const responseText = await response.text()
			if (!response.ok) {
				console.error('Discogs access token request failed', {
					status: response.status
				})
				throw buildDiscogsOAuthHttpError('access_token', response.status)
			}
			const discogsResponse = Object.fromEntries(
				new URLSearchParams(responseText)
			)
			if (!discogsResponse.oauth_token || !discogsResponse.oauth_token_secret) {
				throw new PublicOAuthError(
					'Discogs did not return a complete OAuth access token. Please restart the Discogs connection and try again.'
				)
			}
			await credentials.setAccessCredentials(
				discogsResponse.oauth_token,
				discogsResponse.oauth_token_secret
			)
			await dependencies.fetchIdentity(credentials, dependencies.fetcher)

			return jsonResponse({ success: true }, headers, 200)
		} catch (error) {
			console.error('Discogs access token handler failed')
			return jsonResponse(
				{ error: getPublicOAuthErrorMessage(error) },
				headers,
				error instanceof PublicOAuthError ? 400 : 500
			)
		}
	}
}
