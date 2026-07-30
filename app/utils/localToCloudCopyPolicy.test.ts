import { describe, expect, it } from 'vitest'
import type {
	LocalToCloudCopyReceipt,
	LocalToCloudCopySnapshot
} from './localToCloudCopyPolicy'
import { decideLocalToCloudCopyLifecycle } from './localToCloudCopyPolicy'

const migrationId = 'opaque-migration-token'
const source = {
	workspaceId: 'browser-workspace',
	contentRevision: 12
} as const

function stagingSnapshot(
	overrides: Partial<LocalToCloudCopySnapshot> = {}
): LocalToCloudCopySnapshot {
	return {
		operation: { migrationId, source },
		receipt: { phase: 'staging', migrationId, source },
		currentSource: source,
		ownership: 'owned',
		destination: 'proven-empty',
		writeState: 'settled',
		localDeletionConfirmation: 'not-confirmed',
		...overrides
	}
}

function finalizedReceipt(
	overrides: Partial<
		Extract<LocalToCloudCopyReceipt, { phase: 'metadata-finalized' }>
	> = {}
): Extract<LocalToCloudCopyReceipt, { phase: 'metadata-finalized' }> {
	return {
		phase: 'metadata-finalized',
		migrationId,
		frozenSource: source,
		metadataGraph: 'valid',
		covers: 'pending',
		verification: { state: 'not-run' },
		...overrides
	}
}

function finalizedSnapshot(
	receiptOverrides: Partial<
		Extract<LocalToCloudCopyReceipt, { phase: 'metadata-finalized' }>
	> = {},
	snapshotOverrides: Partial<LocalToCloudCopySnapshot> = {}
): LocalToCloudCopySnapshot {
	return stagingSnapshot({
		receipt: finalizedReceipt(receiptOverrides),
		destination: 'receipt-metadata',
		...snapshotOverrides
	})
}

function malformedSnapshot(
	overrides: Record<string, unknown>
): LocalToCloudCopySnapshot {
	return { ...stagingSnapshot(), ...overrides } as LocalToCloudCopySnapshot
}

function malformedFinalizedSnapshot(
	receiptOverrides: Record<string, unknown>
): LocalToCloudCopySnapshot {
	return {
		...finalizedSnapshot(),
		receipt: { ...finalizedReceipt(), ...receiptOverrides }
	} as unknown as LocalToCloudCopySnapshot
}

function expectBlocked(
	snapshot: LocalToCloudCopySnapshot,
	blocker: string
): void {
	const decision = decideLocalToCloudCopyLifecycle(snapshot)
	expect(decision.status).toBe('blocked')
	expect(decision.blockers).toContain(blocker)
	expect(decision).toMatchObject({
		actions: [],
		offerWorkspaceSwitch: false,
		restartPolicy: 'not-available',
		localDeletion: { automatic: false, permission: 'not-permitted' }
	})
}

