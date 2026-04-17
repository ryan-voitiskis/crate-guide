import type { SupabaseClient } from '@supabase/supabase-js'
import { getUser } from '../supabaseHelpers.ts'
import { makeAuthenticatedRequest } from './makeAuthenticatedRequest.ts'
import { PublicOAuthError, buildDiscogsOAuthHttpError } from './oauthErrors.ts'

const userAgent = Deno.env.get('DISCOGS_USER_AGENT') || ''

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
	supabase: SupabaseClient,
	authHeader: string
) {
	const identityResponse = await makeAuthenticatedRequest(
		'https://api.discogs.com/oauth/identity',
		authHeader
	)
	if (!identityResponse.ok) {
		const responseText = await identityResponse.text()
		console.error('Discogs identity error response:', {
			status: identityResponse.status,
			body: responseText
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
			const discogsUserResponse = await fetch(identity.resource_url, {
				headers: { 'User-Agent': userAgent }
			})
			if (discogsUserResponse.ok) {
				const discogsUser = await discogsUserResponse.json()
				discogs_avatar_url = discogsUser.avatar_url
			}
		} catch (e) {
			console.warn('Failed to fetch Discogs avatar URL:', e)
		}
	} else if (identity.resource_url) {
		console.warn('Skipping unexpected Discogs resource URL host')
	}

	const user = await getUser(supabase)
	const { error } = await supabase
		.from('profiles')
		.update({
			discogs_username: identity.username,
			discogs_avatar_url
		})
		.eq('id', user.id)
	if (error) throw error
}
