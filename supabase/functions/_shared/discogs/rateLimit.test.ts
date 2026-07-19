import assert from 'node:assert/strict'
import {
	DiscogsRateLimitError,
	decodeDiscogsQuotaResponse,
	getDiscogsRateLimitConfig
} from './rateLimit.ts'

function environment(values: Record<string, string | undefined>) {
	return (name: string): string | undefined => values[name]
}

Deno.test('uses conservative Discogs quota defaults', () => {
	assert.deepEqual(getDiscogsRateLimitConfig(environment({})), {
		perUserLimit: 45,
		globalLimit: 55,
		windowSeconds: 60
	})
	assert.deepEqual(
		getDiscogsRateLimitConfig(
			environment({
				DISCOGS_RATE_LIMIT_PER_USER: '45',
				DISCOGS_RATE_LIMIT_GLOBAL: '55',
				DISCOGS_RATE_LIMIT_WINDOW_SECONDS: '60'
			})
		),
		{ perUserLimit: 45, globalLimit: 55, windowSeconds: 60 }
	)
})

Deno.test('rejects invalid Discogs quota configuration', () => {
	for (const values of [
		{ DISCOGS_RATE_LIMIT_PER_USER: '0' },
		{ DISCOGS_RATE_LIMIT_GLOBAL: '1.5' },
		{ DISCOGS_RATE_LIMIT_WINDOW_SECONDS: 'sixty' },
		{
			DISCOGS_RATE_LIMIT_PER_USER: '56',
			DISCOGS_RATE_LIMIT_GLOBAL: '55'
		}
	]) {
		assert.throws(() => getDiscogsRateLimitConfig(environment(values)))
	}
})

Deno.test('rejects provider-unsafe Discogs quota bounds', () => {
	for (const values of [
		{ DISCOGS_RATE_LIMIT_GLOBAL: '61' },
		{ DISCOGS_RATE_LIMIT_WINDOW_SECONDS: '59' },
		{ DISCOGS_RATE_LIMIT_WINDOW_SECONDS: '121' }
	]) {
		assert.throws(() => getDiscogsRateLimitConfig(environment(values)))
	}
})

Deno.test('decodes and bounds the atomic quota result', () => {
	assert.deepEqual(
		decodeDiscogsQuotaResponse([{ allowed: true, retry_after_seconds: 0 }]),
		{ allowed: true, retryAfterMs: 0 }
	)
	assert.deepEqual(
		decodeDiscogsQuotaResponse([{ allowed: false, retry_after_seconds: 999 }]),
		{ allowed: false, retryAfterMs: 120_000 }
	)
})

Deno.test('rejects malformed atomic quota results', () => {
	for (const data of [
		null,
		[],
		[
			{ allowed: true, retry_after_seconds: 0 },
			{ allowed: true, retry_after_seconds: 0 }
		],
		[{ allowed: 'yes', retry_after_seconds: 0 }],
		[{ allowed: false, retry_after_seconds: 0 }],
		[{ allowed: true, retry_after_seconds: 1 }]
	]) {
		assert.throws(() => decodeDiscogsQuotaResponse(data), DiscogsRateLimitError)
	}
})
