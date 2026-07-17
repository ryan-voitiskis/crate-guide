import {
	type DiscogsCredentialRepository,
	createDiscogsCredentialRepository
} from '../_shared/discogs/credentials.ts'
import { makeAuthenticatedRequest } from '../_shared/discogs/makeAuthenticatedRequest.ts'
import {
	DiscogsConnectionRequiredError,
	DiscogsUpstreamTimeoutError,
	DiscogsUpstreamTransportError
} from '../_shared/discogs/requestErrors.ts'
import { getUserProfile } from '../_shared/supabaseHelpers.ts'

const DISCOGS_API_ORIGIN = 'https://api.discogs.com'

interface FoldersRequest {
	endpoint: 'folders'
}

interface FolderReleasesRequest {
	endpoint: 'folder_releases'
	folder_id: number
	page?: number
	per_page?: number
}

interface ReleaseRequest {
	endpoint: 'release'
	release_id: number
}

type DispatchRequest = FoldersRequest | FolderReleasesRequest | ReleaseRequest

type DiscogsErrorCode =
	| 'discogs_connection_required'
	| 'discogs_not_found'
	| 'discogs_rate_limited'
	| 'discogs_request_rejected'
	| 'discogs_timeout'
	| 'discogs_transport'
	| 'discogs_unavailable'
	| 'internal_error'
	| 'invalid_request'
	| 'invalid_upstream_response'

interface RequestContext {
	requestId: string
	attempt: number
}

interface ErrorDefinition {
	code: DiscogsErrorCode
	message: string
	retryable: boolean
}

const MAX_RETRY_AFTER_MS = 120_000
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

class RequestValidationError extends Error {}

interface HandlerDependencies {
	createCredentials(authHeader: string): Promise<DiscogsCredentialRepository>
	makeRequest(
		url: string,
		credentials: DiscogsCredentialRepository
	): Promise<Response>
}

const defaultDependencies: HandlerDependencies = {
	createCredentials: createDiscogsCredentialRepository,
	makeRequest: makeAuthenticatedRequest
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function isDispatchRequest(value: unknown): value is DispatchRequest {
	if (!value || typeof value !== 'object') return false
	const endpoint = (value as { endpoint?: unknown }).endpoint
	return (
		endpoint === 'folders' ||
		endpoint === 'folder_releases' ||
		endpoint === 'release'
	)
}

function getRequestContext(body: unknown): RequestContext {
	if (!body || typeof body !== 'object') {
		return { requestId: crypto.randomUUID(), attempt: 1 }
	}
	const context = (body as { request_context?: unknown }).request_context
	if (!context || typeof context !== 'object') {
		return { requestId: crypto.randomUUID(), attempt: 1 }
	}
	const requestId = (context as { request_id?: unknown }).request_id
	const attempt = (context as { attempt?: unknown }).attempt
	return {
		requestId:
			typeof requestId === 'string' && UUID_PATTERN.test(requestId)
				? requestId
				: crypto.randomUUID(),
		attempt:
			typeof attempt === 'number' &&
			Number.isInteger(attempt) &&
			attempt >= 1 &&
			attempt <= 3
				? attempt
				: 1
	}
}

function definitionForStatus(status: number): ErrorDefinition {
	if (status === 401) {
		return {
			code: 'discogs_connection_required',
			message: 'Reconnect Discogs before trying again.',
			retryable: false
		}
	}
	if (status === 404) {
		return {
			code: 'discogs_not_found',
			message: 'Discogs could not find this release.',
			retryable: false
		}
	}
	if (status === 408) {
		return {
			code: 'discogs_timeout',
			message: 'Discogs took too long to respond.',
			retryable: true
		}
	}
	if (status === 425 || status === 429) {
		return {
			code: 'discogs_rate_limited',
			message: 'Discogs is receiving too many requests. Retrying shortly.',
			retryable: true
		}
	}
	if (status >= 500) {
		return {
			code: 'discogs_unavailable',
			message: 'Discogs is temporarily unavailable.',
			retryable: true
		}
	}
	return {
		code: 'discogs_request_rejected',
		message: 'Discogs could not complete the request.',
		retryable: false
	}
}

function parseRetryAfter(value: string | null): number | undefined {
	if (!value) return undefined
	const seconds = Number(value)
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.min(MAX_RETRY_AFTER_MS, Math.round(seconds * 1000))
	}
	const date = Date.parse(value)
	if (Number.isNaN(date)) return undefined
	return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, date - Date.now()))
}

