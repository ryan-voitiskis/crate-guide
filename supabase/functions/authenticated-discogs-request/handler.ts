import {
	type DiscogsCredentialRepository,
	createDiscogsCredentialRepository
} from '../_shared/discogs/credentials.ts'
import { makeAuthenticatedRequest } from '../_shared/discogs/makeAuthenticatedRequest.ts'
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
	status: number
): Response {
	return new Response(JSON.stringify(body), { headers, status })
}

export function createAuthenticatedDiscogsRequestHandler(
	headers: HeadersInit,
	dependencies: HandlerDependencies = defaultDependencies
): (request: Request) => Promise<Response> {
	return async (request) => {
		if (request.method === 'OPTIONS') return new Response('ok', { headers })

		const authHeader = request.headers.get('Authorization')
		if (!authHeader) return new Response(null, { headers, status: 401 })

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

			const credentials = await dependencies.createCredentials(authHeader)
			const url = await resolveDiscogsRequestUrl(body, credentials)
			const response = await dependencies.makeRequest(url, credentials)

			if (!response.ok) {
				console.error('Discogs proxy upstream request failed', {
					status: response.status
				})
				return jsonResponse(
					{ error: 'Discogs request failed. Please try again.' },
					headers,
					response.status
				)
			}

			return jsonResponse(await response.json(), headers, 200)
		} catch (error) {
			if (error instanceof RequestValidationError) {
				return jsonResponse({ error: error.message }, headers, 400)
			}
			console.error('Authenticated Discogs request failed')
			return jsonResponse({ error: 'Internal server error.' }, headers, 500)
		}
	}
}
