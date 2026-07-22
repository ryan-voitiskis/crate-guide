import type { WorkspaceOperationContext } from '~/repositories/library/contracts'
import type {
	DiscogsImportFailure,
	DiscogsImportResults,
	DiscogsReleaseFull,
	DiscogsReleaseToFilter,
	DiscogsRetryStatus,
	DiscogsRetrySummary
} from '../../shared/types/discogs'
import type { DiscogsReleaseTarget } from './discogs-import'
import type {
	DiscogsTransferMode,
	DiscogsTransferSnapshotPayload
} from './discogsTransferSnapshot'

export interface DiscogsTransferOwnership extends WorkspaceOperationContext {
	ownerId: string
	accountGeneration: number
	folderGeneration: number
}

export interface DiscogsTransferFetchAttemptStatus {
	target: DiscogsReleaseTarget
	attempt: number
	maxAttempts: number
	waitingMs: number | null
}

export interface DiscogsTransferFetchResult {
	releases: DiscogsReleaseFull[]
	failed: DiscogsImportFailure[]
	cancelled: boolean
}

export interface DiscogsTransferSaveResult {
	successful: number
	skipped?: Array<{
		label: string
		releaseId: number
		reason: 'duplicate' | 'cancelled'
	}>
	/** Release IDs whose repository outcome was positively confirmed. */
	confirmedReleaseIds?: number[]
	failed: DiscogsImportFailure[]
}

export interface DiscogsTransferPreparedTargets {
	targets: DiscogsReleaseTarget[]
	skipped: Array<{ label: string }>
}

export type DiscogsTransferSaveOutcome =
	| 'not-attempted'
	| 'complete'
	| 'partial'
	| 'failed'

export interface DiscogsTransferTerminalState extends DiscogsTransferSnapshotPayload {
	libraryRefreshFailed: boolean
}

interface DiscogsTransferPolicyResolution {
	results: DiscogsImportResults
	retrySummary: DiscogsRetrySummary | null
}

export type DiscogsTransferResultsUpdate =
	| { kind: 'preserve' }
	| { kind: 'replace'; results: DiscogsImportResults }

export interface DiscogsTransferModePolicy {
	readonly mode: DiscogsTransferMode
	readonly cancelledMessage: string
	readonly failedMessage: string
	initialResults(): DiscogsTransferResultsUpdate
	prepare(): Promise<DiscogsTransferPreparedTargets>
	preparedResults(
		prepared: DiscogsTransferPreparedTargets
	): DiscogsTransferResultsUpdate
	progressRelease(target: DiscogsReleaseTarget): DiscogsReleaseToFilter | null
	retryStatus(
		targets: DiscogsReleaseTarget[],
		status: DiscogsTransferFetchAttemptStatus
	): DiscogsRetryStatus
	providerCancelled(
		prepared: DiscogsTransferPreparedTargets,
		fetchFailed: DiscogsImportFailure[]
	): DiscogsTransferPolicyResolution
	completed(
		prepared: DiscogsTransferPreparedTargets,
		fetchFailed: DiscogsImportFailure[],
		saveResult: DiscogsTransferSaveResult
	): DiscogsTransferPolicyResolution
	unexpected(
		prepared: DiscogsTransferPreparedTargets | null
	): DiscogsTransferPolicyResolution
}

export type DiscogsTransferRunnerEvent =
	| {
			type: 'started'
			mode: DiscogsTransferMode
			resultsUpdate: DiscogsTransferResultsUpdate
	  }
	| {
			type: 'prepared'
			targets: DiscogsReleaseTarget[]
			resultsUpdate: DiscogsTransferResultsUpdate
	  }
	| {
			type: 'progress'
			progress: number
			release: DiscogsReleaseToFilter | null
	  }
	| { type: 'attempt-status'; status: DiscogsRetryStatus }
	| { type: 'saving' }
	| { type: 'refreshing'; committed: number }
	| { type: 'refresh-failed' }
	| {
			type: 'provider-cancelled'
			terminal: DiscogsTransferTerminalState
			message: string
	  }
	| {
			type: 'completed'
			terminal: DiscogsTransferTerminalState
			saveOutcome: DiscogsTransferSaveOutcome
	  }
	| {
			type: 'unexpected-failure'
			terminal: DiscogsTransferTerminalState
			message: string
	  }
	| { type: 'stale-owner' }
	| {
			type: 'snapshot-persist-failed'
			terminal: DiscogsTransferTerminalState
	  }
	| { type: 'settled' }

