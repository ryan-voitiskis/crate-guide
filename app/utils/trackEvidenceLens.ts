import localAudioAnalysisConfiguration from '../../shared/config/localAudioAnalysis.json'
import {
	TRACK_EVIDENCE_SOURCE_KEYS,
	type TrackEvidenceMatchConfidence,
	type TrackEvidenceSourceKey
} from '../../shared/types/audioFeatures'
import type { LibraryTrack } from '../../shared/types/library'
import {
	type TrackEvidenceAgreementStatus,
	compareTrackEvidenceAgreement
} from './trackEvidenceAgreement'
import { decodeTrackEvidence } from './trackEvidenceCodec'
import {
	type TrackEvidenceFieldAttribution,
	interpretTrackEvidence
} from './trackEvidenceInterpretation'

export type TrackEvidenceLensPresence = 'retained' | 'none' | 'unavailable'

export type TrackEvidenceLensVersion = 'current-v2' | 'legacy-v1'

export type TrackEvidenceLensApplicationState =
	| 'applied'
	| 'changed-since-application'
	| 'source-missing'
	| 'unattributed'
	| 'none'

export type TrackEvidenceLensAnalyzerStatus =
	| 'current'
	| 'outdated'
	| 'unavailable'
	| 'none'

export type TrackEvidenceLensSourceObservation = {
	retained: boolean
	observedAt: string | null
	identityMatch: TrackEvidenceMatchConfidence | 'legacy-unavailable' | 'none'
	bpm: number | null
	keyMode: { key: number; mode: 0 | 1 } | null
}

export type TrackEvidenceLensRow = {
	id: string
	recordId: string
	title: string
	artistLabel: string
	current: {
		bpm: number | null
		key: number | null
		mode: number | null
	}
	evidence: {
		presence: TrackEvidenceLensPresence
		version: TrackEvidenceLensVersion | null
		retainedSourceCount: number
		sources: Record<TrackEvidenceSourceKey, boolean>
		observations: Record<
			TrackEvidenceSourceKey,
			TrackEvidenceLensSourceObservation
		>
		latestObservedAt: string | null
		analyzerStatus: TrackEvidenceLensAnalyzerStatus
		comparison: {
			bpm: TrackEvidenceAgreementStatus | null
			keyMode: TrackEvidenceAgreementStatus | null
			overall: TrackEvidenceAgreementStatus | null
		}
		application: {
			bpm: TrackEvidenceLensApplicationState
			keyMode: TrackEvidenceLensApplicationState
			bpmSource: TrackEvidenceSourceKey | null
			keyModeSource: TrackEvidenceSourceKey | null
			changedSinceApplication: boolean
		}
	}
}

export type TrackEvidenceLensFilters = {
	presence: 'all' | TrackEvidenceLensPresence
	source: 'all' | TrackEvidenceSourceKey
	comparison: 'all' | TrackEvidenceAgreementStatus
	application: 'all' | 'changed-since-application'
	analyzer: 'all' | 'outdated'
	version: 'all' | TrackEvidenceLensVersion
}

export type TrackEvidenceLensCounts = {
	total: number
	retained: number
	none: number
	unavailable: number
	sources: Record<TrackEvidenceSourceKey, number>
	comparison: Record<TrackEvidenceAgreementStatus, number>
	changedSinceApplication: number
	outdatedAnalyzerConfiguration: number
	versions: Record<TrackEvidenceLensVersion, number>
}

export const DEFAULT_TRACK_EVIDENCE_LENS_FILTERS = Object.freeze({
	presence: 'all',
	source: 'all',
	comparison: 'all',
	application: 'all',
	analyzer: 'all',
	version: 'all'
} satisfies TrackEvidenceLensFilters)

function sourceFlags(value = false): Record<TrackEvidenceSourceKey, boolean> {
	return {
		rekordboxXml: value,
		embeddedTags: value,
		essentiaBrowser: value
	}
}

function emptyObservation(): TrackEvidenceLensSourceObservation {
	return {
		retained: false,
		observedAt: null,
		identityMatch: 'none',
		bpm: null,
		keyMode: null
	}
}

function emptyObservations(): Record<
	TrackEvidenceSourceKey,
	TrackEvidenceLensSourceObservation
> {
	return {
		rekordboxXml: emptyObservation(),
		embeddedTags: emptyObservation(),
		essentiaBrowser: emptyObservation()
	}
}

