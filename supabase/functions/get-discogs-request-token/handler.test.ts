import type { SupabaseClient, User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import type { DiscogsCredentialRepository } from '../_shared/discogs/credentials.ts'
import { createDiscogsRequestTokenHandler } from './handler.ts'

const headers = { 'Content-Type': 'application/json' }
const config = {
	consumerKey: 'consumer-key-fixture',
	consumerSecret: 'consumer-secret-fixture',
	userAgent: 'crate-guide-test'
}

function credentials(
	setRequestCredentials = (_token: string, _secret: string) =>
		Promise.resolve(),
	consumeRequestQuota = () =>
		Promise.resolve({ allowed: true, retryAfterMs: 0 })
): DiscogsCredentialRepository {
	return {
		callerClient: {} as SupabaseClient,
		user: { id: 'verified-user-id' } as User,
		getCredentials: () => Promise.resolve(null),
		setRequestCredentials,
		setAccessCredentials: () => Promise.resolve(),
		consumeRequestQuota
	}
}

function authorizedRequest(): Request {
	return new Request('http://localhost', {
		headers: { Authorization: 'Bearer valid' }
	})
}

Deno.test('request-token handler rejects missing authorization', async () => {
	const handler = createDiscogsRequestTokenHandler(headers, {
		createCredentials: () => Promise.resolve(credentials()),
		fetcher: fetch,
		generateNonce: () => Promise.resolve('nonce'),
		getConfig: () => config,
		getCallback: () => 'http://localhost/callback'
	})
	assert.equal((await handler(new Request('http://localhost'))).status, 401)
})

Deno.test('request-token handler stores a complete response', async () => {
	let stored: string[] = []
	const handler = createDiscogsRequestTokenHandler(headers, {
		createCredentials: () =>
			Promise.resolve(
				credentials((token, secret) => {
					stored = [token, secret]
					return Promise.resolve()
				})
			),
		fetcher: (() =>
			Promise.resolve(
				new Response(
					'oauth_token=fixture-token&oauth_token_secret=fixture-secret'
				)
			)) as typeof fetch,
		generateNonce: () => Promise.resolve('nonce'),
		getConfig: () => config,
		getCallback: () => 'http://localhost/callback'
	})
	const response = await handler(authorizedRequest())
	assert.equal(response.status, 200)
	assert.deepEqual(stored, ['fixture-token', 'fixture-secret'])
})

Deno.test('request-token handler checks quota before fetching', async () => {
	const steps: string[] = []
	const handler = createDiscogsRequestTokenHandler(headers, {
		createCredentials: () =>
			Promise.resolve(
				credentials(undefined, () => {
					steps.push('quota')
					return Promise.resolve({ allowed: true, retryAfterMs: 0 })
				})
			),
		fetcher: (() => {
			steps.push('upstream')
			return Promise.resolve(
				new Response(
					'oauth_token=fixture-token&oauth_token_secret=fixture-secret'
				)
			)
		}) as typeof fetch,
		generateNonce: () => Promise.resolve('nonce'),
		getConfig: () => config,
		getCallback: () => 'http://localhost/callback'
	})

	assert.equal((await handler(authorizedRequest())).status, 200)
	assert.deepEqual(steps, ['quota', 'upstream'])
})

Deno.test(
	'request-token handler denies quota without upstream contact',
	async () => {
		let fetchCalled = false
		const logs: unknown[][] = []
		const originalConsoleError = console.error
		console.error = (...values: unknown[]) => logs.push(values)
		try {
			const handler = createDiscogsRequestTokenHandler(headers, {
				createCredentials: () =>
					Promise.resolve(
						credentials(undefined, () =>
							Promise.resolve({ allowed: false, retryAfterMs: 9000 })
						)
					),
				fetcher: (() => {
					fetchCalled = true
					return Promise.resolve(new Response('private provider response'))
				}) as typeof fetch,
				generateNonce: () => Promise.resolve('nonce'),
				getConfig: () => config,
				getCallback: () => 'http://localhost/callback'
			})
			const response = await handler(authorizedRequest())
			const body = await response.json()

			assert.equal(response.status, 429)
			assert.equal(response.headers.get('Retry-After'), '9')
			assert.deepEqual(body, {
				error: 'Discogs is receiving too many requests. Retrying shortly.',
				code: 'discogs_rate_limited',
				retryable: true,
				retry_after_ms: 9000
			})
			assert.equal(fetchCalled, false)
			assert.deepEqual(logs, [])
		} finally {
			console.error = originalConsoleError
		}
	}
)

Deno.test('request-token handler sanitizes quota failures', async () => {
	const privateMessage = 'private quota database failure'
	let fetchCalled = false
	const logs: unknown[][] = []
	const originalConsoleError = console.error
	console.error = (...values: unknown[]) => logs.push(values)
	try {
		const handler = createDiscogsRequestTokenHandler(headers, {
			createCredentials: () =>
				Promise.resolve(
					credentials(undefined, () =>
						Promise.reject(new Error(privateMessage))
					)
				),
			fetcher: (() => {
				fetchCalled = true
				return Promise.resolve(new Response('{}'))
			}) as typeof fetch,
			generateNonce: () => Promise.resolve('nonce'),
			getConfig: () => config,
			getCallback: () => 'http://localhost/callback'
		})
		const response = await handler(authorizedRequest())
		const responseText = await response.text()

		assert.equal(response.status, 500)
		assert.equal(fetchCalled, false)
		assert.equal(responseText.includes(privateMessage), false)
		assert.equal(JSON.stringify(logs).includes(privateMessage), false)
	} finally {
		console.error = originalConsoleError
	}
})

Deno.test(
	'request-token handler sends OAuth parameters in the header',
	async () => {
		let requestedUrl = ''
		let requestInit: RequestInit | undefined
		const handler = createDiscogsRequestTokenHandler(headers, {
			createCredentials: () => Promise.resolve(credentials()),
			fetcher: ((url: string | URL | Request, init?: RequestInit) => {
				requestedUrl = String(url)
				requestInit = init
				return Promise.resolve(
					new Response(
						'oauth_token=fixture-token&oauth_token_secret=fixture-secret'
					)
				)
			}) as typeof fetch,
			generateNonce: () => Promise.resolve('nonce'),
			getConfig: () => config,
			getCallback: () => 'http://localhost/callback'
		})

		const response = await handler(authorizedRequest())
		const requestHeaders = new Headers(requestInit?.headers)
		const authorization = requestHeaders.get('Authorization') ?? ''

		assert.equal(response.status, 200)
		assert.equal(requestedUrl, 'https://api.discogs.com/oauth/request_token')
		assert.equal(requestedUrl.includes('oauth_'), false)
		assert.equal(requestedUrl.includes(config.consumerSecret), false)
		assert.equal(requestInit?.method, 'GET')
		assert.equal(requestHeaders.get('User-Agent'), config.userAgent)
		assert.equal(authorization.startsWith('OAuth '), true)
		assert.equal(
			authorization.includes(
				'oauth_callback="http%3A%2F%2Flocalhost%2Fcallback"'
			),
			true
		)
		assert.equal(
			authorization.includes('oauth_signature="consumer-secret-fixture%26"'),
			true
		)
	}
)

Deno.test(
	'request-token handler does not expose or log upstream bodies',
	async () => {
		const rawBody = 'private upstream body'
		const logs: unknown[][] = []
		const originalConsoleError = console.error
		console.error = (...values: unknown[]) => logs.push(values)
		try {
			const handler = createDiscogsRequestTokenHandler(headers, {
				createCredentials: () => Promise.resolve(credentials()),
				fetcher: (() =>
					Promise.resolve(
						new Response(rawBody, { status: 500 })
					)) as typeof fetch,
				generateNonce: () => Promise.resolve('nonce'),
				getConfig: () => config,
				getCallback: () => 'http://localhost/callback'
			})
			const response = await handler(authorizedRequest())
			assert.equal((await response.text()).includes(rawBody), false)
			assert.equal(JSON.stringify(logs).includes(rawBody), false)
		} finally {
			console.error = originalConsoleError
		}
	}
)
