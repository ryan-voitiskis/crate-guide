import { describe, expect, it } from 'vitest'
import {
	TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION,
	TRACK_ENRICHMENT_DRAFT_MAX_OBSERVATIONS,
	TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES,
	TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION,
	type TrackEnrichmentDraft
} from '~/types/trackEnrichmentDraft'
import {
	createTrackEnrichmentDraftFixture,
	createTrackEnrichmentDraftV1Fixture,
	createTrackEnrichmentEvidenceOnlyDecisionFixture
} from '../../test/fixtures/trackEnrichmentDraft'
import {
	TrackEnrichmentDraftCodecError,
	decodeTrackEnrichmentDraft,
	encodeTrackEnrichmentDraft,
	getCurrentTrackEnrichmentDraftVersions,
	trackEnrichmentDraftBelongsToWorkspace
} from './trackEnrichmentDraftCodec'

function cloneDraft(
	sourceKind: 'rekordboxXml' | 'localAudio' = 'rekordboxXml'
): TrackEnrichmentDraft {
	return structuredClone(createTrackEnrichmentDraftFixture(sourceKind))
}

function decodedDraft(serialized: string): TrackEnrichmentDraft {
	const result = decodeTrackEnrichmentDraft(serialized)
	expect(result.status).toBe('ok')
	if (result.status !== 'ok') throw new Error('Expected a valid draft fixture')
	return result.draft
}

function decodeWithPreEvidenceV2DecisionSemantics(serialized: string) {
	const draft = JSON.parse(serialized) as Record<string, unknown> & {
		decisions: Array<Record<string, unknown>>
	}
	return draft.decisions.map((decision) => {
		if (decision.kind === 'fill-empty-fields' || decision.kind === 'unknown') {
			return decision
		}
		const binding = decision.sourceBinding as
			Record<string, unknown> | undefined
		return {
			kind: 'unknown',
			intentVersion: decision.intentVersion,
			originalKind: decision.kind,
			sourceBinding:
				typeof binding?.sourceFingerprint === 'string' &&
				typeof binding.observationFingerprint === 'string'
					? {
							sourceFingerprint: binding.sourceFingerprint,
							observationFingerprint: binding.observationFingerprint
						}
					: null,
			staged: false,
			reviewedAt:
				typeof decision.reviewedAt === 'string' ? decision.reviewedAt : null
		}
	})
}

function largeDraft(observationCount: number): TrackEnrichmentDraft {
	const draft = cloneDraft()
	const template = draft.observations[0]!
	if (template.evidence.kind !== 'rekordboxXml') {
		throw new Error('Expected an XML observation template')
	}
	const templateEvidence = template.evidence
	draft.observations = Array.from(
		{ length: observationCount },
		(_, ordinal) => {
			const identity = ordinal.toString(16).padStart(64, '0')
			return {
				...structuredClone(template),
				sourceSnapshotId: `snapshot-${ordinal}`,
				sourceFingerprint: `source-${ordinal}`,
				observationFingerprint: identity,
				ordinal,
				evidence: {
					...structuredClone(templateEvidence),
					kind: 'rekordboxXml' as const,
					trackId: null
				}
			}
		}
	)
	draft.decisions = []
	draft.partialOutcomes = []
	draft.ui.anchorSourceFingerprint = null
	return draft
}

