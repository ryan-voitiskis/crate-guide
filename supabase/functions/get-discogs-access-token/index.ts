import { corsHeaders } from '../_shared/cors.ts'
import { createDiscogsAccessTokenHandler } from './handler.ts'

export const handler = createDiscogsAccessTokenHandler({
	...corsHeaders,
	'Content-Type': 'application/json'
})

Deno.serve(handler)