export type DiscogsTransferMachineState =
	| { phase: 'ready' }
	| { phase: 'fetching'; mode: DiscogsTransferMode }
	| { phase: 'saving'; mode: DiscogsTransferMode }
	| {
			phase: 'refreshing'
			mode: DiscogsTransferMode
			refreshFailed: boolean
	  }
	| {
			phase: 'terminal'
			mode: DiscogsTransferMode
			outcome:
				| 'completed'
				| 'provider-cancelled'
				| 'unexpected-failure'
				| 'stale-owner'
	  }
	| {
			phase: 'settled'
			mode: DiscogsTransferMode
			outcome:
				| 'completed'
				| 'provider-cancelled'
				| 'unexpected-failure'
				| 'stale-owner'
	  }

export const INITIAL_DISCOGS_TRANSFER_MACHINE_STATE = {
	phase: 'ready'
} as const satisfies DiscogsTransferMachineState

export class DiscogsTransferTransitionError extends Error {}

function invalidTransition(
	state: DiscogsTransferMachineState,
	event: DiscogsTransferRunnerEvent
): never {
	throw new DiscogsTransferTransitionError(
		`Discogs transfer cannot apply ${event.type} while ${state.phase}`
	)
}

/**
 * Allowed lifecycle:
 * ready -> fetching -> saving -> [refreshing] -> terminal -> settled.
 * Provider cancellation is terminal only from fetching. Ownership staleness or
 * unexpected failure may terminate any active phase. Persistence failures may
 * annotate a terminal report but can never reopen or change its outcome.
 */
export function reduceDiscogsTransferMachine(
	state: DiscogsTransferMachineState,
	event: DiscogsTransferRunnerEvent
): DiscogsTransferMachineState {
	switch (event.type) {
		case 'started':
			if (state.phase !== 'ready') return invalidTransition(state, event)
			return { phase: 'fetching', mode: event.mode }
		case 'prepared':
		case 'progress':
		case 'attempt-status':
			if (state.phase !== 'fetching') return invalidTransition(state, event)
			return state
		case 'saving':
			if (state.phase !== 'fetching') return invalidTransition(state, event)
			return { phase: 'saving', mode: state.mode }
		case 'refreshing':
			if (state.phase !== 'saving') return invalidTransition(state, event)
			return {
				phase: 'refreshing',
				mode: state.mode,
				refreshFailed: false
			}
		case 'refresh-failed':
			if (state.phase !== 'refreshing') return invalidTransition(state, event)
			return { ...state, refreshFailed: true }
		case 'provider-cancelled':
			if (state.phase !== 'fetching') return invalidTransition(state, event)
			return {
				phase: 'terminal',
				mode: state.mode,
				outcome: 'provider-cancelled'
			}
		case 'completed':
			if (state.phase !== 'saving' && state.phase !== 'refreshing') {
				return invalidTransition(state, event)
			}
			return {
				phase: 'terminal',
				mode: state.mode,
				outcome: 'completed'
			}
		case 'unexpected-failure':
		case 'stale-owner':
			if (
				state.phase !== 'fetching' &&
				state.phase !== 'saving' &&
				state.phase !== 'refreshing'
			) {
				return invalidTransition(state, event)
			}
			return {
				phase: 'terminal',
				mode: state.mode,
				outcome: event.type
			}
		case 'snapshot-persist-failed':
			if (state.phase !== 'terminal' || state.outcome === 'stale-owner') {
				return invalidTransition(state, event)
			}
			return state
		case 'settled':
			if (state.phase !== 'terminal') return invalidTransition(state, event)
			return {
				phase: 'settled',
				mode: state.mode,
				outcome: state.outcome
			}
	}
}

