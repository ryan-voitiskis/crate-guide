import type {
	TrackEnrichmentDraft,
	TrackEnrichmentDraftDecision,
	TrackEnrichmentDraftObservation,
	TrackEnrichmentDraftPartialOutcome,
	TrackEnrichmentDraftProposal,
	TrackEnrichmentDraftSourceKind,
	TrackEnrichmentDraftVersions
} from '~/types/trackEnrichmentDraft'
import {
	type TrackEnrichmentDraftOutcomeDisposition,
	getTrackEnrichmentDraftOutcomeDisposition
} from './trackEnrichmentDraftOutcome'

export type TrackEnrichmentDraftSnapshotMigrator = {
	sourceKind: TrackEnrichmentDraftSourceKind
	fromVersion: string
	toVersion: string
	migrate: (snapshot: {
		datasetFingerprint: string
		observations: readonly TrackEnrichmentDraftObservation[]
	}) =>
		| {
				datasetFingerprint: string
				observations: TrackEnrichmentDraftObservation[]
		  }
		| Promise<{
				datasetFingerprint: string
				observations: TrackEnrichmentDraftObservation[]
		  }>
}

export type TrackEnrichmentDraftCompatibility = {
	action: 'rematch' | 'migrate-and-rematch' | 'reimport' | 'reconnect'
	canRetainStaging: boolean
	reasons: Array<
		| 'matcher-policy-changed'
		| 'parser-policy-changed'
		| 'snapshot-version-changed'
	>
	migrator: TrackEnrichmentDraftSnapshotMigrator | null
}

/**
 * Decides whether sanitized evidence is usable. A listed migrator is only an
 * explicit compatibility capability; this helper never pretends to re-run a
 * parser or analyzer without the original file.
 */
export function decideTrackEnrichmentDraftCompatibility(input: {
	sourceKind: TrackEnrichmentDraftSourceKind
	stored: TrackEnrichmentDraftVersions
	current: TrackEnrichmentDraftVersions
	migrators?: readonly TrackEnrichmentDraftSnapshotMigrator[]
}): TrackEnrichmentDraftCompatibility {
	const reasons: TrackEnrichmentDraftCompatibility['reasons'] = []
	if (
		input.stored.matcherPolicyVersion !== input.current.matcherPolicyVersion
	) {
		reasons.push('matcher-policy-changed')
	}
	if (input.stored.parserPolicyVersion !== input.current.parserPolicyVersion) {
		reasons.push('parser-policy-changed')
	}
	if (
		input.stored.sanitizedSourceSnapshotVersion ===
		input.current.sanitizedSourceSnapshotVersion
	) {
		return {
			action: 'rematch',
			canRetainStaging: !reasons.includes('matcher-policy-changed'),
			reasons,
			migrator: null
		}
	}

	reasons.push('snapshot-version-changed')
	const migrator =
		input.migrators?.find(
			(candidate) =>
				candidate.sourceKind === input.sourceKind &&
				candidate.fromVersion === input.stored.sanitizedSourceSnapshotVersion &&
				candidate.toVersion === input.current.sanitizedSourceSnapshotVersion
		) ?? null
	if (migrator) {
		return {
			action: 'migrate-and-rematch',
			canRetainStaging: !reasons.includes('matcher-policy-changed'),
			reasons,
			migrator
		}
	}

	return {
		action: input.sourceKind === 'rekordboxXml' ? 'reimport' : 'reconnect',
		canRetainStaging: false,
		reasons,
		migrator: null
	}
}

export type TrackEnrichmentDraftResumeTarget = {
	id: string
	updatedAt: string | null
	bpm: number | null
	key: number | null
	mode: number | null
	currentEvidenceFingerprint: string | null
}

export type TrackEnrichmentDraftResumeClassification =
	| 'retained'
	| 'not-staged'
	| 'unknown-intent'
	| 'policy-changed'
	| 'source-missing'
	| 'source-changed'
	| 'target-deleted'
	| 'no-longer-matching'
	| 'proposal-changed'
	| 'already-filled'
	| 'target-changed'
	| 'evidence-changed'
	| 'preconditions-changed'
	| 'no-longer-stageable'
	| 'unsupported-intent'

export type TrackEnrichmentDraftResumeDecision = {
	classification: TrackEnrichmentDraftResumeClassification
	staged: boolean
}

function proposalsEqual(
	left: TrackEnrichmentDraftProposal,
	right: TrackEnrichmentDraftProposal
): boolean {
	return (
		left.bpm?.value === right.bpm?.value &&
		left.bpm?.source === right.bpm?.source &&
		left.keyMode?.key === right.keyMode?.key &&
		left.keyMode?.mode === right.keyMode?.mode &&
		left.keyMode?.source === right.keyMode?.source
	)
}

/**
 * Restores only a staged approval, never an automatic write. The caller must
 * supply a current-library rematch and current preconditions; no persisted
 * target snapshot is trusted.
 */
