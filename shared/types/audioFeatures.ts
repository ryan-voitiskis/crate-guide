export const TRACK_EVIDENCE_MODEL_VERSION = 'latest-per-source-v1' as const

export const TRACK_EVIDENCE_SOURCE_KEYS = [
	'rekordboxXml',
	'embeddedTags',
	'essentiaBrowser'
] as const

export type TrackEvidenceJson =
	| boolean
	| number
	| string
	| null
	| TrackEvidenceJson[]
	| { [key: string]: TrackEvidenceJson }

export type TrackEvidenceUnknownFields = Record<string, TrackEvidenceJson>

export type TrackEvidenceSourceKey = (typeof TRACK_EVIDENCE_SOURCE_KEYS)[number]

// Shared by the legacy v1 read shape and current v2 Evidence writer.
export type AudioFeatureSourceKey = TrackEvidenceSourceKey

export type TrackAudioFeaturesV1 = {
	version: 1
	updatedAt: string
	applied: {
		bpm: { source: AudioFeatureSourceKey; appliedAt: string } | null
		keyMode: { source: AudioFeatureSourceKey; appliedAt: string } | null
	}
	match: TrackEvidenceLegacyMatchValue
	sources: {
		rekordboxXml?: RekordboxXmlSource
		embeddedTags?: EmbeddedTagsSource
		essentiaBrowser?: EssentiaBrowserSource
	}
}

// The persisted read surface accepts both generations. Current enrichment
// writers emit v2 while older rows remain readable through the v1 migrator.
export type TrackAudioFeatures = TrackAudioFeaturesV1 | TrackEvidenceV2

export type TrackEvidenceMatchConfidence = 'high' | 'medium' | 'manual'

export type TrackEvidenceLegacyMatchValue = {
	confidence: TrackEvidenceMatchConfidence
	score: number
	reasons: string[]
	warnings: string[]
}

export type TrackEvidenceSourceMatch = TrackEvidenceLegacyMatchValue & {
	matcherPolicyVersion: string
}

export type RekordboxXmlSource = {
	importedAt: string
	fileName: string
	name: string | null
	artist: string | null
	album: string | null
	genre: string | null
	locationHint: string | null
	averageBpm: number | null
	tonality: string | null
	parsedKey: number | null
	parsedMode: number | null
	totalTimeSeconds: number | null
	year: number | null
	kind: string | null
	sampleRate: number | null
	bitRate: number | null
	rating: number | null
	playCount: number | null
	comments: string | null
	remixer: string | null
	label: string | null
	dateAdded: string | null
}

export type EmbeddedTagsSource = {
	importedAt: string
	fileName: string
	locationHint: string | null
	fileSize: number
	lastModified: number
	title: string | null
	artist: string | null
	album: string | null
	genres: string[]
	durationSeconds: number | null
	bpm: number | null
	key: string | null
}

export type EssentiaBrowserSource = {
	importedAt: string
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
}

export type RekordboxXmlEvidenceData = Omit<
	RekordboxXmlSource,
	'importedAt'
> & {
	rekordboxTrackId: string | null
}

export type EmbeddedTagsEvidenceData = Omit<EmbeddedTagsSource, 'importedAt'>

export type EssentiaBrowserEvidenceData = Omit<
	EssentiaBrowserSource,
	'importedAt'
>

export type TrackEvidenceObservation<TData> = {
	kind: 'observation'
	observationId: string
	observedAt: string
	match: TrackEvidenceSourceMatch
	data: TData
}

export type TrackEvidenceLegacyLimitation =
	| 'missing-observation-id'
	| 'missing-source-match'
	| 'missing-rekordbox-track-id'

export type TrackEvidenceLegacyObservation<TData> = {
	kind: 'legacy-v1'
	observationId: null
	observedAt: string
	match: null
	data: TData
	limitations: TrackEvidenceLegacyLimitation[]
	unknownFields: TrackEvidenceUnknownFields
}

