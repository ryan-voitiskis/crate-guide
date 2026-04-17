import { corsHeaders } from '../_shared/cors.ts'
import { makeAuthenticatedRequest } from '../_shared/discogs/makeAuthenticatedRequest.ts'
import {
	createAuthedSupabaseClient,
	getUser,
	getUserProfile
} from '../_shared/supabaseHelpers.ts'

const headers = { ...corsHeaders, 'Content-Type': 'application/json' }

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

function isPositiveInt(v: unknown): v is number {
	return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

function isPositiveIntOneOrMore(v: unknown): v is number {
	return typeof v === 'number' && Number.isInteger(v) && v >= 1
}

async function buildDiscogsUrl(
	body: DispatchRequest,
	authHeader: string
): Promise<string> {
	switch (body.endpoint) {
		case 'folders': {
			const supabase = createAuthedSupabaseClient(authHeader)
			const user = await getUser(supabase)
			const profile = await getUserProfile(supabase, user)
			if (!profile.discogs_username) {
				throw new Error('Discogs username required.')
			}
			return `${DISCOGS_API_ORIGIN}/users/${encodeURIComponent(profile.discogs_username)}/collection/folders`
		}
		case 'folder_releases': {
			if (!isPositiveInt(body.folder_id)) {
				throw new Error('folder_id must be a non-negative integer.')
			}
			const page = body.page ?? 1
			const per_page = body.per_page ?? 100
			if (!isPositiveIntOneOrMore(page)) {
				throw new Error('page must be a positive integer.')
			}
			if (!isPositiveIntOneOrMore(per_page) || per_page > 500) {
				throw new Error('per_page must be between 1 and 500.')
			}
			const supabase = createAuthedSupabaseClient(authHeader)
			const user = await getUser(supabase)
			const profile = await getUserProfile(supabase, user)
			if (!profile.discogs_username) {
				throw new Error('Discogs username required.')
			}
			const url = new URL(
				`${DISCOGS_API_ORIGIN}/users/${encodeURIComponent(profile.discogs_username)}/collection/folders/${body.folder_id}/releases`
			)
			url.searchParams.set('page', String(page))
			url.searchParams.set('per_page', String(per_page))
			return url.toString()
		}
		case 'release': {
			if (!isPositiveIntOneOrMore(body.release_id)) {
				throw new Error('release_id must be a positive integer.')
			}
			return `${DISCOGS_API_ORIGIN}/releases/${body.release_id}`
		}
	}
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

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers })

	const authHeader = req.headers.get('Authorization')
	if (!authHeader) return new Response(null, { headers, status: 401 })

	try {
		const body = await req.json()
		if (!isDispatchRequest(body)) {
			return new Response(JSON.stringify({ error: 'Unknown endpoint.' }), {
				headers,
				status: 400
			})
		}

		const url = await buildDiscogsUrl(body, authHeader)
		const response = await makeAuthenticatedRequest(url, authHeader)

		if (!response.ok) {
			const errorBody = await response.text()
			return new Response(errorBody, { headers, status: response.status })
		}

		const responseObj = await response.json()
		return new Response(JSON.stringify(responseObj), { headers, status: 200 })
	} catch (e) {
		console.error('Function error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		// Surface validation errors with a 400 so clients can distinguish from
		// genuine server faults.
		const validationMessages = [
			'folder_id must',
			'release_id must',
			'page must',
			'per_page must',
			'Discogs username required.'
		]
		const isValidation = validationMessages.some((m) => message.startsWith(m))
		return new Response(JSON.stringify({ error: message }), {
			headers,
			status: isValidation ? 400 : 500
		})
	}
})