interface CreateImportPolicyOptions {
	selectedReleases: DiscogsReleaseToFilter[]
	previousResults: DiscogsImportResults
	prepareTargets(selectedReleases: DiscogsReleaseToFilter[]): Promise<{
		releasesToFetch: DiscogsReleaseToFilter[]
		skipped: Array<{ label: string }>
	}>
	formatTargetLabel(target: DiscogsReleaseToFilter): string
}

interface RetryableDiscogsFailure extends DiscogsImportFailure {
	releaseId: number
}

interface CreateRetryPolicyOptions {
	failuresToRetry: RetryableDiscogsFailure[]
	previousResults: DiscogsImportResults
}

function cloneResults(results: DiscogsImportResults): DiscogsImportResults {
	return {
		successful: results.successful,
		skipped: [...results.skipped],
		failed: [...results.failed]
	}
}

function mergeReplacementFailures(
	existing: DiscogsImportFailure[],
	replacements: DiscogsImportFailure[]
): DiscogsImportFailure[] {
	const replacedIds = new Set(
		replacements
			.map((failure) => failure.releaseId)
			.filter((releaseId): releaseId is number => releaseId !== null)
	)
	return [
		...existing.filter(
			(failure) =>
				failure.releaseId === null || !replacedIds.has(failure.releaseId)
		),
		...replacements
	]
}

function reconcileCompletedFailures(
	existing: DiscogsImportFailure[],
	attemptedIds: Set<number>,
	current: DiscogsImportFailure[]
): DiscogsImportFailure[] {
	return [
		...existing.filter(
			(failure) =>
				failure.releaseId !== null && !attemptedIds.has(failure.releaseId)
		),
		...current
	]
}

function pipelineFailure(label: string, error: string): DiscogsImportFailure {
	return {
		releaseId: null,
		label,
		error,
		code: 'internal_error',
		stage: 'pipeline',
		retryable: false,
		attempts: 1
	}
}

export function createDiscogsImportTransferPolicy(
	options: CreateImportPolicyOptions
): DiscogsTransferModePolicy {
	const selectedReleases = [...options.selectedReleases]
	const previousFailures = [...options.previousResults.failed]
	const selectedIds = new Set(selectedReleases.map((release) => release.id))

	return {
		mode: 'import',
		cancelledMessage: 'Import of Discogs records cancelled',
		failedMessage: 'Discogs import failed. Open Transfers for details.',
		initialResults: () => ({
			kind: 'replace',
			results: {
				successful: 0,
				skipped: [],
				failed: [...previousFailures]
			}
		}),
		async prepare() {
			const { releasesToFetch, skipped } =
				await options.prepareTargets(selectedReleases)
			return { targets: releasesToFetch, skipped }
		},
		preparedResults: (prepared) => ({
			kind: 'replace',
			results: {
				successful: 0,
				skipped: [...prepared.skipped],
				failed: [...previousFailures]
			}
		}),
		progressRelease: (target) =>
			'basic_information' in target ? target : null,
		retryStatus(targets, status) {
			const currentIndex = targets.findIndex(
				(target) => target.id === status.target.id
			)
			return {
				current: Math.max(1, currentIndex + 1),
				total: targets.length,
				label:
					'basic_information' in status.target
						? options.formatTargetLabel(status.target)
						: status.target.label,
				attempt: status.attempt,
				maxAttempts: status.maxAttempts,
				waitingMs: status.waitingMs
			}
		},
		providerCancelled: (prepared, fetchFailed) => ({
			results: {
				successful: 0,
				skipped: [...prepared.skipped],
				failed: mergeReplacementFailures(previousFailures, fetchFailed)
			},
			retrySummary: null
		}),
		completed: (prepared, fetchFailed, saveResult) => ({
			results: {
				successful: saveResult.successful,
				skipped: [
					...prepared.skipped,
					...(saveResult.skipped ?? []).map(({ label }) => ({ label }))
				],
				failed: reconcileCompletedFailures(previousFailures, selectedIds, [
					...fetchFailed,
					...saveResult.failed
				])
			},
			retrySummary: null
		}),
		unexpected: (prepared) => ({
			results: {
				successful: 0,
				skipped: prepared ? [...prepared.skipped] : [],
				failed: [
					...previousFailures,
					pipelineFailure(
						'Discogs import',
						'The transfer stopped unexpectedly. Please try again.'
					)
				]
			},
			retrySummary: null
		})
	}
}

