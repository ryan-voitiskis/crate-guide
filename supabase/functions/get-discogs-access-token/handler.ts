import {
	type DiscogsConfig,
	getDiscogsConfig
} from '../_shared/discogs/config.ts'
import {
	type DiscogsCredentialRepository,
	createDiscogsCredentialRepository
} from '../_shared/discogs/credentials.ts'
import { fetchAndSetIdentity } from '../_shared/discogs/fetchAndSetIdentity.ts'
import { buildOAuthAuthorizationHeader } from '../_shared/discogs/oauthAuthorization.ts'
import {
	PublicOAuthError,
	buildDiscogsOAuthHttpError,
	getPublicOAuthErrorMessage
} from '../_shared/discogs/oauthErrors.ts'
import { quotaBoundFetch } from '../_shared/discogs/quotaBoundFetch.ts'
import { DiscogsQuotaExceededError } from '../_shared/discogs/requestErrors.ts'
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
	status: number,
	retryAfterMs?: number
): Response {
	const responseHeaders = new Headers(headers)
	if (retryAfterMs !== undefined) {
		responseHeaders.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
	}
	return new Response(JSON.stringify(body), {
		headers: responseHeaders,
		status
	})
}

function rateLimitResponse(
	headers: HeadersInit,
	retryAfterMs: number
): Response {
	return jsonResponse(
		{
			error: 'Discogs is receiving too many requests. Retrying shortly.',
			code: 'discogs_rate_limited',
			retryable: true,
			retry_after_ms: retryAfterMs
		},
		headers,
		429,
		retryAfterMs
	)
}

function identityPendingResponse(
	headers: HeadersInit,
	retryAfterMs?: number
): Response {
	return jsonResponse(
		{
			error:
				'Discogs access is saved, but profile setup is incomplete. Retry profile setup to finish connecting.',
			code: 'discogs_identity_pending',
			retryable: true,
			...(retryAfterMs === undefined ? {} : { retry_after_ms: retryAfterMs })
		},
		headers,
		retryAfterMs === undefined ? 503 : 429,
		retryAfterMs
	)
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
			const {
				oauth_token: oauthToken,
				oauth_verifier: oauthVerifier,
				resume
			} = body as {
				oauth_token?: unknown
				oauth_verifier?: unknown
				resume?: unknown
			}
			const isResume = resume === true
			if (
				!isResume &&
				(typeof oauthToken !== 'string' ||
					oauthToken.length === 0 ||
					typeof oauthVerifier !== 'string' ||
					oauthVerifier.length === 0)
			) {
				throw new PublicOAuthError(
					'Missing OAuth callback parameters from Discogs.'
				)
			}

			const config = dependencies.getConfig()
			const credentials = await dependencies.createCredentials(authHeader)
			const storedCredentials = await credentials.getCredentials()
			const hasAccessToken = Boolean(storedCredentials?.access_token)
			const hasAccessSecret = Boolean(storedCredentials?.access_secret)
			if (hasAccessToken !== hasAccessSecret) {
				throw new PublicOAuthError(
					'Discogs connection state is incomplete. Please restart the Discogs connection.'
				)
			}

			if (hasAccessToken && hasAccessSecret) {
				if (
					!isResume &&
					(typeof oauthToken !== 'string' ||
						oauthToken !== storedCredentials?.request_token)
				) {
					throw new PublicOAuthError(
						'Discogs callback does not match the pending request. Please restart the Discogs connection.'
					)
				}
			} else {
				if (isResume) {
					throw new PublicOAuthError(
						'No resumable Discogs connection was found. Please restart the Discogs connection.'
					)
				}
				const requestSecret = validateDiscogsCallbackCredentials(
					storedCredentials,
					oauthToken as string
				)
				const oauthParameters = {
					oauth_consumer_key: config.consumerKey,
					oauth_nonce: await dependencies.generateNonce(),
					oauth_token: oauthToken as string,
					oauth_signature: `${config.consumerSecret}&${requestSecret}`,
					oauth_signature_method: 'PLAINTEXT',
					oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
					oauth_verifier: oauthVerifier as string
				}
				const response = await quotaBoundFetch(
					credentials,
					dependencies.fetcher,
					accessTokenUrl,
					{
						method: 'POST',
						headers: {
							Authorization: buildOAuthAuthorizationHeader(oauthParameters),
							'User-Agent': config.userAgent
						}
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
				if (
					!discogsResponse.oauth_token ||
					!discogsResponse.oauth_token_secret
				) {
					throw new PublicOAuthError(
						'Discogs did not return a complete OAuth access token. Please restart the Discogs connection and try again.'
					)
				}
				await credentials.setAccessCredentials(
					discogsResponse.oauth_token,
					discogsResponse.oauth_token_secret
				)
			}

			try {
				await dependencies.fetchIdentity(credentials, dependencies.fetcher)
			} catch (error) {
				if (error instanceof DiscogsQuotaExceededError) {
					return identityPendingResponse(headers, error.retryAfterMs)
				}
				console.error('Discogs identity finalization is pending')
				return identityPendingResponse(headers)
			}

			return jsonResponse({ success: true }, headers, 200)
		} catch (error) {
			if (error instanceof DiscogsQuotaExceededError) {
				return rateLimitResponse(headers, error.retryAfterMs)
			}
			console.error('Discogs access token handler failed')
			return jsonResponse(
				{ error: getPublicOAuthErrorMessage(error) },
				headers,
				error instanceof PublicOAuthError ? 400 : 500
			)
		}
	}
}
