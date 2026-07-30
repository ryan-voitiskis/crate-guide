import {
	createMockDiscogsRelease,
	createMockDiscogsReleaseFull
} from 'test/mocks/fixtures/discogs'
import { describe, expect, it, vi } from 'vitest'
import type {
	DiscogsImportFailure,
	DiscogsImportResults,
	DiscogsReleaseToFilter
} from '../../shared/types/discogs'
import type { DiscogsTransferModePolicy } from './discogsTransferRunner'
import {
	DiscogsTransferTransitionError,
	INITIAL_DISCOGS_TRANSFER_MACHINE_STATE,
	createDiscogsImportTransferPolicy,
	createDiscogsRetryTransferPolicy,
	reduceDiscogsTransferMachine,
	runDiscogsTransfer
} from './discogsTransferRunner'

const OWNERSHIP = {
	ownerId: 'account-a',
	accountGeneration: 7,
	folderGeneration: 11,
	workspaceId: 'workspace-a',
	repositoryId: 'repository-a',
	activationGeneration: 3
}

function createFailure(
	overrides: Partial<DiscogsImportFailure> = {}
): DiscogsImportFailure {
	return {
		releaseId: 1,
		label: 'Failed release',
		error: 'Discogs could not fetch this release.',
		code: 'discogs_transport',
		stage: 'fetch',
		retryable: true,
		attempts: 3,
		...overrides
	}
}

function emptyResults(): DiscogsImportResults {
	return { successful: 0, skipped: [], failed: [] }
}

function selectedRelease(id = 1): DiscogsReleaseToFilter {
	return { ...createMockDiscogsRelease({ id }), selected: true }
}

function importPolicy(
	overrides: {
		selectedReleases?: DiscogsReleaseToFilter[]
		previousResults?: DiscogsImportResults
		prepareTargets?: (selected: DiscogsReleaseToFilter[]) => Promise<{
			releasesToFetch: DiscogsReleaseToFilter[]
			skipped: Array<{ label: string }>
		}>
	} = {}
): DiscogsTransferModePolicy {
	const selectedReleases = overrides.selectedReleases ?? [selectedRelease()]
	return createDiscogsImportTransferPolicy({
		selectedReleases,
		previousResults: overrides.previousResults ?? emptyResults(),
		prepareTargets:
			overrides.prepareTargets ??
			((selected) =>
				Promise.resolve({ releasesToFetch: selected, skipped: [] })),
		formatTargetLabel: (target) => target.basic_information.title
	})
}

function terminalState() {
	return {
		status: 'completed' as const,
		mode: 'import' as const,
		results: emptyResults(),
		retrySummary: null,
		libraryRefreshFailed: false
	}
}

describe('Discogs transfer reducer', () => {
	it('accepts the documented phase sequence and rejects forbidden transitions', () => {
		let state = reduceDiscogsTransferMachine(
			INITIAL_DISCOGS_TRANSFER_MACHINE_STATE,
			{
				type: 'started',
				mode: 'import',
				resultsUpdate: { kind: 'replace', results: emptyResults() }
			}
		)
		state = reduceDiscogsTransferMachine(state, {
			type: 'prepared',
			targets: [],
			resultsUpdate: { kind: 'replace', results: emptyResults() }
		})
		state = reduceDiscogsTransferMachine(state, { type: 'saving' })
		state = reduceDiscogsTransferMachine(state, {
			type: 'refreshing',
			committed: 1
		})
		state = reduceDiscogsTransferMachine(state, { type: 'refresh-failed' })
		state = reduceDiscogsTransferMachine(state, {
			type: 'completed',
			terminal: { ...terminalState(), libraryRefreshFailed: true },
			saveOutcome: 'complete'
		})
		state = reduceDiscogsTransferMachine(state, { type: 'settled' })

		expect(state).toEqual({
			phase: 'settled',
			mode: 'import',
			outcome: 'completed'
		})
		expect(() =>
			reduceDiscogsTransferMachine(INITIAL_DISCOGS_TRANSFER_MACHINE_STATE, {
				type: 'saving'
			})
		).toThrow(DiscogsTransferTransitionError)
	})
})

