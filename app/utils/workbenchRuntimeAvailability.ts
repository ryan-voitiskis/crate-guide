import { getRoutePolicy } from './routePolicy'

/** Keeps Cloud transports out of Demo, public, and future Local entry paths. */
export function requiresCloudWorkbenchRuntime(path: string): boolean {
	return getRoutePolicy(path).cloudWorkbench
}
