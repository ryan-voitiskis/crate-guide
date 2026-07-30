import { describe, expect, it } from 'vitest'
import type {
	WorkspaceTransitionAtomicOperationKind,
	WorkspaceTransitionSnapshot,
	WorkspaceTransitionWorkflowKind
} from './workspaceTransitionPolicy'
import {
	WORKSPACE_ACTIVATION_SEQUENCE,
	decideWorkspaceTransition
} from './workspaceTransitionPolicy'

const workflowKinds: readonly WorkspaceTransitionWorkflowKind[] = [
	'enrichment',
	'import',
	'audio-analysis'
]
const atomicOperationKinds: readonly WorkspaceTransitionAtomicOperationKind[] =
	['export', 'restore', 'copy', 'delete', 'schema-upgrade']

function snapshot(
	overrides: Partial<WorkspaceTransitionSnapshot> = {}
): WorkspaceTransitionSnapshot {
	return {
		repositoryWrite: 'idle',
		editor: { state: 'clean' },
		unsavedSession: { state: 'none' },
		workflows: [],
		atomicOperations: [],
		...overrides
	}
}

describe('workspace transition policy', () => {
	it('allows activation only through the ordered post-confirmation sequence', () => {
		expect(decideWorkspaceTransition(snapshot())).toEqual({
			status: 'ready',
			activationSequence: WORKSPACE_ACTIVATION_SEQUENCE,
			blockers: [],
			resolutions: []
		})
	})

	it.each([
		{
			state: 'pending-owned',
			reason: 'pending-owned-write',
			requirement: 'await-owned-success-or-failure'
		},
		{
			state: 'ambiguous',
			reason: 'ambiguous-write',
			requirement: 'preserve-and-resolve-ambiguous-write'
		}
	] as const)(
		'blocks and preserves a $state repository write',
		({ reason, requirement, state }) => {
			expect(
				decideWorkspaceTransition(snapshot({ repositoryWrite: state }))
			).toEqual({
				status: 'blocked',
				activationSequence: [],
				blockers: [{ work: 'repository-write', reason, requirement }],
				resolutions: []
			})
		}
	)

	it.each([
		{ surface: 'editor', work: 'dirty-editor' },
		{ surface: 'create-dialog', work: 'dirty-create-dialog' }
	] as const)(
		'offers Stay or Discard without implicit save for a dirty $surface',
		({ surface, work }) => {
			expect(
				decideWorkspaceTransition(
					snapshot({ editor: { state: 'dirty', surface } })
				)
			).toEqual({
				status: 'requires-resolution',
				activationSequence: [],
				blockers: [],
				resolutions: [
					{
						work,
						choices: ['stay', 'discard'],
						implicitSave: 'forbidden'
					}
				]
			})
		}
	)

	it.each([
		{ kind: 'session', work: 'unsaved-session' },
		{ kind: 'set', work: 'unsaved-set' }
	] as const)(
		'offers Save, Discard, or Cancel and waits for an unsaved $kind choice',
		({ kind, work }) => {
			expect(
				decideWorkspaceTransition(
					snapshot({ unsavedSession: { state: 'unsaved', kind } })
				)
			).toEqual({
				status: 'requires-resolution',
				activationSequence: [],
				blockers: [],
				resolutions: [
					{
						work,
						choices: ['save', 'discard', 'cancel'],
						activation: 'after-choice-settles'
					}
				]
			})
		}
	)

	for (const kind of workflowKinds) {
		it(`allows a valid ${kind} draft to be saved or explicitly cancels and settles`, () => {
			expect(
				decideWorkspaceTransition(
					snapshot({
						workflows: [{ kind, state: 'active', draft: 'valid-supported' }]
					})
				)
			).toMatchObject({
				status: 'requires-resolution',
				resolutions: [
					{
						work: kind,
						choices: ['save-draft', 'cancel-operation', 'stay'],
						settlement: 'required-before-activation'
					}
				]
			})
		})

		it(`never offers a draft save for unsupported or invalid ${kind} state`, () => {
			expect(
				decideWorkspaceTransition(
					snapshot({
						workflows: [{ kind, state: 'active', draft: 'unavailable' }]
					})
				)
			).toMatchObject({
				status: 'requires-resolution',
				resolutions: [
					{
						work: kind,
						choices: ['cancel-operation', 'stay'],
						settlement: 'required-before-activation'
					}
				]
			})
		})

		it(`blocks ${kind} while its Worker or operation is settling`, () => {
			expect(
				decideWorkspaceTransition(
					snapshot({ workflows: [{ kind, state: 'settling' }] })
				)
			).toEqual({
				status: 'blocked',
				activationSequence: [],
				blockers: [
					{
						work: kind,
						reason: 'workflow-settling',
						requirement: 'await-worker-or-operation-settlement'
					}
				],
				resolutions: []
			})
		})
	}

	for (const kind of atomicOperationKinds) {
		it(`blocks ${kind} during its atomic phase`, () => {
			expect(
				decideWorkspaceTransition(
					snapshot({ atomicOperations: [{ kind, phase: 'atomic' }] })
				)
			).toMatchObject({
				status: 'blocked',
				blockers: [
					{
						work: kind,
						reason: 'atomic-phase',
						requirement: 'await-atomic-phase-settlement'
					}
				]
			})
		})

		it(`requires explicit ${kind} cancellation outside the atomic phase`, () => {
			expect(
				decideWorkspaceTransition(
					snapshot({ atomicOperations: [{ kind, phase: 'cancellable' }] })
				)
			).toMatchObject({
				status: 'requires-resolution',
				resolutions: [
					{
						work: kind,
						choices: ['cancel-operation', 'stay'],
						settlement: 'rollback-or-cleanup-required-before-activation'
					}
				]
			})
		})

		it(`blocks ${kind} until rollback or cleanup finishes`, () => {
			expect(
				decideWorkspaceTransition(
					snapshot({ atomicOperations: [{ kind, phase: 'cleanup' }] })
				)
			).toMatchObject({
				status: 'blocked',
				blockers: [
					{
						work: kind,
						reason: 'cleanup-in-progress',
						requirement: 'await-rollback-or-cleanup'
					}
				]
			})
		})
	}

	it('retains every unresolved choice while a harder blocker prevents activation', () => {
		const result = decideWorkspaceTransition(
			snapshot({
				repositoryWrite: 'pending-owned',
				editor: { state: 'dirty', surface: 'editor' },
				unsavedSession: { state: 'unsaved', kind: 'set' },
				workflows: [
					{
						kind: 'audio-analysis',
						state: 'active',
						draft: 'valid-supported'
					}
				],
				atomicOperations: [{ kind: 'restore', phase: 'cancellable' }]
			})
		)

		expect(result.status).toBe('blocked')
		expect(result.blockers).toHaveLength(1)
		expect(result.resolutions.map(({ work }) => work)).toEqual([
			'dirty-editor',
			'unsaved-set',
			'audio-analysis',
			'restore'
		])
	})

	it.each([
		{ ...snapshot(), repositoryWrite: 'unknown' },
		{
			...snapshot(),
			workflows: [
				{ kind: 'enrichment', state: 'active', draft: 'valid-supported' },
				{ kind: 'enrichment', state: 'settling' }
			]
		},
		{
			...snapshot(),
			atomicOperations: [
				{ kind: 'copy', phase: 'atomic' },
				{ kind: 'copy', phase: 'cleanup' }
			]
		}
	] as unknown as WorkspaceTransitionSnapshot[])(
		'fails closed for invalid or ambiguous transition state %#',
		(invalidSnapshot) => {
			expect(decideWorkspaceTransition(invalidSnapshot)).toEqual({
				status: 'blocked',
				activationSequence: [],
				blockers: [
					{
						work: 'transition-state',
						reason: 'invalid-state',
						requirement: 'fail-closed'
					}
				],
				resolutions: []
			})
		}
	)
})
