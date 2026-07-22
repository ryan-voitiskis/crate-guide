import {
	TRACK_EVIDENCE_SOURCE_KEYS,
	type TrackEvidenceBpmApplication,
	type TrackEvidenceKeyModeApplication,
	type TrackEvidenceLegacyAppliedMarker,
	type TrackEvidenceMatchConfidence,
	type TrackEvidenceSourceKey,
	type TrackEvidenceV2,
	type TrackEvidenceV2Current,
	type TrackEvidenceV2MigratedV1
} from '../../shared/types/audioFeatures'
import type {
	TrackEvidenceDecodeIssue,
	TrackEvidenceDecodeResult
} from './trackEvidenceCodec'

export type TrackEvidenceCurrentValues = {
	bpm: number | null
	key: number | null
	mode: number | null
}

export type TrackEvidenceCurrentReadState<TValue> = {
	state: 'current'
	value: TValue
	populated: boolean
}

export type TrackEvidenceV2ApplicationSnapshot<TValue> = {
	source: TrackEvidenceSourceKey
	sourceLabel: string
	observationId: string
	value: TValue
	appliedAt: string
}

export type TrackEvidenceLegacyApplicationMarker = {
	source: TrackEvidenceSourceKey
	sourceLabel: string
	appliedAt: string
}

export type TrackEvidenceFieldAttribution<TValue> =
	| {
			state: 'applied'
			label: 'Applied value is still current'
			application: TrackEvidenceV2ApplicationSnapshot<TValue>
	  }
	| {
			state: 'changed-since-application'
			label: 'Changed since application'
			application: TrackEvidenceV2ApplicationSnapshot<TValue>
	  }
	| {
			state: 'source-missing'
			label: 'Applied source observation is not retained'
			missingReason: 'source-not-retained' | 'applied-observation-not-retained'
			application: TrackEvidenceV2ApplicationSnapshot<TValue>
	  }
	| {
			state: 'unattributed'
			label: 'No safe application attribution is available'
			reason: 'no-v2-application-snapshot' | 'legacy-v1-application-marker'
			legacyApplication: TrackEvidenceLegacyApplicationMarker | null
	  }

export type TrackEvidenceFieldInterpretation<TCurrent, TApplied> = {
	current: TrackEvidenceCurrentReadState<TCurrent>
	attribution: TrackEvidenceFieldAttribution<TApplied> | null
}

export type TrackEvidenceIdentityMatchInterpretation =
	| {
			kind: 'identity-match-confidence'
			status: 'available'
			label: string
			confidence: TrackEvidenceMatchConfidence
			score: number
			matcherPolicyVersion: string
	  }
	| {
			kind: 'identity-match-confidence'
			status: 'unavailable'
			label: string
			reason: 'legacy-source-match-unavailable'
	  }

export type TrackEvidenceAnalyzerMetrics = {
	kind: 'essentia-analyzer-metrics'
	bpmConfidence: {
		label: 'Essentia BPM analyzer confidence'
		value: number | null
	}
	keyStrength: {
		label: 'Essentia key strength'
		value: number | null
	}
}

export type TrackEvidenceSourceCoverageEntry = {
	source: TrackEvidenceSourceKey
	sourceLabel: string
	retained: boolean
	retentionLabel: string
	observationKind: 'v2' | 'legacy-v1' | null
	observedAt: string | null
	identityMatch: TrackEvidenceIdentityMatchInterpretation | null
	analyzerMetrics: TrackEvidenceAnalyzerMetrics | null
}

export type TrackEvidenceSourceCoverage = {
	retainedCount: number
	totalSourceSlots: 3
	retainedSources: TrackEvidenceSourceKey[]
	missingSources: TrackEvidenceSourceKey[]
	bySource: Record<TrackEvidenceSourceKey, TrackEvidenceSourceCoverageEntry>
}

export type TrackEvidenceLegacyGlobalMatchInterpretation = {
	kind: 'legacy-global-identity-match'
	state: 'unattributed'
	label: string
	confidence: TrackEvidenceMatchConfidence
	score: number
}

export type TrackEvidenceInterpretationResult =
	| {
			ok: false
			issues: TrackEvidenceDecodeIssue[]
	  }
	| {
			ok: true
			sourceVersion: 1 | 2
			origin: TrackEvidenceV2['origin']
			modelVersion: TrackEvidenceV2['modelVersion']
			updatedAt: string
			fields: {
				bpm: TrackEvidenceFieldInterpretation<number | null, number>
				keyMode: TrackEvidenceFieldInterpretation<
					{ key: number | null; mode: number | null },
					{ key: number; mode: 0 | 1 }
				>
			}
			sourceCoverage: TrackEvidenceSourceCoverage
			legacyGlobalMatch: TrackEvidenceLegacyGlobalMatchInterpretation | null
	  }

type CurrentObservation = NonNullable<
	TrackEvidenceV2Current['sources'][TrackEvidenceSourceKey]
