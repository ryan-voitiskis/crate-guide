export const WORKSPACE_ACTIVATION_SEQUENCE = Object.freeze([
	'close-global-ui',
	'invalidate-outgoing-operation-generation',
	'revoke-outgoing-object-urls',
	'activate-next-repository'
] as const)

export type WorkspaceTransitionWorkflowKind =
	| 'enrichment'
	| 'import'
	| 'audio-analysis'

export type WorkspaceTransitionAtomicOperationKind =
	| 'export'
	| 'restore'
	| 'copy'
	| 'delete'
	| 'schema-upgrade'

export type WorkspaceTransitionWorkflow =
	| Readonly<{
			kind: WorkspaceTransitionWorkflowKind
			state: 'active'
			draft: 'valid-supported' | 'unavailable'
	  }>
	| Readonly<{
			kind: WorkspaceTransitionWorkflowKind
			state: 'settling'
	  }>

export type WorkspaceTransitionAtomicOperation = Readonly<{
	kind: WorkspaceTransitionAtomicOperationKind
	phase: 'atomic' | 'cancellable' | 'cleanup'
}>

export type WorkspaceTransitionSnapshot = Readonly<{
	repositoryWrite: 'idle' | 'pending-owned' | 'ambiguous'
	editor:
		| Readonly<{ state: 'clean' }>
		| Readonly<{ state: 'dirty'; surface: 'editor' | 'create-dialog' }>
	unsavedSession:
		| Readonly<{ state: 'none' }>
		| Readonly<{ state: 'unsaved'; kind: 'session' | 'set' }>
	workflows: readonly WorkspaceTransitionWorkflow[]
	atomicOperations: readonly WorkspaceTransitionAtomicOperation[]
}>

export type WorkspaceTransitionBlocker =
	| Readonly<{
			work: 'repository-write'
			reason: 'pending-owned-write'
			requirement: 'await-owned-success-or-failure'
	  }>
	| Readonly<{
			work: 'repository-write'
			reason: 'ambiguous-write'
			requirement: 'preserve-and-resolve-ambiguous-write'
	  }>
	| Readonly<{
			work: WorkspaceTransitionWorkflowKind
			reason: 'workflow-settling'
			requirement: 'await-worker-or-operation-settlement'
	  }>
	| Readonly<{
			work: WorkspaceTransitionAtomicOperationKind
			reason: 'atomic-phase'
			requirement: 'await-atomic-phase-settlement'
	  }>
	| Readonly<{
			work: WorkspaceTransitionAtomicOperationKind
			reason: 'cleanup-in-progress'
			requirement: 'await-rollback-or-cleanup'
	  }>
	| Readonly<{
			work: 'transition-state'
			reason: 'invalid-state'
			requirement: 'fail-closed'
	  }>

export type WorkspaceTransitionResolution =
	| Readonly<{
			work: 'dirty-editor' | 'dirty-create-dialog'
			choices: readonly ['stay', 'discard']
			implicitSave: 'forbidden'
	  }>
	| Readonly<{
			work: 'unsaved-session' | 'unsaved-set'
			choices: readonly ['save', 'discard', 'cancel']
			activation: 'after-choice-settles'
	  }>
	| Readonly<{
			work: WorkspaceTransitionWorkflowKind
			choices:
				| readonly ['save-draft', 'cancel-operation', 'stay']
				| readonly ['cancel-operation', 'stay']
			settlement: 'required-before-activation'
	  }>
	| Readonly<{
			work: WorkspaceTransitionAtomicOperationKind
			choices: readonly ['cancel-operation', 'stay']
			settlement: 'rollback-or-cleanup-required-before-activation'
	  }>

type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

function toNonEmptyArray<T>(
	values: readonly T[]
): NonEmptyReadonlyArray<T> | null {
	const first = values[0]
	return first === undefined ? null : [first, ...values.slice(1)]
}

export type WorkspaceTransitionDecision =
	| Readonly<{
			status: 'ready'
			blockers: readonly []
			resolutions: readonly []
			activationSequence: typeof WORKSPACE_ACTIVATION_SEQUENCE
	  }>
	| Readonly<{
			status: 'blocked'
			blockers: NonEmptyReadonlyArray<WorkspaceTransitionBlocker>
			resolutions: readonly WorkspaceTransitionResolution[]
			activationSequence: readonly []
	  }>
	| Readonly<{
			status: 'requires-resolution'
			blockers: readonly []
			resolutions: NonEmptyReadonlyArray<WorkspaceTransitionResolution>
			activationSequence: readonly []
	  }>

const WORKFLOW_KINDS = new Set<WorkspaceTransitionWorkflowKind>([
	'enrichment',
	'import',
	'audio-analysis'
])
const ATOMIC_OPERATION_KINDS = new Set<WorkspaceTransitionAtomicOperationKind>([
	'export',
	'restore',
	'copy',
	'delete',
	'schema-upgrade'
])

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function hasUniqueKinds(values: readonly { kind: string }[]): boolean {
	return new Set(values.map(({ kind }) => kind)).size === values.length
}

function isValidWorkflow(value: unknown): value is WorkspaceTransitionWorkflow {
	if (
		!isRecord(value) ||
		!WORKFLOW_KINDS.has(value.kind as WorkspaceTransitionWorkflowKind)
	)
		return false
	if (value.state === 'settling') return true
	return (
		value.state === 'active' &&
		(value.draft === 'valid-supported' || value.draft === 'unavailable')
	)
}

