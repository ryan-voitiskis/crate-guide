import {
	TRACK_EVIDENCE_SOURCE_KEYS,
	type TrackEvidenceSourceKey,
	type TrackEvidenceV2Current,
	type TrackEvidenceV2MigratedV1
} from '../../shared/types/audioFeatures'
import { pitchClassDistance } from './keyFunctions'
import { parseRekordboxTonality } from './rekordboxXml'
import type {
	TrackEvidenceDecodeIssue,
	TrackEvidenceDecodeResult
} from './trackEvidenceCodec'

export const TRACK_EVIDENCE_AGREEMENT_POLICY_VERSION =
	'track-evidence-agreement-v1' as const

const RELATIVE_MINOR_BY_MAJOR_PITCH_CLASS = Object.freeze([
	9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8
] as const)

export const TRACK_EVIDENCE_AGREEMENT_POLICY = Object.freeze({
	version: TRACK_EVIDENCE_AGREEMENT_POLICY_VERSION,
	minimumPopulatedSources: 2 as const,
	bpm: Object.freeze({
		minimumValue: 30,
		maximumValue: 300,
		maximumAbsoluteDifference: 0.5,
		boundary: 'inclusive' as const,
		halfDoubleTempoCountsAsAgreement: false
	}),
	keyMode: Object.freeze({
		minimumPitchClass: 0,
		maximumPitchClass: 11,
		minorMode: 0 as const,
		majorMode: 1 as const,
		relativeMinorByMajorPitchClass: RELATIVE_MINOR_BY_MAJOR_PITCH_CLASS,
		agreementRelations: Object.freeze([
			'exact',
			'relative-major-minor'
		] as const),
		conflictRelations: Object.freeze([
			'parallel-major-minor',
			'perfect-fourth-or-fifth',
			'other'
		] as const)
	})
})

export type TrackEvidenceAgreementStatus =
	'agreement' | 'conflict' | 'insufficient-evidence'

export type TrackEvidenceAgreementSourceIdentity = {
	source: TrackEvidenceSourceKey
	observationId: string | null
	observedAt: string | null
	observationKind: 'v2' | 'legacy-v1' | null
}

export type TrackEvidenceAgreementSourceState<TValue> =
	| {
			availability: 'populated'
			identity: TrackEvidenceAgreementSourceIdentity
			value: TValue
	  }
	| {
			availability: 'unavailable'
			identity: TrackEvidenceAgreementSourceIdentity
			reason: 'not-retained' | 'missing-value' | 'invalid-value'
	  }

export type TrackEvidenceAgreementPairSource<TValue> =
	TrackEvidenceAgreementSourceIdentity & {
		value: TValue
	}

export type TrackEvidenceBpmPair = {
	left: TrackEvidenceAgreementPairSource<number>
	right: TrackEvidenceAgreementPairSource<number>
	status: 'agreement' | 'conflict'
	relation: 'exact' | 'within-tolerance' | 'outside-tolerance'
	absoluteDifference: number
	maximumAbsoluteDifference: number
}

export type TrackEvidenceKeyModeValue = {
	key: number
	mode: 0 | 1
}

export type TrackEvidenceKeyModeRelation =
	| 'exact'
	| 'relative-major-minor'
	| 'parallel-major-minor'
	| 'perfect-fourth-or-fifth'
	| 'other'

export type TrackEvidenceKeyModePair = {
	left: TrackEvidenceAgreementPairSource<TrackEvidenceKeyModeValue>
	right: TrackEvidenceAgreementPairSource<TrackEvidenceKeyModeValue>
	status: 'agreement' | 'conflict'
	relation: TrackEvidenceKeyModeRelation
}

type TrackEvidenceFieldOutcome =
	| { status: 'agreement'; label: 'Agreement' }
	| { status: 'conflict'; label: 'Conflict' }
	| {
			status: 'insufficient-evidence'
			label: 'Insufficient evidence'
	  }

export type TrackEvidenceAgreementField<TValue, TPair> =
	TrackEvidenceFieldOutcome & {
		populatedSourceCount: number
		requiredSourceCount: 2
		sourceStates: Record<
			TrackEvidenceSourceKey,
			TrackEvidenceAgreementSourceState<TValue>
		>
		pairs: TPair[]
	}

export type TrackEvidenceAgreementResult =
	| {
			ok: false
			issues: TrackEvidenceDecodeIssue[]
	  }
	| {
			ok: true
			policyVersion: typeof TRACK_EVIDENCE_AGREEMENT_POLICY_VERSION
			bpm: TrackEvidenceAgreementField<number, TrackEvidenceBpmPair>
			keyMode: TrackEvidenceAgreementField<
				TrackEvidenceKeyModeValue,
				TrackEvidenceKeyModePair
			>
	  }

type CurrentObservation = NonNullable<
	TrackEvidenceV2Current['sources'][TrackEvidenceSourceKey]
>
type LegacyObservation = NonNullable<
	TrackEvidenceV2MigratedV1['sources'][TrackEvidenceSourceKey]
>
type AgreementObservation = CurrentObservation | LegacyObservation

