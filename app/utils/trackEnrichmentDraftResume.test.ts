import { describe, expect, it } from 'vitest'
import type {
	TrackEnrichmentDraftDecision,
	TrackEnrichmentDraftObservation,
	TrackEnrichmentDraftProposal
} from '~/types/trackEnrichmentDraft'
import {
	DRAFT_CURRENT_EVIDENCE_FINGERPRINT,
	createTrackEnrichmentDraftFixture,
	createTrackEnrichmentEvidenceOnlyDecisionFixture
} from '../../test/fixtures/trackEnrichmentDraft'
import {
	type TrackEnrichmentDraftResumeTarget,
	decideTrackEnrichmentDraftCompatibility,
	decideTrackEnrichmentDraftDecisionResume,
	getTrackEnrichmentDraftForWorkspace,
	getTrackEnrichmentDraftPartialOutcomeState,
	summarizeTrackEnrichmentDraftResume
} from './trackEnrichmentDraftResume'

function baseResumeInput() {
	const draft = createTrackEnrichmentDraftFixture()
	const decision = draft.decisions[0]!
	if (decision.kind !== 'fill-empty-fields') {
		throw new Error('Expected a fill-empty-fields decision')
	}
	return {
		decision: structuredClone(decision) as TrackEnrichmentDraftDecision,
		currentObservation: structuredClone(
			draft.observations[0]!
		) as TrackEnrichmentDraftObservation | null,
		currentTargetByStoredId: {
			id: 'track-a',
			updatedAt: null,
			bpm: null,
			key: null,
			mode: null,
			currentEvidenceFingerprint: null
		} as TrackEnrichmentDraftResumeTarget | null,
		rematchedTargetId: 'track-a' as string | null,
		currentProposal: structuredClone(
			decision.proposalBinding
		) as TrackEnrichmentDraftProposal,
		currentPreconditions: {
			bpmMustBeNull: true,
			keyModeMustBeNull: true
		},
		stageable: true,
		retentionAllowedByPolicy: true
	}
}

function baseEvidenceResumeInput() {
	const input = baseResumeInput()
	const draft = createTrackEnrichmentDraftFixture()
	input.decision = createTrackEnrichmentEvidenceOnlyDecisionFixture(draft)
	input.currentTargetByStoredId!.currentEvidenceFingerprint =
		DRAFT_CURRENT_EVIDENCE_FINGERPRINT
	return input
}

describe('track enrichment draft compatibility', () => {
	const current = {
		matcherPolicyVersion: 'matcher-v2',
		parserPolicyVersion: 'parser-v2',
		sanitizedSourceSnapshotVersion: 'snapshot-v2'
	}

	it('always requires a current-library rematch even when versions are identical', () => {
		expect(
			decideTrackEnrichmentDraftCompatibility({
				sourceKind: 'rekordboxXml',
				stored: current,
				current
			})
		).toEqual({
			action: 'rematch',
			canRetainStaging: true,
			reasons: [],
			migrator: null
		})
	})

	it('rematches but invalidates staging after a matcher policy change', () => {
		expect(
			decideTrackEnrichmentDraftCompatibility({
				sourceKind: 'rekordboxXml',
				stored: { ...current, matcherPolicyVersion: 'matcher-v1' },
				current
			})
		).toMatchObject({
			action: 'rematch',
			canRetainStaging: false,
			reasons: ['matcher-policy-changed']
		})
	})

	it('does not claim to reparse when parser provenance changes but the sanitized snapshot remains compatible', () => {
		expect(
			decideTrackEnrichmentDraftCompatibility({
				sourceKind: 'rekordboxXml',
				stored: { ...current, parserPolicyVersion: 'parser-v1' },
				current
			})
		).toEqual({
			action: 'rematch',
			canRetainStaging: true,
			reasons: ['parser-policy-changed'],
			migrator: null
		})
	})

	it('uses only an exact, source-specific sanitized snapshot migrator', () => {
		const exactMigrator = {
			sourceKind: 'rekordboxXml' as const,
			fromVersion: 'snapshot-v1',
			toVersion: 'snapshot-v2',
			migrate: (snapshot: {
				datasetFingerprint: string
				observations: readonly TrackEnrichmentDraftObservation[]
			}) => ({
				...snapshot,
				observations: [...snapshot.observations]
			})
		}
		const wrongSourceMigrator = {
			...exactMigrator,
			sourceKind: 'localAudio' as const
		}

		expect(
			decideTrackEnrichmentDraftCompatibility({
				sourceKind: 'rekordboxXml',
				stored: {
					...current,
					sanitizedSourceSnapshotVersion: 'snapshot-v1'
				},
				current,
				migrators: [wrongSourceMigrator, exactMigrator]
			})
		).toEqual({
			action: 'migrate-and-rematch',
			canRetainStaging: true,
			reasons: ['snapshot-version-changed'],
			migrator: exactMigrator
		})
	})

	it.each([
		['rekordboxXml', 'reimport'],
		['localAudio', 'reconnect']
	] as const)(
		'requires %s source recovery when no safe snapshot migrator exists',
		(sourceKind, action) => {
			expect(
				decideTrackEnrichmentDraftCompatibility({
					sourceKind,
					stored: {
						...current,
						sanitizedSourceSnapshotVersion: 'snapshot-v1'
					},
					current
				})
			).toMatchObject({ action, canRetainStaging: false, migrator: null })
		}
	)
})

