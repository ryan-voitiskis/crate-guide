import assert from 'node:assert/strict'
import { generateOAuthSignature } from './oauthSignature.ts'

Deno.test(
	'generates the corrected RFC 5849 HMAC-SHA1 signature example',
	async () => {
		const signature = await generateOAuthSignature(
			'POST',
			'http://example.com/request',
			[
				['b5', '=%3D'],
				['a3', 'a'],
				['c@', ''],
				['a2', 'r b'],
				['c2', ''],
				['a3', '2 q'],
				['oauth_consumer_key', '9djdj82h48djs9d2'],
				['oauth_token', 'kkk9d7dh3k39sjv7'],
				['oauth_signature_method', 'HMAC-SHA1'],
				['oauth_timestamp', '137131201'],
				['oauth_nonce', '7d8f3e4a']
			],
			'j49sk3j29djd',
			'dh893hdasih9'
		)

		assert.equal(signature, 'r6/TJjbCOr97/+UU0NsvSne7s5g=')
	}
)
