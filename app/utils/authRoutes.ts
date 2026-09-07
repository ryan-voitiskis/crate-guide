import { getRoutePolicy } from './routePolicy'

export function isPublicRoute(path: string): boolean {
	return getRoutePolicy(path).access !== 'authenticated'
}

export function isSignedOutOnlyRoute(path: string): boolean {
	return getRoutePolicy(path).access === 'signed-out'
}

function hasUnsafePathCharacters(value: string): boolean {
	for (const character of value) {
		const code = character.charCodeAt(0)
		if (character === '\\' || code <= 0x1f || (code >= 0x7f && code <= 0x9f))
			return true
	}
	return false
}

function pathWithoutQueryOrHash(value: string): string {
	const queryIndex = value.indexOf('?')
	const hashIndex = value.indexOf('#')
	const end = Math.min(
		queryIndex === -1 ? value.length : queryIndex,
		hashIndex === -1 ? value.length : hashIndex
	)
	return value.slice(0, end)
}

export function sanitizeAuthReturnPath(value: unknown): string {
	if (typeof value !== 'string' || !value.startsWith('/')) return '/'
	if (value.startsWith('//') || hasUnsafePathCharacters(value)) return '/'

	let decodedValue: string
	try {
		decodedValue = decodeURIComponent(value)
	} catch {
		return '/'
	}
	if (
		decodedValue.startsWith('//') ||
		hasUnsafePathCharacters(decodedValue) ||
		getRoutePolicy(pathWithoutQueryOrHash(value)).authPage ||
		getRoutePolicy(pathWithoutQueryOrHash(decodedValue)).authPage
	)
		return '/'

	return value
}

export function buildLoginRedirectPath(returnPath: unknown): string {
	return `/login?redirect=${encodeURIComponent(sanitizeAuthReturnPath(returnPath))}`
}

export function buildSignupRedirectPath(returnPath: unknown): string {
	return `/signup?redirect=${encodeURIComponent(sanitizeAuthReturnPath(returnPath))}`
}

export function buildCheckInboxPath(returnPath: unknown): string {
	return `/auth/check-inbox?redirect=${encodeURIComponent(sanitizeAuthReturnPath(returnPath))}`
}

export function buildResetPasswordPath(returnPath: unknown): string {
	return `/reset-password?redirect=${encodeURIComponent(sanitizeAuthReturnPath(returnPath))}`
}

export function buildUpdatePasswordPath(returnPath: unknown): string {
	return `/update-password?redirect=${encodeURIComponent(sanitizeAuthReturnPath(returnPath))}`
}
