import assert from 'node:assert/strict'
import {
	discogsRateLimitResponse,
	jsonResponse,
	missingAuthorizationResponse,
	preflightResponse
} from './http.ts'
import { createCorsHeaders } from './siteUrl.ts'

const corsHeaders = createCorsHeaders('https://crate.guide/')

function headerEntries(response: Response): Array<[string, string]> {
	return [...response.headers.entries()]
}

Deno.test('jsonResponse serializes the body with CORS headers', async () => {
	const response = jsonResponse({ ok: true, count: 2 }, corsHeaders, 201)

	assert.equal(response.status, 201)
	assert.equal(await response.text(), '{"ok":true,"count":2}')
	assert.deepEqual(headerEntries(response), [
		[
			'access-control-allow-headers',
			'authorization, x-client-info, apikey, content-type'
		],
		['access-control-allow-origin', 'https://crate.guide'],
		['content-type', 'text/plain;charset=UTF-8']
	])
})

Deno.test(
	'jsonResponse matches a direct Response for plain headers',
	async () => {
		const body = { error: 'Invalid request body.' }
		const direct = new Response(JSON.stringify(body), {
			headers: corsHeaders,
			status: 400
		})
		const shared = jsonResponse(body, corsHeaders, 400)

		assert.equal(shared.status, direct.status)
		assert.deepEqual(headerEntries(shared), headerEntries(direct))
		assert.equal(await shared.text(), await direct.text())
	}
)

Deno.test('jsonResponse serializes non-object bodies as JSON', async () => {
	assert.equal(
		await jsonResponse('oauth-token', corsHeaders, 200).text(),
		'"oauth-token"'
	)
})

Deno.test('jsonResponse adds request id and rounded Retry-After', () => {
	const response = jsonResponse({}, corsHeaders, 429, {
		requestId: 'request-1',
		retryAfterMs: 1001
	})

	assert.equal(response.headers.get('X-Request-ID'), 'request-1')
	assert.equal(response.headers.get('Retry-After'), '2')
})

Deno.test('jsonResponse omits optional headers when not provided', () => {
	const response = jsonResponse({}, corsHeaders, 200, { requestId: '' })

	assert.equal(response.headers.has('X-Request-ID'), false)
	assert.equal(response.headers.has('Retry-After'), false)
})

Deno.test('jsonResponse sends Retry-After 0 for a zero delay', () => {
	assert.equal(
		jsonResponse({}, corsHeaders, 429, { retryAfterMs: 0 }).headers.get(
			'Retry-After'
		),
		'0'
	)
})

Deno.test('jsonResponse does not mutate caller headers', () => {
	const headers = new Headers(corsHeaders)
	jsonResponse({}, headers, 429, { requestId: 'request-1', retryAfterMs: 1 })

	assert.equal(headers.has('X-Request-ID'), false)
	assert.equal(headers.has('Retry-After'), false)
})

Deno.test('preflightResponse returns ok with CORS headers', async () => {
	const response = preflightResponse(corsHeaders)

	assert.equal(response.status, 200)
	assert.equal(await response.text(), 'ok')
	assert.equal(
		response.headers.get('Access-Control-Allow-Origin'),
		'https://crate.guide'
	)
})

Deno.test('missingAuthorizationResponse is an empty 401 with CORS', () => {
	const response = missingAuthorizationResponse(corsHeaders)

	assert.equal(response.status, 401)
	assert.equal(response.body, null)
	assert.equal(response.headers.has('content-type'), false)
	assert.equal(
		response.headers.get('Access-Control-Allow-Origin'),
		'https://crate.guide'
	)
})

Deno.test('discogsRateLimitResponse reports a retryable 429', async () => {
	const response = discogsRateLimitResponse(corsHeaders, 2500)

	assert.equal(response.status, 429)
	assert.equal(response.headers.get('Retry-After'), '3')
	assert.equal(
		response.headers.get('Access-Control-Allow-Origin'),
		'https://crate.guide'
	)
	assert.deepEqual(await response.json(), {
		error: 'Discogs is receiving too many requests. Retrying shortly.',
		code: 'discogs_rate_limited',
		retryable: true,
		retry_after_ms: 2500
	})
})
