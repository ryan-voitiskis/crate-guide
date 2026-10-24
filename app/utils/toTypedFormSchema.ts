import {
	type TypedSchema,
	type TypedSchemaError,
	cleanupNonNestedPath,
	isNotNestedPath
} from 'vee-validate'
import { z } from 'zod'

function formPath(parts: PropertyKey[]): string {
	return parts.reduce<string>((path, part, index) => {
		const segment = String(part)
		if (index === 0) return segment
		return /^\d+$/.test(segment) ? `${path}[${segment}]` : `${path}.${segment}`
	}, '')
}

function collectErrors(
	issues: readonly z.core.$ZodIssue[],
	errors: Map<string, TypedSchemaError>,
	prefix: PropertyKey[] = []
) {
	for (const issue of issues) {
		const parts = [...prefix, ...issue.path]
		const path = formPath(parts)
		if (issue.code === 'invalid_union') {
			for (const branch of issue.errors) collectErrors(branch, errors, parts)
			if (!path) continue
		}
		const entry = errors.get(path) ?? { path, errors: [] }
		entry.errors.push(issue.message)
		errors.set(path, entry)
	}
}

function schemaAtPath(schema: z.ZodType, path: string): z.ZodType | undefined {
	if (isNotNestedPath(path)) {
		return schema instanceof z.ZodObject
			? schema.shape[cleanupNonNestedPath(path)]
			: undefined
	}
	let current: z.ZodType | undefined = schema
	for (const part of path.split(/\.|\[(\d+)\]/).filter(Boolean)) {
		if (current instanceof z.ZodObject) current = current.shape[part]
		else if (current instanceof z.ZodArray && /^\d+$/.test(part)) {
			const element = current.element
			current = element instanceof z.ZodType ? element : undefined
		} else return undefined
	}
	return current
}

/** Zod 4 adapter using VeeValidate 4's public schema contract. */
export function toTypedFormSchema<T extends z.ZodType>(
	schema: T
): TypedSchema<Partial<z.input<T>>, z.output<T>> {
	return {
		__type: 'VVTypedSchema',
		async parse(values) {
			const result = await schema.safeParseAsync(values)
			if (result.success) return { value: result.data, errors: [] }
			const errors = new Map<string, TypedSchemaError>()
			collectErrors(result.error.issues, errors)
			return { errors: [...errors.values()] }
		},
		cast(values) {
			try {
				const result = schema.safeParse(values)
				return (result.success ? result.data : values) as Partial<z.input<T>>
			} catch {
				// Async refinements are evaluated by parse, never by initial-value casting.
				return values as Partial<z.input<T>>
			}
		},
		describe(path) {
			try {
				const field = path ? schemaAtPath(schema, String(path)) : schema
				return {
					exists: field !== undefined,
					required: !!field && !field.isOptional()
				}
			} catch {
				return { exists: false, required: false }
			}
		}
	}
}
