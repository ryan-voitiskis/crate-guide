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
	setRequestCredentials = (_token: string, _secret: string) => Promise.resolve()
): DiscogsCredentialRepository {
	return {
		callerClient: {} as SupabaseClient,
		user: { id: 'verified-user-id' } as User,
		getCredentials: () => Promise.resolve(null),
		setRequestCredentials,
		setAccessCredentials: () => Promise.resolve()
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