>
type LegacyObservation = NonNullable<
	TrackEvidenceV2MigratedV1['sources'][TrackEvidenceSourceKey]
>
type CoverageObservation = CurrentObservation | LegacyObservation

const SOURCE_LABELS: Record<TrackEvidenceSourceKey, string> = {
	rekordboxXml: 'Rekordbox XML',
	embeddedTags: 'Embedded tags',
	essentiaBrowser: 'Essentia browser analysis'
}

const IDENTITY_CONFIDENCE_LABELS: Record<TrackEvidenceMatchConfidence, string> =
	{
		high: 'high identity match',
		medium: 'medium identity match',
		manual: 'manual identity review required'
	}

function applicationSnapshot<TValue>(
	application: TrackEvidenceBpmApplication | TrackEvidenceKeyModeApplication,
	value: TValue
): TrackEvidenceV2ApplicationSnapshot<TValue> {
	return {
		source: application.source,
		sourceLabel: SOURCE_LABELS[application.source],
		observationId: application.observationId,
		value,
		appliedAt: application.appliedAt
	}
}

function legacyApplicationMarker(
	marker: TrackEvidenceLegacyAppliedMarker
): TrackEvidenceLegacyApplicationMarker {
	return {
		source: marker.source,
		sourceLabel: SOURCE_LABELS[marker.source],
		appliedAt: marker.appliedAt
	}
}

function retainedApplicationSource(
	evidence: TrackEvidenceV2Current,
	application: TrackEvidenceBpmApplication | TrackEvidenceKeyModeApplication
):
	| { retained: true }
	| {
			retained: false
			reason: 'source-not-retained' | 'applied-observation-not-retained'
	  } {
	const source = evidence.sources[application.source]
	if (!source || source.kind !== 'observation') {
		return { retained: false, reason: 'source-not-retained' }
	}
	if (source.observationId !== application.observationId) {
		return {
			retained: false,
			reason: 'applied-observation-not-retained'
		}
	}
	return { retained: true }
}

function v2Attribution<TValue>(input: {
	evidence: TrackEvidenceV2Current
	application: TrackEvidenceBpmApplication | TrackEvidenceKeyModeApplication
	appliedValue: TValue
	currentMatches: boolean
}): TrackEvidenceFieldAttribution<TValue> {
	const application = applicationSnapshot(input.application, input.appliedValue)
	const source = retainedApplicationSource(input.evidence, input.application)
	if (!source.retained) {
		return {
			state: 'source-missing',
			label: 'Applied source observation is not retained',
			missingReason: source.reason,
			application
		}
	}
	return input.currentMatches
		? {
				state: 'applied',
				label: 'Applied value is still current',
				application
			}
		: {
				state: 'changed-since-application',
				label: 'Changed since application',
				application
			}
}

function unattributed(
	legacyMarker: TrackEvidenceLegacyAppliedMarker | null
): TrackEvidenceFieldAttribution<never> {
	return {
		state: 'unattributed',
		label: 'No safe application attribution is available',
		reason: legacyMarker
			? 'legacy-v1-application-marker'
			: 'no-v2-application-snapshot',
		legacyApplication: legacyMarker
			? legacyApplicationMarker(legacyMarker)
			: null
	}
}

function interpretBpm(
	evidence: TrackEvidenceV2,
	currentBpm: number | null
): TrackEvidenceFieldInterpretation<number | null, number> {
	const current = {
		state: 'current' as const,
		value: currentBpm,
		populated: currentBpm !== null
	}
	if (evidence.origin === 'v2' && evidence.applied.bpm) {
		const application = evidence.applied.bpm
		return {
			current,
			attribution: v2Attribution({
				evidence,
				application,
				appliedValue: application.value,
				currentMatches: currentBpm === application.value
			})
		}
	}

	const legacyMarker =
		evidence.origin === 'v1-migrated' ? evidence.legacy.applied.bpm : null
	return {
		current,
		attribution:
			current.populated || legacyMarker ? unattributed(legacyMarker) : null
	}
}

function interpretKeyMode(
	evidence: TrackEvidenceV2,
	currentKey: number | null,
	currentMode: number | null
): TrackEvidenceFieldInterpretation<
	{ key: number | null; mode: number | null },
	{ key: number; mode: 0 | 1 }
> {
	const current = {
		state: 'current' as const,
		value: { key: currentKey, mode: currentMode },
		populated: currentKey !== null || currentMode !== null
	}
	if (evidence.origin === 'v2' && evidence.applied.keyMode) {
		const application = evidence.applied.keyMode
		return {
			current,
			attribution: v2Attribution({
				evidence,
				application,
				appliedValue: {
					key: application.value.key,
					mode: application.value.mode
				},
				currentMatches:
					currentKey === application.value.key &&
					currentMode === application.value.mode
			})
		}
	}

	const legacyMarker =
		evidence.origin === 'v1-migrated' ? evidence.legacy.applied.keyMode : null
	return {
		current,
		attribution:
			current.populated || legacyMarker ? unattributed(legacyMarker) : null
	}
}

