import type { LocalAudioTrackSource } from '~/types/localAudio'
import { TRACK_ENRICHMENT_DRAFT_MATCHER_POLICY_VERSION } from '~/types/trackEnrichmentDraft'
import type { TrackBatchUpdate } from '~~/shared/types/trackUpdates'
import { TRACK_EVIDENCE_MODEL_VERSION } from '../../shared/types/audioFeatures'
import type {
	EmbeddedTagsEvidenceData,
	EssentiaBrowserEvidenceData,
	RekordboxXmlEvidenceData,
	TrackAudioFeatures,
	TrackEvidenceObservation,
	TrackEvidenceSourceKey,
	TrackEvidenceSourceMatch,
	TrackEvidenceV2Current
} from '../../shared/types/audioFeatures'
import { toRekordboxXmlSource } from './rekordboxXml'
import { sanitizeTrackEnrichmentDraftRelativePath } from './trackEnrichmentDraftPrivacy'
import {
	isValidEnrichmentBpm,
	isValidEnrichmentKeyMode
} from './trackEnrichmentScoring'
import type {
	EnrichmentConfidence,
	EnrichmentRow
} from './trackEnrichmentTypes'
import {
	decodeTrackEvidence,
	decodeTrackEvidenceV2
} from './trackEvidenceCodec'
import { createTrackEvidenceObservationId } from './trackEvidenceObservationId'

const MAX_TEXT_LENGTH = 4096
const MAX_FILE_NAME_LENGTH = 255
const MAX_MATCH_DETAILS = 128

function boundedText(value: string): string {
	return value.replace(/\p{Cc}/gu, '').slice(0, MAX_TEXT_LENGTH)
}

function nullableText(value: string | null): string | null {
	return value === null ? null : boundedText(value)
}

function fileNameOnly(value: string): string {
	const fileName = value.split(/[\\/]/u).at(-1) ?? ''
	return boundedText(fileName).slice(0, MAX_FILE_NAME_LENGTH) || 'unknown'
}

function relativeLocationHint(value: string | null): string | null {
	if (value === null) return null
	const sanitized = sanitizeTrackEnrichmentDraftRelativePath(value)
	return sanitized ? boundedText(sanitized) : null
}

function sourceMatch(match: {
	confidence: EnrichmentConfidence
	score: number
	reasons: string[]
	warnings: string[]
}): TrackEvidenceSourceMatch {
	return {
		confidence: match.confidence,
		score: Math.max(0, Math.min(100, match.score)),
		reasons: match.reasons
			.slice(0, MAX_MATCH_DETAILS)
			.map((value) => boundedText(value).slice(0, 512)),
		warnings: match.warnings
			.slice(0, MAX_MATCH_DETAILS)
			.map((value) => boundedText(value).slice(0, 512)),
		matcherPolicyVersion: TRACK_ENRICHMENT_DRAFT_MATCHER_POLICY_VERSION
	}
}

function createEmptyEvidence(updatedAt: string): TrackEvidenceV2Current {
	return {
		version: 2,
		modelVersion: TRACK_EVIDENCE_MODEL_VERSION,
		origin: 'v2',
		updatedAt,
		applied: { bpm: null, keyMode: null },
		sources: {},
		legacy: null
	}
}

/**
 * Converts a valid persisted generation to the writable bounded v2 shape.
 * Migrated legacy slots and their limitation envelope remain intact until a
 * new observation replaces that exact source slot.
 */
function writableEvidence(
	existing: TrackAudioFeatures | null,
	updatedAt: string
): TrackEvidenceV2Current | null {
	if (existing === null) return createEmptyEvidence(updatedAt)
	const decoded = decodeTrackEvidence(existing)
	if (!decoded.ok) return null
	return {
		...structuredClone(decoded.evidence),
		version: 2,
		modelVersion: TRACK_EVIDENCE_MODEL_VERSION,
		origin: 'v2',
		updatedAt
	}
}

function validateWritableEvidence(
	evidence: TrackEvidenceV2Current
): TrackEvidenceV2Current | null {
	const decoded = decodeTrackEvidenceV2(evidence)
	return decoded.ok && decoded.evidence.origin === 'v2'
		? decoded.evidence
		: null
}

function preserveTouchedLegacyUnknownFields(
	evidence: TrackEvidenceV2Current,
	source: TrackEvidenceSourceKey
): TrackEvidenceV2Current {
	const previous = evidence.sources[source]
	if (
		previous?.kind !== 'legacy-v1' ||
		Object.keys(previous.unknownFields).length === 0 ||
		evidence.legacy === null
	) {
		return evidence
	}
	return {
		...evidence,
		legacy: {
			...evidence.legacy,
			unknownFields: {
				...evidence.legacy.unknownFields,
				sources: {
					...evidence.legacy.unknownFields.sources,
					[source]: structuredClone(previous.unknownFields)
				}
			}
		}
	}
}

