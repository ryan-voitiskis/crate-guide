import type { SupabaseClient, User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import type { DiscogsCredentialRepository } from './credentials.ts'
import { makeAuthenticatedRequest } from './makeAuthenticatedRequest.ts'
import {
	DiscogsConnectionRequiredError,
	DiscogsUpstreamTimeoutError,
	DiscogsUpstreamTransportError
} from './requestErrors.ts'

const config = {
	consumerKey: 'fixture-consumer-key',
	consumerSecret: 'fixture-consumer-secret',
	userAgent: 'crate-guide-test/1.0'
}

function credentials(
	value: { access_token: string | null; access_secret: string | null } | null
): DiscogsCredentialRepository {
	return {
		callerClient: {} as SupabaseClient,
		user: { id: 'verified-user-id' } as User,
		getCredentials: () =>
			Promise.resolve(
				value
					? {
							request_token: null,
							request_secret: null,
							...value
						}
					: null
			),
		setRequestCredentials: () => Promise.resolve(),
		setAccessCredentials: () => Promise.resolve()
	}
}

Deno.test(
	'requires a complete Discogs connection before fetching',
	async () => {
		await assert.rejects(
			() =>
				makeAuthenticatedRequest(
					'https://api.discogs.com/releases/1',
					credentials(null),
					fetch,
					12_000,
					config
				),
			DiscogsConnectionRequiredError
		)
		await assert.rejects(
			() =>
				makeAuthenticatedRequest(
					'https://api.discogs.com/releases/1',
					credentials({ access_token: 'token', access_secret: null }),
					fetch,
					12_000,
					config
				),
			DiscogsConnectionRequiredError
		)
	}
)

Deno.test(
	'aborts a stalled upstream request at the timeout boundary',
	async () => {
		const fetcher = ((_url: string | URL | Request, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () =>
					reject(new DOMException('aborted', 'AbortError'))
				)
			})) as typeof fetch

		await assert.rejects(
			() =>
				makeAuthenticatedRequest(
					'https://api.discogs.com/releases/1',
					credentials({
						access_token: 'fixture-token',
						access_secret: 'fixture-secret'
					}),
					fetcher,
					1,
					config
				),
			DiscogsUpstreamTimeoutError
		)
	}
)

Deno.test(
	'wraps transport failures without preserving private error text',
	async () => {
		const privateMessage = 'socket details containing a signed request'
		const fetcher = (() =>
			Promise.reject(new Error(privateMessage))) as typeof fetch

		try {
			await makeAuthenticatedRequest(
				'https://api.discogs.com/releases/1',
				credentials({
					access_token: 'fixture-token',
					access_secret: 'fixture-secret'
				}),
				fetcher,
				12_000,
				config
			)
			assert.fail('Expected a transport failure')
		} catch (error) {
			assert.ok(error instanceof DiscogsUpstreamTransportError)
			assert.equal(error.message.includes(privateMessage), false)
		}
	}
)

Deno.test('signs a request and passes a timeout signal to fetch', async () => {
	let requestedUrl = ''
	let signal: AbortSignal | null | undefined
	const fetcher = ((url: string | URL | Request, init?: RequestInit) => {
		requestedUrl = String(url)
		signal = init?.signal
		return Promise.resolve(Response.json({ id: 1 }))
	}) as typeof fetch

	const response = await makeAuthenticatedRequest(
		'https://api.discogs.com/releases/1',
		credentials({
			access_token: 'fixture-token',
			access_secret: 'fixture-secret'
		}),
		fetcher,
		12_000,
		config
	)

	assert.equal(response.status, 200)
	assert.equal(
		requestedUrl.startsWith('https://api.discogs.com/releases/1?'),
		true
	)
	assert.equal(requestedUrl.includes('oauth_signature='), true)
	assert.ok(signal instanceof AbortSignal)
})
