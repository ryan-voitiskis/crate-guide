import { describe, expect, it } from 'vitest'
import {
	currentTrackEvidenceV2Golden,
	legacyTrackAudioFeaturesV1Golden,
	mixedTrackEvidenceV2Golden
} from '../../test/fixtures/trackEvidence'
import {
	TRACK_EVIDENCE_AGREEMENT_POLICY,
	TRACK_EVIDENCE_AGREEMENT_POLICY_VERSION,
	type TrackEvidenceAgreementResult,
	compareTrackEvidenceAgreement
} from './trackEvidenceAgreement'
import { decodeTrackEvidence } from './trackEvidenceCodec'

const NOTE_NAMES = [
	'C',
	'C#',
	'D',
	'Eb',
	'E',
	'F',
	'F#',
	'G',
	'Ab',
	'A',
	'Bb',
	'B'
] as const

const RELATIVE_MINOR_BY_MAJOR = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8]

function decoded(value: unknown) {
	const result = decodeTrackEvidence(value)
	if (!result.ok) throw new Error('Expected Evidence decoding to succeed')
	return result
}

function comparedSuccess(
	result: TrackEvidenceAgreementResult
): Extract<TrackEvidenceAgreementResult, { ok: true }> {
	if (!result.ok) throw new Error('Expected Evidence comparison to succeed')
	return result
}

function collectStatuses(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(collectStatuses)
	if (value === null || typeof value !== 'object') return []
	return Object.entries(value).flatMap(([key, nested]) => [
		...(key === 'status' && typeof nested === 'string' ? [nested] : []),
		...collectStatuses(nested)
	])
}

function evidenceWithBpm(left: number | null, right: number | null) {
	const evidence = structuredClone(currentTrackEvidenceV2Golden)
	evidence.applied = { bpm: null, keyMode: null }
	evidence.sources.rekordboxXml!.data.averageBpm = left
	evidence.sources.embeddedTags!.data.bpm = right
	evidence.sources.essentiaBrowser!.data.bpm = null
	return evidence
}

function evidenceWithTwoKeys(input: {
	left: { key: number | null; mode: number | null; tonality?: string | null }
	right: string | null
}) {
	const evidence = structuredClone(currentTrackEvidenceV2Golden)
	evidence.applied = { bpm: null, keyMode: null }
	evidence.sources.rekordboxXml!.data.parsedKey = input.left.key
	evidence.sources.rekordboxXml!.data.parsedMode = input.left.mode
	evidence.sources.rekordboxXml!.data.tonality =
		input.left.tonality === undefined
			? input.left.key === null || input.left.mode === null
				? null
				: `${NOTE_NAMES[input.left.key]} ${input.left.mode === 0 ? 'Minor' : 'Major'}`
			: input.left.tonality
	evidence.sources.embeddedTags!.data.key = input.right
	evidence.sources.essentiaBrowser!.data.key = null
	evidence.sources.essentiaBrowser!.data.scale = null
	return evidence
}

