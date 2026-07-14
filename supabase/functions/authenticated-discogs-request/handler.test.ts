import type { SupabaseClient, User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import type { DiscogsCredentialRepository } from '../_shared/discogs/credentials.ts'
import { createAuthenticatedDiscogsRequestHandler } from './handler.ts'

const headers = { 'Content-Type': 'application/json' }

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
	return new Request('http://localhost', {
		method: 'POST',
		headers: { Authorization: 'Bearer valid' },
		body: body === undefined ? undefined : JSON.stringify(body)
	})
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
	assert.deepEqual(await response.json(), { error: 'Unknown endpoint.' })
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
		assert.deepEqual(await response.json(), { error: message })
	}
})

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
})
