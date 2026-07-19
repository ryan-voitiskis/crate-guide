import { corsHeaders } from '../_shared/cors.ts'
import { createCleanupRecordCoversHandler } from './handler.ts'

export const handler = createCleanupRecordCoversHandler({
	...corsHeaders,
	'Content-Type': 'application/json'
})

Deno.serve(handler)
