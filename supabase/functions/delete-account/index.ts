import { corsHeaders } from '../_shared/cors.ts'
import { createDeleteAccountHandler } from './handler.ts'

export const handler = createDeleteAccountHandler({
	...corsHeaders,
	'Content-Type': 'application/json'
})

Deno.serve(handler)
