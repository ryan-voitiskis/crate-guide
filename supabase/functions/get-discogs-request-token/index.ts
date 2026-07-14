import { corsHeaders } from '../_shared/cors.ts'
import { createDiscogsRequestTokenHandler } from './handler.ts'

export const handler = createDiscogsRequestTokenHandler({
	...corsHeaders,
	'Content-Type': 'application/json'
})

Deno.serve(handler)
