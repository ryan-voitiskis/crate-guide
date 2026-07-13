const PUBLIC_AUTH_ROUTES = new Set([
	'/login',
	'/signup',
	'/reset-password',
	'/auth/check-inbox',
	'/auth/confirm',
	'/auth/finalising'
])

const SIGNED_OUT_ONLY_ROUTES = new Set(['/login', '/signup', '/reset-password'])

export function isPublicRoute(path: string): boolean {
	return (
		PUBLIC_AUTH_ROUTES.has(path) ||
		path === '/demo' ||
		path.startsWith('/demo/')
	)
}

export function isSignedOutOnlyRoute(path: string): boolean {
	return SIGNED_OUT_ONLY_ROUTES.has(path)
}
