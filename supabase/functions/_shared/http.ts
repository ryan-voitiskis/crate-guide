export interface JsonResponseOptions {
	/** Echoed as `X-Request-ID` when nonempty. */
	requestId?: string
	/** Sent as `Retry-After`, rounded up to whole seconds. */
	retryAfterMs?: number
}

export function jsonResponse(
	body: unknown,
	headers: HeadersInit,
	status: number,
	{ requestId, retryAfterMs }: JsonResponseOptions = {}
): Response {
	const responseHeaders = new Headers(headers)
	if (requestId) responseHeaders.set('X-Request-ID', requestId)
	if (retryAfterMs !== undefined) {
		responseHeaders.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
	}
	return new Response(JSON.stringify(body), {
		headers: responseHeaders,
		status
	})
}

export function preflightResponse(headers: HeadersInit): Response {
	return new Response('ok', { headers })
}

/** Rejects a request without an `Authorization` header with an empty 401. */
export function missingAuthorizationResponse(headers: HeadersInit): Response {
	return new Response(null, { headers, status: 401 })
}

export function discogsRateLimitResponse(
	headers: HeadersInit,
	retryAfterMs: number
): Response {
	return jsonResponse(
		{
			error: 'Discogs is receiving too many requests. Retrying shortly.',
			code: 'discogs_rate_limited',
			retryable: true,
			retry_after_ms: retryAfterMs
		},
		headers,
		429,
		{ retryAfterMs }
	)
}
