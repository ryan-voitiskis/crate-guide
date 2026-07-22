import type {
	LocalAudioTrackSource,
	LocalAudioValueSource
} from '~/types/localAudio'
import type {
	TrackEnrichmentDraft,
	TrackEnrichmentDraftDecision,
	TrackEnrichmentDraftObservation,
	TrackEnrichmentDraftPartialOutcome,
	TrackEnrichmentDraftProposal,
	TrackEnrichmentDraftUiState
} from '~/types/trackEnrichmentDraft'
import type { Track } from '~~/shared/types/supabase'
import type { RekordboxXmlTrack } from './rekordboxXml'
import {
	buildTrackEnrichmentRowsAsync,
	canStageTrackEnrichmentRow
} from './trackEnrichment'
import {
	encodeTrackEnrichmentDraft,
	getCurrentTrackEnrichmentDraftVersions
} from './trackEnrichmentDraftCodec'
import { createTrackEnrichmentCurrentEvidenceFingerprint } from './trackEnrichmentDraftEvidencePrecondition'
import {
	createLocalAudioDraftObservationSet,
	createRekordboxDraftObservationSet
} from './trackEnrichmentDraftFingerprint'
import {
	type TrackEnrichmentDraftOutcomeDisposition,
	getTrackEnrichmentDraftOutcomeDisposition
} from './trackEnrichmentDraftOutcome'
import {
	type TrackEnrichmentDraftCompatibility,
	type TrackEnrichmentDraftResumeClassification,
	type TrackEnrichmentDraftResumeSummary,
	type TrackEnrichmentDraftSnapshotMigrator,
	decideTrackEnrichmentDraftCompatibility,
	decideTrackEnrichmentDraftDecisionResume,
	summarizeTrackEnrichmentDraftResume
} from './trackEnrichmentDraftResume'
import type {
	EnrichmentRecord,
	EnrichmentRow,
	EnrichmentSource
} from './trackEnrichmentTypes'

export type TrackEnrichmentDraftHydratedDecision = {
	sourceFingerprint: string | null
	targetTrackId: string | null
	rowId: string | null
	classification: TrackEnrichmentDraftResumeClassification
	staged: boolean
	outcomeDisposition: TrackEnrichmentDraftOutcomeDisposition | null
}

export type TrackEnrichmentDraftHydratedOutcome = {
	sourceFingerprint: string
	targetTrackId: string
	rowId: string | null
	storedStatus: TrackEnrichmentDraftPartialOutcome['status']
	failureCode: TrackEnrichmentDraftPartialOutcome['failureCode']
	applied: TrackEnrichmentDraftPartialOutcome['applied']
	disposition: TrackEnrichmentDraftOutcomeDisposition
}

export type TrackEnrichmentDraftHydrationReady = {
	status: 'ready'
	compatibility: TrackEnrichmentDraftCompatibility
	rows: EnrichmentRow[]
	stagedRowIds: string[]
	doneRowIds: string[]
	changedRowIds: string[]
	dropped: TrackEnrichmentDraftHydratedDecision[]
	decisions: TrackEnrichmentDraftHydratedDecision[]
	outcomes: TrackEnrichmentDraftHydratedOutcome[]
	summary: TrackEnrichmentDraftResumeSummary
	ui: TrackEnrichmentDraftUiState
}

export type TrackEnrichmentDraftHydrationRecovery = {
	status: 'reimport' | 'reconnect'
	compatibility: TrackEnrichmentDraftCompatibility
	ui: TrackEnrichmentDraftUiState
}

export type TrackEnrichmentDraftHydrationResult =
	| TrackEnrichmentDraftHydrationReady
	| TrackEnrichmentDraftHydrationRecovery

export class TrackEnrichmentDraftHydrationError extends Error {
	constructor(
		public readonly code:
			| 'invalid-migrated-snapshot'
			| 'source-identity-mismatch'
			| 'proposal-mismatch'
			| 'duplicate-outcome',
		options?: ErrorOptions
	) {
		super(`Unable to hydrate track enrichment draft: ${code}`, options)
		this.name = 'TrackEnrichmentDraftHydrationError'
	}
}

