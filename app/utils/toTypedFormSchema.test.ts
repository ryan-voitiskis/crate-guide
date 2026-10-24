import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toTypedFormSchema } from './toTypedFormSchema'

describe('Zod 4 form validation', () => {
	it('returns parsed submit values with transforms and no mutation of the input', async () => {
		const schema = toTypedFormSchema(z.object({ title: z.string().trim() }))
		const input = { title: '  New title  ' }
		expect(await schema.parse(input)).toEqual({
			value: { title: 'New title' },
			errors: []
		})
		expect(input.title).toBe('  New title  ')
	})

	it('maps nested array failures to VeeValidate fields and retains multiple messages', async () => {
		const schema = toTypedFormSchema(
			z.object({
				artists: z.array(
					z.object({
						name: z
							.string()
							.min(3, 'Too short')
							.regex(/^A/, 'Must start with A')
					})
				)
			})
		)
		expect((await schema.parse({ artists: [{ name: 'x' }] })).errors).toEqual([
			{ path: 'artists[0].name', errors: ['Too short', 'Must start with A'] }
		])
	})

	it('keeps union validation errors attached to the offending field', async () => {
		const schema = toTypedFormSchema(
			z.object({ rpm: z.union([z.literal(33), z.literal(45), z.null()]) })
		)
		const result = await schema.parse({ rpm: 99 as 33 })
		expect(result.value).toBeUndefined()
		expect(result.errors).toHaveLength(1)
		expect(result.errors[0]?.path).toBe('rpm')
		expect(result.errors[0]?.errors.length).toBeGreaterThan(0)
	})

	it('preserves cross-field errors and supports async refinements at submission', async () => {
		const schema = toTypedFormSchema(
			z
				.object({ password: z.string(), confirmation: z.string() })
				.refine(async (value) => value.password === value.confirmation, {
					path: ['confirmation'],
					message: 'Passwords must match'
				})
		)
		const values = { password: 'first', confirmation: 'second' }
		expect(schema.cast?.(values)).toEqual(values)
		expect((await schema.parse(values)).errors).toEqual([
			{ path: 'confirmation', errors: ['Passwords must match'] }
		])
	})

	it('casts valid initial values while preserving incomplete form input', () => {
		const schema = toTypedFormSchema(
			z.object({ title: z.string().trim(), year: z.number() })
		)
		expect(schema.cast?.({ title: '  Title  ', year: 2026 })).toEqual({
			title: 'Title',
			year: 2026
		})
		expect(schema.cast?.({ title: '  Draft  ' })).toEqual({
			title: '  Draft  '
		})
	})

	it('describes required, optional, nested and missing fields', () => {
		const schema = toTypedFormSchema(
			z.object({
				title: z.string(),
				description: z.string().optional(),
				artists: z.array(z.object({ name: z.string() }))
			})
		)
		expect(schema.describe?.('title')).toEqual({ exists: true, required: true })
		expect(schema.describe?.('description')).toEqual({
			exists: true,
			required: false
		})
		expect(schema.describe?.('artists[0].name')).toEqual({
			exists: true,
			required: true
		})
		expect(schema.describe?.('missing' as 'title')).toEqual({
			exists: false,
			required: false
		})
	})
})