function unavailableEvidence(
	presence: Exclude<TrackEvidenceLensPresence, 'retained'>
): TrackEvidenceLensRow['evidence'] {
	return {
		presence,
		version: null,
		retainedSourceCount: 0,
		sources: sourceFlags(),
		observations: emptyObservations(),
		latestObservedAt: null,
		analyzerStatus: 'none',
		comparison: { bpm: null, keyMode: null, overall: null },
		application: {
			bpm: 'none',
			keyMode: 'none',
			bpmSource: null,
			keyModeSource: null,
			changedSinceApplication: false
		}
	}
}

function applicationState<TValue>(
	attribution: TrackEvidenceFieldAttribution<TValue> | null
): TrackEvidenceLensApplicationState {
	return attribution?.state ?? 'none'
}

function applicationSource<TValue>(
	attribution: TrackEvidenceFieldAttribution<TValue> | null
): TrackEvidenceSourceKey | null {
	if (!attribution) return null
	return attribution.state === 'unattributed'
		? (attribution.legacyApplication?.source ?? null)
		: attribution.application.source
}

function analyzerStatus(
	decoded: Extract<ReturnType<typeof decodeTrackEvidence>, { ok: true }>
): TrackEvidenceLensAnalyzerStatus {
	const essentia = decoded.evidence.sources.essentiaBrowser
	if (!essentia) return 'none'
	const analyzerVersion = essentia.data.analyzerVersion
	const configurationVersion = essentia.data.configurationVersion
	if (!analyzerVersion || !configurationVersion) return 'unavailable'
	const expectedAnalyzer = localAudioAnalysisConfiguration.analyzerVersion
	const analyzerIsCurrent =
		analyzerVersion === expectedAnalyzer ||
		analyzerVersion.startsWith(`${expectedAnalyzer} (`)
	return analyzerIsCurrent &&
		configurationVersion ===
			localAudioAnalysisConfiguration.configurationVersion
		? 'current'
		: 'outdated'
}

function latestObservedAt(
	observations: Record<
		TrackEvidenceSourceKey,
		TrackEvidenceLensSourceObservation
	>
): string | null {
	let latest: { value: string; timestamp: number } | null = null
	for (const source of TRACK_EVIDENCE_SOURCE_KEYS) {
		const value = observations[source].observedAt
		if (!value) continue
		const timestamp = Date.parse(value)
		if (!Number.isFinite(timestamp)) continue
		if (!latest || timestamp > latest.timestamp) latest = { value, timestamp }
	}
	return latest?.value ?? null
}

function overallComparison(
	bpm: TrackEvidenceAgreementStatus,
	keyMode: TrackEvidenceAgreementStatus
): TrackEvidenceAgreementStatus {
	if (bpm === 'conflict' || keyMode === 'conflict') return 'conflict'
	if (bpm === 'agreement' && keyMode === 'agreement') return 'agreement'
	return 'insufficient-evidence'
}

function baseRow(track: LibraryTrack): Omit<TrackEvidenceLensRow, 'evidence'> {
	return {
		id: track.id,
		recordId: track.record_id,
		title: track.title,
		artistLabel: [...track.artists, ...track.extraartists]
			.map((artist) => artist.name)
			.join(', '),
		current: { bpm: track.bpm, key: track.key, mode: track.mode }
	}
}

/**
 * Produces a bounded read-only collection row. Raw Evidence, decode issues,
 * filenames, and location hints are deliberately absent from the result.
 */
