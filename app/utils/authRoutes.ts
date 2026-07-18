const PUBLIC_AUTH_ROUTES = new Set([
	'/login',
	'/signup',
	'/reset-password',
	'/update-password',
	'/auth/check-inbox',
	'/auth/confirm',
	'/auth/finalising'
])

const PUBLIC_LEGAL_ROUTES = new Set(['/privacy', '/terms'])

const SIGNED_OUT_ONLY_ROUTES = new Set(['/login', '/signup', '/reset-password'])

export function isPublicRoute(path: string): boolean {
	return (
		PUBLIC_AUTH_ROUTES.has(path) ||
		PUBLIC_LEGAL_ROUTES.has(path) ||
		path === '/demo' ||
		path.startsWith('/demo/')
	)
}

export function isSignedOutOnlyRoute(path: string): boolean {
	return SIGNED_OUT_ONLY_ROUTES.has(path)
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
		PUBLIC_AUTH_ROUTES.has(pathWithoutQueryOrHash(value)) ||
		PUBLIC_AUTH_ROUTES.has(pathWithoutQueryOrHash(decodedValue))
	)
		return '/'

	return value
}

export function buildLoginRedirectPath(returnPath: unknown): string {
	return `/login?redirect=${encodeURIComponent(sanitizeAuthReturnPath(returnPath))}`
}
