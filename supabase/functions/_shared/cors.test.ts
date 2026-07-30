import assert from 'node:assert/strict'
import { createAuthenticatedDiscogsRequestHandler } from '../authenticated-discogs-request/handler.ts'
import { createCleanupRecordCoversHandler } from '../cleanup-record-covers/handler.ts'
import { createDeleteAccountHandler } from '../delete-account/handler.ts'
import { createDiscogsAccessTokenHandler } from '../get-discogs-access-token/handler.ts'
import { createDiscogsRequestTokenHandler } from '../get-discogs-request-token/handler.ts'
import { createCorsHeaders } from './siteUrl.ts'

Deno.test('CORS headers serialize SITE_URL as an origin', () => {
	assert.deepEqual(createCorsHeaders('https://crate.guide/'), {
		'Access-Control-Allow-Origin': 'https://crate.guide',
		'Access-Control-Allow-Headers':
			'authorization, x-client-info, apikey, content-type'
	})
})

const browserEntrypoints = [
	['authenticated-discogs-request', createAuthenticatedDiscogsRequestHandler],
	['cleanup-record-covers', createCleanupRecordCoversHandler],
	['delete-account', createDeleteAccountHandler],
	['get-discogs-access-token', createDiscogsAccessTokenHandler],
	['get-discogs-request-token', createDiscogsRequestTokenHandler]
] as const

for (const [name, createHandler] of browserEntrypoints) {
	Deno.test(
		`${name} returns the normalized origin on browser responses`,
		async () => {
			const handler = createHandler({
				...createCorsHeaders('https://crate.guide/'),
				'Content-Type': 'application/json'
			})

			for (const method of ['OPTIONS', 'GET']) {
				const response = await handler(
					new Request('https://functions.test', { method })
				)
				assert.equal(
					response.headers.get('Access-Control-Allow-Origin'),
					'https://crate.guide'
				)
			}
		}
	)
}
