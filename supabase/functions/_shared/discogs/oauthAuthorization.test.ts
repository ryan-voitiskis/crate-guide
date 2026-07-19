import assert from 'node:assert/strict'
import {
	buildOAuthAuthorizationHeader,
	encodeOAuthComponent
} from './oauthAuthorization.ts'

Deno.test('encodes OAuth components with RFC 5849 escaping', () => {
	assert.equal(
		encodeOAuthComponent("reserved !'()*~"),
		'reserved%20%21%27%28%29%2A~'
	)
	assert.equal(encodeOAuthComponent('signature+/='), 'signature%2B%2F%3D')
})

Deno.test('builds a sorted OAuth Authorization header', () => {
	assert.equal(
		buildOAuthAuthorizationHeader({
			oauth_token: 'token',
			oauth_consumer_key: 'consumer',
			oauth_signature: 'signature+/='
		}),
		'OAuth oauth_consumer_key="consumer", oauth_signature="signature%2B%2F%3D", oauth_token="token"'
	)
})

Deno.test('rejects empty and non-OAuth parameter keys', () => {
	assert.throws(
		() => buildOAuthAuthorizationHeader({ '': 'value' }),
		/OAuth Authorization parameters/
	)
	assert.throws(
		() => buildOAuthAuthorizationHeader({ consumer_key: 'value' }),
		/OAuth Authorization parameters/
	)
})
