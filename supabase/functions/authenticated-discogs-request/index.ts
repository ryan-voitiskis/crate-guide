import { corsHeaders } from '../_shared/cors.ts'
import { createAuthenticatedDiscogsRequestHandler } from './handler.ts'

export const handler = createAuthenticatedDiscogsRequestHandler({
	...corsHeaders,
	'Content-Type': 'application/json',
	'Access-Control-Expose-Headers': 'Retry-After, X-Request-ID'
})

Deno.serve(handler)