type ValueResult<TValue> =
	| { availability: 'populated'; value: TValue }
	| {
			availability: 'unavailable'
			reason: 'missing-value' | 'invalid-value'
	  }

function sourceIdentity(
	source: TrackEvidenceSourceKey,
	observation: AgreementObservation | undefined
): TrackEvidenceAgreementSourceIdentity {
	return {
		source,
		observationId: observation?.observationId ?? null,
		observedAt: observation?.observedAt ?? null,
		observationKind:
			observation?.kind === 'observation'
				? 'v2'
				: observation?.kind === 'legacy-v1'
					? 'legacy-v1'
					: null
	}
}

function sourceState<TValue>(
	source: TrackEvidenceSourceKey,
	observation: AgreementObservation | undefined,
	value: ValueResult<TValue>
): TrackEvidenceAgreementSourceState<TValue> {
	const identity = sourceIdentity(source, observation)
	if (!observation) {
		return { availability: 'unavailable', identity, reason: 'not-retained' }
	}
	return value.availability === 'populated'
		? { availability: 'populated', identity, value: value.value }
		: { availability: 'unavailable', identity, reason: value.reason }
}

function bpmValue(value: number | null): ValueResult<number> {
	if (value === null) {
		return { availability: 'unavailable', reason: 'missing-value' }
	}
	if (
		!Number.isFinite(value) ||
		value < TRACK_EVIDENCE_AGREEMENT_POLICY.bpm.minimumValue ||
		value > TRACK_EVIDENCE_AGREEMENT_POLICY.bpm.maximumValue
	) {
		return { availability: 'unavailable', reason: 'invalid-value' }
	}
	return { availability: 'populated', value }
}

function keyModeValue(
	key: number | null,
	mode: number | null,
	hasRawValue: boolean
): ValueResult<TrackEvidenceKeyModeValue> {
	if (key === null && mode === null) {
		return {
			availability: 'unavailable',
			reason: hasRawValue ? 'invalid-value' : 'missing-value'
		}
	}
	if (
		key === null ||
		mode === null ||
		!Number.isInteger(key) ||
		key < TRACK_EVIDENCE_AGREEMENT_POLICY.keyMode.minimumPitchClass ||
		key > TRACK_EVIDENCE_AGREEMENT_POLICY.keyMode.maximumPitchClass ||
		(mode !== 0 && mode !== 1)
	) {
		return { availability: 'unavailable', reason: 'invalid-value' }
	}
	return { availability: 'populated', value: { key, mode } }
}

function parsedKeyModeValue(
	value: string | null
): ValueResult<TrackEvidenceKeyModeValue> {
	const hasRawValue = value !== null && value.trim().length > 0
	if (!hasRawValue) {
		return { availability: 'unavailable', reason: 'missing-value' }
	}
	const parsed = parseRekordboxTonality(value)
	return keyModeValue(parsed.key, parsed.mode, true)
}

function essentiaKeyModeValue(input: {
	key: string | null
	scale: string | null
}): ValueResult<TrackEvidenceKeyModeValue> {
	const key = input.key?.trim() ?? ''
	const scale = input.scale?.trim() ?? ''
	if (!key && !scale) {
		return { availability: 'unavailable', reason: 'missing-value' }
	}
	if (!key) return { availability: 'unavailable', reason: 'invalid-value' }
	return parsedKeyModeValue(scale ? `${key} ${scale}` : key)
}

function populatedSources<TValue>(
	states: Record<
		TrackEvidenceSourceKey,
		TrackEvidenceAgreementSourceState<TValue>
	>
): TrackEvidenceAgreementPairSource<TValue>[] {
	return TRACK_EVIDENCE_SOURCE_KEYS.flatMap((source) => {
		const state = states[source]
		return state.availability === 'populated'
			? [{ ...state.identity, value: state.value }]
			: []
	})
}

function pairsOf<TValue>(
	values: readonly TrackEvidenceAgreementPairSource<TValue>[]
): Array<
	readonly [
		TrackEvidenceAgreementPairSource<TValue>,
		TrackEvidenceAgreementPairSource<TValue>
	]
> {
	const pairs: Array<
		readonly [
			TrackEvidenceAgreementPairSource<TValue>,
			TrackEvidenceAgreementPairSource<TValue>
		]
	> = []
	for (let left = 0; left < values.length; left++) {
		for (let right = left + 1; right < values.length; right++) {
			pairs.push([values[left]!, values[right]!])
		}
	}
	return pairs
}

function fieldOutcome(
	populatedSourceCount: number,
	pairs: readonly { status: 'agreement' | 'conflict' }[]
): TrackEvidenceFieldOutcome {
	if (
		populatedSourceCount <
		TRACK_EVIDENCE_AGREEMENT_POLICY.minimumPopulatedSources
	) {
		return {
			status: 'insufficient-evidence',
			label: 'Insufficient evidence'
		}
	}
	return pairs.every((pair) => pair.status === 'agreement')
		? { status: 'agreement', label: 'Agreement' }
		: { status: 'conflict', label: 'Conflict' }
}