describe('track enrichment staged decision resume', () => {
	it('retains staging only when every current binding and nullable precondition is exact', () => {
		expect(decideTrackEnrichmentDraftDecisionResume(baseResumeInput())).toEqual(
			{
				classification: 'retained',
				staged: true
			}
		)
	})

	it('keeps an intentionally unstaged decision unstaged', () => {
		const input = baseResumeInput()
		if (input.decision.kind !== 'fill-empty-fields') throw new Error('fixture')
		input.decision.staged = false

		expect(decideTrackEnrichmentDraftDecisionResume(input)).toEqual({
			classification: 'not-staged',
			staged: false
		})
	})

	it.each([
		[
			'source-missing',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentObservation = null
			}
		],
		[
			'target-deleted',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentTargetByStoredId = null
			}
		],
		[
			'no-longer-matching',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.rematchedTargetId = null
			}
		],
		[
			'proposal-changed',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentProposal.bpm!.value = 125
			}
		],
		[
			'already-filled',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentTargetByStoredId!.bpm = 124
			}
		],
		[
			'target-changed',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentTargetByStoredId!.updatedAt = '2026-07-23T02:00:00.000Z'
			}
		],
		[
			'policy-changed',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.retentionAllowedByPolicy = false
			}
		]
	] as const)(
		'classifies an intentionally unstaged decision as %s without restoring staging',
		(classification, mutate) => {
			const input = baseResumeInput()
			if (input.decision.kind !== 'fill-empty-fields')
				throw new Error('fixture')
			input.decision.staged = false
			mutate(input)

			expect(decideTrackEnrichmentDraftDecisionResume(input)).toEqual({
				classification,
				staged: false
			})
		}
	)

	it('never stages an unknown future intent', () => {
		const input = baseResumeInput()
		input.decision = {
			kind: 'unknown',
			intentVersion: 2,
			originalKind: 'evidence-only',
			sourceBinding: null,
			staged: false,
			reviewedAt: null
		}

		expect(decideTrackEnrichmentDraftDecisionResume(input)).toEqual({
			classification: 'unknown-intent',
			staged: false
		})
	})

	it.each([
		[true, 'retained', true],
		[false, 'not-staged', false]
	] as const)(
		'resumes an exact evidence-only decision with persisted staged %s as %s',
		(staged, classification, expectedStaged) => {
			const input = baseEvidenceResumeInput()
			if (input.decision.kind !== 'evidence-only') throw new Error('fixture')
			input.decision.staged = staged

			expect(decideTrackEnrichmentDraftDecisionResume(input)).toEqual({
				classification,
				staged: expectedStaged
			})
		}
	)

	it.each([
		[
			'source-missing',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.currentObservation = null
			}
		],
		[
			'source-changed',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.currentObservation!.sourceFingerprint = 'changed-source'
			}
		],
		[
			'source-changed',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.currentObservation!.observationFingerprint = 'd'.repeat(64)
			}
		],
		[
			'source-changed',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.currentObservation!.sourceSnapshotId = 'track-id:changed'
			}
		],
		[
			'target-deleted',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.currentTargetByStoredId = null
			}
		],
		[
			'no-longer-matching',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.rematchedTargetId = null
			}
		],
		[
			'no-longer-matching',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.rematchedTargetId = 'track-b'
			}
		],
		[
			'no-longer-matching',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.currentTargetByStoredId!.id = 'track-b'
			}
		],
		[
			'target-changed',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.currentTargetByStoredId!.updatedAt = '2026-07-23T02:00:00.000Z'
			}
		],
		[
			'evidence-changed',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.currentTargetByStoredId!.currentEvidenceFingerprint = 'd'.repeat(
					64
				)
			}
		],
		[
			'evidence-changed',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.currentTargetByStoredId!.currentEvidenceFingerprint = null
			}
		],
		[
			'policy-changed',
			(input: ReturnType<typeof baseEvidenceResumeInput>) => {
				input.retentionAllowedByPolicy = false
			}
		]
	] as const)(
		'classifies evidence-only drift as %s and fails staging closed',
		(classification, mutate) => {
			const input = baseEvidenceResumeInput()
			mutate(input)

			expect(decideTrackEnrichmentDraftDecisionResume(input)).toEqual({
				classification,
				staged: false
			})
		}
	)

	it('prefers a specific current-data classification over a policy fallback', () => {
		const input = baseResumeInput()
		input.retentionAllowedByPolicy = false
		input.currentTargetByStoredId = null

		expect(decideTrackEnrichmentDraftDecisionResume(input)).toEqual({
			classification: 'target-deleted',
			staged: false
		})
	})

	it.each([
		[
			'policy-changed',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.retentionAllowedByPolicy = false
			}
		],
		[
			'source-missing',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentObservation = null
			}
		],
		[
			'source-changed',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentObservation!.sourceFingerprint = 'changed-source'
			}
		],
		[
			'source-changed',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentObservation!.observationFingerprint = 'c'.repeat(64)
			}
		],
		[
			'target-deleted',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentTargetByStoredId = null
			}
		],
		[
			'no-longer-matching',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.rematchedTargetId = null
			}
		],
		[
			'no-longer-matching',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.rematchedTargetId = 'track-b'
			}
		],
		[
			'proposal-changed',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentProposal.bpm!.value = 125
			}
		],
		[
			'proposal-changed',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentProposal.keyMode!.source = 'embeddedTags'
			}
		],
		[
			'already-filled',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentTargetByStoredId!.bpm = 124
			}
		],
		[
			'already-filled',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentTargetByStoredId!.mode = 0
			}
		],
		[
			'target-changed',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentTargetByStoredId!.updatedAt = '2026-07-22T02:00:00.000Z'
			}
		],
		[
			'preconditions-changed',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.currentPreconditions.bpmMustBeNull = false
			}
		],
		[
			'no-longer-stageable',
			(input: ReturnType<typeof baseResumeInput>) => {
				input.stageable = false
			}
		]
	] as const)(
		'classifies an invalidated approval as %s and leaves it unstaged',
		(classification, mutate) => {
			const input = baseResumeInput()
			mutate(input)

			expect(decideTrackEnrichmentDraftDecisionResume(input)).toEqual({
				classification,
				staged: false
			})
		}
	)

	it('summarizes retained, changed, dropped, and intentionally unstaged decisions', () => {
		expect(
			summarizeTrackEnrichmentDraftResume([
				{ classification: 'retained', staged: true },
				{ classification: 'not-staged', staged: false },
				{ classification: 'proposal-changed', staged: false },
				{ classification: 'target-deleted', staged: false },
				{ classification: 'unknown-intent', staged: false }
			])
		).toEqual({
			total: 5,
			retained: 1,
			unchangedUnstaged: 1,
			changed: 1,
			dropped: 2
		})
	})
})