function cloneUi(ui: TrackEnrichmentDraftUiState): TrackEnrichmentDraftUiState {
	return {
		filter: ui.filter,
		sortKey: ui.sortKey,
		sortDirection: ui.sortDirection,
		density: ui.density,
		anchorSourceFingerprint: ui.anchorSourceFingerprint
	}
}

function proposalFromRow(row: EnrichmentRow): TrackEnrichmentDraftProposal {
	return {
		bpm:
			row.proposedBpm !== null && row.proposedBpmSource !== null
				? { value: row.proposedBpm, source: row.proposedBpmSource }
				: null,
		keyMode:
			row.proposedKey !== null &&
			row.proposedMode !== null &&
			row.proposedKeyModeSource !== null
				? {
						key: row.proposedKey,
						mode: row.proposedMode,
						source: row.proposedKeyModeSource
					}
				: null
	}
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

function outcomeBindingKey(sourceFingerprint: string, targetTrackId: string) {
	return `${sourceFingerprint}\n${targetTrackId}`
}

function hasExactAppliedMarker(input: {
	track: Track
	field: 'bpm' | 'keyMode'
	source: NonNullable<TrackEnrichmentDraftProposal['bpm']>['source']
	attemptedAt: string
}): boolean {
	const audioFeatures: unknown = input.track.audio_features
	if (
		!audioFeatures ||
		typeof audioFeatures !== 'object' ||
		Array.isArray(audioFeatures)
	) {
		return false
	}
	const audioFeaturesRecord = audioFeatures as Record<string, unknown>
	if (audioFeaturesRecord.version !== 1) return false
	const applied = audioFeaturesRecord.applied
	if (!applied || typeof applied !== 'object' || Array.isArray(applied)) {
		return false
	}
	const marker = (applied as Record<string, unknown>)[input.field]
	if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
		return false
	}
	const markerRecord = marker as Record<string, unknown>
	return (
		markerRecord.source === input.source &&
		markerRecord.appliedAt === input.attemptedAt
	)
}

function classifyHydratedOutcome(input: {
	outcome: TrackEnrichmentDraftPartialOutcome
	decision: TrackEnrichmentDraftDecision | null
	storedObservation: TrackEnrichmentDraftObservation | null
	currentObservation: TrackEnrichmentDraftObservation | null
	row: EnrichmentRow | null
}): TrackEnrichmentDraftOutcomeDisposition {
	if (input.outcome.status !== 'succeeded') {
		return getTrackEnrichmentDraftOutcomeDisposition(input.outcome)
	}

	const { decision, storedObservation, currentObservation, row } = input
	if (
		decision?.kind !== 'fill-empty-fields' ||
		!storedObservation ||
		!currentObservation ||
		!row ||
		row.track?.id !== input.outcome.targetTrackId ||
		decision.sourceBinding.sourceFingerprint !==
			input.outcome.sourceFingerprint ||
		decision.targetBinding.trackId !== input.outcome.targetTrackId ||
		currentObservation.sourceFingerprint !==
			decision.sourceBinding.sourceFingerprint ||
		currentObservation.observationFingerprint !==
			decision.sourceBinding.observationFingerprint ||
		!proposalsEqual(decision.proposalBinding, currentObservation.proposal) ||
		!proposalsEqual(decision.proposalBinding, proposalFromRow(row))
	) {
		return 'rematch'
	}

	const expectedApplied = {
		bpm:
			decision.preconditionBinding.bpmMustBeNull &&
			decision.proposalBinding.bpm !== null,
		keyMode:
			decision.preconditionBinding.keyModeMustBeNull &&
			decision.proposalBinding.keyMode !== null
	}
	if (
		(!expectedApplied.bpm && !expectedApplied.keyMode) ||
		input.outcome.applied.bpm !== expectedApplied.bpm ||
		input.outcome.applied.keyMode !== expectedApplied.keyMode ||
		(expectedApplied.bpm &&
			(row.track.bpm !== decision.proposalBinding.bpm?.value ||
				!hasExactAppliedMarker({
					track: row.track,
					field: 'bpm',
					source: decision.proposalBinding.bpm!.source,
					attemptedAt: input.outcome.attemptedAt
				}))) ||
		(expectedApplied.keyMode &&
			(row.track.key !== decision.proposalBinding.keyMode?.key ||
				row.track.mode !== decision.proposalBinding.keyMode?.mode ||
				!hasExactAppliedMarker({
					track: row.track,
					field: 'keyMode',
					source: decision.proposalBinding.keyMode!.source,
					attemptedAt: input.outcome.attemptedAt
				})))
	) {
		return 'review'
	}

	return 'done'
}

