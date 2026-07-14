import { corsHeaders } from '../_shared/cors.ts'
import { createAuthenticatedDiscogsRequestHandler } from './handler.ts'

export const handler = createAuthenticatedDiscogsRequestHandler({
	...corsHeaders,
	'Content-Type': 'application/json'
})

Deno.serve(handler)