describe('track Evidence agreement policy', () => {
	it('compares current and retained legacy source slots after an incremental upgrade', () => {
		const result = comparedSuccess(
			compareTrackEvidenceAgreement(decoded(mixedTrackEvidenceV2Golden))
		)

		expect(result.bpm.status).toBe('agreement')
		expect(result.bpm.sourceStates.rekordboxXml).toMatchObject({
			availability: 'populated',
			identity: {
				observationKind: 'v2',
				observationId: 'obs-rbx-20260721-001'
			}
		})
		expect(result.bpm.sourceStates.embeddedTags).toMatchObject({
			availability: 'populated',
			identity: { observationKind: 'legacy-v1', observationId: null }
		})
	})

	it('publishes the version, inclusive BPM threshold, and explicit harmonic rules', () => {
		expect(TRACK_EVIDENCE_AGREEMENT_POLICY).toEqual({
			version: 'track-evidence-agreement-v1',
			minimumPopulatedSources: 2,
			bpm: {
				minimumValue: 30,
				maximumValue: 300,
				maximumAbsoluteDifference: 0.5,
				boundary: 'inclusive',
				halfDoubleTempoCountsAsAgreement: false
			},
			keyMode: {
				minimumPitchClass: 0,
				maximumPitchClass: 11,
				minorMode: 0,
				majorMode: 1,
				relativeMinorByMajorPitchClass: RELATIVE_MINOR_BY_MAJOR,
				agreementRelations: ['exact', 'relative-major-minor'],
				conflictRelations: [
					'parallel-major-minor',
					'perfect-fourth-or-fifth',
					'other'
				]
			}
		})
		expect(TRACK_EVIDENCE_AGREEMENT_POLICY_VERSION).toBe(
			'track-evidence-agreement-v1'
		)
		expect(Object.isFrozen(TRACK_EVIDENCE_AGREEMENT_POLICY)).toBe(true)
		expect(Object.isFrozen(TRACK_EVIDENCE_AGREEMENT_POLICY.keyMode)).toBe(true)
		expect(
			Object.isFrozen(
				TRACK_EVIDENCE_AGREEMENT_POLICY.keyMode.relativeMinorByMajorPitchClass
			)
		).toBe(true)
	})

	it('derives deterministic all-pairs agreement while preserving source identities', () => {
		const result = comparedSuccess(
			compareTrackEvidenceAgreement(decoded(currentTrackEvidenceV2Golden))
		)

		expect(result.policyVersion).toBe('track-evidence-agreement-v1')
		expect(result.bpm).toMatchObject({
			status: 'agreement',
			label: 'Agreement',
			populatedSourceCount: 3,
			requiredSourceCount: 2
		})
		expect(
			result.bpm.pairs.map((pair) => `${pair.left.source}:${pair.right.source}`)
		).toEqual([
			'rekordboxXml:embeddedTags',
			'rekordboxXml:essentiaBrowser',
			'embeddedTags:essentiaBrowser'
		])
		expect(result.bpm.pairs[0]).toMatchObject({
			left: {
				source: 'rekordboxXml',
				observationId: 'obs-rbx-20260721-001',
				observationKind: 'v2',
				value: 128
			},
			right: {
				source: 'embeddedTags',
				observationId: 'obs-tags-20260721-001',
				value: 128.01
			},
			status: 'agreement',
			relation: 'within-tolerance',
			maximumAbsoluteDifference: 0.5
		})
		expect(result.keyMode).toMatchObject({
			status: 'agreement',
			label: 'Agreement',
			populatedSourceCount: 3
		})
		expect(result.keyMode.pairs.map((pair) => pair.relation)).toEqual([
			'exact',
			'exact',
			'exact'
		])
	})

	it.each([
		{
			name: 'includes the exact tolerance boundary',
			left: 100,
			right: 100.5,
			status: 'agreement',
			relation: 'within-tolerance'
		},
		{
			name: 'rejects the first value beyond the tolerance boundary',
			left: 100,
			right: 100.500_001,
			status: 'conflict',
			relation: 'outside-tolerance'
		},
		{
			name: 'does not fold half and double tempos',
			left: 64,
			right: 128,
			status: 'conflict',
			relation: 'outside-tolerance'
		}
	])('$name', ({ left, relation, right, status }) => {
		const result = comparedSuccess(
			compareTrackEvidenceAgreement(decoded(evidenceWithBpm(left, right)))
		)

		expect(result.bpm.status).toBe(status)
		expect(result.bpm.pairs).toHaveLength(1)
		expect(result.bpm.pairs[0]).toMatchObject({ status, relation })
	})

	it.each(
		RELATIVE_MINOR_BY_MAJOR.map((minor, major) => ({
			major,
			majorName: `${NOTE_NAMES[major]} Major`,
			minor,
			minorName: `${NOTE_NAMES[minor]} Minor`
		}))
	)(
		'treats $majorName -> $minorName as the explicit relative-major/minor agreement',
		({ major, minorName }) => {
			const result = comparedSuccess(
				compareTrackEvidenceAgreement(
					decoded(
						evidenceWithTwoKeys({
							left: { key: major, mode: 1 },
							right: minorName
						})
					)
				)
			)

			expect(result.keyMode).toMatchObject({
				status: 'agreement',
				label: 'Agreement',
				populatedSourceCount: 2
			})
			expect(result.keyMode.pairs).toHaveLength(1)
			expect(result.keyMode.pairs[0]).toMatchObject({
				status: 'agreement',
				relation: 'relative-major-minor'
			})
		}
	)

	it('recognizes the relative mapping regardless of source direction', () => {
		const result = comparedSuccess(
			compareTrackEvidenceAgreement(
				decoded(
					evidenceWithTwoKeys({
						left: { key: 9, mode: 0 },
						right: 'C Major'
					})
				)
			)
		)

		expect(result.keyMode.pairs[0]).toMatchObject({
			status: 'agreement',
			relation: 'relative-major-minor'
		})
	})

	it.each([
		{
			name: 'parallel major/minor',
			left: { key: 0, mode: 0 },
			right: 'C Major',
			relation: 'parallel-major-minor'
		},
		{
			name: 'a perfect fourth/fifth pairing',
			left: { key: 0, mode: 0 },
			right: 'G Minor',
			relation: 'perfect-fourth-or-fifth'
		},
		{
			name: 'another key relationship',
			left: { key: 0, mode: 0 },
			right: 'F# Minor',
			relation: 'other'
		}
	])('classifies $name as conflict', ({ left, relation, right }) => {
		const result = comparedSuccess(
			compareTrackEvidenceAgreement(
				decoded(evidenceWithTwoKeys({ left, right }))
			)
		)

		expect(result.keyMode).toMatchObject({
			status: 'conflict',
			label: 'Conflict',
			populatedSourceCount: 2
		})
		expect(result.keyMode.pairs[0]).toMatchObject({
			status: 'conflict',
			relation
		})
	})

	it('requires two populated retained sources and explains exclusions', () => {
		const evidence = evidenceWithTwoKeys({
			left: { key: null, mode: null, tonality: 'not-a-key' },
			right: null
		})
		evidence.sources.rekordboxXml!.data.averageBpm = 29
		evidence.sources.embeddedTags!.data.bpm = null
		evidence.sources.essentiaBrowser!.data.bpm = 128
		const result = comparedSuccess(
			compareTrackEvidenceAgreement(decoded(evidence))
		)

		expect(result.bpm).toMatchObject({
			status: 'insufficient-evidence',
			label: 'Insufficient evidence',
			populatedSourceCount: 1,
			requiredSourceCount: 2,
			pairs: []
		})
		expect(result.bpm.sourceStates.rekordboxXml).toMatchObject({
			availability: 'unavailable',
			reason: 'invalid-value',
			identity: {
				source: 'rekordboxXml',
				observationId: 'obs-rbx-20260721-001'
			}
		})
		expect(result.bpm.sourceStates.embeddedTags).toMatchObject({
			availability: 'unavailable',
			reason: 'missing-value'
		})
		expect(result.keyMode).toMatchObject({
			status: 'insufficient-evidence',
			populatedSourceCount: 0,
			pairs: []
		})
		expect(result.keyMode.sourceStates.rekordboxXml).toMatchObject({
			availability: 'unavailable',
			reason: 'invalid-value'
		})
	})

	it('distinguishes a source that is not retained from a retained missing value', () => {
		const evidence = structuredClone(currentTrackEvidenceV2Golden)
		evidence.applied = { bpm: null, keyMode: null }
		delete evidence.sources.embeddedTags
		delete evidence.sources.essentiaBrowser
		const result = comparedSuccess(
			compareTrackEvidenceAgreement(decoded(evidence))
		)

		expect(result.bpm.status).toBe('insufficient-evidence')
		expect(result.bpm.sourceStates.embeddedTags).toEqual({
			availability: 'unavailable',
			identity: {
				source: 'embeddedTags',
				observationId: null,
				observedAt: null,
				observationKind: null
			},
			reason: 'not-retained'
		})
	})

	it('keeps identity-match confidence and analyzer metrics out of comparison', () => {
		const baseline = structuredClone(currentTrackEvidenceV2Golden)
		const changedConfidence = structuredClone(currentTrackEvidenceV2Golden)
		changedConfidence.sources.rekordboxXml!.match.confidence = 'manual'
		changedConfidence.sources.rekordboxXml!.match.score = 1
		changedConfidence.sources.embeddedTags!.match.confidence = 'high'
		changedConfidence.sources.embeddedTags!.match.score = 100
		changedConfidence.sources.essentiaBrowser!.match.confidence = 'manual'
		changedConfidence.sources.essentiaBrowser!.match.score = 0
		changedConfidence.sources.essentiaBrowser!.data.bpmConfidence = 999
		changedConfidence.sources.essentiaBrowser!.data.keyStrength = -999

		const first = comparedSuccess(
			compareTrackEvidenceAgreement(decoded(baseline))
		)
		const second = comparedSuccess(
			compareTrackEvidenceAgreement(decoded(changedConfidence))
		)
		expect(second).toEqual(first)
		const serialized = JSON.stringify(second)
		expect(serialized).not.toContain('score')
		expect(serialized).not.toContain('confidence')
		expect(serialized).not.toContain('keyStrength')
	})

	it('preserves source keys while honestly comparing migrated-v1 values', () => {
		const result = comparedSuccess(
			compareTrackEvidenceAgreement(decoded(legacyTrackAudioFeaturesV1Golden))
		)

		expect(result.bpm.status).toBe('agreement')
		expect(result.keyMode.status).toBe('agreement')
		expect(result.bpm.pairs[0]).toMatchObject({
			left: {
				source: 'rekordboxXml',
				observationId: null,
				observationKind: 'legacy-v1'
			},
			right: {
				source: 'embeddedTags',
				observationId: null,
				observationKind: 'legacy-v1'
			}
		})
	})

	it('returns strict-reader failures without producing comparison claims', () => {
		const result = compareTrackEvidenceAgreement(
			decodeTrackEvidence({ version: 2 })
		)

		expect(result).toEqual({
			ok: false,
			issues: expect.arrayContaining([
				expect.objectContaining({ code: 'invalid-shape' })
			])
		})
		expect(result).not.toHaveProperty('bpm')
		expect(result).not.toHaveProperty('keyMode')
	})

	it('uses only bounded agreement language in successful outputs', () => {
		const result = comparedSuccess(
			compareTrackEvidenceAgreement(decoded(currentTrackEvidenceV2Golden))
		)
		const serialized = JSON.stringify(result).toLowerCase()

		expect(serialized).toContain('agreement')
		expect(serialized).not.toContain('correct')
		expect(serialized).not.toContain('history')
		expect(serialized).not.toContain('ground truth')
	})

	it('limits every public status field to the three policy outcomes', () => {
		const outputs = [
			currentTrackEvidenceV2Golden,
			evidenceWithBpm(100, 101),
			evidenceWithBpm(100, null)
		].map((value) =>
			comparedSuccess(compareTrackEvidenceAgreement(decoded(value)))
		)

		expect(new Set(outputs.flatMap(collectStatuses))).toEqual(
			new Set(['agreement', 'conflict', 'insufficient-evidence'])
		)
	})
})
