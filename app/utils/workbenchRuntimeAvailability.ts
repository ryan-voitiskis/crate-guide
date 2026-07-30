const CLOUD_WORKBENCH_ROUTES = new Set([
	'/',
	'/crates',
	'/enrichment',
	'/records',
	'/settings',
	'/tracks'
])

/** Keeps Cloud transports out of Demo, public, and future Local entry paths. */
export function requiresCloudWorkbenchRuntime(path: string): boolean {
	return CLOUD_WORKBENCH_ROUTES.has(path)
}
