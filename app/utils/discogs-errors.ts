import type {
	DiscogsErrorCode,
	DiscogsRequestContext
} from '../../shared/types/discogs'

export type DiscogsErrorPayload = {
	error: string
	code: DiscogsErrorCode
	retryable: boolean
	request_id: string
	retry_after_ms?: number
}

interface DiscogsApiErrorOptions {
	code: DiscogsErrorCode
	retryable: boolean
	status?: number
	retryAfterMs?: number
	requestId?: string
}

const MANUALLY_RETRYABLE_CODES = new Set<DiscogsErrorCode>([
	'database_write_failed',
	'discogs_rate_limited',
	'discogs_timeout',
	'discogs_transport',
	'discogs_unavailable',
	'internal_error',
	'invalid_upstream_response',
	'unknown_error'
])

const ERROR_CODES = new Set<DiscogsErrorCode>([
	'database_write_failed',
	'discogs_connection_required',
	'discogs_not_found',
	'discogs_rate_limited',
	'discogs_request_rejected',
	'discogs_timeout',
	'discogs_transport',
	'discogs_unavailable',
	'internal_error',
	'invalid_request',
	'invalid_upstream_response',
	'unknown_error'
])

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class DiscogsApiError extends Error {
	readonly code: DiscogsErrorCode
	readonly retryable: boolean
	readonly status?: number
	readonly retryAfterMs?: number
	readonly requestId?: string

	constructor(message: string, options: DiscogsApiErrorOptions) {
		super(message)
		this.name = 'DiscogsApiError'
		this.code = options.code
		this.retryable = options.retryable
		this.status = options.status
		this.retryAfterMs = options.retryAfterMs
		this.requestId = options.requestId
	}
}

export function isDiscogsApiError(error: unknown): error is DiscogsApiError {
	return error instanceof DiscogsApiError
}

export function isDiscogsRequestId(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function isDiscogsErrorPayload(
	value: unknown
): value is DiscogsErrorPayload {
	if (!value || typeof value !== 'object') return false
	const payload = value as Record<string, unknown>
	return (
		typeof payload.error === 'string' &&
		payload.error.length > 0 &&
		payload.error.length <= 240 &&
		typeof payload.code === 'string' &&
		ERROR_CODES.has(payload.code as DiscogsErrorCode) &&
		typeof payload.retryable === 'boolean' &&
		isDiscogsRequestId(payload.request_id) &&
		(payload.retry_after_ms === undefined ||
			(typeof payload.retry_after_ms === 'number' &&
				Number.isFinite(payload.retry_after_ms) &&
				payload.retry_after_ms >= 0 &&
				payload.retry_after_ms <= 120_000))
	)
}

export function canManuallyRetryDiscogsError(error: unknown): boolean {
	return !isDiscogsApiError(error) || MANUALLY_RETRYABLE_CODES.has(error.code)
}

export function createDiscogsRequestContext(
	attempt = 1,
	requestId = crypto.randomUUID()
): DiscogsRequestContext {
	return { attempt, requestId }
}
