import { describe, expect, it } from 'vitest'
import type { TrackEnrichmentDraft } from '~/types/trackEnrichmentDraft'
import { createTrackEnrichmentDraftFixture } from '../../test/fixtures/trackEnrichmentDraft'
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

describe('track enrichment draft strict codec', () => {
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
			decodeTrackEnrichmentDraft(JSON.stringify({ schemaVersion: 2 }))
		).toEqual({
			status: 'incompatible',
			schemaVersion: 2,
			reason: 'future-schema'
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
		evidenceMismatch.observations[0]!.evidence = {
			kind: 'localAudio',
			fileIdentity: {
				version: 'local-audio-file-v1',
				relativePath: 'Track.mp3',
				size: 1,
				lastModified: 1
			},
			metadataVersion: 'native-tags-v3',
			analyzerVersion: null,
			configurationVersion: null,
			bpmConfidence: null,
			keyStrength: null,
			requiresManualReview: false
		}
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
		const detachedAnchor = cloneDraft()
		detachedAnchor.ui.anchorSourceFingerprint = 'detached'

		for (const draft of [
			failedWithoutCode,
			succeededWithCode,
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