describe('local-to-cloud copy lifecycle policy', () => {
	it('continues metadata staging only while source, ownership, and empty destination still match', () => {
		expect(decideLocalToCloudCopyLifecycle(stagingSnapshot())).toEqual({
			status: 'in-progress',
			phase: 'metadata-staging',
			blockers: [],
			actions: ['continue-metadata-staging'],
			offerWorkspaceSwitch: false,
			restartPolicy: 'not-required-before-finalization',
			localDeletion: { automatic: false, permission: 'not-permitted' },
			sourceChange: 'none'
		})
	})

	it.each([
		{
			currentSource: { ...source, contentRevision: source.contentRevision + 1 },
			change: 'later content revision'
		},
		{
			currentSource: { ...source, contentRevision: source.contentRevision - 1 },
			change: 'different content revision'
		},
		{
			currentSource: { ...source, workspaceId: 'another-browser-workspace' },
			change: 'workspace'
		}
	])(
		'pauses a pre-finalization $change until owned abort and restart while destination stays empty',
		({ currentSource }) => {
			expect(
				decideLocalToCloudCopyLifecycle(stagingSnapshot({ currentSource }))
			).toEqual({
				status: 'paused-source-changed',
				blockers: [],
				actions: ['owned-abort', 'restart-after-owned-abort'],
				offerWorkspaceSwitch: false,
				restartPolicy: 'owned-abort-and-restart-required',
				destinationRequirement: 'must-remain-proven-empty',
				localDeletion: { automatic: false, permission: 'not-permitted' },
				sourceChange: 'none'
			})
		}
	)

	it('does not offer restart when a changed pre-finalization source no longer has an empty destination', () => {
		expectBlocked(
			stagingSnapshot({
				currentSource: { ...source, contentRevision: 13 },
				destination: 'nonempty'
			}),
			'nonempty-destination'
		)
	})

	it('freezes the source revision at metadata finalization and continues cover work', () => {
		expect(decideLocalToCloudCopyLifecycle(finalizedSnapshot())).toEqual({
			status: 'in-progress',
			phase: 'cover-copy',
			blockers: [],
			actions: ['continue-cover-copy'],
			offerWorkspaceSwitch: false,
			restartPolicy: 'forbidden-after-finalization',
			localDeletion: { automatic: false, permission: 'not-permitted' },
			sourceChange: 'none'
		})
	})

	it.each(['pending', 'complete', 'retryable-partial'] as const)(
		'reports later source edits as changes not copied for $s covers and never restarts',
		(covers) => {
			const decision = decideLocalToCloudCopyLifecycle(
				finalizedSnapshot(
					{ covers },
					{
						currentSource: {
							...source,
							contentRevision: source.contentRevision + 1
						}
					}
				)
			)
			expect(decision).toMatchObject({
				offerWorkspaceSwitch: false,
				restartPolicy: 'forbidden-after-finalization',
				sourceChange: 'changes-not-copied'
			})
			expect(decision.actions).not.toContain('owned-abort')
			expect(decision.actions).not.toContain('restart-after-owned-abort')
		}
	)

	it.each([
		{
			currentSource: { ...source, workspaceId: 'another-browser-workspace' },
			name: 'workspace change'
		},
		{
			currentSource: { ...source, contentRevision: source.contentRevision - 1 },
			name: 'revision rollback'
		}
	])('fails closed on a post-finalization $name', ({ currentSource }) => {
		expectBlocked(finalizedSnapshot({}, { currentSource }), 'source-mismatch')
	})

	it('makes partial covers retryable only after a valid metadata graph', () => {
		expect(
			decideLocalToCloudCopyLifecycle(
				finalizedSnapshot({ covers: 'retryable-partial' })
			)
		).toEqual({
			status: 'awaiting-verification',
			covers: 'retryable-partial',
			blockers: [],
			actions: ['retry-covers', 'run-deterministic-read-back'],
			offerWorkspaceSwitch: false,
			restartPolicy: 'forbidden-after-finalization',
			localDeletion: { automatic: false, permission: 'not-permitted' },
			sourceChange: 'none'
		})
	})

	it('requires deterministic read-back after complete covers', () => {
		expect(
			decideLocalToCloudCopyLifecycle(finalizedSnapshot({ covers: 'complete' }))
		).toMatchObject({
			status: 'awaiting-verification',
			actions: ['run-deterministic-read-back'],
			offerWorkspaceSwitch: false
		})
	})

	it.each(['complete', 'retryable-partial'] as const)(
		'offers a switch only after deterministic read-back with $s covers',
		(covers) => {
			const decision = decideLocalToCloudCopyLifecycle(
				finalizedSnapshot({
					covers,
					verification: {
						state: 'matched',
						method: 'deterministic-read-back'
					}
				})
			)
			expect(decision).toEqual({
				status: 'verified',
				covers,
				blockers: [],
				actions: covers === 'retryable-partial' ? ['retry-covers'] : [],
				offerWorkspaceSwitch: true,
				restartPolicy: 'forbidden-after-finalization',
				localDeletion: {
					automatic: false,
					permission: 'requires-separate-confirmation'
				},
				sourceChange: 'none'
			})
		}
	)

	it('keeps post-finalization edits visible without withdrawing a verified switch', () => {
		expect(
			decideLocalToCloudCopyLifecycle(
				finalizedSnapshot(
					{
						covers: 'complete',
						verification: {
							state: 'matched',
							method: 'deterministic-read-back'
						}
					},
					{
						currentSource: {
							...source,
							contentRevision: source.contentRevision + 4
						}
					}
				)
			)
		).toMatchObject({
			status: 'verified',
			offerWorkspaceSwitch: true,
			restartPolicy: 'forbidden-after-finalization',
			sourceChange: 'changes-not-copied'
		})
	})

	it('permits Local deletion only after a separate post-verification confirmation and never automatically', () => {
		const receipt = {
			covers: 'complete',
			verification: {
				state: 'matched',
				method: 'deterministic-read-back'
			}
		} as const

		expect(
			decideLocalToCloudCopyLifecycle(finalizedSnapshot(receipt)).localDeletion
		).toEqual({
			automatic: false,
			permission: 'requires-separate-confirmation'
		})
		expect(
			decideLocalToCloudCopyLifecycle(
				finalizedSnapshot(receipt, {
					localDeletionConfirmation: 'confirmed-after-verification'
				})
			).localDeletion
		).toEqual({
			automatic: false,
			permission: 'permitted-after-separate-confirmation'
		})
	})

	it('fails closed when Local deletion is marked confirmed before verification', () => {
		expectBlocked(
			finalizedSnapshot(
				{ covers: 'complete' },
				{ localDeletionConfirmation: 'confirmed-after-verification' }
			),
			'local-deletion-confirmed-before-verification'
		)
	})

	it.each([
		{
			name: 'account mismatch',
			snapshot: stagingSnapshot({ ownership: 'account-mismatch' }),
			blocker: 'account-mismatch'
		},
		{
			name: 'unresolved ownership',
			snapshot: stagingSnapshot({ ownership: 'unresolved' }),
			blocker: 'ownership-unresolved'
		},
		{
			name: 'aborted receipt',
			snapshot: stagingSnapshot({
				receipt: { phase: 'aborted', migrationId, source }
			}),
			blocker: 'receipt-aborted'
		},
		{
			name: 'expired receipt',
			snapshot: stagingSnapshot({
				receipt: { phase: 'expired', migrationId, source }
			}),
			blocker: 'receipt-expired'
		},
		{
			name: 'nonempty destination',
			snapshot: stagingSnapshot({ destination: 'nonempty' }),
			blocker: 'nonempty-destination'
		},
		{
			name: 'unknown destination',
			snapshot: stagingSnapshot({ destination: 'unknown' }),
			blocker: 'destination-unproven'
		},
		{
			name: 'ambiguous write',
			snapshot: stagingSnapshot({ writeState: 'ambiguous' }),
			blocker: 'ambiguous-write'
		},
		{
			name: 'verification mismatch',
			snapshot: finalizedSnapshot({
				covers: 'complete',
				verification: {
					state: 'mismatch',
					method: 'deterministic-read-back'
				}
			}),
			blocker: 'verification-mismatch'
		},
		{
			name: 'migration mismatch',
			snapshot: stagingSnapshot({
				receipt: { phase: 'staging', migrationId: 'another-token', source }
			}),
			blocker: 'migration-mismatch'
		},
		{
			name: 'receipt source mismatch',
			snapshot: stagingSnapshot({
				receipt: {
					phase: 'staging',
					migrationId,
					source: { ...source, workspaceId: 'unexpected-workspace' }
				}
			}),
			blocker: 'source-mismatch'
		}
	])('fails closed for $name', ({ blocker, snapshot }) => {
		expectBlocked(snapshot, blocker)
	})

	it.each([
		{
			name: 'nonempty destination after finalization',
			snapshot: finalizedSnapshot({}, { destination: 'nonempty' }),
			blocker: 'nonempty-destination'
		},
		{
			name: 'ambiguous write after finalization',
			snapshot: finalizedSnapshot({}, { writeState: 'ambiguous' }),
			blocker: 'ambiguous-write'
		}
	])('keeps $name fail closed', ({ blocker, snapshot }) => {
		expectBlocked(snapshot, blocker)
	})

	it('retains every simultaneous hard blocker without offering actions', () => {
		const decision = decideLocalToCloudCopyLifecycle(
			stagingSnapshot({
				ownership: 'account-mismatch',
				destination: 'nonempty',
				writeState: 'ambiguous'
			})
		)
		expect(decision).toMatchObject({
			status: 'blocked',
			blockers: ['account-mismatch', 'nonempty-destination', 'ambiguous-write'],
			actions: [],
			offerWorkspaceSwitch: false
		})
	})

	it.each([
		null,
		{},
		malformedSnapshot({ ownership: 'future-state' }),
		malformedSnapshot({ destination: 'future-state' }),
		malformedSnapshot({ writeState: 'future-state' }),
		malformedSnapshot({ localDeletionConfirmation: 'future-state' }),
		stagingSnapshot({
			operation: { migrationId: '', source }
		}),
		stagingSnapshot({
			operation: {
				migrationId,
				source: { ...source, contentRevision: -1 }
			}
		}),
		malformedFinalizedSnapshot({
			metadataGraph: 'unchecked',
			covers: 'retryable-partial'
		}),
		malformedFinalizedSnapshot({ covers: 'future-state' }),
		malformedSnapshot({
			receipt: { phase: 'future-state', migrationId, source }
		}),
		finalizedSnapshot({
			covers: 'pending',
			verification: {
				state: 'matched',
				method: 'deterministic-read-back'
			}
		}),
		malformedFinalizedSnapshot({
			covers: 'complete',
			verification: {
				state: 'matched',
				method: 'probabilistic-check'
			}
		})
	] as unknown as LocalToCloudCopySnapshot[])(
		'fails closed for malformed or future lifecycle state %#',
		(snapshot) => {
			expect(decideLocalToCloudCopyLifecycle(snapshot)).toEqual({
				status: 'blocked',
				blockers: ['invalid-state'],
				actions: [],
				offerWorkspaceSwitch: false,
				restartPolicy: 'not-available',
				localDeletion: {
					automatic: false,
					permission: 'not-permitted'
				},
				sourceChange: 'none'
			})
		}
	)
})
