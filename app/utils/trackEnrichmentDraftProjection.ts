import type {
	TrackEnrichmentDraft,
	TrackEnrichmentDraftPartialOutcome,
	TrackEnrichmentDraftProposal,
	TrackEnrichmentDraftUiState,
	TrackEnrichmentDraftWorkspaceBinding
} from '~/types/trackEnrichmentDraft'
import {
	TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION,
	TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION
} from '~/types/trackEnrichmentDraft'
import {
	encodeTrackEnrichmentDraft,
	getCurrentTrackEnrichmentDraftVersions
} from './trackEnrichmentDraftCodec'
import { createTrackEnrichmentCurrentEvidenceFingerprint } from './trackEnrichmentDraftEvidencePrecondition'
import {
	createLocalAudioDraftObservationSet,
	createRekordboxDraftObservationSet
} from './trackEnrichmentDraftFingerprint'
import { sanitizeTrackEnrichmentDraftLabel } from './trackEnrichmentDraftPrivacy'
import { canStageEnrichmentRow } from './trackEnrichmentReview'
import type { EnrichmentRow } from './trackEnrichmentTypes'

export type TrackEnrichmentDraftProjectionRow = {
	row: EnrichmentRow
	staged: boolean
	reviewedAt: string
}

export type TrackEnrichmentDraftProjectionUiState = Omit<
	TrackEnrichmentDraftUiState,
	'anchorSourceFingerprint'
> & {
	anchorSourceIndex: number | null
}

export type TrackEnrichmentDraftProjectionInput = {
	id: string
	workspace: TrackEnrichmentDraftWorkspaceBinding
	draftRevision: number
	createdAt: string
	updatedAt: string
	sourceLabel: string
	rows: readonly TrackEnrichmentDraftProjectionRow[]
	partialOutcomes?: readonly TrackEnrichmentDraftPartialOutcome[]
	ui: TrackEnrichmentDraftProjectionUiState
}

export class TrackEnrichmentDraftProjectionError extends Error {
	constructor(
		public readonly code:
			| 'empty-review'
			| 'mixed-source-kind'
			| 'invalid-source-identity'
			| 'duplicate-source-identity'
			| 'proposal-mismatch'
			| 'review-state-mismatch'
			| 'invalid-source-label'
			| 'invalid-anchor'
			| 'invalid-current-evidence'
			| 'observation-projection-mismatch'
	) {
		super(`Unable to project track enrichment draft: ${code}`)
		this.name = 'TrackEnrichmentDraftProjectionError'
	}
}

function proposalMatchesRow(
	row: EnrichmentRow,
	proposal: TrackEnrichmentDraftProposal
): boolean {
	return (
		row.proposedBpm === (proposal.bpm?.value ?? null) &&
		row.proposedBpmSource === (proposal.bpm?.source ?? null) &&
		row.proposedKey === (proposal.keyMode?.key ?? null) &&
		row.proposedMode === (proposal.keyMode?.mode ?? null) &&
		row.proposedKeyModeSource === (proposal.keyMode?.source ?? null)
	)
}

function cloneProposal(
	proposal: TrackEnrichmentDraftProposal
): TrackEnrichmentDraftProposal {
	return {
		bpm: proposal.bpm
			? { value: proposal.bpm.value, source: proposal.bpm.source }
			: null,
		keyMode: proposal.keyMode
			? {
					key: proposal.keyMode.key,
					mode: proposal.keyMode.mode,
					source: proposal.keyMode.source
				}
			: null
	}
}

function clonePartialOutcome(
	outcome: TrackEnrichmentDraftPartialOutcome
): TrackEnrichmentDraftPartialOutcome {
	return {
		intentKind: outcome.intentKind,
		sourceFingerprint: outcome.sourceFingerprint,
		targetTrackId: outcome.targetTrackId,
		status: outcome.status,
		applied: {
			bpm: outcome.applied.bpm,
			keyMode: outcome.applied.keyMode
		},
		attemptedAt: outcome.attemptedAt,
		failureCode: outcome.failureCode
	}
}

/**
 * Projects ephemeral matcher rows into the strict, privacy-audited draft DTO.
 * Row IDs and row snapshots are deliberately ignored; source observations and
 * target bindings are rebuilt from the narrow fields the draft owns.
 */
