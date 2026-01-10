import { z } from 'zod'

export const crateSchema = z.object({
	name: z
		.string()
		.min(1, 'Name is required')
		.max(50, 'Name is too long')
		.trim(),
	description: z.string().max(100, 'Description is too long').optional()
})

export type CrateFormValues = z.infer<typeof crateSchema>
