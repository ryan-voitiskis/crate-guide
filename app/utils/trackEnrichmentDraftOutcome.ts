import type { TrackEnrichmentDraftPartialOutcome } from '~/types/trackEnrichmentDraft'
import type {
	TrackBatchIssueCode,
	TrackBatchUpdateOutcome,
	TrackBatchUpdateResult
} from '~~/shared/types/trackUpdates'

export type TrackEnrichmentDraftBatchBinding = {
	sourceFingerprint: string
	targetTrackId: string
	requested: {
		bpm: boolean
		keyMode: boolean
	}
}

export type TrackEnrichmentDraftOutcomeDisposition =
	| 'done'
	| 'retry'
	| 'rematch'
	| 'review'

export class TrackEnrichmentDraftOutcomeMappingError extends Error {
	constructor(
		public readonly code:
			| 'duplicate-binding'
			| 'invalid-binding'
			| 'duplicate-result'
			| 'missing-result'
			| 'result-target-mismatch'
			| 'result-status-mismatch'
	) {
		super(`Unable to map track enrichment batch outcome: ${code}`)
		this.name = 'TrackEnrichmentDraftOutcomeMappingError'
	}
}

type FailedOutcomeClassification = Pick<
	TrackEnrichmentDraftPartialOutcome,
	'status' | 'failureCode'
>

const EXPECTED_STATUS_BY_ISSUE: Readonly<
	Record<TrackBatchIssueCode, readonly TrackBatchUpdateResult['status'][]>
> = {
	account_replaced: ['unattempted'],
	duplicate_track_id: ['invalid'],
	invalid_audio_features: ['invalid'],
	invalid_item: ['invalid'],
	invalid_response: ['invalid', 'unknown'],
	not_found: ['not_found'],
	prior_chunk_unknown: ['unattempted'],
	receipt_capacity: ['invalid', 'unattempted'],
	request_unknown: ['unknown'],
	stale_revision: ['stale'],
	update_rejected: ['invalid']
}

const OUTCOME_BY_ISSUE: Readonly<
	Record<TrackBatchIssueCode, FailedOutcomeClassification>
> = {
	account_replaced: {
		status: 'failed',
		failureCode: 'workspace-changed'
	},
	duplicate_track_id: { status: 'failed', failureCode: 'invalid' },
	invalid_audio_features: { status: 'failed', failureCode: 'invalid' },
	invalid_item: { status: 'failed', failureCode: 'invalid' },
	invalid_response: { status: 'unknown', failureCode: 'request-unknown' },
	not_found: { status: 'failed', failureCode: 'not-found' },
	prior_chunk_unknown: {
		status: 'unknown',
		failureCode: 'request-unknown'
	},
	receipt_capacity: { status: 'failed', failureCode: 'capacity' },
	request_unknown: { status: 'unknown', failureCode: 'request-unknown' },
	stale_revision: { status: 'failed', failureCode: 'conflict' },
	update_rejected: { status: 'failed', failureCode: 'invalid' }
}

function classifyFailedResult(
	result: Exclude<TrackBatchUpdateResult, { success: true }>
): FailedOutcomeClassification {
	const issueCode = result.issue.code
	if (!EXPECTED_STATUS_BY_ISSUE[issueCode].includes(result.status)) {
		throw new TrackEnrichmentDraftOutcomeMappingError('result-status-mismatch')
	}
	return OUTCOME_BY_ISSUE[issueCode]
}

function mapResult(
	binding: TrackEnrichmentDraftBatchBinding,
	result: TrackBatchUpdateResult,
	attemptedAt: string
): TrackEnrichmentDraftPartialOutcome {
	if (result.id !== binding.targetTrackId) {
		throw new TrackEnrichmentDraftOutcomeMappingError('result-target-mismatch')
	}

	if (result.success) {
		return {
			intentKind: 'fill-empty-fields',
			sourceFingerprint: binding.sourceFingerprint,
			targetTrackId: binding.targetTrackId,
			status: 'succeeded',
			applied: {
				bpm: binding.requested.bpm,
				keyMode: binding.requested.keyMode
			},
			attemptedAt,
			failureCode: null
		}
	}

	const classification = classifyFailedResult(result)
	return {
		intentKind: 'fill-empty-fields',
		sourceFingerprint: binding.sourceFingerprint,
		targetTrackId: binding.targetTrackId,
		status: classification.status,
		applied: { bpm: false, keyMode: false },
		attemptedAt,
		failureCode: classification.failureCode
	}
}

/**
 * Maps only results the repository actually returned. A cancelled batch may
 * omit unattempted bindings; no outcome is invented for them. Cancellation
 * never downgrades an already confirmed success.
 */
export function mapTrackEnrichmentDraftBatchOutcome(input: {
	bindings: readonly TrackEnrichmentDraftBatchBinding[]
	outcome: TrackBatchUpdateOutcome
	attemptedAt: string
}): TrackEnrichmentDraftPartialOutcome[] {
	const bindingByTarget = new Map<string, TrackEnrichmentDraftBatchBinding>()
	const boundSources = new Set<string>()
	for (const binding of input.bindings) {
		if (
			bindingByTarget.has(binding.targetTrackId) ||
			boundSources.has(binding.sourceFingerprint)
		) {
			throw new TrackEnrichmentDraftOutcomeMappingError('duplicate-binding')
		}
		if (!binding.requested.bpm && !binding.requested.keyMode) {
			throw new TrackEnrichmentDraftOutcomeMappingError('invalid-binding')
		}
		bindingByTarget.set(binding.targetTrackId, binding)
		boundSources.add(binding.sourceFingerprint)
	}

	const outcomeByTarget = new Map<string, TrackEnrichmentDraftPartialOutcome>()
	for (const result of input.outcome.results) {
		if (outcomeByTarget.has(result.id)) {
			throw new TrackEnrichmentDraftOutcomeMappingError('duplicate-result')
		}
		const binding = bindingByTarget.get(result.id)
		if (!binding) {
			throw new TrackEnrichmentDraftOutcomeMappingError(
				'result-target-mismatch'
			)
		}
		outcomeByTarget.set(
			result.id,
			mapResult(binding, result, input.attemptedAt)
		)
	}

	if (
		!input.outcome.cancelled &&
		outcomeByTarget.size !== input.bindings.length
	) {
		throw new TrackEnrichmentDraftOutcomeMappingError('missing-result')
	}

	return input.bindings.flatMap((binding) => {
		const outcome = outcomeByTarget.get(binding.targetTrackId)
		return outcome ? [outcome] : []
	})
}

export function getTrackEnrichmentDraftOutcomeDisposition(
	outcome: TrackEnrichmentDraftPartialOutcome
): TrackEnrichmentDraftOutcomeDisposition {
	if (outcome.status === 'succeeded') return 'done'
	if (outcome.status === 'unknown') return 'review'
	if (
		outcome.failureCode === 'offline' ||
		outcome.failureCode === 'transport' ||
		outcome.failureCode === 'capacity'
	) {
		return 'retry'
	}
	if (
		outcome.failureCode === 'conflict' ||
		outcome.failureCode === 'not-found' ||
		outcome.failureCode === 'workspace-changed'
	) {
		return 'rematch'
	}
	return 'review'
}
