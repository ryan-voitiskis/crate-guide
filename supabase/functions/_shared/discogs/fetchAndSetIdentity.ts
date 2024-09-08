import { getAuthedSupabaseClient } from '../supabaseHelpers.ts'
import { getUserProfile } from '../supabaseHelpers.ts'
import { makeAuthenticatedRequest } from './makeAuthenticatedRequest.ts'

export async function fetchAndSetIdentity(authHeader: string) {
	const identityResponse = await makeAuthenticatedRequest(
		'GET',
		'https://api.discogs.com/oauth/identity',
		authHeader
	)
	const identity = await identityResponse.json()
	if (!identity.username) throw new Error('Missing Discogs username.')

	let discogs_avatar_url = null
	if (identity.resource_url) {
		const discogsUserResponse = await fetch(identity.resource_url)
		const discogsUser = await discogsUserResponse.json()
		discogs_avatar_url = discogsUser.avatar_url
	}

	const supabase = getAuthedSupabaseClient(authHeader)
	const profile = await getUserProfile(authHeader)
	const { error } = await supabase
		.from('profiles')
		.update({
			discogs_username: identity.username,
			discogs_avatar_url
		})
		.eq('id', profile.id)
	if (error) throw error
}