export function createDiscogsRetryTransferPolicy(
	options: CreateRetryPolicyOptions
): DiscogsTransferModePolicy {
	const failuresToRetry = [...options.failuresToRetry]
	const previousResults = cloneResults(options.previousResults)
	const targets: DiscogsReleaseTarget[] = failuresToRetry.map((failure) => ({
		id: failure.releaseId,
		label: failure.label
	}))
	const attemptedIds = new Set(targets.map((target) => target.id))

	return {
		mode: 'retry',
		cancelledMessage: 'Retry of Discogs records cancelled',
		failedMessage: 'Discogs retry failed. Open Transfers for details.',
		initialResults: () => ({ kind: 'preserve' }),
		prepare: () =>
			Promise.resolve({
				targets: [...targets],
				skipped: [...previousResults.skipped]
			}),
		preparedResults: () => ({ kind: 'preserve' }),
		progressRelease: () => null,
		retryStatus(currentTargets, status) {
			const currentIndex = currentTargets.findIndex(
				(target) => target.id === status.target.id
			)
			return {
				current: Math.max(1, currentIndex + 1),
				total: currentTargets.length,
				label:
					'label' in status.target
						? status.target.label
						: String(status.target.id),
				attempt: status.attempt,
				maxAttempts: status.maxAttempts,
				waitingMs: status.waitingMs
			}
		},
		providerCancelled: (_prepared, fetchFailed) => {
			const failed = mergeReplacementFailures(
				previousResults.failed,
				fetchFailed
			)
			return {
				results: { ...cloneResults(previousResults), failed },
				retrySummary: {
					attempted: failuresToRetry.length,
					recovered: 0,
					remaining: failed.length
				}
			}
		},
		completed: (_prepared, fetchFailed, saveResult) => {
			const unattemptedIds = new Set(
				(saveResult.skipped ?? [])
					.filter((skipped) => skipped.reason === 'cancelled')
					.map((skipped) => skipped.releaseId)
			)
			const currentFailures = [
				...fetchFailed,
				...saveResult.failed,
				...previousResults.failed.filter(
					(failure) =>
						failure.releaseId !== null && unattemptedIds.has(failure.releaseId)
				)
			]
			const failed = reconcileCompletedFailures(
				previousResults.failed,
				attemptedIds,
				currentFailures
			)
			const failedAttemptIds = new Set(
				currentFailures
					.map((failure) => failure.releaseId)
					.filter((releaseId): releaseId is number => releaseId !== null)
			)
			const confirmedIds = saveResult.confirmedReleaseIds
				? new Set(saveResult.confirmedReleaseIds)
				: null
			const recovered = [...attemptedIds].filter((releaseId) =>
				confirmedIds
					? confirmedIds.has(releaseId)
					: !failedAttemptIds.has(releaseId)
			).length
			return {
				results: {
					...cloneResults(previousResults),
					successful: previousResults.successful + recovered,
					skipped: [...previousResults.skipped],
					failed
				},
				retrySummary: {
					attempted: failuresToRetry.length,
					recovered,
					remaining: failed.length
				}
			}
		},
		unexpected: () => {
			const failed = [
				...previousResults.failed,
				pipelineFailure(
					'Discogs retry',
					'The retry stopped unexpectedly. Please try again.'
				)
			]
			return {
				results: { ...cloneResults(previousResults), failed },
				retrySummary: {
					attempted: failuresToRetry.length,
					recovered: 0,
					remaining: failed.length
				}
			}
		}
	}
}

