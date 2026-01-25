import { corsHeaders } from '../_shared/cors.ts'
import { makeAuthenticatedRequest } from '../_shared/discogs/makeAuthenticatedRequest.ts'

const headers = { ...corsHeaders, 'Content-Type': 'application/json' }

const ALLOWED_DISCOGS_HOSTS = ['api.discogs.com']

function validateDiscogsUrl(url: string): boolean {
	try {
		const parsed = new URL(url)
		return ALLOWED_DISCOGS_HOSTS.includes(parsed.host)
	} catch {
		return false
	}
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers })

	const authHeader = req.headers.get('Authorization')
	if (!authHeader) return new Response(null, { headers, status: 401 })

	try {
		const { httpMethod = 'GET', url, page, per_page } = await req.json()
		if (!url) throw new Error('Missing url.')

		if (!validateDiscogsUrl(url)) {
			return new Response(JSON.stringify({ error: 'Invalid Discogs URL' }), { headers, status: 400 })
		}

		const response = await makeAuthenticatedRequest(
			httpMethod,
			url,
			authHeader,
			page,
			per_page
		)

		const responseObj = await response.json()

		return new Response(JSON.stringify(responseObj), { headers, status: 200 })
	} catch (e) {
		console.error('Function error:', e)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { headers, status: 500 })
	}
})