export function deriveTrackEvidenceLensRow(
	track: LibraryTrack
): TrackEvidenceLensRow {
	const base = baseRow(track)
	if (track.audio_features === null) {
		return { ...base, evidence: unavailableEvidence('none') }
	}

	const decoded = decodeTrackEvidence(track.audio_features)
	if (!decoded.ok) {
		return { ...base, evidence: unavailableEvidence('unavailable') }
	}

	const interpretation = interpretTrackEvidence(decoded, {
		bpm: track.bpm,
		key: track.key,
		mode: track.mode
	})
	const agreement = compareTrackEvidenceAgreement(decoded)
	if (!interpretation.ok || !agreement.ok) {
		return { ...base, evidence: unavailableEvidence('unavailable') }
	}

	const bpmApplication = applicationState(interpretation.fields.bpm.attribution)
	const keyModeApplication = applicationState(
		interpretation.fields.keyMode.attribution
	)
	const sources = sourceFlags()
	const observations = emptyObservations()
	for (const source of TRACK_EVIDENCE_SOURCE_KEYS) {
		const coverage = interpretation.sourceCoverage.bySource[source]
		const bpm = agreement.bpm.sourceStates[source]
		const keyMode = agreement.keyMode.sourceStates[source]
		sources[source] = coverage.retained
		observations[source] = {
			retained: coverage.retained,
			observedAt: coverage.observedAt,
			identityMatch:
				coverage.identityMatch?.status === 'available'
					? coverage.identityMatch.confidence
					: coverage.identityMatch
						? 'legacy-unavailable'
						: 'none',
			bpm: bpm.availability === 'populated' ? bpm.value : null,
			keyMode: keyMode.availability === 'populated' ? keyMode.value : null
		}
	}

	return {
		...base,
		evidence: {
			presence: 'retained',
			version: interpretation.sourceVersion === 1 ? 'legacy-v1' : 'current-v2',
			retainedSourceCount: interpretation.sourceCoverage.retainedCount,
			sources,
			observations,
			latestObservedAt: latestObservedAt(observations),
			analyzerStatus: analyzerStatus(decoded),
			comparison: {
				bpm: agreement.bpm.status,
				keyMode: agreement.keyMode.status,
				overall: overallComparison(
					agreement.bpm.status,
					agreement.keyMode.status
				)
			},
			application: {
				bpm: bpmApplication,
				keyMode: keyModeApplication,
				bpmSource: applicationSource(interpretation.fields.bpm.attribution),
				keyModeSource: applicationSource(
					interpretation.fields.keyMode.attribution
				),
				changedSinceApplication:
					bpmApplication === 'changed-since-application' ||
					keyModeApplication === 'changed-since-application'
			}
		}
	}
}

export function deriveTrackEvidenceLensRows(
	tracks: readonly LibraryTrack[]
): TrackEvidenceLensRow[] {
	return tracks.map(deriveTrackEvidenceLensRow)
}

export function countTrackEvidenceLensRows(
	rows: readonly TrackEvidenceLensRow[]
): TrackEvidenceLensCounts {
	const counts: TrackEvidenceLensCounts = {
		total: rows.length,
		retained: 0,
		none: 0,
		unavailable: 0,
		sources: { rekordboxXml: 0, embeddedTags: 0, essentiaBrowser: 0 },
		comparison: {
			agreement: 0,
			conflict: 0,
			'insufficient-evidence': 0
		},
		changedSinceApplication: 0,
		outdatedAnalyzerConfiguration: 0,
		versions: { 'current-v2': 0, 'legacy-v1': 0 }
	}

	for (const row of rows) {
		counts[row.evidence.presence] += 1
		for (const source of TRACK_EVIDENCE_SOURCE_KEYS) {
			if (row.evidence.sources[source]) counts.sources[source] += 1
		}
		if (row.evidence.comparison.overall) {
			counts.comparison[row.evidence.comparison.overall] += 1
		}
		if (row.evidence.application.changedSinceApplication) {
			counts.changedSinceApplication += 1
		}
		if (row.evidence.analyzerStatus === 'outdated') {
			counts.outdatedAnalyzerConfiguration += 1
		}
		if (row.evidence.version) counts.versions[row.evidence.version] += 1
	}

	return counts
}

export function filterTrackEvidenceLensRows(
	rows: readonly TrackEvidenceLensRow[],
	filters: TrackEvidenceLensFilters
): TrackEvidenceLensRow[] {
	return rows.filter((row) => {
		if (
			filters.presence !== 'all' &&
			row.evidence.presence !== filters.presence
		) {
			return false
		}
		if (filters.source !== 'all' && !row.evidence.sources[filters.source]) {
			return false
		}
		if (
			filters.comparison !== 'all' &&
			row.evidence.comparison.overall !== filters.comparison
		) {
			return false
		}
		if (
			filters.application === 'changed-since-application' &&
			!row.evidence.application.changedSinceApplication
		) {
			return false
		}
		if (
			filters.analyzer === 'outdated' &&
			row.evidence.analyzerStatus !== 'outdated'
		) {
			return false
		}
		if (filters.version !== 'all' && row.evidence.version !== filters.version) {
			return false
		}
		return true
	})
}

export function hasTrackEvidenceLensFilters(
	filters: TrackEvidenceLensFilters
): boolean {
	return Object.entries(DEFAULT_TRACK_EVIDENCE_LENS_FILTERS).some(
		([key, value]) => filters[key as keyof TrackEvidenceLensFilters] !== value
	)
}