async function currentObservation<TData>(
	source: TrackEvidenceSourceKey,
	observedAt: string,
	match: TrackEvidenceSourceMatch,
	data: TData
): Promise<TrackEvidenceObservation<TData>> {
	return {
		kind: 'observation',
		observationId: await createTrackEvidenceObservationId(source, {
			observedAt,
			match,
			data
		}),
		observedAt,
		match,
		data
	}
}

export async function mergeRekordboxFeatures(
	existing: TrackAudioFeatures | null,
	source: ReturnType<typeof toRekordboxXmlSource>,
	matchInput: {
		confidence: EnrichmentConfidence
		score: number
		reasons: string[]
		warnings: string[]
	},
	applied: { bpm: boolean; keyMode: boolean },
	importedAt: string,
	rekordboxTrackId: string | null = null
): Promise<TrackEvidenceV2Current | null> {
	const writable = writableEvidence(existing, importedAt)
	if (!writable) return null
	const base = preserveTouchedLegacyUnknownFields(writable, 'rekordboxXml')
	const { importedAt: _legacyImportedAt, ...legacyData } = source
	const data: RekordboxXmlEvidenceData = {
		...legacyData,
		fileName: fileNameOnly(legacyData.fileName),
		name: nullableText(legacyData.name),
		artist: nullableText(legacyData.artist),
		album: nullableText(legacyData.album),
		genre: nullableText(legacyData.genre),
		locationHint: relativeLocationHint(legacyData.locationHint),
		tonality: nullableText(legacyData.tonality),
		kind: nullableText(legacyData.kind),
		comments: nullableText(legacyData.comments),
		remixer: nullableText(legacyData.remixer),
		label: nullableText(legacyData.label),
		dateAdded: nullableText(legacyData.dateAdded),
		rekordboxTrackId: rekordboxTrackId
			? boundedText(rekordboxTrackId).slice(0, 512)
			: null
	}
	const observation = await currentObservation(
		'rekordboxXml',
		importedAt,
		sourceMatch(matchInput),
		data
	)

	return validateWritableEvidence({
		...base,
		applied: {
			bpm:
				applied.bpm && isValidEnrichmentBpm(source.averageBpm)
					? {
							source: 'rekordboxXml',
							observationId: observation.observationId,
							value: source.averageBpm,
							appliedAt: importedAt
						}
					: base.applied.bpm,
			keyMode:
				applied.keyMode &&
				isValidEnrichmentKeyMode(source.parsedKey, source.parsedMode)
					? {
							source: 'rekordboxXml',
							observationId: observation.observationId,
							value: {
								key: source.parsedKey,
								mode: source.parsedMode as 0 | 1
							},
							appliedAt: importedAt
						}
					: base.applied.keyMode
		},
		sources: { ...base.sources, rekordboxXml: observation }
	})
}

function embeddedTagsEvidenceData(
	source: LocalAudioTrackSource
): EmbeddedTagsEvidenceData {
	return {
		fileName: fileNameOnly(source.fileName),
		locationHint: relativeLocationHint(source.locationHint),
		fileSize: source.fileSize,
		lastModified: source.lastModified,
		title: nullableText(source.tags.title),
		artist: nullableText(source.tags.artist),
		album: nullableText(source.tags.album),
		genres: source.tags.genres
			.slice(0, 128)
			.map((value) => boundedText(value).slice(0, 512)),
		durationSeconds: source.tags.durationSeconds,
		bpm: source.tags.bpm,
		key: nullableText(source.tags.key)
	}
}

function essentiaEvidenceData(
	source: LocalAudioTrackSource
): EssentiaBrowserEvidenceData | null {
	if (!source.analysis) return null
	return {
		...source.analysis,
		analyzerVersion: boundedText(source.analysis.analyzerVersion).slice(0, 128),
		configurationVersion: boundedText(
			source.analysis.configurationVersion
		).slice(0, 128),
		bpmEstimates: source.analysis.bpmEstimates.slice(0, 64),
		key: nullableText(source.analysis.key),
		scale: nullableText(source.analysis.scale),
		warnings: source.analysis.warnings
			.slice(0, MAX_MATCH_DETAILS)
			.map((value) => boundedText(value).slice(0, 512))
	}
}

function localAppliedBpm(
	source: LocalAudioTrackSource,
	appliedSource: TrackEvidenceSourceKey
): number | null {
	if (appliedSource === 'embeddedTags') return source.tags.bpm
	if (appliedSource === 'essentiaBrowser') return source.analysis?.bpm ?? null
	return null
}