export type TrackEvidenceCurrentSources = {
	rekordboxXml?: TrackEvidenceObservation<RekordboxXmlEvidenceData>
	embeddedTags?: TrackEvidenceObservation<EmbeddedTagsEvidenceData>
	essentiaBrowser?: TrackEvidenceObservation<EssentiaBrowserEvidenceData>
}

export type TrackEvidenceLegacySources = {
	rekordboxXml?: TrackEvidenceLegacyObservation<RekordboxXmlEvidenceData>
	embeddedTags?: TrackEvidenceLegacyObservation<EmbeddedTagsEvidenceData>
	essentiaBrowser?: TrackEvidenceLegacyObservation<EssentiaBrowserEvidenceData>
}

/**
 * A v1 row upgrades incrementally: a newly observed source replaces only its
 * own bounded slot while untouched v1 slots remain honest legacy observations.
 */
export type TrackEvidenceV2Sources = {
	rekordboxXml?:
		| TrackEvidenceObservation<RekordboxXmlEvidenceData>
		| TrackEvidenceLegacyObservation<RekordboxXmlEvidenceData>
	embeddedTags?:
		| TrackEvidenceObservation<EmbeddedTagsEvidenceData>
		| TrackEvidenceLegacyObservation<EmbeddedTagsEvidenceData>
	essentiaBrowser?:
		| TrackEvidenceObservation<EssentiaBrowserEvidenceData>
		| TrackEvidenceLegacyObservation<EssentiaBrowserEvidenceData>
}

export type TrackEvidenceBpmApplication = {
	source: TrackEvidenceSourceKey
	observationId: string
	value: number
	appliedAt: string
}

export type TrackEvidenceKeyModeApplication = {
	source: TrackEvidenceSourceKey
	observationId: string
	value: {
		key: number
		mode: 0 | 1
	}
	appliedAt: string
}

export type TrackEvidenceApplications = {
	bpm: TrackEvidenceBpmApplication | null
	keyMode: TrackEvidenceKeyModeApplication | null
}

export type TrackEvidenceLegacyAppliedMarker = {
	source: TrackEvidenceSourceKey
	appliedAt: string
	unknownFields: TrackEvidenceUnknownFields
}

export type TrackEvidenceLegacyMatch = TrackEvidenceLegacyMatchValue & {
	unknownFields: TrackEvidenceUnknownFields
}

export type TrackEvidenceLegacyV1 = {
	sourceVersion: 1
	limitations: [
		'unattributed-global-match',
		'missing-application-values-and-observation-ids'
	]
	applied: {
		bpm: TrackEvidenceLegacyAppliedMarker | null
		keyMode: TrackEvidenceLegacyAppliedMarker | null
	}
	globalMatch: TrackEvidenceLegacyMatch
	unknownFields: {
		root: TrackEvidenceUnknownFields
		applied: TrackEvidenceUnknownFields
		sources: TrackEvidenceUnknownFields
	}
}

type TrackEvidenceV2Base = {
	version: 2
	modelVersion: typeof TRACK_EVIDENCE_MODEL_VERSION
	updatedAt: string
}

/** A v2 value authored without any migrated v1 source slots or envelope. */
export type TrackEvidenceV2FullyCurrent = TrackEvidenceV2Base & {
	origin: 'v2'
	applied: TrackEvidenceApplications
	sources: TrackEvidenceCurrentSources
	legacy: null
}

export type TrackEvidenceV2Current = TrackEvidenceV2Base & {
	origin: 'v2'
	applied: TrackEvidenceApplications
	sources: TrackEvidenceV2Sources
	/**
	 * Retained when this value was upgraded from v1. It keeps the unattributed
	 * global match, applied markers, and unknown fields that current source
	 * observations cannot truthfully absorb.
	 */
	legacy: TrackEvidenceLegacyV1 | null
}

export type TrackEvidenceV2MigratedV1 = TrackEvidenceV2Base & {
	origin: 'v1-migrated'
	applied: { bpm: null; keyMode: null }
	sources: TrackEvidenceLegacySources
	legacy: TrackEvidenceLegacyV1
}

export type TrackEvidenceV2 = TrackEvidenceV2Current | TrackEvidenceV2MigratedV1
