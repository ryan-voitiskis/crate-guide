import type { AudioFeatureSourceKey } from '~~/shared/types/audioFeatures'

export const TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION = 2 as const
export const TRACK_ENRICHMENT_DRAFT_PREVIOUS_SCHEMA_VERSION = 1 as const
export const TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES = 134_217_728
export const TRACK_ENRICHMENT_DRAFT_MAX_OBSERVATIONS = 100_000
export const TRACK_ENRICHMENT_DRAFT_MAX_DECISIONS = 100_000
export const TRACK_ENRICHMENT_DRAFT_MAX_OUTCOMES = 100_000
export const TRACK_ENRICHMENT_DRAFT_MAX_WARNINGS_PER_OBSERVATION = 128
export const TRACK_ENRICHMENT_DRAFT_MATCHER_POLICY_VERSION =
	'track-enrichment-match-v1'
export const TRACK_ENRICHMENT_DRAFT_LOCAL_SNAPSHOT_VERSION =
	'local-audio-sanitized-v1'
export const TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION =
	'local-audio-file-v1'
export const TRACK_ENRICHMENT_DRAFT_FINGERPRINT_VERSION =
	'track-enrichment-fingerprint-v1'
export const TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION =
	'track-enrichment-current-evidence-v1'

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
	source: {
		name: string | null
		artist: string | null
		album: string | null
		genre: string | null
		kind: string | null
		totalTimeSeconds: number | null
		year: number | null
		averageBpm: number | null
		dateAdded: string | null
		bitRate: number | null
		sampleRate: number | null
		comments: string | null
		playCount: number | null
		rating: number | null
		locationHint: string | null
		remixer: string | null
		tonality: string | null
		parsedKey: number | null
		parsedMode: number | null
		label: string | null
	}
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
	source: {
		name: string | null
		artist: string | null
		album: string | null
		genre: string | null
		locationHint: string
		totalTimeSeconds: number | null
		averageBpm: number | null
		tonality: string | null
		parsedKey: number | null
		parsedMode: number | null
		fileName: string
		fileSize: number
		lastModified: number
		tags: {
			title: string | null
			artist: string | null
			album: string | null
			genres: string[]
			durationSeconds: number | null
			bpm: number | null
			key: string | null
		}
		analysis: {
			analyzerVersion: string
			configurationVersion: string
			bpm: number | null
			bpmConfidence: number | null
			bpmEstimates: number[]
			key: string | null
			scale: string | null
			keyStrength: number | null
			sampleRate: number
			durationSeconds: number
			analyzedDurationSeconds: number
			analysisOffsetSeconds: number
			warnings: string[]
		} | null
		bpmSource: 'embeddedTags' | 'essentiaBrowser' | null
		keyModeSource: 'embeddedTags' | 'essentiaBrowser' | null
		requiresManualReview: boolean
	}
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
 * Records a reviewed request to retain Evidence without approving a BPM/key
 * write. Current hydration may restore staging only when every source, target,
 * revision, and current-Evidence binding still matches.
 *
 * The additive intent stays in draft schema v2. Older readers demote the
 * unfamiliar kind to an unstaged unknown decision instead of a fill approval.
 */
export type TrackEnrichmentEvidenceOnlyDecision = {
	kind: 'evidence-only'
	intentVersion: 1
	sourceBinding: {
		sourceSnapshotId: string
		sourceFingerprint: string
		observationFingerprint: string
	}
	targetBinding: {
		trackId: string
	}
	preconditionBinding: {
		expectedTargetUpdatedAt: string | null
		currentEvidenceFingerprint: {
			version: typeof TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION
			digest: string
		}
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
	| TrackEnrichmentEvidenceOnlyDecision
	| TrackEnrichmentUnknownDecision

export type TrackEnrichmentDraftPartialOutcome = {
	intentKind: 'fill-empty-fields' | 'evidence-only'
	sourceFingerprint: string
	targetTrackId: string
	status: 'succeeded' | 'failed' | 'unknown'
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
		| 'capacity'
		| 'invalid'
		| 'workspace-changed'
		| 'request-unknown'
		| 'unknown'
		| null
}

export type TrackEnrichmentDraftReviewFilter =
	| 'ready'
	| 'review'
	| 'evidence'
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