function xmlSourceFromObservation(
	observation: TrackEnrichmentDraftObservation
): RekordboxXmlTrack {
	if (observation.evidence.kind !== 'rekordboxXml') {
		throw new TrackEnrichmentDraftHydrationError('source-identity-mismatch')
	}
	return {
		sourceType: 'rekordboxXml',
		index: observation.ordinal,
		trackId: observation.evidence.trackId,
		name: observation.name,
		artist: observation.artist,
		album: observation.album,
		genre: observation.genre,
		kind: null,
		totalTimeSeconds: observation.totalTimeSeconds,
		year: null,
		averageBpm: observation.proposal.bpm?.value ?? null,
		dateAdded: null,
		bitRate: null,
		sampleRate: null,
		comments: null,
		playCount: null,
		rating: null,
		location: null,
		locationHint: observation.locationHint,
		remixer: null,
		tonality: null,
		parsedKey: observation.proposal.keyMode?.key ?? null,
		parsedMode: observation.proposal.keyMode?.mode ?? null,
		label: null,
		warnings: [...observation.warnings]
	}
}

function localSourceFromObservation(
	observation: TrackEnrichmentDraftObservation
): LocalAudioTrackSource {
	if (observation.evidence.kind !== 'localAudio') {
		throw new TrackEnrichmentDraftHydrationError('source-identity-mismatch')
	}
	const evidence = observation.evidence
	const localValueSource = (
		source: NonNullable<TrackEnrichmentDraftProposal['bpm']>['source'] | null
	): LocalAudioValueSource => {
		if (source === 'rekordboxXml') {
			throw new TrackEnrichmentDraftHydrationError('source-identity-mismatch')
		}
		return source
	}
	const bpmSource = localValueSource(observation.proposal.bpm?.source ?? null)
	const keyModeSource = localValueSource(
		observation.proposal.keyMode?.source ?? null
	)
	const relativePath = evidence.fileIdentity.relativePath
	const fileName = relativePath.split('/').at(-1) ?? relativePath
	const hasAnalysisEvidence =
		evidence.analyzerVersion !== null ||
		evidence.configurationVersion !== null ||
		evidence.bpmConfidence !== null ||
		evidence.keyStrength !== null ||
		bpmSource === 'essentiaBrowser' ||
		keyModeSource === 'essentiaBrowser'

	return {
		sourceType: 'localAudio',
		index: observation.ordinal,
		name: observation.name,
		artist: observation.artist,
		album: observation.album,
		genre: observation.genre,
		locationHint: relativePath,
		totalTimeSeconds: observation.totalTimeSeconds,
		averageBpm: observation.proposal.bpm?.value ?? null,
		tonality: null,
		parsedKey: observation.proposal.keyMode?.key ?? null,
		parsedMode: observation.proposal.keyMode?.mode ?? null,
		warnings: [...observation.warnings],
		fileName,
		fileSize: evidence.fileIdentity.size,
		lastModified: evidence.fileIdentity.lastModified,
		tags: {
			title: observation.name,
			artist: observation.artist,
			album: observation.album,
			genres: observation.genre ? [observation.genre] : [],
			durationSeconds: observation.totalTimeSeconds,
			bpm:
				bpmSource === 'embeddedTags'
					? (observation.proposal.bpm?.value ?? null)
					: null,
			key: null
		},
		analysis: hasAnalysisEvidence
			? {
					analyzerVersion: evidence.analyzerVersion ?? '',
					configurationVersion: evidence.configurationVersion ?? '',
					bpm:
						bpmSource === 'essentiaBrowser'
							? (observation.proposal.bpm?.value ?? null)
							: null,
					bpmConfidence: evidence.bpmConfidence,
					bpmEstimates: [],
					key: null,
					scale: null,
					keyStrength: evidence.keyStrength,
					sampleRate: 0,
					durationSeconds: observation.totalTimeSeconds ?? 0,
					analyzedDurationSeconds: 0,
					analysisOffsetSeconds: 0,
					warnings: []
				}
			: null,
		bpmSource,
		keyModeSource,
		requiresManualReview: evidence.requiresManualReview
	}
}