export async function mergeLocalFeatures(
	existing: TrackAudioFeatures | null,
	source: LocalAudioTrackSource,
	matchInput: {
		confidence: EnrichmentConfidence
		score: number
		reasons: string[]
		warnings: string[]
	},
	applied: {
		bpm: TrackEvidenceSourceKey | null
		keyMode: TrackEvidenceSourceKey | null
	},
	importedAt: string
): Promise<TrackEvidenceV2Current | null> {
	const writable = writableEvidence(existing, importedAt)
	if (!writable) return null
	const base = preserveTouchedLegacyUnknownFields(
		preserveTouchedLegacyUnknownFields(writable, 'embeddedTags'),
		'essentiaBrowser'
	)
	const match = sourceMatch(matchInput)
	const embeddedTagsData = embeddedTagsEvidenceData(source)
	const essentiaData = essentiaEvidenceData(source)
	const [embeddedTags, essentiaBrowser] = await Promise.all([
		currentObservation('embeddedTags', importedAt, match, embeddedTagsData),
		essentiaData
			? currentObservation('essentiaBrowser', importedAt, match, essentiaData)
			: Promise.resolve(null)
	])
	const observations = {
		embeddedTags,
		...(essentiaBrowser ? { essentiaBrowser } : {})
	}
	const bpmObservation =
		applied.bpm === 'embeddedTags'
			? embeddedTags
			: applied.bpm === 'essentiaBrowser'
				? essentiaBrowser
				: null
	const bpmValue = applied.bpm ? localAppliedBpm(source, applied.bpm) : null
	const keyModeObservation =
		applied.keyMode === 'embeddedTags'
			? embeddedTags
			: applied.keyMode === 'essentiaBrowser'
				? essentiaBrowser
				: null

	return validateWritableEvidence({
		...base,
		applied: {
			bpm:
				bpmObservation && isValidEnrichmentBpm(bpmValue)
					? {
							source: applied.bpm!,
							observationId: bpmObservation.observationId,
							value: bpmValue,
							appliedAt: importedAt
						}
					: base.applied.bpm,
			keyMode:
				keyModeObservation &&
				isValidEnrichmentKeyMode(source.parsedKey, source.parsedMode)
					? {
							source: applied.keyMode!,
							observationId: keyModeObservation.observationId,
							value: {
								key: source.parsedKey,
								mode: source.parsedMode as 0 | 1
							},
							appliedAt: importedAt
						}
					: base.applied.keyMode
		},
		sources: { ...base.sources, ...observations }
	})
}

export async function buildEnrichmentUpdate(
	row: EnrichmentRow,
	fileName: string,
	importedAt: string,
	intentKind: 'fill-empty-fields' | 'evidence-only' = 'fill-empty-fields'
): Promise<TrackBatchUpdate | null> {
	if (!row.track?.updated_at || row.stagingBlockedReason) return null

	const updates: TrackBatchUpdate['updates'] = {}
	const shouldApplyBpm =
		intentKind === 'fill-empty-fields' &&
		row.track.bpm === null &&
		row.proposedBpmSource !== null &&
		isValidEnrichmentBpm(row.proposedBpm)
	const shouldApplyKeyMode =
		intentKind === 'fill-empty-fields' &&
		row.track.key === null &&
		row.track.mode === null &&
		row.proposedKeyModeSource !== null &&
		isValidEnrichmentKeyMode(row.proposedKey, row.proposedMode)

	if (shouldApplyBpm) updates.bpm = row.proposedBpm
	if (shouldApplyKeyMode) {
		updates.key = row.proposedKey
		updates.mode = row.proposedMode
	}

	const match = {
		confidence: row.confidence,
		score: row.score,
		reasons: row.reasons,
		warnings: row.warnings
	}
	const evidence =
		row.source.sourceType === 'rekordboxXml'
			? await mergeRekordboxFeatures(
					row.track.audio_features,
					toRekordboxXmlSource(row.source, fileName, importedAt),
					match,
					{ bpm: shouldApplyBpm, keyMode: shouldApplyKeyMode },
					importedAt,
					row.source.trackId
				)
			: await mergeLocalFeatures(
					row.track.audio_features,
					row.source,
					match,
					{
						bpm: shouldApplyBpm ? row.proposedBpmSource : null,
						keyMode: shouldApplyKeyMode ? row.proposedKeyModeSource : null
					},
					importedAt
				)
	if (!evidence) return null
	updates.audio_features = evidence

	return {
		id: row.track.id,
		expectedUpdatedAt: row.track.updated_at,
		updates,
		preconditions: {
			bpmMustBeNull: shouldApplyBpm,
			keyModeMustBeNull: shouldApplyKeyMode
		}
	}
}
