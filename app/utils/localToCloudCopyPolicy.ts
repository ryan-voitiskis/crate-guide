/** A server-issued identifier that this policy treats only as an opaque token. */
export type OpaqueMigrationId = string

export type CopySourceReference = Readonly<{
	workspaceId: string
	contentRevision: number
}>

export type CopyOperationReference = Readonly<{
	migrationId: OpaqueMigrationId
	source: CopySourceReference
}>

export type DeterministicReadBackVerification =
	| Readonly<{ state: 'not-run' }>
	| Readonly<{
			state: 'matched' | 'mismatch'
			method: 'deterministic-read-back'
	  }>

export type LocalToCloudCopyReceipt =
	| Readonly<{
			phase: 'staging'
			migrationId: OpaqueMigrationId
			source: CopySourceReference
	  }>
	| Readonly<{
			phase: 'metadata-finalized'
			migrationId: OpaqueMigrationId
			frozenSource: CopySourceReference
			metadataGraph: 'valid'
			covers: 'pending' | 'complete' | 'retryable-partial'
			verification: DeterministicReadBackVerification
	  }>
	| Readonly<{
			phase: 'aborted' | 'expired'
			migrationId: OpaqueMigrationId
			source: CopySourceReference
	  }>

export type LocalToCloudCopySnapshot = Readonly<{
	operation: CopyOperationReference
	receipt: LocalToCloudCopyReceipt
	currentSource: CopySourceReference
	ownership: 'owned' | 'account-mismatch' | 'unresolved'
	destination: 'proven-empty' | 'receipt-metadata' | 'nonempty' | 'unknown'
	writeState: 'settled' | 'ambiguous'
	localDeletionConfirmation: 'not-confirmed' | 'confirmed-after-verification'
}>

export type LocalToCloudCopyBlocker =
	| 'invalid-state'
	| 'migration-mismatch'
	| 'account-mismatch'
	| 'ownership-unresolved'
	| 'source-mismatch'
	| 'receipt-aborted'
	| 'receipt-expired'
	| 'nonempty-destination'
	| 'destination-unproven'
	| 'ambiguous-write'
	| 'verification-mismatch'
	| 'local-deletion-confirmed-before-verification'

export type LocalToCloudCopyAction =
	| 'continue-metadata-staging'
	| 'owned-abort'
	| 'restart-after-owned-abort'
	| 'continue-cover-copy'
	| 'retry-covers'
	| 'run-deterministic-read-back'

export type LocalDeletionPolicy = Readonly<{
	automatic: false
	permission:
		| 'not-permitted'
		| 'requires-separate-confirmation'
		| 'permitted-after-separate-confirmation'
}>

type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

type RetainedLocalPolicy = Readonly<{
	automatic: false
	permission: 'not-permitted'
}>

type VerifiedLocalDeletionPolicy = Readonly<{
	automatic: false
	permission:
		'requires-separate-confirmation' | 'permitted-after-separate-confirmation'
}>

export type LocalToCloudCopyDecision =
	| Readonly<{
			status: 'blocked'
			blockers: NonEmptyReadonlyArray<LocalToCloudCopyBlocker>
			actions: readonly []
			offerWorkspaceSwitch: false
			restartPolicy: 'not-available'
			localDeletion: RetainedLocalPolicy
			sourceChange: 'none'
	  }>
	| Readonly<{
			status: 'paused-source-changed'
			blockers: readonly []
			actions: readonly ['owned-abort', 'restart-after-owned-abort']
			offerWorkspaceSwitch: false
			restartPolicy: 'owned-abort-and-restart-required'
			destinationRequirement: 'must-remain-proven-empty'
			localDeletion: RetainedLocalPolicy
			sourceChange: 'none'
	  }>
	| Readonly<{
			status: 'in-progress'
			phase: 'metadata-staging'
			blockers: readonly []
			actions: readonly ['continue-metadata-staging']
			offerWorkspaceSwitch: false
			restartPolicy: 'not-required-before-finalization'
			localDeletion: RetainedLocalPolicy
			sourceChange: 'none'
	  }>
	| Readonly<{
			status: 'in-progress'
			phase: 'cover-copy'
			blockers: readonly []
			actions: readonly ['continue-cover-copy']
			offerWorkspaceSwitch: false
			restartPolicy: 'forbidden-after-finalization'
			localDeletion: RetainedLocalPolicy
			sourceChange: 'none' | 'changes-not-copied'
	  }>
	| Readonly<{
			status: 'awaiting-verification'
			covers: 'complete' | 'retryable-partial'
			blockers: readonly []
			actions:
				| readonly ['run-deterministic-read-back']
				| readonly ['retry-covers', 'run-deterministic-read-back']
			offerWorkspaceSwitch: false
			restartPolicy: 'forbidden-after-finalization'
			localDeletion: RetainedLocalPolicy
			sourceChange: 'none' | 'changes-not-copied'
	  }>
	| Readonly<{
			status: 'verified'
			covers: 'complete' | 'retryable-partial'
			blockers: readonly []
			actions: readonly [] | readonly ['retry-covers']
			offerWorkspaceSwitch: true
			restartPolicy: 'forbidden-after-finalization'
			localDeletion: VerifiedLocalDeletionPolicy
			sourceChange: 'none' | 'changes-not-copied'
	  }>