async function reconstructAndVerifySources(input: {
	kind: TrackEnrichmentDraft['source']['kind']
	datasetFingerprint: string
	observations: readonly TrackEnrichmentDraftObservation[]
}): Promise<EnrichmentSource[]> {
	const observations = [...input.observations].sort(
		(left, right) => left.ordinal - right.ordinal
	)
	if (
		observations.some((observation, index) => observation.ordinal !== index)
	) {
		throw new TrackEnrichmentDraftHydrationError('source-identity-mismatch')
	}

	const sources: EnrichmentSource[] =
		input.kind === 'rekordboxXml'
			? observations.map(xmlSourceFromObservation)
			: observations.map(localSourceFromObservation)
	const rebuilt =
		input.kind === 'rekordboxXml'
			? await createRekordboxDraftObservationSet(sources as RekordboxXmlTrack[])
			: await createLocalAudioDraftObservationSet(
					sources as LocalAudioTrackSource[]
				)

	if (
		rebuilt.datasetFingerprint !== input.datasetFingerprint ||
		rebuilt.observations.length !== observations.length ||
		rebuilt.observations.some((observation, index) => {
			const expected = observations[index]
			return (
				!expected ||
				observation.sourceSnapshotId !== expected.sourceSnapshotId ||
				observation.sourceFingerprint !== expected.sourceFingerprint ||
				observation.observationFingerprint !==
					expected.observationFingerprint ||
				!proposalsEqual(observation.proposal, expected.proposal)
			)
		})
	) {
		throw new TrackEnrichmentDraftHydrationError('source-identity-mismatch')
	}
	return sources
}

async function currentSnapshot(input: {
	draft: TrackEnrichmentDraft
	compatibility: TrackEnrichmentDraftCompatibility
}): Promise<{
	datasetFingerprint: string
	observations: TrackEnrichmentDraftObservation[]
}> {
	if (!input.compatibility.migrator) {
		return {
			datasetFingerprint: input.draft.source.datasetFingerprint,
			observations: input.draft.observations.map((observation) =>
				structuredClone(observation)
			)
		}
	}

	let migrated: {
		datasetFingerprint: string
		observations: TrackEnrichmentDraftObservation[]
	}
	try {
		migrated = await input.compatibility.migrator.migrate({
			datasetFingerprint: input.draft.source.datasetFingerprint,
			observations: input.draft.observations
		})
		const validationDraft: TrackEnrichmentDraft = {
			...structuredClone(input.draft),
			versions: getCurrentTrackEnrichmentDraftVersions(input.draft.source.kind),
			source: {
				...input.draft.source,
				datasetFingerprint: migrated.datasetFingerprint
			},
			observations: migrated.observations,
			decisions: [],
			partialOutcomes: [],
			ui: { ...input.draft.ui, anchorSourceFingerprint: null }
		}
		encodeTrackEnrichmentDraft(validationDraft)
	} catch (error) {
		throw new TrackEnrichmentDraftHydrationError('invalid-migrated-snapshot', {
			cause: error
		})
	}
	return {
		datasetFingerprint: migrated.datasetFingerprint,
		observations: migrated.observations.map((observation) =>
			structuredClone(observation)
		)
	}
}

const DROPPED_CLASSIFICATIONS =
	new Set<TrackEnrichmentDraftResumeClassification>([
		'unknown-intent',
		'source-missing',
		'target-deleted',
		'no-longer-matching'
	])