export interface RunDiscogsTransferOptions {
	ownership: DiscogsTransferOwnership
	policy: DiscogsTransferModePolicy
	isCurrentOwnership(ownership: DiscogsTransferOwnership): boolean
	isCancellationRequested(): boolean
	fetch(
		targets: DiscogsReleaseTarget[],
		onProgress: (progress: number, current: DiscogsReleaseTarget) => void,
		shouldCancel: () => boolean,
		options: {
			onAttemptStatus(status: DiscogsTransferFetchAttemptStatus): void
		}
	): Promise<DiscogsTransferFetchResult>
	save(
		releases: DiscogsReleaseFull[],
		shouldCancel: () => boolean
	): Promise<DiscogsTransferSaveResult>
	refresh(): Promise<boolean>
	persist(terminal: DiscogsTransferTerminalState): void
	onEvent(event: DiscogsTransferRunnerEvent): void
}

type PersistedRunResult = {
	terminal: DiscogsTransferTerminalState
	snapshotPersisted: boolean
}

export type DiscogsTransferRunResult =
	| { kind: 'stale-owner' }
	| ({ kind: 'provider-cancelled' } & PersistedRunResult)
	| ({ kind: 'unexpected-failure' } & PersistedRunResult)
	| ({
			kind: 'refresh-failed-after-commit'
			saveOutcome: 'complete' | 'partial'
	  } & PersistedRunResult)
	| ({
			kind: 'partial-save'
			refreshOutcome: 'not-needed' | 'succeeded'
	  } & PersistedRunResult)
	| ({
			kind: 'completed'
			saveOutcome: Exclude<DiscogsTransferSaveOutcome, 'partial'>
			refreshOutcome: 'not-needed' | 'succeeded'
	  } & PersistedRunResult)

function classifySaveOutcome(
	releaseCount: number,
	result: DiscogsTransferSaveResult
): DiscogsTransferSaveOutcome {
	if (releaseCount === 0) return 'not-attempted'
	const handled = result.confirmedReleaseIds
		? new Set(result.confirmedReleaseIds).size
		: result.successful + (result.skipped?.length ?? 0)
	if (handled === releaseCount && result.failed.length === 0) {
		return 'complete'
	}
	if (result.successful === 0 && result.failed.length === releaseCount) {
		return 'failed'
	}
	return 'partial'
}

