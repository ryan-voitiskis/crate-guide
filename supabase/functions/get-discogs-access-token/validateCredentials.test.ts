import assert from 'node:assert/strict'
import type { DiscogsCredentialsRow } from '../_shared/discogs/credentials.ts'
import { PublicOAuthError } from '../_shared/discogs/oauthErrors.ts'
import { validateDiscogsCallbackCredentials } from './validateCredentials.ts'

const mismatchMessage =
	'Discogs callback does not match the pending request. Please restart the Discogs connection.'
const missingStateMessage =
	'Discogs request state is missing. Please restart the Discogs connection and try again.'

const credentials: DiscogsCredentialsRow = {
	request_token: 'request-token',
	request_secret: 'request-secret',
	access_token: null,
	access_secret: null
}

function assertPublicOAuthError(
	action: () => unknown,
	expectedMessage: string
): void {
	let thrown: unknown
	try {
		action()
	} catch (error) {
		thrown = error
	}

	assert.ok(thrown instanceof PublicOAuthError)
	assert.equal(thrown.message, expectedMessage)
}

Deno.test(
	'returns the request secret for matching callback credentials',
	() => {
		const requestSecret = validateDiscogsCallbackCredentials(
			credentials,
			'request-token'
		)

		assert.equal(requestSecret, 'request-secret')
	}
)

Deno.test(
	'rejects a missing credential row with the public mismatch error',
	() => {
		assertPublicOAuthError(
			() => validateDiscogsCallbackCredentials(null, 'request-token'),
			mismatchMessage
		)
	}
)

Deno.test(
	'rejects a mismatched callback token with the public mismatch error',
	() => {
		assertPublicOAuthError(
			() =>
				validateDiscogsCallbackCredentials(
					credentials,
					'different-request-token'
				),
			mismatchMessage
		)
	}
)

Deno.test(
	'rejects a missing request secret with the public state error',
	() => {
		assertPublicOAuthError(
			() =>
				validateDiscogsCallbackCredentials(
					{ ...credentials, request_secret: null },
					'request-token'
				),
			missingStateMessage
		)
	}
)
