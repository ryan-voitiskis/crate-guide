export type WorkspaceStatusLocation = 'browser' | 'cloud' | 'demo'

export type WorkspaceConnectivity = 'online' | 'offline'

export type WorkspaceStatusInput = Readonly<{
	location: WorkspaceStatusLocation
	connectivity: WorkspaceConnectivity
}>

export type WorkspaceLocationSignal =
	| Readonly<{ state: 'browser'; label: 'This browser' }>
	| Readonly<{ state: 'cloud'; label: 'Cloud library' }>
	| Readonly<{ state: 'demo'; label: 'Demo' }>

export type WorkspaceBackupSignal =
	| Readonly<{ state: 'not-backed-up'; label: 'Not backed up' }>
	| Readonly<{ state: 'export-recommended'; label: 'Export recommended' }>
	| Readonly<{ state: 'read-only'; label: 'Read-only' }>

export type WorkspaceConnectivitySignal =
	| Readonly<{ state: 'online'; label: 'Online' }>
	| Readonly<{ state: 'offline'; label: 'Offline' }>
	| Readonly<{
			state: 'offline-unavailable'
			label: 'Offline — unavailable'
	  }>

export type WorkspaceStatusBehavior =
	| Readonly<{
			availability: 'usable'
			writes: 'local' | 'cloud' | 'read-only'
			queuedWrites: false
	  }>
	| Readonly<{
			availability: 'unavailable'
			writes: 'unavailable'
			queuedWrites: false
	  }>

type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

export type WorkspaceStatusPresentation = Readonly<{
	status: 'known'
	location: WorkspaceLocationSignal
	backup: WorkspaceBackupSignal
	connectivity: WorkspaceConnectivitySignal
	behavior: WorkspaceStatusBehavior
}>

export type WorkspaceStatusPresentationIssue =
	'invalid-input' | 'invalid-location' | 'invalid-connectivity'

export type WorkspaceStatusPresentationResult =
	| WorkspaceStatusPresentation
	| Readonly<{
			status: 'invalid'
			presentation: null
			issues: NonEmptyReadonlyArray<WorkspaceStatusPresentationIssue>
			behavior: Readonly<{
				availability: 'unavailable'
				writes: 'unavailable'
				queuedWrites: false
			}>
	  }>

const LOCATIONS = new Set<WorkspaceStatusLocation>(['browser', 'cloud', 'demo'])
const CONNECTIVITY_STATES = new Set<WorkspaceConnectivity>([
	'online',
	'offline'
])

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidPresentation(
	issues: NonEmptyReadonlyArray<WorkspaceStatusPresentationIssue>
): WorkspaceStatusPresentationResult {
	return {
		status: 'invalid',
		presentation: null,
		issues,
		behavior: {
			availability: 'unavailable',
			writes: 'unavailable',
			queuedWrites: false
		}
	}
}

function getLocationSignals(location: WorkspaceStatusLocation): Readonly<{
	location: WorkspaceLocationSignal
	backup: WorkspaceBackupSignal
}> {
	if (location === 'browser') {
		return {
			location: { state: 'browser', label: 'This browser' },
			backup: { state: 'not-backed-up', label: 'Not backed up' }
		}
	}
	if (location === 'cloud') {
		return {
			location: { state: 'cloud', label: 'Cloud library' },
			backup: { state: 'export-recommended', label: 'Export recommended' }
		}
	}
	return {
		location: { state: 'demo', label: 'Demo' },
		backup: { state: 'read-only', label: 'Read-only' }
	}
}

/**
 * Builds the three simultaneous workspace status signals. Authentication is
 * deliberately absent: identity cannot change the active library's location or
 * backup meaning. This function neither probes connectivity nor queues writes.
 */
export function buildWorkspaceStatusPresentation(
	input: WorkspaceStatusInput
): WorkspaceStatusPresentationResult {
	if (!isRecord(input)) return invalidPresentation(['invalid-input'])

	const issues: WorkspaceStatusPresentationIssue[] = []
	if (!LOCATIONS.has(input.location as WorkspaceStatusLocation)) {
		issues.push('invalid-location')
	}
	if (!CONNECTIVITY_STATES.has(input.connectivity as WorkspaceConnectivity)) {
		issues.push('invalid-connectivity')
	}
	const firstIssue = issues[0]
	if (firstIssue !== undefined) {
		return invalidPresentation([firstIssue, ...issues.slice(1)])
	}

	const location = input.location as WorkspaceStatusLocation
	const connectivity = input.connectivity as WorkspaceConnectivity
	const signals = getLocationSignals(location)

	if (location === 'cloud' && connectivity === 'offline') {
		return {
			status: 'known',
			...signals,
			connectivity: {
				state: 'offline-unavailable',
				label: 'Offline — unavailable'
			},
			behavior: {
				availability: 'unavailable',
				writes: 'unavailable',
				queuedWrites: false
			}
		}
	}

	return {
		status: 'known',
		...signals,
		connectivity:
			connectivity === 'online'
				? { state: 'online', label: 'Online' }
				: { state: 'offline', label: 'Offline' },
		behavior: {
			availability: 'usable',
			writes:
				location === 'browser'
					? 'local'
					: location === 'cloud'
						? 'cloud'
						: 'read-only',
			queuedWrites: false
		}
	}
}