export function decideTrackEnrichmentDraftDecisionResume(input: {
	decision: TrackEnrichmentDraftDecision
	currentObservation: TrackEnrichmentDraftObservation | null
	currentTargetByStoredId: TrackEnrichmentDraftResumeTarget | null
	rematchedTargetId: string | null
	currentProposal: TrackEnrichmentDraftProposal
	currentPreconditions: {
		bpmMustBeNull: boolean
		keyModeMustBeNull: boolean
	}
	stageable: boolean
	retentionAllowedByPolicy: boolean
}): TrackEnrichmentDraftResumeDecision {
	const { decision } = input
	if (decision.kind === 'unknown') {
		return { classification: 'unknown-intent', staged: false }
	}
	if (!input.currentObservation) {
		return { classification: 'source-missing', staged: false }
	}
	if (
		decision.sourceBinding.sourceFingerprint !==
			input.currentObservation.sourceFingerprint ||
		decision.sourceBinding.observationFingerprint !==
			input.currentObservation.observationFingerprint ||
		(decision.kind === 'evidence-only' &&
			decision.sourceBinding.sourceSnapshotId !==
				input.currentObservation.sourceSnapshotId)
	) {
		return { classification: 'source-changed', staged: false }
	}
	if (!input.currentTargetByStoredId) {
		return { classification: 'target-deleted', staged: false }
	}
	if (
		input.rematchedTargetId === null ||
		input.rematchedTargetId !== decision.targetBinding.trackId ||
		input.currentTargetByStoredId.id !== decision.targetBinding.trackId
	) {
		return { classification: 'no-longer-matching', staged: false }
	}
	if (decision.kind === 'evidence-only') {
		if (
			decision.preconditionBinding.expectedTargetUpdatedAt !==
			input.currentTargetByStoredId.updatedAt
		) {
			return { classification: 'target-changed', staged: false }
		}
		if (
			decision.preconditionBinding.currentEvidenceFingerprint.digest !==
			input.currentTargetByStoredId.currentEvidenceFingerprint
		) {
			return { classification: 'evidence-changed', staged: false }
		}
		if (!input.retentionAllowedByPolicy) {
			return { classification: 'policy-changed', staged: false }
		}

		// The evidence-only writer gate is intentionally closed. A persisted true
		// value records a prior review request but is never executable approval.
		return { classification: 'unsupported-intent', staged: false }
	}
	if (!proposalsEqual(decision.proposalBinding, input.currentProposal)) {
		return { classification: 'proposal-changed', staged: false }
	}
	if (
		(decision.preconditionBinding.bpmMustBeNull &&
			input.currentTargetByStoredId.bpm !== null) ||
		(decision.preconditionBinding.keyModeMustBeNull &&
			(input.currentTargetByStoredId.key !== null ||
				input.currentTargetByStoredId.mode !== null))
	) {
		return { classification: 'already-filled', staged: false }
	}
	if (
		decision.preconditionBinding.expectedTargetUpdatedAt !==
		input.currentTargetByStoredId.updatedAt
	) {
		return { classification: 'target-changed', staged: false }
	}
	if (
		decision.preconditionBinding.bpmMustBeNull !==
			input.currentPreconditions.bpmMustBeNull ||
		decision.preconditionBinding.keyModeMustBeNull !==
			input.currentPreconditions.keyModeMustBeNull
	) {
		return { classification: 'preconditions-changed', staged: false }
	}
	if (!input.stageable) {
		return { classification: 'no-longer-stageable', staged: false }
	}
	if (!input.retentionAllowedByPolicy) {
		return { classification: 'policy-changed', staged: false }
	}
	if (!decision.staged) {
		return { classification: 'not-staged', staged: false }
	}
	return { classification: 'retained', staged: true }
}

export type TrackEnrichmentDraftResumeSummary = {
	total: number
	retained: number
	unchangedUnstaged: number
	changed: number
	dropped: number
}

const DROPPED_CLASSIFICATIONS =
	new Set<TrackEnrichmentDraftResumeClassification>([
		'unknown-intent',
		'source-missing',
		'target-deleted',
		'no-longer-matching'
	])

export function summarizeTrackEnrichmentDraftResume(
	results: readonly TrackEnrichmentDraftResumeDecision[]
): TrackEnrichmentDraftResumeSummary {
	const summary: TrackEnrichmentDraftResumeSummary = {
		total: results.length,
		retained: 0,
		unchangedUnstaged: 0,
		changed: 0,
		dropped: 0
	}
	for (const result of results) {
		if (result.classification === 'retained') summary.retained++
		else if (result.classification === 'not-staged') summary.unchangedUnstaged++
		else if (DROPPED_CLASSIFICATIONS.has(result.classification))
			summary.dropped++
		else summary.changed++
	}
	return summary
}

export function getTrackEnrichmentDraftPartialOutcomeState(
	outcome: TrackEnrichmentDraftPartialOutcome
): TrackEnrichmentDraftOutcomeDisposition {
	return getTrackEnrichmentDraftOutcomeDisposition(outcome)
}

export function getTrackEnrichmentDraftForWorkspace(
	drafts: readonly TrackEnrichmentDraft[],
	workspace: { workspaceId: string; repositoryId: string }
): TrackEnrichmentDraft | null {
	const matches = drafts.filter(
		(draft) =>
			draft.workspace.workspaceId === workspace.workspaceId &&
			draft.workspace.repositoryId === workspace.repositoryId
	)
	if (matches.length > 1) {
		throw new Error('Multiple enrichment drafts exist for one workspace')
	}
	return matches[0] ?? null
}