describe('track enrichment draft strict codec', () => {
	it.each([50_000, TRACK_ENRICHMENT_DRAFT_MAX_OBSERVATIONS])(
		'round-trips %i observations within the advertised privacy and schema bounds',
		(observationCount) => {
			const startedAt = performance.now()
			const serialized = encodeTrackEnrichmentDraft(
				largeDraft(observationCount)
			)
			const result = decodeTrackEnrichmentDraft(serialized)
			const elapsedMs = performance.now() - startedAt
			const serializedBytes = new TextEncoder().encode(serialized).byteLength

			expect(result.status).toBe('ok')
			if (result.status !== 'ok')
				throw new Error('Expected a valid large draft')
			expect(result.draft.observations).toHaveLength(observationCount)
			expect(serializedBytes).toBeLessThanOrEqual(
				TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES
			)
			expect(elapsedMs).toBeLessThan(60_000)
		},
		120_000
	)

	it.each(['rekordboxXml', 'localAudio'] as const)(
		'round-trips a sanitized %s draft without widening nullable preconditions',
		(sourceKind) => {
			const draft = cloneDraft(sourceKind)
			const serialized = encodeTrackEnrichmentDraft(draft)
			const decoded = decodedDraft(serialized)
			const decision = decoded.decisions[0]
			if (decision?.kind !== 'fill-empty-fields') {
				throw new Error('Expected fill-empty-fields decision')
			}

			expect(decoded).toEqual(draft)
			expect(decision.preconditionBinding.expectedTargetUpdatedAt).toBeNull()
			expect(serialized).not.toContain('userId')
		}
	)

	it('rejects malformed, unsupported, and future top-level schemas explicitly', () => {
		expect(decodeTrackEnrichmentDraft('{')).toEqual({
			status: 'invalid',
			issues: [{ code: 'invalid-json', path: '' }]
		})
		expect(
			decodeTrackEnrichmentDraft(JSON.stringify({ schemaVersion: 0 }))
		).toEqual({
			status: 'incompatible',
			schemaVersion: 0,
			reason: 'unsupported-schema'
		})
		expect(
			decodeTrackEnrichmentDraft(JSON.stringify({ schemaVersion: 3 }))
		).toEqual({
			status: 'incompatible',
			schemaVersion: 3,
			reason: 'future-schema'
		})
	})

	it('migrates strict v1 outcomes without inventing review or application history', () => {
		const legacy = createTrackEnrichmentDraftV1Fixture()
		const successful = structuredClone(legacy.partialOutcomes[0]!)
		const definiteFailure = {
			...successful,
			targetTrackId: 'track-b',
			status: 'failed' as const,
			applied: { bpm: false, keyMode: false },
			failureCode: 'transport' as const
		}
		const ambiguousLegacyFailure = {
			...successful,
			targetTrackId: 'track-c',
			status: 'failed' as const,
			applied: { bpm: false, keyMode: false },
			failureCode: 'unknown' as const
		}
		legacy.partialOutcomes = [
			successful,
			definiteFailure,
			ambiguousLegacyFailure
		]
		legacy.decisions = []

		const result = decodeTrackEnrichmentDraft(JSON.stringify(legacy))
		expect(result.status).toBe('ok')
		if (result.status !== 'ok') throw new Error('Expected v1 migration')
		expect(result.draft.schemaVersion).toBe(
			TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION
		)
		expect(result.draft.observations).toEqual(legacy.observations)
		expect(result.draft.decisions).toEqual([])
		expect(result.draft.partialOutcomes).toEqual([
			successful,
			definiteFailure,
			{ ...ambiguousLegacyFailure, status: 'unknown' }
		])
	})

	it('exhaustively migrates the committed v1 status, failure, and applied permutations', () => {
		const statuses = ['succeeded', 'failed'] as const
		const failureCodes = [
			null,
			'conflict',
			'not-found',
			'offline',
			'permission',
			'transport',
			'unknown'
		] as const
		const appliedValues = [
			{ bpm: false, keyMode: false },
			{ bpm: true, keyMode: false },
			{ bpm: false, keyMode: true },
			{ bpm: true, keyMode: true }
		]

		for (const status of statuses) {
			for (const failureCode of failureCodes) {
				for (const applied of appliedValues) {
					const legacy = createTrackEnrichmentDraftV1Fixture()
					legacy.partialOutcomes = [
						{
							...legacy.partialOutcomes[0]!,
							status,
							failureCode,
							applied
						}
					]
					const result = decodeTrackEnrichmentDraft(JSON.stringify(legacy))
					const wasValidInV1 =
						(status === 'succeeded') === (failureCode === null)

					if (!wasValidInV1) {
						expect(result.status).toBe('invalid')
						continue
					}

					expect(result.status).toBe('ok')
					if (result.status !== 'ok') throw new Error('Expected v1 migration')
					const migrated = result.draft.partialOutcomes[0]!
					const hasApplied = applied.bpm || applied.keyMode
					const becomesUnknown =
						(status === 'succeeded') !== hasApplied ||
						(status === 'failed' && failureCode === 'unknown')

					if (becomesUnknown) {
						expect(migrated).toMatchObject({
							status: 'unknown',
							failureCode: 'unknown',
							applied: { bpm: false, keyMode: false }
						})
					} else {
						expect(migrated).toMatchObject({ status, failureCode, applied })
					}
				}
			}
		}
	})

	it('rejects v2-only outcome states disguised as v1 and audits privacy before migration', () => {
		const v2OutcomeInV1 = createTrackEnrichmentDraftV1Fixture() as unknown as {
			schemaVersion: 1
			partialOutcomes: unknown[]
		}
		v2OutcomeInV1.partialOutcomes[0] = {
			...(v2OutcomeInV1.partialOutcomes[0] as object),
			status: 'unknown',
			failureCode: 'request-unknown'
		}
		expect(
			decodeTrackEnrichmentDraft(JSON.stringify(v2OutcomeInV1)).status
		).toBe('invalid')

		const privateLegacy = createTrackEnrichmentDraftV1Fixture() as unknown as {
			observations: Array<Record<string, unknown>>
		}
		privateLegacy.observations[0]!.rawXml = '<DJ_PLAYLISTS />'
		expect(
			decodeTrackEnrichmentDraft(JSON.stringify(privateLegacy))
		).toMatchObject({
			status: 'invalid',
			issues: expect.arrayContaining([
				{ code: 'forbidden-field', path: '/observations/0/rawXml' }
			])
		})
	})

	it('rejects unknown fields instead of silently stripping them', () => {
		const draft = cloneDraft() as TrackEnrichmentDraft & { accountId?: string }
		draft.accountId = 'account-a'

		expect(decodeTrackEnrichmentDraft(JSON.stringify(draft))).toMatchObject({
			status: 'invalid',
			issues: expect.arrayContaining([{ code: 'invalid-schema', path: '' }])
		})
	})

	it.each([
		'/Users/alice/Music/Track.mp3',
		'C:\\Users\\Alice\\Music\\Track.mp3',
		'\\\\NAS\\share\\Music\\Track.mp3',
		'file:///Users/alice/Music/Track.mp3',
		'https:/example.test/Music/Track.mp3',
		'custom://provider/Music/Track.mp3',
		'%68%74%74%70%73%3A%2F%2Fexample.test%2FTrack.mp3'
	])('rejects a persisted absolute location hint: %s', (absolutePath) => {
		const draft = cloneDraft()
		draft.observations[0]!.locationHint = absolutePath

		expect(decodeTrackEnrichmentDraft(JSON.stringify(draft))).toMatchObject({
			status: 'invalid',
			issues: expect.arrayContaining([
				{ code: 'absolute-path', path: '/observations/0/locationHint' }
			])
		})
	})

	it.each([
		'/Users/alice/Music/Track.mp3',
		'C:\\Users\\Alice\\Music\\Track.mp3',
		'\\\\NAS\\share\\Music\\Track.mp3',
		'file:///Users/alice/Music/Track.mp3',
		'https:/example.test/Music/Track.mp3',
		'custom://provider/Music/Track.mp3',
		'%68%74%74%70%73%3A%2F%2Fexample.test%2FTrack.mp3'
	])('rejects a persisted absolute local file identity: %s', (absolutePath) => {
		const draft = cloneDraft('localAudio')
		const evidence = draft.observations[0]!.evidence
		if (evidence.kind !== 'localAudio')
			throw new Error('Expected local evidence')
		evidence.fileIdentity.relativePath = absolutePath

		expect(decodeTrackEnrichmentDraft(JSON.stringify(draft))).toMatchObject({
			status: 'invalid',
			issues: expect.arrayContaining([
				{
					code: 'absolute-path',
					path: '/observations/0/evidence/fileIdentity/relativePath'
				}
			])
		})
	})

	it('runs the recursive privacy audit before a future intent payload is discarded', () => {
		const draft = cloneDraft()
		;(draft.decisions as unknown[]) = [
			{
				kind: 'future-intent',
				intentVersion: 9,
				rawXml: '<DJ_PLAYLISTS />',
				staged: true
			}
		]

		expect(decodeTrackEnrichmentDraft(JSON.stringify(draft))).toMatchObject({
			status: 'invalid',
			issues: expect.arrayContaining([
				{ code: 'forbidden-field', path: '/decisions/0/rawXml' }
			])
		})
	})

	it('round-trips the exact evidence-only intent in additive unreleased schema v2', () => {
		const draft = cloneDraft()
		const decision = createTrackEnrichmentEvidenceOnlyDecisionFixture(draft)
		draft.decisions = [decision]
		draft.partialOutcomes = []

		const serialized = encodeTrackEnrichmentDraft(draft)
		const decoded = decodedDraft(serialized)

		expect(decoded.schemaVersion).toBe(2)
		expect(decoded.decisions).toEqual([decision])
		expect(decoded.decisions[0]).not.toHaveProperty('proposalBinding')
		expect(
			decision.preconditionBinding.currentEvidenceFingerprint.version
		).toBe(TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION)
		expect(decoded.partialOutcomes).toEqual([])
	})

	it('is safely demoted by the exact pre-evidence schema-v2 reader semantics', () => {
		const draft = cloneDraft()
		const decision = createTrackEnrichmentEvidenceOnlyDecisionFixture(draft)
		draft.decisions = [decision]
		draft.partialOutcomes = []

		expect(
			decodeWithPreEvidenceV2DecisionSemantics(
				encodeTrackEnrichmentDraft(draft)
			)
		).toEqual([
			{
				kind: 'unknown',
				intentVersion: 1,
				originalKind: 'evidence-only',
				sourceBinding: {
					sourceFingerprint: decision.sourceBinding.sourceFingerprint,
					observationFingerprint: decision.sourceBinding.observationFingerprint
				},
				staged: false,
				reviewedAt: decision.reviewedAt
			}
		])
	})

	it('never upgrades an evidence-only payload presented as legacy v1 approval', () => {
		const legacy = createTrackEnrichmentDraftV1Fixture()
		const current = cloneDraft()
		const decision = createTrackEnrichmentEvidenceOnlyDecisionFixture(current)
		legacy.decisions = [decision]
		legacy.partialOutcomes = []

		const result = decodeTrackEnrichmentDraft(JSON.stringify(legacy))
		expect(result.status).toBe('ok')
		if (result.status !== 'ok') throw new Error('Expected v1 migration')
		expect(result.draft.decisions).toEqual([
			{
				kind: 'unknown',
				intentVersion: 1,
				originalKind: 'evidence-only',
				sourceBinding: {
					sourceFingerprint: decision.sourceBinding.sourceFingerprint,
					observationFingerprint: decision.sourceBinding.observationFingerprint
				},
				staged: false,
				reviewedAt: decision.reviewedAt
			}
		])
	})

	it.each([
		[
			'missing observation identity',
			(decision: Record<string, unknown>) => {
				const sourceBinding = decision.sourceBinding as Record<string, unknown>
				delete sourceBinding.sourceSnapshotId
			}
		],
		[
			'future precondition version',
			(decision: Record<string, unknown>) => {
				const precondition = decision.preconditionBinding as Record<
					string,
					Record<string, unknown>
				>
				precondition.currentEvidenceFingerprint!.version = 'future-version'
			}
		],
		[
			'unbounded digest',
			(decision: Record<string, unknown>) => {
				const precondition = decision.preconditionBinding as Record<
					string,
					Record<string, unknown>
				>
				precondition.currentEvidenceFingerprint!.digest = 'c'.repeat(65)
			}
		],
		[
			'fill proposal smuggled into evidence approval',
			(decision: Record<string, unknown>) => {
				decision.proposalBinding = {
					bpm: { value: 140, source: 'rekordboxXml' },
					keyMode: null
				}
			}
		]
	] as const)('rejects evidence-only DTOs with %s', (_name, mutate) => {
		const draft = cloneDraft()
		draft.decisions = [createTrackEnrichmentEvidenceOnlyDecisionFixture(draft)]
		mutate(draft.decisions[0] as unknown as Record<string, unknown>)

		expect(decodeTrackEnrichmentDraft(JSON.stringify(draft)).status).toBe(
			'invalid'
		)
	})

	it('retains unknown future intent provenance only as safely unstaged state', () => {
		const draft = cloneDraft()
		const binding = draft.decisions[0]!.sourceBinding
		;(draft.decisions as unknown[]) = [
			{
				kind: 'evidence-only',
				intentVersion: 2,
				sourceBinding: binding,
				targetBinding: { trackId: 'track-a' },
				proposalBinding: { evidence: 'future-safe-value' },
				staged: true,
				reviewedAt: '2026-07-22T01:04:00.000Z'
			}
		]

		expect(decodedDraft(JSON.stringify(draft)).decisions).toEqual([
			{
				kind: 'unknown',
				intentVersion: 2,
				originalKind: 'evidence-only',
				sourceBinding: binding,
				staged: false,
				reviewedAt: '2026-07-22T01:04:00.000Z'
			}
		])
	})

	it.each([
		[
			'sourceBinding',
			{ sourceFingerprint: 'detached', observationFingerprint: 'c'.repeat(64) }
		],
		['targetBinding', { id: 'track-a' }],
		[
			'proposalBinding',
			{ bpm: null, keyMode: { key: 12, mode: 0, source: 'rekordboxXml' } }
		],
		['preconditionBinding', { expectedTargetUpdatedAt: null }]
	] as const)('strictly validates the distinct %s contract', (field, value) => {
		const draft = cloneDraft()
		Object.assign(draft.decisions[0]!, { [field]: value })

		expect(decodeTrackEnrichmentDraft(JSON.stringify(draft)).status).toBe(
			'invalid'
		)
	})

	it('rejects cross-source evidence, proposal provenance, and reconnect claims', () => {
		const evidenceMismatch = cloneDraft()
		evidenceMismatch.observations[0]!.evidence = structuredClone(
			createTrackEnrichmentDraftFixture('localAudio').observations[0]!.evidence
		)
		const reconnectMismatch = cloneDraft()
		reconnectMismatch.source.requiresReconnect = true
		const proposalMismatch = cloneDraft('localAudio')
		proposalMismatch.observations[0]!.proposal.bpm = {
			value: 124,
			source: 'rekordboxXml'
		}
		const decisionProposalMismatch = cloneDraft('localAudio')
		const decision = decisionProposalMismatch.decisions[0]
		if (decision?.kind !== 'fill-empty-fields') throw new Error('fixture')
		decision.proposalBinding.bpm = {
			value: 124,
			source: 'rekordboxXml'
		}
		const localPathMismatch = cloneDraft('localAudio')
		localPathMismatch.observations[0]!.locationHint = 'Other/Track.mp3'

		for (const draft of [
			evidenceMismatch,
			reconnectMismatch,
			proposalMismatch,
			decisionProposalMismatch,
			localPathMismatch
		]) {
			expect(decodeTrackEnrichmentDraft(JSON.stringify(draft)).status).toBe(
				'invalid'
			)
		}
	})

	it('rejects detached and duplicate decision/outcome identities', () => {
		const detachedDecision = cloneDraft()
		const decision = detachedDecision.decisions[0]
		if (decision?.kind !== 'fill-empty-fields') throw new Error('fixture')
		decision.sourceBinding.sourceFingerprint = 'detached'
		const duplicateDecision = cloneDraft()
		duplicateDecision.decisions.push(
			structuredClone(duplicateDecision.decisions[0]!)
		)
		const detachedOutcome = cloneDraft()
		detachedOutcome.partialOutcomes[0]!.sourceFingerprint = 'detached'
		const duplicateOutcome = cloneDraft()
		duplicateOutcome.partialOutcomes.push(
			structuredClone(duplicateOutcome.partialOutcomes[0]!)
		)

		for (const draft of [
			detachedDecision,
			duplicateDecision,
			detachedOutcome,
			duplicateOutcome
		]) {
			expect(decodeTrackEnrichmentDraft(JSON.stringify(draft)).status).toBe(
				'invalid'
			)
		}
	})

	it('rejects duplicate snapshot IDs, source fingerprints, and ordinals', () => {
		const duplicateSnapshotId = cloneDraft()
		const second = structuredClone(duplicateSnapshotId.observations[0]!)
		second.sourceFingerprint = 'source-fingerprint-b'
		second.observationFingerprint = 'c'.repeat(64)
		second.ordinal = 1
		duplicateSnapshotId.observations.push(second)

		const duplicateSource = cloneDraft()
		const third = structuredClone(duplicateSource.observations[0]!)
		third.sourceSnapshotId = 'track-id:84'
		third.observationFingerprint = 'c'.repeat(64)
		third.ordinal = 1
		duplicateSource.observations.push(third)

		const duplicateOrdinal = cloneDraft()
		const fourth = structuredClone(duplicateOrdinal.observations[0]!)
		fourth.sourceSnapshotId = 'track-id:84'
		fourth.sourceFingerprint = 'source-fingerprint-b'
		fourth.observationFingerprint = 'c'.repeat(64)
		duplicateOrdinal.observations.push(fourth)

		for (const draft of [
			duplicateSnapshotId,
			duplicateSource,
			duplicateOrdinal
		]) {
			expect(decodeTrackEnrichmentDraft(JSON.stringify(draft)).status).toBe(
				'invalid'
			)
		}
	})

	it('rejects inconsistent partial outcomes and UI anchors', () => {
		const failedWithoutCode = cloneDraft()
		failedWithoutCode.partialOutcomes[0]!.status = 'failed'
		const succeededWithCode = cloneDraft()
		succeededWithCode.partialOutcomes[0]!.failureCode = 'transport'
		const unknownWithoutUnknownCode = cloneDraft()
		unknownWithoutUnknownCode.partialOutcomes[0]!.status = 'unknown'
		unknownWithoutUnknownCode.partialOutcomes[0]!.failureCode = 'transport'
		const failedWithUnknownCode = cloneDraft()
		failedWithUnknownCode.partialOutcomes[0]!.status = 'failed'
		failedWithUnknownCode.partialOutcomes[0]!.failureCode = 'request-unknown'
		const detachedAnchor = cloneDraft()
		detachedAnchor.ui.anchorSourceFingerprint = 'detached'

		for (const draft of [
			failedWithoutCode,
			succeededWithCode,
			unknownWithoutUnknownCode,
			failedWithUnknownCode,
			detachedAnchor
		]) {
			expect(decodeTrackEnrichmentDraft(JSON.stringify(draft)).status).toBe(
				'invalid'
			)
		}
	})

	it('orders timestamps by instant rather than their ISO offset text', () => {
		const validAcrossOffsets = cloneDraft()
		validAcrossOffsets.createdAt = '2026-07-22T12:00:00+10:00'
		validAcrossOffsets.updatedAt = '2026-07-22T03:00:00Z'
		const invalidAcrossOffsets = cloneDraft()
		invalidAcrossOffsets.createdAt = '2026-07-22T04:00:00Z'
		invalidAcrossOffsets.updatedAt = '2026-07-22T12:00:00+10:00'

		expect(
			decodeTrackEnrichmentDraft(JSON.stringify(validAcrossOffsets)).status
		).toBe('ok')
		expect(
			decodeTrackEnrichmentDraft(JSON.stringify(invalidAcrossOffsets)).status
		).toBe('invalid')
	})

	it('refuses to encode live application state or target snapshots', () => {
		const draft = cloneDraft() as TrackEnrichmentDraft & {
			isApplying?: boolean
			track?: unknown
		}
		draft.isApplying = true
		draft.track = { id: 'track-a', title: 'Never persist me' }

		expect(() => encodeTrackEnrichmentDraft(draft)).toThrow(
			TrackEnrichmentDraftCodecError
		)
	})

	it('exposes current source-specific compatibility versions', () => {
		expect(getCurrentTrackEnrichmentDraftVersions('rekordboxXml')).toEqual({
			matcherPolicyVersion: 'track-enrichment-match-v1',
			parserPolicyVersion: 'rekordbox-xml-stream-v1',
			sanitizedSourceSnapshotVersion: 'rekordbox-xml-sanitized-v1'
		})
		expect(getCurrentTrackEnrichmentDraftVersions('localAudio')).toEqual({
			matcherPolicyVersion: 'track-enrichment-match-v1',
			parserPolicyVersion: null,
			sanitizedSourceSnapshotVersion: 'local-audio-sanitized-v1'
		})
	})

	it('binds drafts to workspace and repository, never an account identifier', () => {
		const draft = cloneDraft()
		expect(
			trackEnrichmentDraftBelongsToWorkspace(draft, {
				workspaceId: 'workspace-a',
				repositoryId: 'repository-a'
			})
		).toBe(true)
		expect(
			trackEnrichmentDraftBelongsToWorkspace(draft, {
				workspaceId: 'workspace-a',
				repositoryId: 'repository-b'
			})
		).toBe(false)
	})
})