export async function hydrateTrackEnrichmentDraft(input: {
	draft: TrackEnrichmentDraft
	tracks: readonly Track[]
	records: readonly EnrichmentRecord[]
	migrators?: readonly TrackEnrichmentDraftSnapshotMigrator[]
	onProgress?: (completed: number, total: number) => void
}): Promise<TrackEnrichmentDraftHydrationResult> {
	// Hydration is a trust boundary too: callers may have bypassed the decoder
	// by constructing an in-memory value with hidden runtime fields.
	const draft = JSON.parse(
		encodeTrackEnrichmentDraft(input.draft)
	) as TrackEnrichmentDraft
	const currentVersions = getCurrentTrackEnrichmentDraftVersions(
		draft.source.kind
	)
	const compatibility = decideTrackEnrichmentDraftCompatibility({
		sourceKind: draft.source.kind,
		stored: draft.versions,
		current: currentVersions,
		migrators: input.migrators
	})
	const ui = cloneUi(draft.ui)
	if (
		compatibility.action === 'reimport' ||
		compatibility.action === 'reconnect'
	) {
		return { status: compatibility.action, compatibility, ui }
	}

	const snapshot = await currentSnapshot({ draft, compatibility })
	const sources = await reconstructAndVerifySources({
		kind: draft.source.kind,
		datasetFingerprint: snapshot.datasetFingerprint,
		observations: snapshot.observations
	})
	const rows = (
		await buildTrackEnrichmentRowsAsync({
			sources,
			tracks: [...input.tracks],
			records: [...input.records],
			onProgress: input.onProgress
		})
	).map((row) => ({ ...row, defaultStaged: false }))

	const storedObservationByBinding = new Map(
		draft.observations.map((observation) => [
			`${observation.sourceFingerprint}\n${observation.observationFingerprint}`,
			observation
		])
	)
	const currentObservationBySnapshotId = new Map(
		snapshot.observations.map((observation) => [
			observation.sourceSnapshotId,
			observation
		])
	)
	const rowByOrdinal = new Map(rows.map((row) => [row.source.index, row]))
	const currentTrackById = new Map(
		input.tracks.map((track) => [track.id, track])
	)
	const currentEvidenceFingerprintByTrackId = new Map<
		string,
		Promise<string | null>
	>()
	const currentEvidenceFingerprint = (track: Track) => {
		const existing = currentEvidenceFingerprintByTrackId.get(track.id)
		if (existing) return existing
		const fingerprint = createTrackEnrichmentCurrentEvidenceFingerprint(
			track.audio_features
		)
		currentEvidenceFingerprintByTrackId.set(track.id, fingerprint)
		return fingerprint
	}
	const decisionByOutcomeBinding = new Map(
		draft.decisions.flatMap((decision) =>
			decision.kind === 'fill-empty-fields'
				? [
						[
							outcomeBindingKey(
								decision.sourceBinding.sourceFingerprint,
								decision.targetBinding.trackId
							),
							decision
						] as const
					]
				: []
		)
	)
	const hydratedOutcomeByBinding = new Map<
		string,
		TrackEnrichmentDraftHydratedOutcome
	>()
	for (const outcome of draft.partialOutcomes) {
		const binding = outcomeBindingKey(
			outcome.sourceFingerprint,
			outcome.targetTrackId
		)
		if (hydratedOutcomeByBinding.has(binding)) {
			throw new TrackEnrichmentDraftHydrationError('duplicate-outcome')
		}
		const decision = decisionByOutcomeBinding.get(binding) ?? null
		const storedObservation =
			decision?.kind === 'fill-empty-fields'
				? (storedObservationByBinding.get(
						`${decision.sourceBinding.sourceFingerprint}\n${decision.sourceBinding.observationFingerprint}`
					) ?? null)
				: null
		const observation = storedObservation
			? (currentObservationBySnapshotId.get(
					storedObservation.sourceSnapshotId
				) ?? null)
			: null
		const row = observation
			? (rowByOrdinal.get(observation.ordinal) ?? null)
			: null
		const disposition = classifyHydratedOutcome({
			outcome,
			decision,
			storedObservation,
			currentObservation: observation,
			row
		})
		if (disposition === 'done' && row) row.applied = true
		hydratedOutcomeByBinding.set(binding, {
			sourceFingerprint: outcome.sourceFingerprint,
			targetTrackId: outcome.targetTrackId,
			rowId: row?.id ?? null,
			storedStatus: outcome.status,
			failureCode: outcome.failureCode,
			applied: { ...outcome.applied },
			disposition
		})
	}

	const resumeDecisions = await Promise.all(
		draft.decisions.map(async (decision) => {
			const storedObservation = decision.sourceBinding
				? (storedObservationByBinding.get(
						`${decision.sourceBinding.sourceFingerprint}\n${decision.sourceBinding.observationFingerprint}`
					) ?? null)
				: null
			const observation = storedObservation
				? (currentObservationBySnapshotId.get(
						storedObservation.sourceSnapshotId
					) ?? null)
				: null
			const row = observation
				? (rowByOrdinal.get(observation.ordinal) ?? null)
				: null
			const currentProposal = row
				? proposalFromRow(row)
				: (observation?.proposal ?? { bpm: null, keyMode: null })
			if (
				row &&
				observation &&
				!proposalsEqual(currentProposal, observation.proposal)
			) {
				throw new TrackEnrichmentDraftHydrationError('proposal-mismatch')
			}
			const targetTrackId =
				decision.kind === 'unknown' ? null : decision.targetBinding.trackId
			const currentTarget = targetTrackId
				? (currentTrackById.get(targetTrackId) ?? null)
				: null
			const result = decideTrackEnrichmentDraftDecisionResume({
				decision,
				currentObservation: observation,
				currentTargetByStoredId: currentTarget
					? {
							id: currentTarget.id,
							updatedAt: currentTarget.updated_at,
							bpm: currentTarget.bpm,
							key: currentTarget.key,
							mode: currentTarget.mode,
							currentEvidenceFingerprint:
								decision.kind === 'evidence-only'
									? await currentEvidenceFingerprint(currentTarget)
									: null
						}
					: null,
				rematchedTargetId: row?.track?.id ?? null,
				currentProposal,
				currentPreconditions: {
					bpmMustBeNull: row?.canFillBpm ?? false,
					keyModeMustBeNull: row?.canFillKeyMode ?? false
				},
				stageable: row ? canStageTrackEnrichmentRow(row) : false,
				retentionAllowedByPolicy: compatibility.canRetainStaging
			})
			const outcomeDisposition =
				decision.kind === 'fill-empty-fields'
					? (hydratedOutcomeByBinding.get(
							outcomeBindingKey(
								decision.sourceBinding.sourceFingerprint,
								decision.targetBinding.trackId
							)
						)?.disposition ?? null)
					: null
			const staged =
				result.staged &&
				(outcomeDisposition === null || outcomeDisposition === 'retry')
			return {
				result: { ...result, staged },
				value: {
					sourceFingerprint: decision.sourceBinding?.sourceFingerprint ?? null,
					targetTrackId,
					rowId: row?.id ?? null,
					classification: result.classification,
					staged,
					outcomeDisposition
				} satisfies TrackEnrichmentDraftHydratedDecision
			}
		})
	)

	const staged = new Set(
		resumeDecisions.flatMap(({ result, value }) =>
			result.staged && value.rowId ? [value.rowId] : []
		)
	)
	const changed = new Set(
		resumeDecisions.flatMap(({ result, value }) =>
			value.rowId &&
			(value.outcomeDisposition === 'review' ||
				value.outcomeDisposition === 'rematch' ||
				(result.classification !== 'retained' &&
					result.classification !== 'not-staged')) &&
			value.outcomeDisposition !== 'done' &&
			!DROPPED_CLASSIFICATIONS.has(result.classification)
				? [value.rowId]
				: []
		)
	)
	const decisions = resumeDecisions.map(({ value }) => value)
	const outcomes = [...hydratedOutcomeByBinding.values()]
	const done = new Set(
		outcomes.flatMap((outcome) =>
			outcome.disposition === 'done' && outcome.rowId ? [outcome.rowId] : []
		)
	)

	return {
		status: 'ready',
		compatibility,
		rows,
		stagedRowIds: rows.flatMap((row) => (staged.has(row.id) ? [row.id] : [])),
		doneRowIds: rows.flatMap((row) => (done.has(row.id) ? [row.id] : [])),
		changedRowIds: rows.flatMap((row) => (changed.has(row.id) ? [row.id] : [])),
		dropped: decisions.filter((decision) =>
			DROPPED_CLASSIFICATIONS.has(decision.classification)
		),
		decisions,
		outcomes,
		summary: summarizeTrackEnrichmentDraftResume(
			resumeDecisions.map(({ result, value }) =>
				DROPPED_CLASSIFICATIONS.has(result.classification)
					? result
					: value.outcomeDisposition === 'done'
						? { classification: 'not-staged', staged: false }
						: value.outcomeDisposition === 'review' ||
							  value.outcomeDisposition === 'rematch'
							? { classification: 'no-longer-stageable', staged: false }
							: result
			)
		),
		ui
	}
}
