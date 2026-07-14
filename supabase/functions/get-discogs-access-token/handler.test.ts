import type { SupabaseClient, User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import type { DiscogsCredentialRepository } from '../_shared/discogs/credentials.ts'
import { createDiscogsAccessTokenHandler } from './handler.ts'

const headers = { 'Content-Type': 'application/json' }
const config = {
	consumerKey: 'consumer-key-fixture',
	consumerSecret: 'consumer-secret-fixture',
	userAgent: 'crate-guide-test'
}

function credentials(
	setAccessCredentials = (_token: string, _secret: string) => Promise.resolve()
): DiscogsCredentialRepository {
	return {
		callerClient: {} as SupabaseClient,
		user: { id: 'verified-user-id' } as User,
		getCredentials: () =>
			Promise.resolve({
				request_token: 'request-token',
				request_secret: 'request-secret',
				access_token: null,
				access_secret: null
			}),
		setRequestCredentials: () => Promise.resolve(),
		setAccessCredentials
	}
}

function request(body: unknown): Request {
	return new Request('http://localhost', {
		method: 'POST',
		headers: { Authorization: 'Bearer valid' },
		body: JSON.stringify(body)
	})
}

Deno.test('access-token handler validates callback parameters', async () => {
	const handler = createDiscogsAccessTokenHandler(headers, {
		createCredentials: () => Promise.resolve(credentials()),
		fetcher: fetch,
		generateNonce: () => Promise.resolve('nonce'),
		getConfig: () => config,
		fetchIdentity: () => Promise.resolve()
	})
	const response = await handler(request({ oauth_token: 'request-token' }))
	assert.equal(response.status, 400)
})

Deno.test(
	'access-token handler stores credentials before fetching identity',
	async () => {
		const steps: string[] = []
		const handler = createDiscogsAccessTokenHandler(headers, {
			createCredentials: () =>
				Promise.resolve(
					credentials(() => {
						steps.push('stored')
						return Promise.resolve()
					})
				),
			fetcher: (() =>
				Promise.resolve(
					new Response(
						'oauth_token=access-token&oauth_token_secret=access-secret'
					)
				)) as typeof fetch,
			generateNonce: () => Promise.resolve('nonce'),
			getConfig: () => config,
			fetchIdentity: () => {
				steps.push('identity')
				return Promise.resolve()
			}
		})
		const response = await handler(
			request({ oauth_token: 'request-token', oauth_verifier: 'verifier' })
		)
		assert.equal(response.status, 200)
		assert.deepEqual(steps, ['stored', 'identity'])
	}
)

Deno.test(
	'access-token handler does not expose unknown exception messages',
	async () => {
		const privateMessage = 'private credential failure'
		const logs: unknown[][] = []
		const originalConsoleError = console.error
		console.error = (...values: unknown[]) => logs.push(values)
		try {
			const handler = createDiscogsAccessTokenHandler(headers, {
				createCredentials: () => Promise.reject(new Error(privateMessage)),
				fetcher: fetch,
				generateNonce: () => Promise.resolve('nonce'),
				getConfig: () => config,
				fetchIdentity: () => Promise.resolve()
			})
			const response = await handler(
				request({ oauth_token: 'request-token', oauth_verifier: 'verifier' })
			)
			assert.equal((await response.text()).includes(privateMessage), false)
			assert.equal(JSON.stringify(logs).includes(privateMessage), false)
		} finally {
			console.error = originalConsoleError
		}
	}
)