export async function resolveDiscogsRequestUrl(
	body: DispatchRequest,
	credentials: DiscogsCredentialRepository
): Promise<string> {
	switch (body.endpoint) {
		case 'folders': {
			const profile = await getUserProfile(
				credentials.callerClient,
				credentials.user
			)
			if (!profile.discogs_username) {
				throw new RequestValidationError('Discogs username required.')
			}
			return `${DISCOGS_API_ORIGIN}/users/${encodeURIComponent(profile.discogs_username)}/collection/folders`
		}
		case 'folder_releases': {
			if (!isNonNegativeInteger(body.folder_id)) {
				throw new RequestValidationError(
					'folder_id must be a non-negative integer.'
				)
			}
			const page = body.page ?? 1
			const perPage = body.per_page ?? 100
			if (!isPositiveInteger(page)) {
				throw new RequestValidationError('page must be a positive integer.')
			}
			if (!isPositiveInteger(perPage) || perPage > 500) {
				throw new RequestValidationError('per_page must be between 1 and 500.')
			}
			const profile = await getUserProfile(
				credentials.callerClient,
				credentials.user
			)
			if (!profile.discogs_username) {
				throw new RequestValidationError('Discogs username required.')
			}
			const url = new URL(
				`${DISCOGS_API_ORIGIN}/users/${encodeURIComponent(profile.discogs_username)}/collection/folders/${body.folder_id}/releases`
			)
			url.searchParams.set('page', String(page))
			url.searchParams.set('per_page', String(perPage))
			return url.toString()
		}
		case 'release': {
			if (!isPositiveInteger(body.release_id)) {
				throw new RequestValidationError(
					'release_id must be a positive integer.'
				)
			}
			return `${DISCOGS_API_ORIGIN}/releases/${body.release_id}`
		}
	}
}

function jsonResponse(
	body: unknown,
	headers: HeadersInit,
	status: number,
	requestId?: string,
	retryAfterMs?: number
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

function errorResponse(
	definition: ErrorDefinition,
	headers: HeadersInit,
	status: number,
	context: RequestContext,
	retryAfterMs?: number
): Response {
	return jsonResponse(
		{
			error: definition.message,
			code: definition.code,
			retryable: definition.retryable,
			request_id: context.requestId,
			...(retryAfterMs === undefined ? {} : { retry_after_ms: retryAfterMs })
		},
		headers,
		status,
		context.requestId,
		retryAfterMs
	)
}

export function createAuthenticatedDiscogsRequestHandler(
	headers: HeadersInit,
	dependencies: HandlerDependencies = defaultDependencies
): (request: Request) => Promise<Response> {
	return async (request) => {
		if (request.method === 'OPTIONS') return new Response('ok', { headers })

		const authHeader = request.headers.get('Authorization')
		if (!authHeader) return new Response(null, { headers, status: 401 })

		let context: RequestContext = {
			requestId: crypto.randomUUID(),
			attempt: 1
		}
		let endpoint = 'unknown'
		let releaseId: number | undefined
		try {
			let body: unknown
			try {
				body = await request.json()
			} catch {
				throw new RequestValidationError('Invalid request body.')
			}
			if (!isDispatchRequest(body)) {
				throw new RequestValidationError('Unknown endpoint.')
			}
			context = getRequestContext(body)
			endpoint = body.endpoint
			releaseId = body.endpoint === 'release' ? body.release_id : undefined

			const credentials = await dependencies.createCredentials(authHeader)
			const url = await resolveDiscogsRequestUrl(body, credentials)
			const response = await dependencies.makeRequest(url, credentials)

			if (!response.ok) {
				const definition = definitionForStatus(response.status)
				const retryAfterMs = parseRetryAfter(
					response.headers.get('Retry-After')
				)
				console.error('Discogs proxy upstream request failed', {
					requestId: context.requestId,
					endpoint,
					releaseId,
					attempt: context.attempt,
					status: response.status,
					code: definition.code
				})
				return errorResponse(
					definition,
					headers,
					response.status,
					context,
					retryAfterMs
				)
			}

			let responseBody: unknown
			try {
				responseBody = await response.json()
			} catch {
				const definition: ErrorDefinition = {
					code: 'invalid_upstream_response',
					message: 'Discogs returned an invalid response.',
					retryable: false
				}
				console.error('Discogs proxy received invalid JSON', {
					requestId: context.requestId,
					endpoint,
					releaseId,
					attempt: context.attempt,
					code: definition.code
				})
				return errorResponse(definition, headers, 502, context)
			}

			return jsonResponse(responseBody, headers, 200, context.requestId)
		} catch (error) {
			if (error instanceof RequestValidationError) {
				return errorResponse(
					{
						code: 'invalid_request',
						message: error.message,
						retryable: false
					},
					headers,
					400,
					context
				)
			}
			if (error instanceof DiscogsConnectionRequiredError) {
				return errorResponse(
					{
						code: 'discogs_connection_required',
						message: 'Reconnect Discogs before trying again.',
						retryable: false
					},
					headers,
					401,
					context
				)
			}
			if (error instanceof DiscogsUpstreamTimeoutError) {
				return errorResponse(
					{
						code: 'discogs_timeout',
						message: 'Discogs took too long to respond.',
						retryable: true
					},
					headers,
					504,
					context
				)
			}
			if (error instanceof DiscogsUpstreamTransportError) {
				return errorResponse(
					{
						code: 'discogs_transport',
						message: 'Could not reach Discogs.',
						retryable: true
					},
					headers,
					502,
					context
				)
			}
			console.error('Authenticated Discogs request failed', {
				requestId: context.requestId,
				endpoint,
				releaseId,
				attempt: context.attempt,
				code: 'internal_error'
			})
			return errorResponse(
				{
					code: 'internal_error',
					message: 'Internal server error.',
					retryable: false
				},
				headers,
				500,
				context
			)
		}
	}
}
