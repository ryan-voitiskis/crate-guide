import type { SupabaseClient, User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import type { DiscogsCredentialRepository } from '../_shared/discogs/credentials.ts'
import {
	DiscogsConnectionRequiredError,
	DiscogsUpstreamTimeoutError,
	DiscogsUpstreamTransportError
} from '../_shared/discogs/requestErrors.ts'
import { createAuthenticatedDiscogsRequestHandler } from './handler.ts'

const headers = { 'Content-Type': 'application/json' }
const requestId = '00000000-0000-4000-8000-000000000001'

function createCredentials(): DiscogsCredentialRepository {
	const callerClient = {
		from: () => ({
			select: () => ({
				eq: () =>
					Promise.resolve({
						data: [{ discogs_username: 'test user' }],
						error: null
					})
			})
		})
	} as unknown as SupabaseClient
	return {
		callerClient,
		user: { id: 'verified-user-id' } as User,
		getCredentials: () => Promise.resolve(null),
		setRequestCredentials: () => Promise.resolve(),
		setAccessCredentials: () => Promise.resolve()
	}
}

function request(body?: unknown): Request {
	const requestBody =
		body && typeof body === 'object'
			? {
					...body,
					request_context: { request_id: requestId, attempt: 2 }
				}
			: body
	return new Request('http://localhost', {
		method: 'POST',
		headers: { Authorization: 'Bearer valid' },
		body: requestBody === undefined ? undefined : JSON.stringify(requestBody)
	})
}

async function assertErrorEnvelope(
	response: Response,
	expected: {
		code: string
		retryable: boolean
		message?: string
		requestId?: string
	}
) {
	const body = await response.json()
	assert.equal(body.code, expected.code)
	assert.equal(body.retryable, expected.retryable)
	assert.equal(typeof body.request_id, 'string')
	if (expected.message !== undefined) {
		assert.equal(body.error, expected.message)
	}
	if (expected.requestId !== undefined) {
		assert.equal(body.request_id, expected.requestId)
	}
	return body
}

Deno.test('rejects a missing authorization header', async () => {
	const handler = createAuthenticatedDiscogsRequestHandler(headers, {
		createCredentials: () => Promise.resolve(createCredentials()),
		makeRequest: () => Promise.resolve(new Response('{}'))
	})
	const response = await handler(new Request('http://localhost'))
	assert.equal(response.status, 401)
})

Deno.test('rejects invalid dispatch bodies', async () => {
	const handler = createAuthenticatedDiscogsRequestHandler(headers, {
		createCredentials: () => Promise.resolve(createCredentials()),
		makeRequest: () => Promise.resolve(new Response('{}'))
	})
	const response = await handler(request({ endpoint: 'write_release' }))
	assert.equal(response.status, 400)
	await assertErrorEnvelope(response, {
		code: 'invalid_request',
		retryable: false,
		message: 'Unknown endpoint.'
	})
})

Deno.test(
	'accepts folder id zero and applies pagination defaults',
	async () => {
		let requestedUrl = ''
		const handler = createAuthenticatedDiscogsRequestHandler(headers, {
			createCredentials: () => Promise.resolve(createCredentials()),
			makeRequest: (url) => {
				requestedUrl = url
				return Promise.resolve(Response.json({ releases: [] }))
			}
		})
		const response = await handler(
			request({ endpoint: 'folder_releases', folder_id: 0 })
		)
		assert.equal(response.status, 200)
		assert.equal(
			requestedUrl,
			'https://api.discogs.com/users/test%20user/collection/folders/0/releases?page=1&per_page=100'
		)
	}
)

Deno.test('rejects invalid page and per-page values', async () => {
	const handler = createAuthenticatedDiscogsRequestHandler(headers, {
		createCredentials: () => Promise.resolve(createCredentials()),
		makeRequest: () => Promise.resolve(new Response('{}'))
	})
	for (const [body, message] of [
		[
			{ endpoint: 'folder_releases', folder_id: 0, page: 0 },
			'page must be a positive integer.'
		],
		[
			{ endpoint: 'folder_releases', folder_id: 0, per_page: 501 },
			'per_page must be between 1 and 500.'
		]
	] as const) {
		const response = await handler(request(body))
		assert.equal(response.status, 400)
		await assertErrorEnvelope(response, {
			code: 'invalid_request',
			retryable: false,
			message,
			requestId
		})
	}
})

Deno.test(
	'classifies rate limits and bounds Retry-After metadata',
	async () => {
		const handler = createAuthenticatedDiscogsRequestHandler(headers, {
			createCredentials: () => Promise.resolve(createCredentials()),
			makeRequest: () =>
				Promise.resolve(
					new Response('slow down', {
						status: 429,
						headers: { 'Retry-After': '999' }
					})
				)
		})
		const response = await handler(
			request({ endpoint: 'release', release_id: 42 })
		)

		assert.equal(response.status, 429)
		assert.equal(response.headers.get('Retry-After'), '120')
		assert.equal(response.headers.get('X-Request-ID'), requestId)
		const body = await assertErrorEnvelope(response, {
			code: 'discogs_rate_limited',
			retryable: true,
			requestId
		})
		assert.equal(body.retry_after_ms, 120_000)
	}
)

Deno.test(
	'classifies retryable and nonretryable upstream statuses',
	async () => {
		for (const [status, code, retryable] of [
			[401, 'discogs_connection_required', false],
			[403, 'discogs_request_rejected', false],
			[404, 'discogs_not_found', false],
			[503, 'discogs_unavailable', true]
		] as const) {
			const handler = createAuthenticatedDiscogsRequestHandler(headers, {
				createCredentials: () => Promise.resolve(createCredentials()),
				makeRequest: () =>
					Promise.resolve(new Response('private body', { status }))
			})
			const response = await handler(
				request({ endpoint: 'release', release_id: 42 })
			)
			assert.equal(response.status, status)
			await assertErrorEnvelope(response, { code, retryable, requestId })
		}
	}
)

Deno.test('maps typed connection and transport failures safely', async () => {
	for (const [error, status, code, retryable] of [
		[
			new DiscogsConnectionRequiredError(),
			401,
			'discogs_connection_required',
			false
		],
		[new DiscogsUpstreamTimeoutError(), 504, 'discogs_timeout', true],
		[new DiscogsUpstreamTransportError(), 502, 'discogs_transport', true]
	] as const) {
		const handler = createAuthenticatedDiscogsRequestHandler(headers, {
			createCredentials: () => Promise.resolve(createCredentials()),
			makeRequest: () => Promise.reject(error)
		})
		const response = await handler(
			request({ endpoint: 'release', release_id: 42 })
		)
		assert.equal(response.status, status)
		await assertErrorEnvelope(response, { code, retryable, requestId })
	}
})

Deno.test(
	'rejects invalid successful upstream JSON without exposing it',
	async () => {
		const handler = createAuthenticatedDiscogsRequestHandler(headers, {
			createCredentials: () => Promise.resolve(createCredentials()),
			makeRequest: () => Promise.resolve(new Response('not-json'))
		})
		const response = await handler(
			request({ endpoint: 'release', release_id: 42 })
		)

		assert.equal(response.status, 502)
		const text = await response.clone().text()
		assert.equal(text.includes('not-json'), false)
		await assertErrorEnvelope(response, {
			code: 'invalid_upstream_response',
			retryable: false,
			requestId
		})
	}
)

Deno.test('does not expose an upstream response body', async () => {
	const rawBody = 'upstream-private-body'
	const logs: unknown[][] = []
	const originalConsoleError = console.error
	console.error = (...values: unknown[]) => logs.push(values)
	try {
		const handler = createAuthenticatedDiscogsRequestHandler(headers, {
			createCredentials: () => Promise.resolve(createCredentials()),
			makeRequest: () => Promise.resolve(new Response(rawBody, { status: 403 }))
		})
		const response = await handler(
			request({ endpoint: 'release', release_id: 1 })
		)
		assert.equal(response.status, 403)
		assert.equal((await response.text()).includes(rawBody), false)
		assert.equal(JSON.stringify(logs).includes(rawBody), false)
		assert.equal(JSON.stringify(logs).includes('Bearer valid'), false)
	} finally {
		console.error = originalConsoleError
	}
})

Deno.test('does not expose unknown exception messages', async () => {
	const privateMessage = 'private database failure'
	const logs: unknown[][] = []
	const originalConsoleError = console.error
	console.error = (...values: unknown[]) => logs.push(values)
	try {
		const handler = createAuthenticatedDiscogsRequestHandler(headers, {
			createCredentials: () => Promise.reject(new Error(privateMessage)),
			makeRequest: () => Promise.resolve(new Response('{}'))
		})
		const response = await handler(
			request({ endpoint: 'release', release_id: 1 })
		)
		assert.equal(response.status, 500)
		assert.equal((await response.text()).includes(privateMessage), false)
		assert.equal(JSON.stringify(logs).includes(privateMessage), false)
		assert.equal(JSON.stringify(logs).includes(requestId), true)
	} finally {
		console.error = originalConsoleError
	}
})

Deno.test('returns successful Discogs JSON', async () => {
	const payload = { folders: [] }
	const handler = createAuthenticatedDiscogsRequestHandler(headers, {
		createCredentials: () => Promise.resolve(createCredentials()),
		makeRequest: () => Promise.resolve(Response.json(payload))
	})
	const response = await handler(request({ endpoint: 'folders' }))
	assert.equal(response.status, 200)
	assert.deepEqual(await response.json(), payload)
	assert.equal(response.headers.get('X-Request-ID'), requestId)
})