export async function runDiscogsTransfer(
	options: RunDiscogsTransferOptions
): Promise<DiscogsTransferRunResult> {
	let machine: DiscogsTransferMachineState =
		INITIAL_DISCOGS_TRANSFER_MACHINE_STATE
	const emit = (event: DiscogsTransferRunnerEvent) => {
		machine = reduceDiscogsTransferMachine(machine, event)
		options.onEvent(event)
	}
	const isCurrent = () => options.isCurrentOwnership(options.ownership)
	const shouldCancel = () => options.isCancellationRequested() || !isCurrent()
	const finishStale = (): DiscogsTransferRunResult => {
		emit({ type: 'stale-owner' })
		emit({ type: 'settled' })
		return { kind: 'stale-owner' }
	}
	const finishTerminal = <T extends DiscogsTransferRunResult>(
		result: Omit<T, 'snapshotPersisted'> & {
			terminal: DiscogsTransferTerminalState
		}
	): T => {
		let snapshotPersisted = true
		try {
			options.persist(result.terminal)
		} catch {
			snapshotPersisted = false
			emit({ type: 'snapshot-persist-failed', terminal: result.terminal })
		}
		emit({ type: 'settled' })
		return { ...result, snapshotPersisted } as T
	}

	emit({
		type: 'started',
		mode: options.policy.mode,
		resultsUpdate: options.policy.initialResults()
	})
	let prepared: DiscogsTransferPreparedTargets | null = null

	try {
		prepared = await options.policy.prepare()
		if (!isCurrent()) return finishStale()
		emit({
			type: 'prepared',
			targets: prepared.targets,
			resultsUpdate: options.policy.preparedResults(prepared)
		})

		const fetchResult = await options.fetch(
			prepared.targets,
			(progress, current) => {
				if (!isCurrent()) return
				emit({
					type: 'progress',
					progress,
					release: options.policy.progressRelease(current)
				})
			},
			shouldCancel,
			{
				onAttemptStatus: (status) => {
					if (!isCurrent()) return
					emit({
						type: 'attempt-status',
						status: options.policy.retryStatus(prepared!.targets, status)
					})
				}
			}
		)
		if (!isCurrent()) return finishStale()

		if (fetchResult.cancelled) {
			const resolution = options.policy.providerCancelled(
				prepared,
				fetchResult.failed
			)
			const terminal: DiscogsTransferTerminalState = {
				status: 'cancelled',
				mode: options.policy.mode,
				...resolution,
				libraryRefreshFailed: false
			}
			emit({
				type: 'provider-cancelled',
				terminal,
				message: options.policy.cancelledMessage
			})
			return finishTerminal<
				Extract<DiscogsTransferRunResult, { kind: 'provider-cancelled' }>
			>({ kind: 'provider-cancelled', terminal })
		}

		emit({ type: 'saving' })
		const saveResult = await options.save(fetchResult.releases, shouldCancel)
		if (!isCurrent()) return finishStale()
		const saveOutcome = classifySaveOutcome(
			fetchResult.releases.length,
			saveResult
		)
		const resolution = options.policy.completed(
			prepared,
			fetchResult.failed,
			saveResult
		)
		let libraryRefreshFailed = false
		let refreshOutcome: 'not-needed' | 'succeeded' | 'failed' = 'not-needed'

		if (saveResult.successful > 0) {
			emit({ type: 'refreshing', committed: saveResult.successful })
			let refreshSucceeded = false
			try {
				refreshSucceeded = await options.refresh()
			} catch {
				refreshSucceeded = false
			}
			if (!isCurrent()) return finishStale()
			if (refreshSucceeded) {
				refreshOutcome = 'succeeded'
			} else {
				refreshOutcome = 'failed'
				libraryRefreshFailed = true
				emit({ type: 'refresh-failed' })
			}
		}

		const terminal: DiscogsTransferTerminalState = {
			status: 'completed',
			mode: options.policy.mode,
			...resolution,
			libraryRefreshFailed
		}
		emit({ type: 'completed', terminal, saveOutcome })

		if (refreshOutcome === 'failed') {
			return finishTerminal<
				Extract<
					DiscogsTransferRunResult,
					{ kind: 'refresh-failed-after-commit' }
				>
			>({
				kind: 'refresh-failed-after-commit',
				saveOutcome: saveOutcome === 'partial' ? 'partial' : 'complete',
				terminal
			})
		}
		if (saveOutcome === 'partial') {
			return finishTerminal<
				Extract<DiscogsTransferRunResult, { kind: 'partial-save' }>
			>({ kind: 'partial-save', refreshOutcome, terminal })
		}
		return finishTerminal<
			Extract<DiscogsTransferRunResult, { kind: 'completed' }>
		>({ kind: 'completed', saveOutcome, refreshOutcome, terminal })
	} catch {
		if (!isCurrent()) return finishStale()
		const resolution = options.policy.unexpected(prepared)
		const terminal: DiscogsTransferTerminalState = {
			status: 'failed',
			mode: options.policy.mode,
			...resolution,
			libraryRefreshFailed: false
		}
		emit({
			type: 'unexpected-failure',
			terminal,
			message: options.policy.failedMessage
		})
		return finishTerminal<
			Extract<DiscogsTransferRunResult, { kind: 'unexpected-failure' }>
		>({ kind: 'unexpected-failure', terminal })
	}
}