const OWNERSHIP_STATES = new Set<LocalToCloudCopySnapshot['ownership']>([
	'owned',
	'account-mismatch',
	'unresolved'
])
const DESTINATION_STATES = new Set<LocalToCloudCopySnapshot['destination']>([
	'proven-empty',
	'receipt-metadata',
	'nonempty',
	'unknown'
])
const WRITE_STATES = new Set<LocalToCloudCopySnapshot['writeState']>([
	'settled',
	'ambiguous'
])
const LOCAL_DELETION_CONFIRMATIONS = new Set<
	LocalToCloudCopySnapshot['localDeletionConfirmation']
>(['not-confirmed', 'confirmed-after-verification'])

const RETAIN_LOCAL: RetainedLocalPolicy = Object.freeze({
	automatic: false,
	permission: 'not-permitted'
})

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOpaqueToken(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isContentRevision(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0
}

function isSourceReference(value: unknown): value is CopySourceReference {
	return (
		isRecord(value) &&
		isOpaqueToken(value.workspaceId) &&
		isContentRevision(value.contentRevision)
	)
}

function isOperationReference(value: unknown): value is CopyOperationReference {
	return (
		isRecord(value) &&
		isOpaqueToken(value.migrationId) &&
		isSourceReference(value.source)
	)
}

function isVerification(
	value: unknown
): value is DeterministicReadBackVerification {
	if (!isRecord(value)) return false
	if (value.state === 'not-run') return true
	return (
		(value.state === 'matched' || value.state === 'mismatch') &&
		value.method === 'deterministic-read-back'
	)
}

function isReceipt(value: unknown): value is LocalToCloudCopyReceipt {
	if (!isRecord(value) || !isOpaqueToken(value.migrationId)) return false
	if (
		value.phase === 'staging' ||
		value.phase === 'aborted' ||
		value.phase === 'expired'
	) {
		return isSourceReference(value.source)
	}
	return (
		value.phase === 'metadata-finalized' &&
		isSourceReference(value.frozenSource) &&
		value.metadataGraph === 'valid' &&
		['pending', 'complete', 'retryable-partial'].includes(
			String(value.covers)
		) &&
		isVerification(value.verification)
	)
}

function isSnapshot(value: unknown): value is LocalToCloudCopySnapshot {
	return (
		isRecord(value) &&
		isOperationReference(value.operation) &&
		isReceipt(value.receipt) &&
		isSourceReference(value.currentSource) &&
		OWNERSHIP_STATES.has(
			value.ownership as LocalToCloudCopySnapshot['ownership']
		) &&
		DESTINATION_STATES.has(
			value.destination as LocalToCloudCopySnapshot['destination']
		) &&
		WRITE_STATES.has(
			value.writeState as LocalToCloudCopySnapshot['writeState']
		) &&
		LOCAL_DELETION_CONFIRMATIONS.has(
			value.localDeletionConfirmation as LocalToCloudCopySnapshot['localDeletionConfirmation']
		)
	)
}

function sameSource(
	left: CopySourceReference,
	right: CopySourceReference
): boolean {
	return (
		left.workspaceId === right.workspaceId &&
		left.contentRevision === right.contentRevision
	)
}

function receiptSource(receipt: LocalToCloudCopyReceipt): CopySourceReference {
	return receipt.phase === 'metadata-finalized'
		? receipt.frozenSource
		: receipt.source
}

function blocked(
	blockers: NonEmptyReadonlyArray<LocalToCloudCopyBlocker>
): LocalToCloudCopyDecision {
	return {
		status: 'blocked',
		blockers,
		actions: [],
		offerWorkspaceSwitch: false,
		restartPolicy: 'not-available',
		localDeletion: RETAIN_LOCAL,
		sourceChange: 'none'
	}
}

function collectBlockers(
	snapshot: LocalToCloudCopySnapshot
): LocalToCloudCopyBlocker[] {
	const blockers: LocalToCloudCopyBlocker[] = []
	const { operation, receipt } = snapshot

	if (operation.migrationId !== receipt.migrationId) {
		blockers.push('migration-mismatch')
	}
	if (!sameSource(operation.source, receiptSource(receipt))) {
		blockers.push('source-mismatch')
	}
	if (snapshot.ownership === 'account-mismatch') {
		blockers.push('account-mismatch')
	} else if (snapshot.ownership === 'unresolved') {
		blockers.push('ownership-unresolved')
	}
	if (receipt.phase === 'aborted') blockers.push('receipt-aborted')
	if (receipt.phase === 'expired') blockers.push('receipt-expired')
	if (snapshot.destination === 'nonempty') {
		blockers.push('nonempty-destination')
	} else if (snapshot.destination === 'unknown') {
		blockers.push('destination-unproven')
	}
	if (snapshot.writeState === 'ambiguous') blockers.push('ambiguous-write')

	if (receipt.phase === 'staging') {
		if (snapshot.destination !== 'proven-empty') {
			if (
				snapshot.destination !== 'nonempty' &&
				snapshot.destination !== 'unknown'
			) {
				blockers.push('invalid-state')
			}
		}
	} else if (receipt.phase === 'metadata-finalized') {
		if (snapshot.destination !== 'receipt-metadata') {
			if (
				snapshot.destination !== 'nonempty' &&
				snapshot.destination !== 'unknown'
			) {
				blockers.push('invalid-state')
			}
		}
		if (receipt.verification.state === 'mismatch') {
			blockers.push('verification-mismatch')
		}
		if (
			receipt.covers === 'pending' &&
			receipt.verification.state === 'matched'
		) {
			blockers.push('invalid-state')
		}
		if (
			snapshot.currentSource.workspaceId !== receipt.frozenSource.workspaceId
		) {
			blockers.push('source-mismatch')
		} else if (
			snapshot.currentSource.contentRevision <
			receipt.frozenSource.contentRevision
		) {
			blockers.push('source-mismatch')
		}
	}

	const verified =
		receipt.phase === 'metadata-finalized' &&
		receipt.verification.state === 'matched' &&
		receipt.covers !== 'pending'
	if (
		snapshot.localDeletionConfirmation === 'confirmed-after-verification' &&
		!verified
	) {
		blockers.push('local-deletion-confirmed-before-verification')
	}

	return [...new Set(blockers)]
}

/**
 * Decides the next safe orchestration step without reading or mutating either
 * workspace. The receipt is authoritative only after ownership, source, and
 * destination checks pass.
 */
export function decideLocalToCloudCopyLifecycle(
	snapshot: LocalToCloudCopySnapshot
): LocalToCloudCopyDecision {
	if (!isSnapshot(snapshot)) return blocked(['invalid-state'])

	const blockers = collectBlockers(snapshot)
	const firstBlocker = blockers[0]
	if (firstBlocker !== undefined) {
		return blocked([firstBlocker, ...blockers.slice(1)])
	}

	const { receipt } = snapshot
	if (receipt.phase !== 'staging' && receipt.phase !== 'metadata-finalized') {
		return blocked([
			receipt.phase === 'aborted' ? 'receipt-aborted' : 'receipt-expired'
		])
	}

	if (receipt.phase === 'staging') {
		if (!sameSource(snapshot.currentSource, receipt.source)) {
			return {
				status: 'paused-source-changed',
				blockers: [],
				actions: ['owned-abort', 'restart-after-owned-abort'],
				offerWorkspaceSwitch: false,
				restartPolicy: 'owned-abort-and-restart-required',
				destinationRequirement: 'must-remain-proven-empty',
				localDeletion: RETAIN_LOCAL,
				sourceChange: 'none'
			}
		}
		return {
			status: 'in-progress',
			phase: 'metadata-staging',
			blockers: [],
			actions: ['continue-metadata-staging'],
			offerWorkspaceSwitch: false,
			restartPolicy: 'not-required-before-finalization',
			localDeletion: RETAIN_LOCAL,
			sourceChange: 'none'
		}
	}

	const sourceChange =
		snapshot.currentSource.contentRevision >
		receipt.frozenSource.contentRevision
			? 'changes-not-copied'
			: 'none'

	if (receipt.covers === 'pending') {
		return {
			status: 'in-progress',
			phase: 'cover-copy',
			blockers: [],
			actions: ['continue-cover-copy'],
			offerWorkspaceSwitch: false,
			restartPolicy: 'forbidden-after-finalization',
			localDeletion: RETAIN_LOCAL,
			sourceChange
		}
	}

	if (receipt.verification.state === 'not-run') {
		return {
			status: 'awaiting-verification',
			covers: receipt.covers,
			blockers: [],
			actions:
				receipt.covers === 'retryable-partial'
					? ['retry-covers', 'run-deterministic-read-back']
					: ['run-deterministic-read-back'],
			offerWorkspaceSwitch: false,
			restartPolicy: 'forbidden-after-finalization',
			localDeletion: RETAIN_LOCAL,
			sourceChange
		}
	}

	const localDeletion: VerifiedLocalDeletionPolicy = {
		automatic: false,
		permission:
			snapshot.localDeletionConfirmation === 'confirmed-after-verification'
				? 'permitted-after-separate-confirmation'
				: 'requires-separate-confirmation'
	}
	return {
		status: 'verified',
		covers: receipt.covers,
		blockers: [],
		actions: receipt.covers === 'retryable-partial' ? ['retry-covers'] : [],
		offerWorkspaceSwitch: true,
		restartPolicy: 'forbidden-after-finalization',
		localDeletion,
		sourceChange
	}
}
