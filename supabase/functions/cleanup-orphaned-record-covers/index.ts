import { createCleanupOrphanedRecordCoversHandler } from './handler.ts'

export const handler = createCleanupOrphanedRecordCoversHandler({
	'Content-Type': 'application/json'
})

Deno.serve(handler)