function compareBpm(
	states: Record<
		TrackEvidenceSourceKey,
		TrackEvidenceAgreementSourceState<number>
	>
): TrackEvidenceAgreementField<number, TrackEvidenceBpmPair> {
	const populated = populatedSources(states)
	const pairs = pairsOf(populated).map<TrackEvidenceBpmPair>(
		([left, right]) => {
			const absoluteDifference = Math.abs(left.value - right.value)
			const status =
				absoluteDifference <=
				TRACK_EVIDENCE_AGREEMENT_POLICY.bpm.maximumAbsoluteDifference
					? 'agreement'
					: 'conflict'
			return {
				left,
				right,
				status,
				relation:
					absoluteDifference === 0
						? ('exact' as const)
						: status === 'agreement'
							? ('within-tolerance' as const)
							: ('outside-tolerance' as const),
				absoluteDifference,
				maximumAbsoluteDifference:
					TRACK_EVIDENCE_AGREEMENT_POLICY.bpm.maximumAbsoluteDifference
			}
		}
	)
	return {
		...fieldOutcome(populated.length, pairs),
		populatedSourceCount: populated.length,
		requiredSourceCount:
			TRACK_EVIDENCE_AGREEMENT_POLICY.minimumPopulatedSources,
		sourceStates: states,
		pairs
	}
}

function keyModeRelation(
	left: TrackEvidenceKeyModeValue,
	right: TrackEvidenceKeyModeValue
): TrackEvidenceKeyModeRelation {
	if (left.key === right.key && left.mode === right.mode) return 'exact'
	if (left.mode !== right.mode) {
		const major = left.mode === 1 ? left : right
		const minor = left.mode === 0 ? left : right
		if (
			TRACK_EVIDENCE_AGREEMENT_POLICY.keyMode.relativeMinorByMajorPitchClass[
				major.key
			] === minor.key
		) {
			return 'relative-major-minor'
		}
		if (left.key === right.key) return 'parallel-major-minor'
		return 'other'
	}
	return pitchClassDistance(left.key, right.key) === 5
		? 'perfect-fourth-or-fifth'
		: 'other'
}

function compareKeyMode(
	states: Record<
		TrackEvidenceSourceKey,
		TrackEvidenceAgreementSourceState<TrackEvidenceKeyModeValue>
	>
): TrackEvidenceAgreementField<
	TrackEvidenceKeyModeValue,
	TrackEvidenceKeyModePair
> {
	const populated = populatedSources(states)
	const pairs = pairsOf(populated).map(([left, right]) => {
		const relation = keyModeRelation(left.value, right.value)
		return {
			left,
			right,
			status:
				TRACK_EVIDENCE_AGREEMENT_POLICY.keyMode.agreementRelations.includes(
					relation as 'exact' | 'relative-major-minor'
				)
					? ('agreement' as const)
					: ('conflict' as const),
			relation
		}
	})
	return {
		...fieldOutcome(populated.length, pairs),
		populatedSourceCount: populated.length,
		requiredSourceCount:
			TRACK_EVIDENCE_AGREEMENT_POLICY.minimumPopulatedSources,
		sourceStates: states,
		pairs
	}
}

/**
 * Applies a bounded, versioned agreement policy to the strict Evidence read
 * model. Only retained source values and identities participate; match
 * confidence and analyzer metrics are deliberately excluded.
 */
export function compareTrackEvidenceAgreement(
	decoded: TrackEvidenceDecodeResult
): TrackEvidenceAgreementResult {
	if (!decoded.ok) {
		return {
			ok: false,
			issues: decoded.issues.map((issue) => ({
				code: issue.code,
				path: issue.path
			}))
		}
	}

	const sources = decoded.evidence.sources
	const rekordbox = sources.rekordboxXml
	const embedded = sources.embeddedTags
	const essentia = sources.essentiaBrowser
	const bpmStates = {
		rekordboxXml: sourceState(
			'rekordboxXml',
			rekordbox,
			bpmValue(rekordbox?.data.averageBpm ?? null)
		),
		embeddedTags: sourceState(
			'embeddedTags',
			embedded,
			bpmValue(embedded?.data.bpm ?? null)
		),
		essentiaBrowser: sourceState(
			'essentiaBrowser',
			essentia,
			bpmValue(essentia?.data.bpm ?? null)
		)
	}
	const keyModeStates = {
		rekordboxXml: sourceState(
			'rekordboxXml',
			rekordbox,
			keyModeValue(
				rekordbox?.data.parsedKey ?? null,
				rekordbox?.data.parsedMode ?? null,
				Boolean(rekordbox?.data.tonality?.trim())
			)
		),
		embeddedTags: sourceState(
			'embeddedTags',
			embedded,
			parsedKeyModeValue(embedded?.data.key ?? null)
		),
		essentiaBrowser: sourceState(
			'essentiaBrowser',
			essentia,
			essentiaKeyModeValue({
				key: essentia?.data.key ?? null,
				scale: essentia?.data.scale ?? null
			})
		)
	}

	return {
		ok: true,
		policyVersion: TRACK_EVIDENCE_AGREEMENT_POLICY_VERSION,
		bpm: compareBpm(bpmStates),
		keyMode: compareKeyMode(keyModeStates)
	}
}