describe('track enrichment draft recovery invariants', () => {
	it('separates done, retryable, unknown, and rematch-required outcomes', () => {
		const success = createTrackEnrichmentDraftFixture().partialOutcomes[0]!
		const retryableFailure = {
			...success,
			status: 'failed' as const,
			failureCode: 'transport' as const
		}
		const unknown = {
			...success,
			status: 'unknown' as const,
			failureCode: 'request-unknown' as const
		}
		const rematch = {
			...success,
			status: 'failed' as const,
			failureCode: 'conflict' as const
		}

		expect(getTrackEnrichmentDraftPartialOutcomeState(success)).toBe('done')
		expect(getTrackEnrichmentDraftPartialOutcomeState(retryableFailure)).toBe(
			'retry'
		)
		expect(getTrackEnrichmentDraftPartialOutcomeState(unknown)).toBe('review')
		expect(getTrackEnrichmentDraftPartialOutcomeState(rematch)).toBe('rematch')
	})

	it('selects one draft per workspace/repository and rejects duplicate slots', () => {
		const draft = createTrackEnrichmentDraftFixture()
		const other = createTrackEnrichmentDraftFixture()
		other.workspace.workspaceId = 'workspace-b'

		expect(
			getTrackEnrichmentDraftForWorkspace([draft, other], {
				workspaceId: 'workspace-a',
				repositoryId: 'repository-a'
			})
		).toBe(draft)
		expect(
			getTrackEnrichmentDraftForWorkspace([draft], {
				workspaceId: 'missing',
				repositoryId: 'repository-a'
			})
		).toBeNull()
		expect(() =>
			getTrackEnrichmentDraftForWorkspace([draft, structuredClone(draft)], {
				workspaceId: 'workspace-a',
				repositoryId: 'repository-a'
			})
		).toThrow('Multiple enrichment drafts exist for one workspace')
	})
})
