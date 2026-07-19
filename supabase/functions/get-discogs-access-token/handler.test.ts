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
	'access-token handler sends OAuth parameters in the header',
	async () => {
		let requestedUrl = ''
		let requestInit: RequestInit | undefined
		const handler = createDiscogsAccessTokenHandler(headers, {
			createCredentials: () => Promise.resolve(credentials()),
			fetcher: ((url: string | URL | Request, init?: RequestInit) => {
				requestedUrl = String(url)
				requestInit = init
				return Promise.resolve(
					new Response(
						'oauth_token=access-token&oauth_token_secret=access-secret'
					)
				)
			}) as typeof fetch,
			generateNonce: () => Promise.resolve('nonce'),
			getConfig: () => config,
			fetchIdentity: () => Promise.resolve()
		})

		const response = await handler(
			request({ oauth_token: 'request-token', oauth_verifier: 'verifier' })
		)
		const requestHeaders = new Headers(requestInit?.headers)
		const authorization = requestHeaders.get('Authorization') ?? ''
		const oauthKeys = [...authorization.matchAll(/(oauth_[a-z_]+)=/g)].map(
			([, key]) => key
		)

		assert.equal(response.status, 200)
		assert.equal(requestedUrl, 'https://api.discogs.com/oauth/access_token')
		assert.equal(requestedUrl.includes('oauth_'), false)
		assert.equal(requestedUrl.includes('verifier'), false)
		assert.equal(requestedUrl.includes('request-secret'), false)
		assert.equal(requestInit?.method, 'POST')
		assert.equal(requestHeaders.get('User-Agent'), config.userAgent)
		assert.equal(authorization.startsWith('OAuth '), true)
		assert.deepEqual(oauthKeys, [
			'oauth_consumer_key',
			'oauth_nonce',
			'oauth_signature',
			'oauth_signature_method',
			'oauth_timestamp',
			'oauth_token',
			'oauth_verifier'
		])
		assert.equal(authorization.includes('oauth_verifier="verifier"'), true)
		assert.equal(
			authorization.includes(
				'oauth_signature="consumer-secret-fixture%26request-secret"'
			),
			true
		)
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