export async function projectTrackEnrichmentDraft(
	input: TrackEnrichmentDraftProjectionInput
): Promise<TrackEnrichmentDraft> {
	if (input.rows.length === 0) {
		throw new TrackEnrichmentDraftProjectionError('empty-review')
	}

	const sourceKind = input.rows[0]!.row.source.sourceType
	const sourceIdentities = new Set<number>()
	for (const { row } of input.rows) {
		if (row.source.sourceType !== sourceKind) {
			throw new TrackEnrichmentDraftProjectionError('mixed-source-kind')
		}
		if (!Number.isSafeInteger(row.source.index) || row.source.index < 0) {
			throw new TrackEnrichmentDraftProjectionError('invalid-source-identity')
		}
		if (sourceIdentities.has(row.source.index)) {
			throw new TrackEnrichmentDraftProjectionError('duplicate-source-identity')
		}
		sourceIdentities.add(row.source.index)
	}

	const label = sanitizeTrackEnrichmentDraftLabel(input.sourceLabel)
	if (!label) {
		throw new TrackEnrichmentDraftProjectionError('invalid-source-label')
	}

	const rows = [...input.rows].sort(
		(left, right) => left.row.source.index - right.row.source.index
	)
	const observationSet =
		sourceKind === 'rekordboxXml'
			? await createRekordboxDraftObservationSet(
					rows.map(({ row }) => {
						if (row.source.sourceType !== 'rekordboxXml') {
							throw new TrackEnrichmentDraftProjectionError('mixed-source-kind')
						}
						return row.source
					})
				)
			: await createLocalAudioDraftObservationSet(
					rows.map(({ row }) => {
						if (row.source.sourceType !== 'localAudio') {
							throw new TrackEnrichmentDraftProjectionError('mixed-source-kind')
						}
						return row.source
					})
				)

	if (observationSet.observations.length !== rows.length) {
		throw new TrackEnrichmentDraftProjectionError(
			'observation-projection-mismatch'
		)
	}

	const decisions: TrackEnrichmentDraft['decisions'] = []
	for (const [ordinal, { row, reviewedAt, staged }] of rows.entries()) {
		const observation = observationSet.observations[ordinal]
		if (!observation || observation.ordinal !== ordinal) {
			throw new TrackEnrichmentDraftProjectionError(
				'observation-projection-mismatch'
			)
		}
		if (!proposalMatchesRow(row, observation.proposal)) {
			throw new TrackEnrichmentDraftProjectionError('proposal-mismatch')
		}

		const canFillBpm =
			row.track !== null &&
			row.track.bpm === null &&
			observation.proposal.bpm !== null
		const canFillKeyMode =
			row.track !== null &&
			row.track.key === null &&
			row.track.mode === null &&
			observation.proposal.keyMode !== null
		if (
			row.canFillBpm !== canFillBpm ||
			row.canFillKeyMode !== canFillKeyMode
		) {
			throw new TrackEnrichmentDraftProjectionError('review-state-mismatch')
		}

		if (!row.track) continue
		if (canFillBpm || canFillKeyMode) {
			decisions.push({
				kind: 'fill-empty-fields' as const,
				intentVersion: 1 as const,
				sourceBinding: {
					sourceFingerprint: observation.sourceFingerprint,
					observationFingerprint: observation.observationFingerprint
				},
				targetBinding: { trackId: row.track.id },
				proposalBinding: cloneProposal(observation.proposal),
				preconditionBinding: {
					expectedTargetUpdatedAt: row.track.updated_at,
					bpmMustBeNull: canFillBpm,
					keyModeMustBeNull: canFillKeyMode
				},
				staged: staged && canStageEnrichmentRow(row),
				reviewedAt
			})
			continue
		}

		const currentEvidenceFingerprint =
			await createTrackEnrichmentCurrentEvidenceFingerprint(
				row.track.audio_features
			)
		if (!currentEvidenceFingerprint) {
			if (staged) {
				throw new TrackEnrichmentDraftProjectionError(
					'invalid-current-evidence'
				)
			}
			continue
		}
		const canStageEvidenceOnly =
			!row.applied && !row.stagingBlockedReason && row.track.updated_at !== null
		decisions.push({
			kind: 'evidence-only',
			intentVersion: 1,
			sourceBinding: {
				sourceSnapshotId: observation.sourceSnapshotId,
				sourceFingerprint: observation.sourceFingerprint,
				observationFingerprint: observation.observationFingerprint
			},
			targetBinding: { trackId: row.track.id },
			preconditionBinding: {
				expectedTargetUpdatedAt: row.track.updated_at,
				currentEvidenceFingerprint: {
					version: TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION,
					digest: currentEvidenceFingerprint
				}
			},
			staged: staged && canStageEvidenceOnly,
			reviewedAt
		})
	}

	let anchorSourceFingerprint: string | null = null
	if (input.ui.anchorSourceIndex !== null) {
		const anchorOrdinal = rows.findIndex(
			({ row }) => row.source.index === input.ui.anchorSourceIndex
		)
		const anchor = observationSet.observations[anchorOrdinal]
		if (!anchor) {
			throw new TrackEnrichmentDraftProjectionError('invalid-anchor')
		}
		anchorSourceFingerprint = anchor.sourceFingerprint
	}

	const draft: TrackEnrichmentDraft = {
		schemaVersion: TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION,
		id: input.id,
		workspace: {
			workspaceId: input.workspace.workspaceId,
			repositoryId: input.workspace.repositoryId,
			repositoryRevision: input.workspace.repositoryRevision
		},
		draftRevision: input.draftRevision,
		createdAt: input.createdAt,
		updatedAt: input.updatedAt,
		versions: getCurrentTrackEnrichmentDraftVersions(sourceKind),
		source: {
			kind: sourceKind,
			label,
			datasetFingerprint: observationSet.datasetFingerprint,
			requiresReconnect: sourceKind === 'localAudio'
		},
		observations: observationSet.observations,
		decisions,
		partialOutcomes: (input.partialOutcomes ?? []).map(clonePartialOutcome),
		ui: {
			filter: input.ui.filter,
			sortKey: input.ui.sortKey,
			sortDirection: input.ui.sortDirection,
			density: input.ui.density,
			anchorSourceFingerprint
		}
	}

	// Keep the projection boundary fail-closed if the draft schema or privacy
	// contract changes independently of this adapter.
	encodeTrackEnrichmentDraft(draft)
	return draft
}
