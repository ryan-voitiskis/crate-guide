import type { AudioFeatureSourceKey } from '~~/shared/types/audioFeatures'

export const TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION = 1 as const
export const TRACK_ENRICHMENT_DRAFT_MATCHER_POLICY_VERSION =
	'track-enrichment-match-v1'
export const TRACK_ENRICHMENT_DRAFT_LOCAL_SNAPSHOT_VERSION =
	'local-audio-sanitized-v1'
export const TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION =
	'local-audio-file-v1'
export const TRACK_ENRICHMENT_DRAFT_FINGERPRINT_VERSION =
	'track-enrichment-fingerprint-v1'

export type TrackEnrichmentDraftSourceKind = 'rekordboxXml' | 'localAudio'

export type TrackEnrichmentDraftVersions = {
	matcherPolicyVersion: string
	parserPolicyVersion: string | null
	sanitizedSourceSnapshotVersion: string
}

export type TrackEnrichmentDraftWorkspaceBinding = {
	workspaceId: string
	repositoryId: string
	repositoryRevision: number
}

export type TrackEnrichmentDraftProposal = {
	bpm: {
		value: number
		source: AudioFeatureSourceKey
	} | null
	keyMode: {
		key: number
		mode: number
		source: AudioFeatureSourceKey
	} | null
}

export type TrackEnrichmentDraftLocalFileIdentity = {
	version: typeof TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION
	relativePath: string
	size: number
	lastModified: number
}

export type TrackEnrichmentDraftXmlEvidence = {
	kind: 'rekordboxXml'
	trackId: string | null
}

export type TrackEnrichmentDraftLocalEvidence = {
	kind: 'localAudio'
	fileIdentity: TrackEnrichmentDraftLocalFileIdentity
	metadataVersion: string
	analyzerVersion: string | null
	configurationVersion: string | null
	bpmConfidence: number | null
	keyStrength: number | null
	requiresManualReview: boolean
}

export type TrackEnrichmentDraftObservation = {
	sourceSnapshotId: string
	sourceFingerprint: string
	observationFingerprint: string
	ordinal: number
	name: string | null
	artist: string | null
	album: string | null
	genre: string | null
	locationHint: string | null
	totalTimeSeconds: number | null
	proposal: TrackEnrichmentDraftProposal
	warnings: string[]
	evidence: TrackEnrichmentDraftXmlEvidence | TrackEnrichmentDraftLocalEvidence
}

export type TrackEnrichmentDraftSource = {
	kind: TrackEnrichmentDraftSourceKind
	label: string
	datasetFingerprint: string
	requiresReconnect: boolean
}

export type TrackEnrichmentFillEmptyFieldsDecision = {
	kind: 'fill-empty-fields'
	intentVersion: 1
	sourceBinding: {
		sourceFingerprint: string
		observationFingerprint: string
	}
	targetBinding: {
		trackId: string
	}
	proposalBinding: TrackEnrichmentDraftProposal
	preconditionBinding: {
		expectedTargetUpdatedAt: string | null
		bpmMustBeNull: boolean
		keyModeMustBeNull: boolean
	}
	staged: boolean
	reviewedAt: string
}

/**
 * A future intent is retained only as inert provenance. Its opaque payload is
 * intentionally discarded by the codec, and it can never restore staging.
 */
export type TrackEnrichmentUnknownDecision = {
	kind: 'unknown'
	intentVersion: number
	originalKind: string
	sourceBinding: {
		sourceFingerprint: string
		observationFingerprint: string
	} | null
	staged: false
	reviewedAt: string | null
}

export type TrackEnrichmentDraftDecision =
	| TrackEnrichmentFillEmptyFieldsDecision
	| TrackEnrichmentUnknownDecision

export type TrackEnrichmentDraftPartialOutcome = {
	intentKind: 'fill-empty-fields'
	sourceFingerprint: string
	targetTrackId: string
	status: 'succeeded' | 'failed'
	applied: {
		bpm: boolean
		keyMode: boolean
	}
	attemptedAt: string
	failureCode:
		| 'conflict'
		| 'not-found'
		| 'offline'
		| 'permission'
		| 'transport'
		| 'unknown'
		| null
}

export type TrackEnrichmentDraftReviewFilter =
	| 'ready'
	| 'review'
	| 'staged'
	| 'matched'
	| 'unmatched'
	| 'done'

export type TrackEnrichmentDraftReviewSortKey =
	| 'library'
	| 'source'
	| 'duration'
	| 'bpm'
	| 'key'
	| 'confidence'

export type TrackEnrichmentDraftUiState = {
	filter: TrackEnrichmentDraftReviewFilter
	sortKey: TrackEnrichmentDraftReviewSortKey | null
	sortDirection: 'asc' | 'desc'
	density: 'compact' | 'comfortable'
	anchorSourceFingerprint: string | null
}

export type TrackEnrichmentDraft = {
	schemaVersion: typeof TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION
	id: string
	workspace: TrackEnrichmentDraftWorkspaceBinding
	draftRevision: number
	createdAt: string
	updatedAt: string
	versions: TrackEnrichmentDraftVersions
	source: TrackEnrichmentDraftSource
	observations: TrackEnrichmentDraftObservation[]
	decisions: TrackEnrichmentDraftDecision[]
	partialOutcomes: TrackEnrichmentDraftPartialOutcome[]
	ui: TrackEnrichmentDraftUiState
}