function identityMatch(
	source: TrackEvidenceSourceKey,
	observation: CoverageObservation
): TrackEvidenceIdentityMatchInterpretation {
	const sourceLabel = SOURCE_LABELS[source]
	if (observation.kind === 'legacy-v1') {
		return {
			kind: 'identity-match-confidence',
			status: 'unavailable',
			label: `${sourceLabel}: source-specific identity match unavailable for migrated v1 evidence`,
			reason: 'legacy-source-match-unavailable'
		}
	}
	return {
		kind: 'identity-match-confidence',
		status: 'available',
		label: `${sourceLabel}: ${IDENTITY_CONFIDENCE_LABELS[observation.match.confidence]}`,
		confidence: observation.match.confidence,
		score: observation.match.score,
		matcherPolicyVersion: observation.match.matcherPolicyVersion
	}
}

function coverageEntry(
	source: TrackEvidenceSourceKey,
	observation: CoverageObservation | undefined,
	analyzerMetrics: TrackEvidenceAnalyzerMetrics | null = null
): TrackEvidenceSourceCoverageEntry {
	const sourceLabel = SOURCE_LABELS[source]
	return {
		source,
		sourceLabel,
		retained: observation !== undefined,
		retentionLabel: observation
			? `${sourceLabel} evidence retained`
			: `${sourceLabel} evidence not retained`,
		observationKind:
			observation?.kind === 'observation'
				? 'v2'
				: observation?.kind === 'legacy-v1'
					? 'legacy-v1'
					: null,
		observedAt: observation?.observedAt ?? null,
		identityMatch: observation ? identityMatch(source, observation) : null,
		analyzerMetrics: observation ? analyzerMetrics : null
	}
}

function sourceCoverage(
	evidence: TrackEvidenceV2
): TrackEvidenceSourceCoverage {
	const essentia = evidence.sources.essentiaBrowser
	const bySource: TrackEvidenceSourceCoverage['bySource'] = {
		rekordboxXml: coverageEntry('rekordboxXml', evidence.sources.rekordboxXml),
		embeddedTags: coverageEntry('embeddedTags', evidence.sources.embeddedTags),
		essentiaBrowser: coverageEntry(
			'essentiaBrowser',
			essentia,
			essentia
				? {
						kind: 'essentia-analyzer-metrics',
						bpmConfidence: {
							label: 'Essentia BPM analyzer confidence',
							value: essentia.data.bpmConfidence
						},
						keyStrength: {
							label: 'Essentia key strength',
							value: essentia.data.keyStrength
						}
					}
				: null
		)
	}
	const retainedSources = TRACK_EVIDENCE_SOURCE_KEYS.filter(
		(source) => bySource[source].retained
	)
	const missingSources = TRACK_EVIDENCE_SOURCE_KEYS.filter(
		(source) => !bySource[source].retained
	)
	return {
		retainedCount: retainedSources.length,
		totalSourceSlots: TRACK_EVIDENCE_SOURCE_KEYS.length,
		retainedSources,
		missingSources,
		bySource
	}
}

function legacyGlobalMatch(
	evidence: TrackEvidenceV2
): TrackEvidenceLegacyGlobalMatchInterpretation | null {
	if (evidence.origin !== 'v1-migrated') return null
	return {
		kind: 'legacy-global-identity-match',
		state: 'unattributed',
		label: `Legacy global ${IDENTITY_CONFIDENCE_LABELS[evidence.legacy.globalMatch.confidence]} (not attributable to a source)`,
		confidence: evidence.legacy.globalMatch.confidence,
		score: evidence.legacy.globalMatch.score
	}
}

/**
 * Derives a bounded, read-only interpretation from the strict compatibility
 * reader. It compares only explicit application snapshots with current values;
 * it does not infer source agreement, correctness, or historical events.
 */
export function interpretTrackEvidence(
	decoded: TrackEvidenceDecodeResult,
	currentValues: TrackEvidenceCurrentValues
): TrackEvidenceInterpretationResult {
	if (!decoded.ok) {
		return {
			ok: false,
			issues: decoded.issues.map((issue) => ({
				code: issue.code,
				path: issue.path
			}))
		}
	}

	const { evidence } = decoded
	return {
		ok: true,
		sourceVersion: decoded.sourceVersion,
		origin: evidence.origin,
		modelVersion: evidence.modelVersion,
		updatedAt: evidence.updatedAt,
		fields: {
			bpm: interpretBpm(evidence, currentValues.bpm),
			keyMode: interpretKeyMode(evidence, currentValues.key, currentValues.mode)
		},
		sourceCoverage: sourceCoverage(evidence),
		legacyGlobalMatch: legacyGlobalMatch(evidence)
	}
}
