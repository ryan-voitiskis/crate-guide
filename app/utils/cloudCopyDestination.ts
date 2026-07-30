export const CLOUD_COPY_GRAPH_COUNT_KEYS = [
	'records',
	'tracks',
	'crates',
	'sets',
	'managedCoverReferences',
	'managedCoverObjects',
	'activeCopyReceipts',
	'finalizedCopyReceipts'
] as const

export type CloudCopyGraphCountKey =
	(typeof CLOUD_COPY_GRAPH_COUNT_KEYS)[number]

export type CloudCopyGraphCounts = Record<CloudCopyGraphCountKey, number>

export type CloudCopyDestinationInspection =
	| Readonly<{ state: 'offline' }>
	| Readonly<{ state: 'error' }>
	| Readonly<{
			state: 'complete'
			counts: Readonly<CloudCopyGraphCounts>
	  }>

export type CloudCopyDestinationChoice =
	| 'copy-local-to-cloud'
	| 'open-empty-cloud'
	| 'continue-local'
	| 'open-cloud'
	| 'export-local'
	| 'export-cloud'
	| 'retry-inspection'

type CloudCopySafetyBoundary = Readonly<{
	preserveActiveWorkspace: 'local'
	automaticUpload: 'forbidden'
	automaticSwitch: 'forbidden'
	automaticMerge: 'unavailable'
}>

export type CloudCopyDestinationDecision =
	| (CloudCopySafetyBoundary &
			Readonly<{
				status: 'inspection-unavailable'
				reason: 'offline' | 'inspection-error' | 'invalid-inspection'
				choices: readonly ['continue-local', 'retry-inspection']
			}>)
	| (CloudCopySafetyBoundary &
			Readonly<{
				status: 'empty'
				counts: Readonly<CloudCopyGraphCounts>
				choices: readonly [
					'copy-local-to-cloud',
					'open-empty-cloud',
					'continue-local'
				]
			}>)
	| (CloudCopySafetyBoundary &
			Readonly<{
				status: 'nonempty'
				counts: Readonly<CloudCopyGraphCounts>
				nonemptyReasons: readonly CloudCopyGraphCountKey[]
				choices: readonly [
					'continue-local',
					'open-cloud',
					'export-local',
					'export-cloud'
				]
			}>)

const safetyBoundary: CloudCopySafetyBoundary = {
	preserveActiveWorkspace: 'local',
	automaticUpload: 'forbidden',
	automaticSwitch: 'forbidden',
	automaticMerge: 'unavailable'
}

function isValidGraphCount(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0
}

function unavailable(
	reason: Extract<
		CloudCopyDestinationDecision,
		{ status: 'inspection-unavailable' }
	>['reason']
): CloudCopyDestinationDecision {
	return {
		...safetyBoundary,
		status: 'inspection-unavailable',
		reason,
		choices: ['continue-local', 'retry-inspection']
	}
}

/**
 * Interprets a complete, identity-authorized destination inspection without
 * uploading, switching workspaces, or loading Cloud data into the active Local
 * repository. Profile and identity rows are deliberately not part of the
 * library-emptiness contract.
 */
export function decideCloudCopyDestination(
	inspection: CloudCopyDestinationInspection
): CloudCopyDestinationDecision {
	if (inspection.state === 'offline') return unavailable('offline')
	if (inspection.state === 'error') return unavailable('inspection-error')

	if (
		CLOUD_COPY_GRAPH_COUNT_KEYS.some(
			(key) => !isValidGraphCount(inspection.counts[key])
		)
	) {
		return unavailable('invalid-inspection')
	}

	const nonemptyReasons = CLOUD_COPY_GRAPH_COUNT_KEYS.filter(
		(key) => inspection.counts[key] > 0
	)
	if (nonemptyReasons.length === 0) {
		return {
			...safetyBoundary,
			status: 'empty',
			counts: inspection.counts,
			choices: ['copy-local-to-cloud', 'open-empty-cloud', 'continue-local']
		}
	}

	return {
		...safetyBoundary,
		status: 'nonempty',
		counts: inspection.counts,
		nonemptyReasons,
		choices: ['continue-local', 'open-cloud', 'export-local', 'export-cloud']
	}
}
