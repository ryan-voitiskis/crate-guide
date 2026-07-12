import { PublicOAuthError } from '../_shared/discogs/oauthErrors.ts'

export interface DiscogsCredentialsRow {
	request_token: string | null
	request_secret: string | null
	access_token: string | null
	access_secret: string | null
}

export function validateDiscogsCallbackCredentials(
	creds: DiscogsCredentialsRow | null,
	callbackToken: string
): string {
	if (creds?.request_token !== callbackToken) {
		throw new PublicOAuthError(
			'Discogs callback does not match the pending request. Please restart the Discogs connection.'
		)
	}
	if (!creds.request_secret) {
		throw new PublicOAuthError(
			'Discogs request state is missing. Please restart the Discogs connection and try again.'
		)
	}

	return creds.request_secret
}
