import { getDiscogsConfig } from './config.ts'
import type { DiscogsCredentialRepository } from './credentials.ts'
import { makeAuthenticatedRequest } from './makeAuthenticatedRequest.ts'
import { PublicOAuthError, buildDiscogsOAuthHttpError } from './oauthErrors.ts'

function isTrustedDiscogsResourceUrl(
	resourceUrl: unknown
): resourceUrl is string {
	if (typeof resourceUrl !== 'string' || resourceUrl.length === 0) {
		return false
	}

	try {
		const url = new URL(resourceUrl)
		return (
			url.protocol === 'https:' &&
			['api.discogs.com', 'www.discogs.com', 'discogs.com'].includes(
				url.hostname
			)
		)
	} catch {
		return false
	}
}

export async function fetchAndSetIdentity(
	credentials: DiscogsCredentialRepository,
	fetcher: typeof fetch = fetch
) {
	const config = getDiscogsConfig()
	const identityResponse = await makeAuthenticatedRequest(
		'https://api.discogs.com/oauth/identity',
		credentials,
		fetcher
	)
	if (!identityResponse.ok) {
		console.error('Discogs identity error response:', {
			status: identityResponse.status
		})
		throw buildDiscogsOAuthHttpError('identity', identityResponse.status)
	}
	const identity = await identityResponse.json()
	if (!identity.username) {
		throw new PublicOAuthError(
			'Discogs authorization succeeded, but profile details were incomplete. Please try again.'
		)
	}

	let discogs_avatar_url = null
	if (isTrustedDiscogsResourceUrl(identity.resource_url)) {
		try {
			const discogsUserResponse = await fetcher(identity.resource_url, {
				headers: { 'User-Agent': config.userAgent }
			})
			if (discogsUserResponse.ok) {
				const discogsUser = await discogsUserResponse.json()
				discogs_avatar_url = discogsUser.avatar_url
			}
		} catch {
			console.warn('Failed to fetch Discogs avatar URL')
		}
	} else if (identity.resource_url) {
		console.warn('Skipping unexpected Discogs resource URL host')
	}

	const { error } = await credentials.callerClient
		.from('profiles')
		.update({
			discogs_username: identity.username,
			discogs_avatar_url
		})
		.eq('id', credentials.user.id)
	if (error) throw error
}
