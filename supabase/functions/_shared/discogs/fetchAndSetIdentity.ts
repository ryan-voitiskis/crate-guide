import type { SupabaseClient } from '@supabase/supabase-js'
import { getUser, getUserProfile } from '../supabaseHelpers.ts'
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
	supabase: SupabaseClient,
	authHeader: string
) {
	const identityResponse = await makeAuthenticatedRequest(
		'GET',
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
			const discogsUserResponse = await fetch(identity.resource_url)
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
	const profile = await getUserProfile(supabase, user)
	const { error } = await supabase
		.from('profiles')
		.update({
			discogs_username: identity.username,
			discogs_avatar_url
		})
		.eq('id', profile.id)
	if (error) throw error
}
