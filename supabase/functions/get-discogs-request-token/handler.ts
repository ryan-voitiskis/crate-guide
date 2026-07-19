import {
	type DiscogsConfig,
	getDiscogsConfig
} from '../_shared/discogs/config.ts'
import {
	type DiscogsCredentialRepository,
	createDiscogsCredentialRepository
} from '../_shared/discogs/credentials.ts'
import { buildOAuthAuthorizationHeader } from '../_shared/discogs/oauthAuthorization.ts'
import {
	PublicOAuthError,
	buildDiscogsOAuthHttpError,
	getPublicOAuthErrorMessage
} from '../_shared/discogs/oauthErrors.ts'
import { generateToken } from '../_shared/generateToken.ts'
import { requireEnv } from '../_shared/supabaseHelpers.ts'

const requestTokenUrl = 'https://api.discogs.com/oauth/request_token'

interface HandlerDependencies {
	createCredentials(authHeader: string): Promise<DiscogsCredentialRepository>
	fetcher: typeof fetch
	generateNonce(): Promise<string>
	getConfig(): DiscogsConfig
	getCallback(): string
}

const defaultDependencies: HandlerDependencies = {
	createCredentials: createDiscogsCredentialRepository,
	fetcher: fetch,
	generateNonce: generateToken,
	getConfig: getDiscogsConfig,
	getCallback: buildOAuthCallback
}

export function buildOAuthCallback(siteUrl = requireEnv('SITE_URL')): string {
	let parsedSiteUrl: URL
	try {
		parsedSiteUrl = new URL(siteUrl)
	} catch {
		throw new PublicOAuthError(
			'Server configuration error: SITE_URL must be a valid absolute URL.'
		)
	}

	parsedSiteUrl.pathname = parsedSiteUrl.pathname.endsWith('/')
		? parsedSiteUrl.pathname
		: `${parsedSiteUrl.pathname}/`
	parsedSiteUrl.search = ''
	parsedSiteUrl.hash = ''
	return new URL('auth/discogs/capture-verifier', parsedSiteUrl).toString()
}

function jsonResponse(
	body: unknown,
	headers: HeadersInit,
	status: number
): Response {
	return new Response(JSON.stringify(body), { headers, status })
}

export function createDiscogsRequestTokenHandler(
	headers: HeadersInit,
	dependencies: HandlerDependencies = defaultDependencies
): (request: Request) => Promise<Response> {
	return async (request) => {
		if (request.method === 'OPTIONS') return new Response('ok', { headers })
		const authHeader = request.headers.get('Authorization')
		if (!authHeader) return new Response(null, { headers, status: 401 })

		try {
			const config = dependencies.getConfig()
			const credentials = await dependencies.createCredentials(authHeader)
			const oauthParameters = {
				oauth_consumer_key: config.consumerKey,
				oauth_nonce: await dependencies.generateNonce(),
				oauth_version: '1.0',
				oauth_signature_method: 'PLAINTEXT',
				oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
				oauth_signature: `${config.consumerSecret}&`,
				oauth_callback: dependencies.getCallback()
			}
			const response = await dependencies.fetcher(requestTokenUrl, {
				method: 'GET',
				headers: {
					Authorization: buildOAuthAuthorizationHeader(oauthParameters),
					'User-Agent': config.userAgent
				}
			})
			const responseText = await response.text()
			if (!response.ok) {
				console.error('Discogs request token request failed', {
					status: response.status
				})
				throw buildDiscogsOAuthHttpError('request_token', response.status)
			}
			const discogsResponse = Object.fromEntries(
				new URLSearchParams(responseText)
			)
			if (!discogsResponse.oauth_token) {
				throw new PublicOAuthError(
					'Discogs did not provide an OAuth request token. Please try again.'
				)
			}
			if (!discogsResponse.oauth_token_secret) {
				throw new PublicOAuthError(
					'Discogs did not provide an OAuth request token secret. Please try again.'
				)
			}
			await credentials.setRequestCredentials(
				discogsResponse.oauth_token,
				discogsResponse.oauth_token_secret
			)
			return jsonResponse(discogsResponse.oauth_token, headers, 200)
		} catch (error) {
			console.error('Discogs request token handler failed')
			const message = getPublicOAuthErrorMessage(
				error,
				'Could not start Discogs authorization. Please try again.'
			)
			return jsonResponse(
				{ error: message },
				headers,
				error instanceof PublicOAuthError ? 400 : 500
			)
		}
	}
}
