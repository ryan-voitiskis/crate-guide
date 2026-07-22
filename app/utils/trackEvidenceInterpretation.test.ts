import { describe, expect, it } from 'vitest'
import {
	currentTrackEvidenceV2Golden,
	legacyTrackAudioFeaturesV1Golden
} from '../../test/fixtures/trackEvidence'
import type { TrackEvidenceDecodeResult } from './trackEvidenceCodec'
import {
	decodeTrackEvidence,
	decodeTrackEvidenceV2
} from './trackEvidenceCodec'
import {
	type TrackEvidenceInterpretationResult,
	interpretTrackEvidence
} from './trackEvidenceInterpretation'

function decodedSuccess(
	value: unknown
): Extract<TrackEvidenceDecodeResult, { ok: true }> {
	const decoded = decodeTrackEvidence(value)
	if (!decoded.ok) throw new Error('Expected Evidence decoding to succeed')
	return decoded
}

function interpretedSuccess(
	result: TrackEvidenceInterpretationResult
): Extract<TrackEvidenceInterpretationResult, { ok: true }> {
	if (!result.ok) throw new Error('Expected Evidence interpretation to succeed')
	return result
}

describe('interpretTrackEvidence', () => {
	it('keeps current values, applied snapshots, and confidence axes explicit', () => {
		const result = interpretedSuccess(
			interpretTrackEvidence(decodedSuccess(currentTrackEvidenceV2Golden), {
				bpm: 128,
				key: 5,
				mode: 0
			})
		)

		expect(result.fields.bpm).toEqual({
			current: { state: 'current', value: 128, populated: true },
			attribution: {
				state: 'applied',
				label: 'Applied value is still current',
				application: {
					source: 'rekordboxXml',
					sourceLabel: 'Rekordbox XML',
					observationId: 'obs-rbx-20260721-001',
					value: 128,
					appliedAt: '2026-07-21T12:01:00.000Z'
				}
			}
		})
		expect(result.fields.keyMode.attribution).toMatchObject({
			state: 'applied',
			application: {
				source: 'embeddedTags',
				sourceLabel: 'Embedded tags',
				value: { key: 5, mode: 0 }
			}
		})

		expect(result.sourceCoverage).toMatchObject({
			retainedCount: 3,
			totalSourceSlots: 3,
			retainedSources: ['rekordboxXml', 'embeddedTags', 'essentiaBrowser'],
			missingSources: []
		})
		expect(result.sourceCoverage.bySource.rekordboxXml.identityMatch).toEqual({
			kind: 'identity-match-confidence',
			status: 'available',
			label: 'Rekordbox XML: high identity match',
			confidence: 'high',
			score: 96,
			matcherPolicyVersion: 'identity-match-v2'
		})
		expect(
			result.sourceCoverage.bySource.essentiaBrowser.identityMatch
		).toMatchObject({
			kind: 'identity-match-confidence',
			label: 'Essentia browser analysis: medium identity match',
			confidence: 'medium'
		})
		expect(
			result.sourceCoverage.bySource.essentiaBrowser.analyzerMetrics
		).toEqual({
			kind: 'essentia-analyzer-metrics',
			bpmConfidence: {
				label: 'Essentia BPM analyzer confidence',
				value: 0.87
			},
			keyStrength: { label: 'Essentia key strength', value: 0.73 }
		})
		expect(
			result.sourceCoverage.bySource.rekordboxXml.analyzerMetrics
		).toBeNull()
		expect(result.legacyGlobalMatch).toBeNull()
		expect(result).not.toHaveProperty('agreement')
		expect(result).not.toHaveProperty('conflict')
	})

	it('labels manual identity review without reclassifying analyzer metrics', () => {
		const evidence = structuredClone(currentTrackEvidenceV2Golden)
		evidence.sources.essentiaBrowser!.match.confidence = 'manual'
		const result = interpretedSuccess(
			interpretTrackEvidence(decodedSuccess(evidence), {
				bpm: 128,
				key: 5,
				mode: 0
			})
		)

		expect(
			result.sourceCoverage.bySource.essentiaBrowser.identityMatch
		).toMatchObject({
			kind: 'identity-match-confidence',
			label: 'Essentia browser analysis: manual identity review required',
			confidence: 'manual'
		})
		expect(
			result.sourceCoverage.bySource.essentiaBrowser.analyzerMetrics
		).toMatchObject({
			kind: 'essentia-analyzer-metrics',
			bpmConfidence: { value: 0.87 },
			keyStrength: { value: 0.73 }
		})
	})

	it('uses exact application snapshots for changed-since-application state', () => {
		const result = interpretedSuccess(
			interpretTrackEvidence(decodedSuccess(currentTrackEvidenceV2Golden), {
				bpm: 128.000_1,
				key: 5,
				mode: 1
			})
		)

		expect(result.fields.bpm.attribution).toMatchObject({
			state: 'changed-since-application',
			label: 'Changed since application',
			application: { value: 128 }
		})
		expect(result.fields.keyMode).toMatchObject({
			current: {
				state: 'current',
				value: { key: 5, mode: 1 },
				populated: true
			},
			attribution: {
				state: 'changed-since-application',
				application: { value: { key: 5, mode: 0 } }
			}
		})
	})

	it('marks populated values without a v2 snapshot as unattributed', () => {
		const evidence = structuredClone(currentTrackEvidenceV2Golden)
		evidence.applied = { bpm: null, keyMode: null }
		const decoded = decodedSuccess(evidence)
		const populated = interpretedSuccess(
			interpretTrackEvidence(decoded, { bpm: 130, key: 7, mode: null })
		)

		expect(populated.fields.bpm.attribution).toEqual({
			state: 'unattributed',
			label: 'No safe application attribution is available',
			reason: 'no-v2-application-snapshot',
			legacyApplication: null
		})
		expect(populated.fields.keyMode.attribution).toMatchObject({
			state: 'unattributed',
			reason: 'no-v2-application-snapshot'
		})
		expect(populated.fields.keyMode.current.populated).toBe(true)

		const empty = interpretedSuccess(
			interpretTrackEvidence(decoded, { bpm: null, key: null, mode: null })
		)
		expect(empty.fields.bpm).toEqual({
			current: { state: 'current', value: null, populated: false },
			attribution: null
		})
		expect(empty.fields.keyMode.attribution).toBeNull()
	})

	it('defensively reports a missing applied observation without weakening the strict reader', () => {
		const decoded = decodedSuccess(currentTrackEvidenceV2Golden)
		if (decoded.evidence.origin !== 'v2') {
			throw new Error('Expected current v2 Evidence')
		}
		delete decoded.evidence.sources.rekordboxXml
		decoded.evidence.sources.embeddedTags!.observationId =
			'replacement-observation'

		expect(decodeTrackEvidenceV2(decoded.evidence).ok).toBe(false)
		const result = interpretedSuccess(
			interpretTrackEvidence(decoded, { bpm: 128, key: 5, mode: 0 })
		)
		expect(result.fields.bpm.attribution).toMatchObject({
			state: 'source-missing',
			missingReason: 'source-not-retained',
			application: { source: 'rekordboxXml', value: 128 }
		})
		expect(result.fields.keyMode.attribution).toMatchObject({
			state: 'source-missing',
			missingReason: 'applied-observation-not-retained',
			application: { source: 'embeddedTags', value: { key: 5, mode: 0 } }
		})
	})

	it('keeps migrated-v1 applications and match confidence explicitly unattributed', () => {
		const result = interpretedSuccess(
			interpretTrackEvidence(decodedSuccess(legacyTrackAudioFeaturesV1Golden), {
				bpm: 128,
				key: 5,
				mode: 0
			})
		)

		expect(result).toMatchObject({ sourceVersion: 1, origin: 'v1-migrated' })
		expect(result.fields.bpm.attribution).toEqual({
			state: 'unattributed',
			label: 'No safe application attribution is available',
			reason: 'legacy-v1-application-marker',
			legacyApplication: {
				source: 'rekordboxXml',
				sourceLabel: 'Rekordbox XML',
				appliedAt: '2026-07-18T09:00:00.000Z'
			}
		})
		expect(result.fields.keyMode.attribution).toMatchObject({
			state: 'unattributed',
			reason: 'legacy-v1-application-marker',
			legacyApplication: { source: 'embeddedTags' }
		})
		expect(result.sourceCoverage.bySource.rekordboxXml.identityMatch).toEqual({
			kind: 'identity-match-confidence',
			status: 'unavailable',
			label:
				'Rekordbox XML: source-specific identity match unavailable for migrated v1 evidence',
			reason: 'legacy-source-match-unavailable'
		})
		expect(
			result.sourceCoverage.bySource.essentiaBrowser.analyzerMetrics
		).toMatchObject({
			bpmConfidence: { value: 0.87 },
			keyStrength: { value: 0.73 }
		})
		expect(result.legacyGlobalMatch).toEqual({
			kind: 'legacy-global-identity-match',
			state: 'unattributed',
			label: 'Legacy global high identity match (not attributable to a source)',
			confidence: 'high',
			score: 94
		})
	})

	it('reports fixed three-source coverage without treating absence as a claim', () => {
		const evidence = structuredClone(currentTrackEvidenceV2Golden)
		delete evidence.sources.essentiaBrowser
		const result = interpretedSuccess(
			interpretTrackEvidence(decodedSuccess(evidence), {
				bpm: 128,
				key: 5,
				mode: 0
			})
		)

		expect(result.sourceCoverage).toMatchObject({
			retainedCount: 2,
			totalSourceSlots: 3,
			retainedSources: ['rekordboxXml', 'embeddedTags'],
			missingSources: ['essentiaBrowser']
		})
		expect(result.sourceCoverage.bySource.essentiaBrowser).toEqual({
			source: 'essentiaBrowser',
			sourceLabel: 'Essentia browser analysis',
			retained: false,
			retentionLabel: 'Essentia browser analysis evidence not retained',
			observationKind: null,
			observedAt: null,
			identityMatch: null,
			analyzerMetrics: null
		})
		expect(JSON.stringify(result).toLowerCase()).not.toContain('never analyzed')
	})

	it('returns strict-reader failures without deriving provenance states', () => {
		const decoded = decodeTrackEvidence({ version: 2 })
		const result = interpretTrackEvidence(decoded, {
			bpm: 128,
			key: 5,
			mode: 0
		})

		expect(result).toEqual({
			ok: false,
			issues: expect.arrayContaining([
				expect.objectContaining({ code: 'invalid-shape' })
			])
		})
		expect(result).not.toHaveProperty('fields')
		expect(result).not.toHaveProperty('sourceCoverage')
	})
})
