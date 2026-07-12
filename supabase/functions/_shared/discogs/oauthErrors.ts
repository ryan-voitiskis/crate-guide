const defaultOAuthErrorMessage =
	'Failed to authenticate with Discogs. Please try again.'

export class PublicOAuthError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'PublicOAuthError'
	}
}

type DiscogsOAuthStep = 'request_token' | 'access_token' | 'identity'

export function buildDiscogsOAuthHttpError(
	step: DiscogsOAuthStep,
	status: number
): PublicOAuthError {
	if (status === 429) {
		return new PublicOAuthError(
			'Discogs rate-limited the OAuth request. Please wait a minute and try again.'
		)
	}
	if (status === 401 || status === 403) {
		if (step === 'request_token') {
			return new PublicOAuthError(
				'Discogs rejected the OAuth start request. Please try connecting again.'
			)
		}
		return new PublicOAuthError(
			'Discogs rejected the OAuth callback. Please restart the Discogs connection and try again.'
		)
	}
	if (status >= 500) {
		return new PublicOAuthError(
			'Discogs is temporarily unavailable. Please try again in a moment.'
		)
	}

	if (step === 'identity') {
		return new PublicOAuthError(
			'Discogs authorization succeeded, but profile details could not be retrieved. Please try again.'
		)
	}
	if (step === 'request_token') {
		return new PublicOAuthError(
			'Could not start Discogs authorization. Please try again.'
		)
	}
	return new PublicOAuthError(
		'Could not complete Discogs authorization. Please restart the Discogs connection and try again.'
	)
}

export function getPublicOAuthErrorMessage(
	error: unknown,
	fallbackMessage = defaultOAuthErrorMessage
): string {
	if (error instanceof PublicOAuthError) return error.message
	return fallbackMessage
}