function isValidAtomicOperation(
	value: unknown
): value is WorkspaceTransitionAtomicOperation {
	return (
		isRecord(value) &&
		ATOMIC_OPERATION_KINDS.has(
			value.kind as WorkspaceTransitionAtomicOperationKind
		) &&
		['atomic', 'cancellable', 'cleanup'].includes(String(value.phase))
	)
}

function isValidTransitionSnapshot(
	value: unknown
): value is WorkspaceTransitionSnapshot {
	if (!isRecord(value)) return false
	if (
		!['idle', 'pending-owned', 'ambiguous'].includes(
			String(value.repositoryWrite)
		)
	)
		return false
	if (!isRecord(value.editor)) return false
	if (
		value.editor.state !== 'clean' &&
		!(
			value.editor.state === 'dirty' &&
			(value.editor.surface === 'editor' ||
				value.editor.surface === 'create-dialog')
		)
	)
		return false
	if (!isRecord(value.unsavedSession)) return false
	if (
		value.unsavedSession.state !== 'none' &&
		!(
			value.unsavedSession.state === 'unsaved' &&
			(value.unsavedSession.kind === 'session' ||
				value.unsavedSession.kind === 'set')
		)
	)
		return false
	if (
		!Array.isArray(value.workflows) ||
		!value.workflows.every(isValidWorkflow)
	)
		return false
	if (
		!Array.isArray(value.atomicOperations) ||
		!value.atomicOperations.every(isValidAtomicOperation)
	)
		return false
	return (
		hasUniqueKinds(value.workflows) && hasUniqueKinds(value.atomicOperations)
	)
}

function invalidStateDecision(): WorkspaceTransitionDecision {
	return {
		status: 'blocked',
		activationSequence: [],
		blockers: [
			{
				work: 'transition-state',
				reason: 'invalid-state',
				requirement: 'fail-closed'
			}
		],
		resolutions: []
	}
}

/**
 * Decide whether a workspace activation may proceed. This function performs no
 * cancellation, persistence, cleanup, URL revocation, or repository activation.
 */
export function decideWorkspaceTransition(
	snapshot: WorkspaceTransitionSnapshot
): WorkspaceTransitionDecision {
	if (!isValidTransitionSnapshot(snapshot)) return invalidStateDecision()

	const blockers: WorkspaceTransitionBlocker[] = []
	const resolutions: WorkspaceTransitionResolution[] = []

	if (snapshot.repositoryWrite === 'pending-owned') {
		blockers.push({
			work: 'repository-write',
			reason: 'pending-owned-write',
			requirement: 'await-owned-success-or-failure'
		})
	} else if (snapshot.repositoryWrite === 'ambiguous') {
		blockers.push({
			work: 'repository-write',
			reason: 'ambiguous-write',
			requirement: 'preserve-and-resolve-ambiguous-write'
		})
	}

	if (snapshot.editor.state === 'dirty') {
		resolutions.push({
			work:
				snapshot.editor.surface === 'editor'
					? 'dirty-editor'
					: 'dirty-create-dialog',
			choices: ['stay', 'discard'],
			implicitSave: 'forbidden'
		})
	}

	if (snapshot.unsavedSession.state === 'unsaved') {
		resolutions.push({
			work:
				snapshot.unsavedSession.kind === 'session'
					? 'unsaved-session'
					: 'unsaved-set',
			choices: ['save', 'discard', 'cancel'],
			activation: 'after-choice-settles'
		})
	}

	for (const workflow of snapshot.workflows) {
		if (workflow.state === 'settling') {
			blockers.push({
				work: workflow.kind,
				reason: 'workflow-settling',
				requirement: 'await-worker-or-operation-settlement'
			})
			continue
		}
		resolutions.push({
			work: workflow.kind,
			choices:
				workflow.draft === 'valid-supported'
					? ['save-draft', 'cancel-operation', 'stay']
					: ['cancel-operation', 'stay'],
			settlement: 'required-before-activation'
		})
	}

	for (const operation of snapshot.atomicOperations) {
		if (operation.phase === 'atomic') {
			blockers.push({
				work: operation.kind,
				reason: 'atomic-phase',
				requirement: 'await-atomic-phase-settlement'
			})
		} else if (operation.phase === 'cleanup') {
			blockers.push({
				work: operation.kind,
				reason: 'cleanup-in-progress',
				requirement: 'await-rollback-or-cleanup'
			})
		} else {
			resolutions.push({
				work: operation.kind,
				choices: ['cancel-operation', 'stay'],
				settlement: 'rollback-or-cleanup-required-before-activation'
			})
		}
	}

	const nonEmptyBlockers = toNonEmptyArray(blockers)
	if (nonEmptyBlockers) {
		return {
			status: 'blocked',
			activationSequence: [],
			blockers: nonEmptyBlockers,
			resolutions
		}
	}
	const nonEmptyResolutions = toNonEmptyArray(resolutions)
	if (nonEmptyResolutions) {
		return {
			status: 'requires-resolution',
			activationSequence: [],
			blockers: [],
			resolutions: nonEmptyResolutions
		}
	}
	return {
		status: 'ready',
		activationSequence: WORKSPACE_ACTIVATION_SEQUENCE,
		blockers: [],
		resolutions: []
	}
}
