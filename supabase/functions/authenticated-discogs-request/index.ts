import { corsHeaders } from '../_shared/cors.ts'
import { makeAuthenticatedRequest } from '../_shared/discogs/makeAuthenticatedRequest.ts'

const headers = { ...corsHeaders, 'Content-Type': 'application/json' }

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers })

	const authHeader = req.headers.get('Authorization')
	if (!authHeader) return new Response(null, { headers, status: 401 })

	try {
		const { httpMethod = 'GET', url, page, per_page } = await req.json()
		if (!url) throw new Error('Missing url.')

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
		console.error(e)
		return new Response(JSON.stringify(e), { headers, status: 500 })
	}
})