describe('Discogs transfer runner', () => {
	it('runs the import lifecycle with an exact event sequence and captured ownership', async () => {
		const events: string[] = []
		const persisted = vi.fn()
		const save = vi.fn().mockResolvedValue({ successful: 1, failed: [] })
		const seenOwnership: unknown[] = []
		const target = selectedRelease()

		const result = await runDiscogsTransfer({
			ownership: OWNERSHIP,
			policy: importPolicy({ selectedReleases: [target] }),
			isCurrentOwnership: (ownership) => {
				seenOwnership.push(ownership)
				return true
			},
			isCancellationRequested: () => false,
			fetch: async (targets, onProgress, shouldCancel, options) => {
				expect(shouldCancel()).toBe(false)
				onProgress(100, targets[0]!)
				options.onAttemptStatus({
					target: targets[0]!,
					attempt: 1,
					maxAttempts: 3,
					waitingMs: null
				})
				return {
					releases: [createMockDiscogsReleaseFull({ id: 1 })],
					failed: [],
					cancelled: false
				}
			},
			save,
			refresh: () => Promise.resolve(true),
			persist: persisted,
			onEvent: (event) => events.push(event.type)
		})

		expect(result).toMatchObject({
			kind: 'completed',
			saveOutcome: 'complete',
			refreshOutcome: 'succeeded',
			snapshotPersisted: true,
			terminal: {
				status: 'completed',
				mode: 'import',
				results: { successful: 1, skipped: [], failed: [] }
			}
		})
		expect(events).toEqual([
			'started',
			'prepared',
			'progress',
			'attempt-status',
			'saving',
			'refreshing',
			'completed',
			'settled'
		])
		expect(save).toHaveBeenCalledWith(expect.any(Array), expect.any(Function))
		expect(seenOwnership).toContainEqual(OWNERSHIP)
		expect(persisted).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'completed', mode: 'import' })
		)
	})

	it('preserves all-skipped import accounting without refreshing', async () => {
		const refresh = vi.fn()
		const save = vi.fn().mockResolvedValue({ successful: 0, failed: [] })
		const result = await runDiscogsTransfer({
			ownership: OWNERSHIP,
			policy: importPolicy({
				prepareTargets: () =>
					Promise.resolve({
						releasesToFetch: [],
						skipped: [{ label: 'Already present' }]
					})
			}),
			isCurrentOwnership: () => true,
			isCancellationRequested: () => false,
			fetch: async (targets) => {
				expect(targets).toEqual([])
				return { releases: [], failed: [], cancelled: false }
			},
			save,
			refresh,
			persist: vi.fn(),
			onEvent: vi.fn()
		})

		expect(result).toMatchObject({
			kind: 'completed',
			saveOutcome: 'not-attempted',
			refreshOutcome: 'not-needed',
			terminal: {
				results: {
					successful: 0,
					skipped: [{ label: 'Already present' }],
					failed: []
				}
			}
		})
		expect(save).toHaveBeenCalledWith([], expect.any(Function))
		expect(refresh).not.toHaveBeenCalled()
	})

	it('counts an atomic save-time duplicate as skipped without refreshing', async () => {
		const refresh = vi.fn()
		const result = await runDiscogsTransfer({
			ownership: OWNERSHIP,
			policy: importPolicy(),
			isCurrentOwnership: () => true,
			isCancellationRequested: () => false,
			fetch: async () => ({
				releases: [createMockDiscogsReleaseFull({ id: 1 })],
				failed: [],
				cancelled: false
			}),
			save: async () => ({
				successful: 0,
				skipped: [
					{
						label: 'Already present after preflight',
						releaseId: 1,
						reason: 'duplicate' as const
					}
				],
				confirmedReleaseIds: [1],
				failed: []
			}),
			refresh,
			persist: vi.fn(),
			onEvent: vi.fn()
		})

		expect(result).toMatchObject({
			kind: 'completed',
			saveOutcome: 'complete',
			terminal: {
				results: {
					successful: 0,
					skipped: [{ label: 'Already present after preflight' }],
					failed: []
				}
			}
		})
		expect(refresh).not.toHaveBeenCalled()
	})

	it('retains retry-specific recovery accounting and summaries', async () => {
		const unrelated = createFailure({
			releaseId: 2,
			label: 'Deleted release',
			code: 'discogs_not_found',
			retryable: false,
			attempts: 1
		})
		const retryable = createFailure({
			releaseId: 1
		}) as DiscogsImportFailure & {
			releaseId: number
		}
		const result = await runDiscogsTransfer({
			ownership: OWNERSHIP,
			policy: createDiscogsRetryTransferPolicy({
				failuresToRetry: [retryable],
				previousResults: {
					successful: 179,
					skipped: [],
					failed: [retryable, unrelated]
				}
			}),
			isCurrentOwnership: () => true,
			isCancellationRequested: () => false,
			fetch: async () => ({
				releases: [createMockDiscogsReleaseFull({ id: 1 })],
				failed: [],
				cancelled: false
			}),
			save: async () => ({ successful: 1, failed: [] }),
			refresh: () => Promise.resolve(true),
			persist: vi.fn(),
			onEvent: vi.fn()
		})

		expect(result).toMatchObject({
			terminal: {
				results: { successful: 180, skipped: [], failed: [unrelated] },
				retrySummary: { attempted: 1, recovered: 1, remaining: 1 }
			}
		})
	})

	it('reports partial fetch and save outcomes without losing either failure', async () => {
		const selected = [
			selectedRelease(1),
			selectedRelease(2),
			selectedRelease(3)
		]
		const fetchFailure = createFailure({ releaseId: 3, label: 'Fetch failed' })
		const saveFailure = createFailure({
			releaseId: 2,
			label: 'Save failed',
			code: 'database_write_failed',
			stage: 'save',
			attempts: 1
		})
		const result = await runDiscogsTransfer({
			ownership: OWNERSHIP,
			policy: importPolicy({ selectedReleases: selected }),
			isCurrentOwnership: () => true,
			isCancellationRequested: () => false,
			fetch: async () => ({
				releases: [
					createMockDiscogsReleaseFull({ id: 1 }),
					createMockDiscogsReleaseFull({ id: 2 })
				],
				failed: [fetchFailure],
				cancelled: false
			}),
			save: async () => ({ successful: 1, failed: [saveFailure] }),
			refresh: () => Promise.resolve(true),
			persist: vi.fn(),
			onEvent: vi.fn()
		})

		expect(result).toMatchObject({
			kind: 'partial-save',
			refreshOutcome: 'succeeded',
			terminal: {
				results: {
					successful: 1,
					failed: [fetchFailure, saveFailure]
				}
			}
		})
	})

	it('terminates provider cancellation before save and persists its report', async () => {
		const events: string[] = []
		const save = vi.fn()
		const replacement = createFailure({ error: 'Still unavailable' })
		const result = await runDiscogsTransfer({
			ownership: OWNERSHIP,
			policy: importPolicy({
				previousResults: {
					successful: 0,
					skipped: [],
					failed: [createFailure()]
				}
			}),
			isCurrentOwnership: () => true,
			isCancellationRequested: () => true,
			fetch: async (_targets, _onProgress, shouldCancel) => {
				expect(shouldCancel()).toBe(true)
				return { releases: [], failed: [replacement], cancelled: true }
			},
			save,
			refresh: vi.fn(),
			persist: vi.fn(),
			onEvent: (event) => events.push(event.type)
		})

		expect(result).toMatchObject({
			kind: 'provider-cancelled',
			terminal: {
				status: 'cancelled',
				results: { failed: [replacement] }
			}
		})
		expect(events).toEqual([
			'started',
			'prepared',
			'provider-cancelled',
			'settled'
		])
		expect(save).not.toHaveBeenCalled()
	})

	it('keeps save-boundary cancellation distinct from provider cancellation', async () => {
		let cancellationRequested = false
		const events: string[] = []
		const result = await runDiscogsTransfer({
			ownership: OWNERSHIP,
			policy: importPolicy(),
			isCurrentOwnership: () => true,
			isCancellationRequested: () => cancellationRequested,
			fetch: async () => {
				cancellationRequested = true
				return {
					releases: [createMockDiscogsReleaseFull({ id: 1 })],
					failed: [],
					cancelled: false
				}
			},
			save: async (_releases, shouldCancel) => {
				expect(shouldCancel()).toBe(true)
				return {
					successful: 0,
					skipped: [
						{
							label: 'Cancelled before save',
							releaseId: 1,
							reason: 'cancelled' as const
						}
					],
					confirmedReleaseIds: [],
					failed: []
				}
			},
			refresh: vi.fn(),
			persist: vi.fn(),
			onEvent: (event) => events.push(event.type)
		})

		expect(result).toMatchObject({
			kind: 'partial-save',
			refreshOutcome: 'not-needed',
			terminal: { status: 'completed' }
		})
		expect(events).not.toContain('provider-cancelled')
	})

	it('preserves retry recovery accounting at the save-cancellation boundary', async () => {
		let cancellationRequested = false
		const retryable = createFailure({
			releaseId: 1
		}) as DiscogsImportFailure & {
			releaseId: number
		}
		const result = await runDiscogsTransfer({
			ownership: OWNERSHIP,
			policy: createDiscogsRetryTransferPolicy({
				failuresToRetry: [retryable],
				previousResults: {
					successful: 5,
					skipped: [],
					failed: [retryable]
				}
			}),
			isCurrentOwnership: () => true,
			isCancellationRequested: () => cancellationRequested,
			fetch: async () => {
				cancellationRequested = true
				return {
					releases: [createMockDiscogsReleaseFull({ id: 1 })],
					failed: [],
					cancelled: false
				}
			},
			save: async (_releases, shouldCancel) => {
				expect(shouldCancel()).toBe(true)
				return {
					successful: 0,
					skipped: [
						{
							label: retryable.label,
							releaseId: 1,
							reason: 'cancelled' as const
						}
					],
					confirmedReleaseIds: [],
					failed: []
				}
			},
			refresh: vi.fn(),
			persist: vi.fn(),
			onEvent: vi.fn()
		})

		expect(result).toMatchObject({
			kind: 'partial-save',
			terminal: {
				results: { successful: 5, skipped: [], failed: [retryable] },
				retrySummary: { attempted: 1, recovered: 0, remaining: 1 }
			}
		})
	})

	it.each(['prepare', 'fetch', 'save', 'refresh'] as const)(
		'returns stale-owner without persistence when ownership changes during %s',
		async (stalePhase) => {
			let current = true
			const events: string[] = []
			const persist = vi.fn()
			const policy = importPolicy({
				prepareTargets: async (selected) => {
					if (stalePhase === 'prepare') current = false
					return { releasesToFetch: selected, skipped: [] }
				}
			})

			const result = await runDiscogsTransfer({
				ownership: OWNERSHIP,
				policy,
				isCurrentOwnership: () => current,
				isCancellationRequested: () => false,
				fetch: async () => {
					if (stalePhase === 'fetch') current = false
					return {
						releases: [createMockDiscogsReleaseFull({ id: 1 })],
						failed: [],
						cancelled: false
					}
				},
				save: async () => {
					if (stalePhase === 'save') current = false
					return { successful: 1, failed: [] }
				},
				refresh: async () => {
					if (stalePhase === 'refresh') current = false
					return true
				},
				persist,
				onEvent: (event) => events.push(event.type)
			})

			expect(result).toEqual({ kind: 'stale-owner' })
			expect(events.slice(-2)).toEqual(['stale-owner', 'settled'])
			expect(persist).not.toHaveBeenCalled()
		}
	)

	it.each([
		['returned failure', () => Promise.resolve(false)],
		['thrown failure', () => Promise.reject(new Error('refresh failed'))]
	] as const)(
		'distinguishes refresh failure after a committed save: %s',
		async (_label, refresh) => {
			const events: string[] = []
			const result = await runDiscogsTransfer({
				ownership: OWNERSHIP,
				policy: importPolicy(),
				isCurrentOwnership: () => true,
				isCancellationRequested: () => false,
				fetch: async () => ({
					releases: [createMockDiscogsReleaseFull({ id: 1 })],
					failed: [],
					cancelled: false
				}),
				save: async () => ({ successful: 1, failed: [] }),
				refresh,
				persist: vi.fn(),
				onEvent: (event) => events.push(event.type)
			})

			expect(result).toMatchObject({
				kind: 'refresh-failed-after-commit',
				saveOutcome: 'complete',
				terminal: {
					status: 'completed',
					libraryRefreshFailed: true
				}
			})
			expect(events).toContain('refresh-failed')
		}
	)

	it('keeps terminal state when snapshot persistence fails', async () => {
		const events: string[] = []
		const result = await runDiscogsTransfer({
			ownership: OWNERSHIP,
			policy: importPolicy(),
			isCurrentOwnership: () => true,
			isCancellationRequested: () => false,
			fetch: async () => ({ releases: [], failed: [], cancelled: false }),
			save: async () => ({ successful: 0, failed: [] }),
			refresh: vi.fn(),
			persist: () => {
				throw new Error('storage unavailable')
			},
			onEvent: (event) => events.push(event.type)
		})

		expect(result).toMatchObject({
			kind: 'completed',
			snapshotPersisted: false,
			terminal: { status: 'completed' }
		})
		expect(events.slice(-2)).toEqual(['snapshot-persist-failed', 'settled'])
	})

	it('turns a runner callback throw into the mode-specific unexpected report', async () => {
		const events: string[] = []
		const result = await runDiscogsTransfer({
			ownership: OWNERSHIP,
			policy: importPolicy(),
			isCurrentOwnership: () => true,
			isCancellationRequested: () => false,
			fetch: async () => {
				throw new Error('provider callback failed')
			},
			save: vi.fn(),
			refresh: vi.fn(),
			persist: vi.fn(),
			onEvent: (event) => events.push(event.type)
		})

		expect(result).toMatchObject({
			kind: 'unexpected-failure',
			terminal: {
				status: 'failed',
				results: {
					failed: [
						expect.objectContaining({
							label: 'Discogs import',
							stage: 'pipeline'
						})
					]
				}
			}
		})
		expect(events).toEqual([
			'started',
			'prepared',
			'unexpected-failure',
			'settled'
		])
	})
})
