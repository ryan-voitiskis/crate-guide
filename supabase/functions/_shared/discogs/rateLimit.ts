export const DISCOGS_AUTHENTICATED_REQUESTS_PER_MINUTE = 60
export const MAX_DISCOGS_RETRY_AFTER_MS = 120_000

const DEFAULT_PER_USER_LIMIT = 45
const DEFAULT_GLOBAL_LIMIT = 55
const DEFAULT_WINDOW_SECONDS = 60
const MIN_WINDOW_SECONDS = 60
const MAX_WINDOW_SECONDS = MAX_DISCOGS_RETRY_AFTER_MS / 1000

export interface DiscogsRateLimitConfig {
	perUserLimit: number
	globalLimit: number
	windowSeconds: number
}

type EnvironmentReader = (name: string) => string | undefined

export class DiscogsRateLimitError extends Error {
	constructor() {
		super('Discogs request quota is unavailable')
		this.name = 'DiscogsRateLimitError'
	}
}

function readPositiveInteger(
	name: string,
	fallback: number,
	readEnvironment: EnvironmentReader
): number {
	const rawValue = readEnvironment(name)?.trim()
	if (!rawValue) return fallback
	if (!/^[1-9]\d*$/.test(rawValue)) {
		throw new Error(`${name} must be a positive integer`)
	}

	const value = Number(rawValue)
	if (!Number.isSafeInteger(value)) {
		throw new Error(`${name} must be a positive integer`)
	}
	return value
}

export function getDiscogsRateLimitConfig(
	readEnvironment: EnvironmentReader = (name) => Deno.env.get(name)
): DiscogsRateLimitConfig {
	const perUserLimit = readPositiveInteger(
		'DISCOGS_RATE_LIMIT_PER_USER',
		DEFAULT_PER_USER_LIMIT,
		readEnvironment
	)
	const globalLimit = readPositiveInteger(
		'DISCOGS_RATE_LIMIT_GLOBAL',
		DEFAULT_GLOBAL_LIMIT,
		readEnvironment
	)
	const windowSeconds = readPositiveInteger(
		'DISCOGS_RATE_LIMIT_WINDOW_SECONDS',
		DEFAULT_WINDOW_SECONDS,
		readEnvironment
	)

	if (perUserLimit > globalLimit) {
		throw new Error(
			'DISCOGS_RATE_LIMIT_PER_USER must not exceed DISCOGS_RATE_LIMIT_GLOBAL'
		)
	}
	if (globalLimit > DISCOGS_AUTHENTICATED_REQUESTS_PER_MINUTE) {
		throw new Error(
			'DISCOGS_RATE_LIMIT_GLOBAL must not exceed the authenticated provider allowance'
		)
	}
	if (
		windowSeconds < MIN_WINDOW_SECONDS ||
		windowSeconds > MAX_WINDOW_SECONDS
	) {
		throw new Error(
			`DISCOGS_RATE_LIMIT_WINDOW_SECONDS must be between ${MIN_WINDOW_SECONDS} and ${MAX_WINDOW_SECONDS}`
		)
	}

	return { perUserLimit, globalLimit, windowSeconds }
}

export function decodeDiscogsQuotaResponse(data: unknown): {
	allowed: boolean
	retryAfterMs: number
} {
	if (!Array.isArray(data) || data.length !== 1) {
		throw new DiscogsRateLimitError()
	}
	const row = data[0]
	if (!row || typeof row !== 'object') {
		throw new DiscogsRateLimitError()
	}
	const { allowed, retry_after_seconds: retryAfterSeconds } = row as {
		allowed?: unknown
		retry_after_seconds?: unknown
	}
	if (
		typeof allowed !== 'boolean' ||
		typeof retryAfterSeconds !== 'number' ||
		!Number.isInteger(retryAfterSeconds) ||
		retryAfterSeconds < 0 ||
		(allowed && retryAfterSeconds !== 0) ||
		(!allowed && retryAfterSeconds === 0)
	) {
		throw new DiscogsRateLimitError()
	}

	return {
		allowed,
		retryAfterMs: Math.min(MAX_DISCOGS_RETRY_AFTER_MS, retryAfterSeconds * 1000)
	}
}
