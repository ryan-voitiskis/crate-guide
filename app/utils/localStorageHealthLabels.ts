export type LocalStoragePersistenceOutcome =
	| 'granted'
	| 'not-granted'
	| 'unsupported'
	| 'error'
	| 'not-requested'

export type LocalStorageEstimateOutcome =
	| Readonly<{
			status: 'available'
			usageBytes: number
			quotaBytes: number
	  }>
	| Readonly<{
			status: 'unsupported' | 'error' | 'not-requested'
	  }>

export type LocalStorageHealthInput = Readonly<{
	persistence: LocalStoragePersistenceOutcome
	estimate: LocalStorageEstimateOutcome
}>

export type LocalStorageHealthLabels = Readonly<{
	cleanupProtection:
		| Readonly<{
				state: 'protected'
				label: 'Protected from automatic cleanup'
		  }>
		| Readonly<{
				state: 'browser-managed'
				label: 'Browser-managed'
		  }>
		| Readonly<{
				state: 'unknown'
				label: 'Unknown'
		  }>
	estimate:
		| Readonly<{
				state: 'available'
				label: 'Approximate usage and quota'
				usageBytes: number
				quotaBytes: number
				usageRatio: number | null
		  }>
		| Readonly<{
				state: 'unknown'
				label: 'Storage estimate unavailable'
				reason: 'unsupported' | 'error' | 'not-requested' | 'invalid-estimate'
		  }>
	durabilityBoundary: 'Does not protect against manual site-data clearing or device/profile loss.'
	nextWritePrediction: 'not-supported'
}>

const PERSISTENCE_OUTCOMES = new Set<LocalStoragePersistenceOutcome>([
	'granted',
	'not-granted',
	'unsupported',
	'error',
	'not-requested'
])

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function cleanupProtectionLabel(
	outcome: unknown
): LocalStorageHealthLabels['cleanupProtection'] {
	if (outcome === 'granted') {
		return {
			state: 'protected',
			label: 'Protected from automatic cleanup'
		}
	}
	if (outcome === 'not-granted') {
		return { state: 'browser-managed', label: 'Browser-managed' }
	}
	return { state: 'unknown', label: 'Unknown' }
}

function isValidByteEstimate(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function storageEstimateLabel(
	outcome: unknown
): LocalStorageHealthLabels['estimate'] {
	if (!isRecord(outcome)) {
		return {
			state: 'unknown',
			label: 'Storage estimate unavailable',
			reason: 'invalid-estimate'
		}
	}
	if (outcome.status !== 'available') {
		const reason = ['unsupported', 'error', 'not-requested'].includes(
			String(outcome.status)
		)
			? (outcome.status as 'unsupported' | 'error' | 'not-requested')
			: 'invalid-estimate'
		return {
			state: 'unknown',
			label: 'Storage estimate unavailable',
			reason
		}
	}
	if (
		!isValidByteEstimate(outcome.usageBytes) ||
		!isValidByteEstimate(outcome.quotaBytes) ||
		outcome.usageBytes > outcome.quotaBytes
	) {
		return {
			state: 'unknown',
			label: 'Storage estimate unavailable',
			reason: 'invalid-estimate'
		}
	}
	return {
		state: 'available',
		label: 'Approximate usage and quota',
		usageBytes: outcome.usageBytes,
		quotaBytes: outcome.quotaBytes,
		usageRatio:
			outcome.quotaBytes === 0 ? null : outcome.usageBytes / outcome.quotaBytes
	}
}

/**
 * Convert observed Storage API capability outcomes into truthful labels. The
 * result is descriptive only and must not be used to predict the next write.
 */
export function buildLocalStorageHealthLabels(
	input: LocalStorageHealthInput
): LocalStorageHealthLabels {
	const persistence =
		isRecord(input) &&
		PERSISTENCE_OUTCOMES.has(
			input.persistence as LocalStoragePersistenceOutcome
		)
			? input.persistence
			: null
	return {
		cleanupProtection: cleanupProtectionLabel(persistence),
		estimate: storageEstimateLabel(isRecord(input) ? input.estimate : null),
		durabilityBoundary:
			'Does not protect against manual site-data clearing or device/profile loss.',
		nextWritePrediction: 'not-supported'
	}
}
