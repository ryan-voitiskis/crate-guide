type RoutePolicy = Readonly<{
	access: 'public' | 'signed-out' | 'authenticated'
	authPage: boolean
	cloudWorkbench: boolean
}>

const PUBLIC: RoutePolicy = {
	access: 'public',
	authPage: false,
	cloudWorkbench: false
}
const AUTH: RoutePolicy = { ...PUBLIC, authPage: true }
const SIGNED_OUT: RoutePolicy = { ...AUTH, access: 'signed-out' }
const PROTECTED: RoutePolicy = { ...PUBLIC, access: 'authenticated' }
const WORKBENCH: RoutePolicy = { ...PROTECTED, cloudWorkbench: true }

const ROUTES: Readonly<Record<string, RoutePolicy>> = {
	'/': WORKBENCH,
	'/crates': WORKBENCH,
	'/enrichment': WORKBENCH,
	'/records': WORKBENCH,
	'/settings': WORKBENCH,
	'/tracks': WORKBENCH,
	'/login': SIGNED_OUT,
	'/signup': SIGNED_OUT,
	'/reset-password': SIGNED_OUT,
	'/update-password': AUTH,
	'/auth/check-inbox': AUTH,
	'/auth/confirm': AUTH,
	'/auth/finalising': AUTH,
	'/privacy': PUBLIC,
	'/terms': PUBLIC
}

/** Match Vue Router's static-route case and optional trailing slash policy.
 * Only classify the pathname; keep the original URL and its query/hash intact.
 */
export function getRoutePolicy(pathname: string): RoutePolicy {
	const path = pathname.replace(/\/$/, '').toLowerCase() || '/'
	if (path === '/demo' || path.startsWith('/demo/')) return PUBLIC
	return Object.hasOwn(ROUTES, path) ? ROUTES[path]! : PROTECTED
}
