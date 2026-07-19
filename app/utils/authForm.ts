import { nextTick } from 'vue'

export async function focusFirstInvalidAuthField(
	form: HTMLFormElement | null,
	errors: Record<string, unknown>
): Promise<void> {
	if (!form) return
	await nextTick()

	for (const name of Object.keys(errors)) {
		const field = form.elements.namedItem(name)
		if (
			field instanceof HTMLElement &&
			!field.matches(':disabled') &&
			typeof field.focus === 'function'
		) {
			field.focus({ preventScroll: true })
			return
		}
	}
}

export function maskEmailAddress(email: string): string {
	const separator = email.lastIndexOf('@')
	if (separator <= 0 || separator === email.length - 1)
		return 'your email address'
	const local = email.slice(0, separator)
	const domain = email.slice(separator + 1)
	const visibleLocal = local.slice(0, Math.min(2, local.length))
	return `${visibleLocal}${'•'.repeat(Math.max(3, local.length - visibleLocal.length))}@${domain}`
}
