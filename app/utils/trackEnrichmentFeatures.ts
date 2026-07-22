import type { LocalAudioTrackSource } from '~/types/localAudio'
import type {
	AudioFeatureSourceKey,
	EmbeddedTagsSource,
	EssentiaBrowserSource,
	RekordboxXmlSource,
	TrackAudioFeatures
} from '~~/shared/types/audioFeatures'
import type { TrackBatchUpdate } from '~~/shared/types/trackUpdates'
import { toRekordboxXmlSource } from './rekordboxXml'
import {
	isValidEnrichmentBpm,
	isValidEnrichmentKeyMode
} from './trackEnrichmentScoring'
import type {
	EnrichmentConfidence,
	EnrichmentRow
} from './trackEnrichmentTypes'

function createEmptyAudioFeatures(importedAt: string): TrackAudioFeatures {
	return {
		version: 1,
		updatedAt: importedAt,
		applied: { bpm: null, keyMode: null },
		match: {
			confidence: 'manual',
			score: 0,
			reasons: [],
			warnings: []
		},
		sources: {}
	}
}

export function mergeRekordboxFeatures(
	existing: TrackAudioFeatures | null,
	source: RekordboxXmlSource,
	match: {
		confidence: EnrichmentConfidence
		score: number
		reasons: string[]
		warnings: string[]
	},
	applied: { bpm: boolean; keyMode: boolean },
	importedAt: string
): TrackAudioFeatures {
	const base =
		existing?.version === 1 ? existing : createEmptyAudioFeatures(importedAt)

	return {
		version: 1,
		updatedAt: importedAt,
		applied: {
			bpm: applied.bpm
				? { source: 'rekordboxXml', appliedAt: importedAt }
				: base.applied.bpm,
			keyMode: applied.keyMode
				? { source: 'rekordboxXml', appliedAt: importedAt }
				: base.applied.keyMode
		},
		match,
		sources: { ...base.sources, rekordboxXml: source }
	}
}

function toEmbeddedTagsSource(
	source: LocalAudioTrackSource,
	importedAt: string
): EmbeddedTagsSource {
	return {
		importedAt,
		fileName: source.fileName,
		locationHint: source.locationHint,
		fileSize: source.fileSize,
		lastModified: source.lastModified,
		title: source.tags.title,
		artist: source.tags.artist,
		album: source.tags.album,
		genres: source.tags.genres,
		durationSeconds: source.tags.durationSeconds,
		bpm: source.tags.bpm,
		key: source.tags.key
	}
}

function toEssentiaBrowserSource(
	source: LocalAudioTrackSource,
	importedAt: string
): EssentiaBrowserSource | null {
	if (!source.analysis) return null
	return { importedAt, ...source.analysis }
}

export function mergeLocalFeatures(
	existing: TrackAudioFeatures | null,
	source: LocalAudioTrackSource,
	match: {
		confidence: EnrichmentConfidence
		score: number
		reasons: string[]
		warnings: string[]
	},
	applied: {
		bpm: AudioFeatureSourceKey | null
		keyMode: AudioFeatureSourceKey | null
	},
	importedAt: string
): TrackAudioFeatures {
	const base =
		existing?.version === 1 ? existing : createEmptyAudioFeatures(importedAt)
	const essentiaBrowser = toEssentiaBrowserSource(source, importedAt)

	return {
		version: 1,
		updatedAt: importedAt,
		applied: {
			bpm: applied.bpm
				? { source: applied.bpm, appliedAt: importedAt }
				: base.applied.bpm,
			keyMode: applied.keyMode
				? { source: applied.keyMode, appliedAt: importedAt }
				: base.applied.keyMode
		},
		match,
		sources: {
			...base.sources,
			embeddedTags: toEmbeddedTagsSource(source, importedAt),
			...(essentiaBrowser ? { essentiaBrowser } : {})
		}
	}
}

export function buildEnrichmentUpdate(
	row: EnrichmentRow,
	fileName: string,
	importedAt: string
): TrackBatchUpdate | null {
	if (!row.track || row.stagingBlockedReason) return null

	const updates: TrackBatchUpdate['updates'] = {}
	const shouldApplyBpm =
		row.track.bpm === null &&
		row.proposedBpmSource !== null &&
		isValidEnrichmentBpm(row.proposedBpm)
	const shouldApplyKeyMode =
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
	updates.audio_features =
		row.source.sourceType === 'rekordboxXml'
			? mergeRekordboxFeatures(
					row.track.audio_features,
					toRekordboxXmlSource(row.source, fileName, importedAt),
					match,
					{ bpm: shouldApplyBpm, keyMode: shouldApplyKeyMode },
					importedAt
				)
			: mergeLocalFeatures(
					row.track.audio_features,
					row.source,
					match,
					{
						bpm: shouldApplyBpm ? row.proposedBpmSource : null,
						keyMode: shouldApplyKeyMode ? row.proposedKeyModeSource : null
					},
					importedAt
				)

	return {
		id: row.track.id,
		updates,
		preconditions: {
			bpmMustBeNull: shouldApplyBpm,
			keyModeMustBeNull: shouldApplyKeyMode
		}
	}
}
