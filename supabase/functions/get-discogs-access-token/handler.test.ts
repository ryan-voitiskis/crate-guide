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
	setAccessCredentials = (_token: string, _secret: string) => Promise.resolve(),
	consumeRequestQuota = () =>
		Promise.resolve({ allowed: true, retryAfterMs: 0 }),
	storedCredentials = {
		request_token: 'request-token',
		request_secret: 'request-secret',
		access_token: null as string | null,
		access_secret: null as string | null
	},
	clearRequestCredentials = () => Promise.resolve()
): DiscogsCredentialRepository {
	return {
		callerClient: {} as SupabaseClient,
		user: { id: 'verified-user-id' } as User,
		getCredentials: () => Promise.resolve(storedCredentials),
		setRequestCredentials: () => Promise.resolve(),
		setAccessCredentials,
		clearRequestCredentials,
		consumeRequestQuota
	}
}

Deno.test(
	'access-token handler resumes identity without another verifier exchange',
	async () => {
		const storedCredentials = {
			request_token: 'request-token',
			request_secret: 'request-secret',
			access_token: null as string | null,
			access_secret: null as string | null
		}
		let exchangeCalls = 0
		let identityCalls = 0
		const repository = credentials(
			(token, secret) => {
				storedCredentials.access_token = token
				storedCredentials.access_secret = secret
				return Promise.resolve()
			},
			undefined,
			storedCredentials
		)
		const handler = createDiscogsAccessTokenHandler(headers, {
			createCredentials: () => Promise.resolve(repository),
			fetcher: (() => {
				exchangeCalls += 1
				return Promise.resolve(
					new Response(
						'oauth_token=access-token&oauth_token_secret=access-secret'
					)
				)
			}) as typeof fetch,
			generateNonce: () => Promise.resolve('nonce'),
			getConfig: () => config,
			fetchIdentity: () => {
				identityCalls += 1
				return identityCalls === 1
					? Promise.reject(new Error('private identity failure'))
					: Promise.resolve()
			}
		})

		const firstResponse = await handler(
			request({ oauth_token: 'request-token', oauth_verifier: 'verifier' })
		)
		assert.equal(firstResponse.status, 503)
		assert.deepEqual(await firstResponse.json(), {
			error:
				'Discogs access is saved, but profile setup is incomplete. Retry profile setup to finish connecting.',
			code: 'discogs_identity_pending',
			retryable: true
		})

		const resumedResponse = await handler(request({ resume: true }))
		assert.equal(resumedResponse.status, 200)
		assert.equal(exchangeCalls, 1)
		assert.equal(identityCalls, 2)
	}
)

Deno.test(
	'access-token handler rejects resumption without access credentials',
	async () => {
		let identityCalled = false
		const handler = createDiscogsAccessTokenHandler(headers, {
			createCredentials: () => Promise.resolve(credentials()),
			fetcher: fetch,
			generateNonce: () => Promise.resolve('nonce'),
			getConfig: () => config,
			fetchIdentity: () => {
				identityCalled = true
				return Promise.resolve()
			}
		})

		const response = await handler(request({ resume: true }))
		assert.equal(response.status, 400)
		assert.equal(identityCalled, false)
	}
)

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

Deno.test('access-token handler checks quota before fetching', async () => {
	const steps: string[] = []
	const handler = createDiscogsAccessTokenHandler(headers, {
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
					'oauth_token=access-token&oauth_token_secret=access-secret'
				)
			)
		}) as typeof fetch,
		generateNonce: () => Promise.resolve('nonce'),
		getConfig: () => config,
		fetchIdentity: () => Promise.resolve()
	})

	assert.equal(
		(
			await handler(
				request({ oauth_token: 'request-token', oauth_verifier: 'verifier' })
			)
		).status,
		200
	)
	assert.deepEqual(steps, ['quota', 'upstream'])
})

Deno.test(
	'access-token handler rejects callback mismatch before quota',
	async () => {
		let quotaCalls = 0
		let fetchCalled = false
		const handler = createDiscogsAccessTokenHandler(headers, {
			createCredentials: () =>
				Promise.resolve(
					credentials(undefined, () => {
						quotaCalls += 1
						return Promise.resolve({ allowed: true, retryAfterMs: 0 })
					})
				),
			fetcher: (() => {
				fetchCalled = true
				return Promise.resolve(new Response('{}'))
			}) as typeof fetch,
			generateNonce: () => Promise.resolve('nonce'),
			getConfig: () => config,
			fetchIdentity: () => Promise.resolve()
		})

		const response = await handler(
			request({ oauth_token: 'wrong-token', oauth_verifier: 'verifier' })
		)
		assert.equal(response.status, 400)
		assert.equal(quotaCalls, 0)
		assert.equal(fetchCalled, false)
	}
)

Deno.test(
	'access-token handler denies quota without upstream contact',
	async () => {
		let fetchCalled = false
		let identityCalled = false
		const logs: unknown[][] = []
		const originalConsoleError = console.error
		console.error = (...values: unknown[]) => logs.push(values)
		try {
			const handler = createDiscogsAccessTokenHandler(headers, {
				createCredentials: () =>
					Promise.resolve(
						credentials(undefined, () =>
							Promise.resolve({ allowed: false, retryAfterMs: 11_000 })
						)
					),
				fetcher: (() => {
					fetchCalled = true
					return Promise.resolve(new Response('private provider response'))
				}) as typeof fetch,
				generateNonce: () => Promise.resolve('nonce'),
				getConfig: () => config,
				fetchIdentity: () => {
					identityCalled = true
					return Promise.resolve()
				}
			})
			const response = await handler(
				request({ oauth_token: 'request-token', oauth_verifier: 'verifier' })
			)
			const body = await response.json()

			assert.equal(response.status, 429)
			assert.equal(response.headers.get('Retry-After'), '11')
			assert.deepEqual(body, {
				error: 'Discogs is receiving too many requests. Retrying shortly.',
				code: 'discogs_rate_limited',
				retryable: true,
				retry_after_ms: 11_000
			})
			assert.equal(fetchCalled, false)
			assert.equal(identityCalled, false)
			assert.deepEqual(logs, [])
		} finally {
			console.error = originalConsoleError
		}
	}
)

Deno.test('access-token handler sanitizes quota failures', async () => {
	const privateMessage = 'private quota database failure'
	let fetchCalled = false
	const logs: unknown[][] = []
	const originalConsoleError = console.error
	console.error = (...values: unknown[]) => logs.push(values)
	try {
		const handler = createDiscogsAccessTokenHandler(headers, {
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
			fetchIdentity: () => Promise.resolve()
		})
		const response = await handler(
			request({ oauth_token: 'request-token', oauth_verifier: 'verifier' })
		)
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
