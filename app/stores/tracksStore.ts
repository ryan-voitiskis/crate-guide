import { toRaw } from 'vue'
import { toast } from 'vue-sonner'
import type { WorkspaceOperationContext } from '~/repositories/library/contracts'
import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { type DecodeIssue, reportDecodeIssues } from '~/utils/supabaseRows'
import { TRACK_ENRICHMENT_BATCH_SIZE } from '~/utils/trackEnrichmentBatch'
import {
	ensureWorkbenchRuntime,
	getWorkbenchRuntime,
	getWorkbenchStorePinia
} from '~/utils/workbenchPinia'
import type { LibraryTrack, TrackCreateInput } from '~~/shared/types/library'
import type {
	TrackBatchIssue,
	TrackBatchIssueCode,
	TrackBatchUpdate,
	TrackBatchUpdateOutcome,
	TrackBatchUpdateResult,
	TrackUpdateInput
} from '~~/shared/types/trackUpdates'

type FetchContext = WorkspaceOperationContext & {
	generation: number
}

type MutationActivity = 'create' | 'update'

type MutationActivityToken = {
	context: FetchContext
	activity: MutationActivity
}

type LibraryFetchOptions = {
	fresh?: boolean
}

type TrackMutationProvenance = FetchContext & { revision: number } & (
		| { kind: 'create' | 'update'; row: LibraryTrack }
		| { kind: 'delete' }
	)

type ApplyTrackUpdateResult = {
	track: LibraryTrack | null
	error: string | null
	issues: DecodeIssue[]
	stale: boolean
}

type OptimisticBatchMutation = {
	id: string
	originalTrack: LibraryTrack
	optimisticTrack: LibraryTrack
	operationRevision: number
}

type RepositoryTrackChunkResponse =
	| {
			kind: 'settled'
			results: TrackBatchUpdateResult[]
			decodeIssues: DecodeIssue[]
			refreshRequired: boolean
			stoppedByCapacity: boolean
			stoppedByUnknown: boolean
	  }
	| { kind: 'capacity' }
	| { kind: 'cancelled' }
	| { kind: 'unknown'; error: unknown }

const TRACK_BATCH_ISSUE_MESSAGES: Record<TrackBatchIssueCode, string> = {
	account_replaced: 'Not attempted because the signed-in account changed.',
	duplicate_track_id: 'The same track appeared more than once in this batch.',
	invalid_audio_features: 'The enrichment evidence was rejected as invalid.',
	invalid_item: 'The enrichment update was rejected as invalid.',
	invalid_response: 'The saved track response could not be verified.',
	not_found: 'The track is no longer in your collection.',
	prior_chunk_unknown:
		'Not attempted because an earlier batch could not be confirmed.',
	receipt_capacity:
		'Batch retry capacity is temporarily full. Review again after the 24-hour receipt window.',
	request_unknown:
		'The update could not be confirmed. Review the refreshed track before trying again.',
	stale_revision:
		'The track changed after review. Review it again before applying.',
	update_rejected: 'The enrichment update was rejected.'
}

export const useTracksStore = defineStore('tracks', () => {
	const pinia = getWorkbenchStorePinia()
	const runtime = getWorkbenchRuntime(pinia) ?? ensureWorkbenchRuntime(pinia!)

	const tracks = ref<LibraryTrack[]>([])
	const isLoadingTracks = ref(false)
	const isCreatingTrack = ref(false)
	const isUpdatingTrack = ref(false)
	let fetchPromise: Promise<boolean> | null = null
	let freshFetchPromise: Promise<boolean> | null = null
	let accountGeneration = 0
	let activeFetchContext: FetchContext | null = null
	let mutationRevision = 0
	const trackMutationProvenance = new Map<string, TrackMutationProvenance>()
	const trackOperationRevisions = new Map<string, number>()
	const trackOperationQueues = new Map<string, Promise<void>>()
	const mutationActivityCounts: Record<MutationActivity, number> = {
		create: 0,
		update: 0
	}

	const tracksCount = computed(() => tracks.value.length)
	const hasTracks = computed(() => tracks.value.length > 0)
	const playableTracks = computed(() => tracks.value.filter((t) => t.playable))
	const tracksById = computed(
		() => new Map(tracks.value.map((track) => [track.id, track]))
	)
	const tracksByRecordId = computed(() => {
		const groupedTracks = new Map<string, LibraryTrack[]>()
		for (const track of tracks.value) {
			const recordTracks = groupedTracks.get(track.record_id) ?? []
			recordTracks.push(track)
			groupedTracks.set(track.record_id, recordTracks)
		}
		return groupedTracks
	})

	function isCurrentAccountContext(context: FetchContext): boolean {
		return (
			context.generation === accountGeneration && runtime.isCurrent(context)
		)
	}

	function captureContext(generation: number): FetchContext | null {
		if (generation !== accountGeneration) return null
		const captured = runtime.capture()
		return { ...captured.context, generation }
	}

	function isCurrentFetchContext(context: FetchContext): boolean {
		return isCurrentAccountContext(context) && activeFetchContext === context
	}

	function repositoriesFor(context: FetchContext) {
		if (!isCurrentAccountContext(context)) return null
		const captured = runtime.capture()
		return runtime.isCurrent(context) ? captured.repositories : null
	}

	function setMutationActivity(
		activity: MutationActivity,
		isActive: boolean
	): void {
		if (activity === 'create') isCreatingTrack.value = isActive
		else isUpdatingTrack.value = isActive
	}

	function beginMutationActivity(
		context: FetchContext,
		activity: MutationActivity
	): MutationActivityToken {
		mutationActivityCounts[activity] += 1
		setMutationActivity(activity, true)
		return { context, activity }
	}

	function finishMutationActivity(token: MutationActivityToken): void {
		if (!isCurrentAccountContext(token.context)) return
		mutationActivityCounts[token.activity] = Math.max(
			0,
			mutationActivityCounts[token.activity] - 1
		)
		setMutationActivity(
			token.activity,
			mutationActivityCounts[token.activity] > 0
		)
	}

	async function resolveMutationContext(
		generation: number
	): Promise<FetchContext | null> {
		if (runtime.capture().descriptor.readOnly) return null
		return captureContext(generation)
	}

	async function confirmMutationContext(
		context: FetchContext,
		_suppressErrorToast = false
	): Promise<boolean> {
		return isCurrentAccountContext(context)
	}

	function nextMutationRevision(): number {
		mutationRevision += 1
		return mutationRevision
	}

	function recordCommittedTrackMutation(
		id: string,
		context: FetchContext,
		mutation:
			| { kind: 'create' | 'update'; row: LibraryTrack }
			| { kind: 'delete' }
	): void {
		trackMutationProvenance.set(id, {
			...context,
			...mutation,
			revision: nextMutationRevision()
		})
	}

	function upsertTrack(track: LibraryTrack): void {
		const currentIndex = tracks.value.findIndex(({ id }) => id === track.id)
		if (currentIndex !== -1) {
			tracks.value[currentIndex] = track
			return
		}
		tracks.value = sortCreatedAtDescIdDesc([...tracks.value, track])
	}

	function reconcileFetchedTracks(
		context: FetchContext,
		startingRevision: number,
		fetchedTracks: LibraryTrack[]
	): LibraryTrack[] {
		const reconciled = new Map(fetchedTracks.map((track) => [track.id, track]))

		for (const [id, provenance] of trackMutationProvenance) {
			if (
				provenance.generation !== context.generation ||
				provenance.workspaceId !== context.workspaceId ||
				provenance.repositoryId !== context.repositoryId ||
				provenance.activationGeneration !== context.activationGeneration
			) {
				continue
			}

			if (provenance.revision > startingRevision) {
				if (provenance.kind === 'delete') reconciled.delete(id)
				else if (provenance.kind === 'update' || !reconciled.has(id)) {
					reconciled.set(id, provenance.row)
				} else {
					trackMutationProvenance.delete(id)
				}
				continue
			}

			const fetchedTrack = reconciled.get(id)
			const confirmsMutation =
				provenance.kind === 'delete'
					? !fetchedTrack
					: provenance.kind === 'create'
						? Boolean(fetchedTrack)
						: Boolean(
								fetchedTrack &&
								JSON.stringify(fetchedTrack) === JSON.stringify(provenance.row)
							)
			if (confirmsMutation) trackMutationProvenance.delete(id)
		}

		return sortCreatedAtDescIdDesc([...reconciled.values()])
	}

	async function runSerializedTrackOperation<T>(
		context: FetchContext,
		id: string,
		staleResult: T,
		operation: () => Promise<T>
	): Promise<T> {
		const previous = trackOperationQueues.get(id) ?? Promise.resolve()
		const run = previous
			.catch(() => undefined)
			.then(async () => {
				if (!isCurrentAccountContext(context)) return staleResult
				return await operation()
			})
		const completion = run.then(
			() => undefined,
			() => undefined
		)
		trackOperationQueues.set(id, completion)
		try {
			return await run
		} finally {
			if (trackOperationQueues.get(id) === completion) {
				trackOperationQueues.delete(id)
			}
		}
	}

	async function runSerializedTrackBatchOperation<T>(
		context: FetchContext,
		ids: string[],
		staleResult: T,
		operation: () => Promise<T>
	): Promise<T> {
		const uniqueIds = [...new Set(ids)]
		const previousOperations = uniqueIds.map(
			(id) => trackOperationQueues.get(id) ?? Promise.resolve()
		)
		const run = Promise.all(
			previousOperations.map((previous) => previous.catch(() => undefined))
		).then(async () => {
			if (!isCurrentAccountContext(context)) return staleResult
			return await operation()
		})
		const completion = run.then(
			() => undefined,
			() => undefined
		)
		for (const id of uniqueIds) trackOperationQueues.set(id, completion)

		try {
			return await run
		} finally {
			for (const id of uniqueIds) {
				if (trackOperationQueues.get(id) === completion) {
					trackOperationQueues.delete(id)
				}
			}
		}
	}

	function getErrorMessage(error: unknown): string {
		if (error instanceof Error) return error.message
		if (typeof error === 'string') return error
		return 'Unknown error'
	}

	async function performFetchAllTracks(generation: number): Promise<boolean> {
		isLoadingTracks.value = true
		const context = captureContext(generation)
		try {
			if (!context) return false
			activeFetchContext = context
			const startingRevision = mutationRevision
			const repositories = repositoriesFor(context)
			if (!repositories) return false
			const outcome = await repositories.tracks.list(context)
			if (!isCurrentFetchContext(context)) return false
			if (outcome.status === 'stale') return false
			if (outcome.status !== 'success') {
				throw outcome.status === 'unavailable'
					? (outcome.error ?? new Error(outcome.reason))
					: new Error(outcome.reason)
			}
			if (
				!runtime.acceptRepositoryRevision(context, outcome.repositoryRevision)
			) {
				return false
			}
			reportDecodeIssues(outcome.issues, (message) => toast.warning(message))
			tracks.value = reconcileFetchedTracks(
				context,
				startingRevision,
				outcome.value
			)
			return true
		} catch (error) {
			if (!context || !isCurrentFetchContext(context)) return false
			console.error('Failed to fetch tracks:', error)
			toast.error('Error fetching tracks.')
			return false
		} finally {
			const isCurrentOperation = context
				? isCurrentFetchContext(context)
				: generation === accountGeneration
			if (isCurrentOperation) isLoadingTracks.value = false
			if (activeFetchContext === context) activeFetchContext = null
		}
	}

	function fetchAllTracks(options: LibraryFetchOptions = {}): Promise<boolean> {
		if (options.fresh) {
			if (freshFetchPromise) return freshFetchPromise

			const generation = accountGeneration
			const priorFetch = fetchPromise
			const createdFreshPromise = (async () => {
				if (priorFetch) await priorFetch
				if (generation !== accountGeneration) return false
				return await (fetchPromise ?? fetchAllTracks())
			})().finally(() => {
				if (freshFetchPromise === createdFreshPromise) freshFetchPromise = null
			})
			freshFetchPromise = createdFreshPromise
			return createdFreshPromise
		}

		if (fetchPromise) return fetchPromise

		const createdPromise = performFetchAllTracks(accountGeneration).finally(
			() => {
				if (fetchPromise === createdPromise) fetchPromise = null
			}
		)
		fetchPromise = createdPromise
		return createdPromise
	}

	async function createTrack(
		trackData: TrackCreateInput
	): Promise<LibraryTrack | null> {
		const context = await resolveMutationContext(accountGeneration)
		if (!context) return null
		const activity = beginMutationActivity(context, 'create')
		try {
			const repositories = repositoriesFor(context)
			if (!repositories) return null
			const outcome = await repositories.tracks.create(context, trackData)
			if (!isCurrentAccountContext(context) || outcome.status === 'stale') {
				return null
			}
			if (outcome.status !== 'success') {
				throw outcome.status === 'unavailable'
					? (outcome.error ?? new Error(outcome.reason))
					: new Error(outcome.reason)
			}
			if (
				!runtime.acceptRepositoryRevision(context, outcome.repositoryRevision)
			) {
				return null
			}
			reportDecodeIssues(outcome.issues, (message) => toast.warning(message))
			recordCommittedTrackMutation(outcome.value.id, context, {
				kind: 'create',
				row: outcome.value
			})
			upsertTrack(outcome.value)
			toast.success('Track created successfully.')
			return outcome.value
		} catch (error) {
			if (!isCurrentAccountContext(context)) return null
			console.error('Failed to create track:', error)
			toast.error('Error creating track.')
			return null
		} finally {
			finishMutationActivity(activity)
		}
	}

	async function applyTrackUpdate(
		context: FetchContext,
		id: string,
		updates: TrackUpdateInput,
		options?: {
			suppressSuccessToast?: boolean
			suppressErrorToast?: boolean
			preconditions?: TrackBatchUpdate['preconditions']
		}
	): Promise<ApplyTrackUpdateResult> {
		if (runtime.capture().descriptor.readOnly)
			return {
				track: null,
				error: 'Disabled in demo mode.',
				issues: [],
				stale: false
			}
		const staleResult: ApplyTrackUpdateResult = {
			track: null,
			error: null,
			issues: [],
			stale: true
		}
		return await runSerializedTrackOperation(
			context,
			id,
			staleResult,
			async () => {
				if (
					!(await confirmMutationContext(context, options?.suppressErrorToast))
				) {
					return { track: null, error: null, issues: [], stale: true }
				}
				const trackIndex = tracks.value.findIndex(
					(track: LibraryTrack) => track.id === id
				)
				if (trackIndex === -1) {
					if (!options?.suppressErrorToast) toast.error('Track not found.')
					return {
						track: null,
						error: 'Track not found.',
						issues: [],
						stale: false
					}
				}

				const originalTrack = tracks.value[trackIndex]!
				const optimisticTrack = {
					...originalTrack,
					...updates
				} as LibraryTrack
				const operationRevision = nextMutationRevision()
				trackOperationRevisions.set(id, operationRevision)
				tracks.value[trackIndex] = optimisticTrack

				try {
					const repositories = repositoriesFor(context)
					if (!repositories) return staleResult
					const outcome = await repositories.tracks.update(context, {
						id,
						updates
					})

					if (!isCurrentAccountContext(context) || outcome.status === 'stale') {
						return { track: null, error: null, issues: [], stale: true }
					}
					if (outcome.status !== 'success') {
						throw outcome.status === 'unavailable'
							? (outcome.error ?? new Error(outcome.reason))
							: new Error(outcome.reason)
					}
					const ownsOperation =
						trackOperationRevisions.get(id) === operationRevision
					if (!ownsOperation) {
						return { track: null, error: null, issues: [], stale: true }
					}
					if (
						!runtime.acceptRepositoryRevision(
							context,
							outcome.repositoryRevision
						)
					) {
						return staleResult
					}
					recordCommittedTrackMutation(id, context, {
						kind: 'update',
						row: outcome.value
					})
					upsertTrack(outcome.value)
					if (!options?.suppressSuccessToast)
						toast.success('Track updated successfully.')
					return {
						track: outcome.value,
						error: null,
						issues: outcome.issues,
						stale: false
					}
				} catch (error) {
					if (!isCurrentAccountContext(context)) {
						return { track: null, error: null, issues: [], stale: true }
					}
					const currentIndex = tracks.value.findIndex(
						(track) => track.id === id
					)
					const ownsOperation =
						trackOperationRevisions.get(id) === operationRevision
					if (!ownsOperation) {
						return { track: null, error: null, issues: [], stale: true }
					}
					console.error('Failed to update track:', error)
					if (
						currentIndex !== -1 &&
						toRaw(tracks.value[currentIndex]) === optimisticTrack
					) {
						tracks.value[currentIndex] = originalTrack
					}
					if (!options?.suppressErrorToast) toast.error('Error updating track.')
					return {
						track: null,
						error: getErrorMessage(error),
						issues: [],
						stale: false
					}
				} finally {
					if (trackOperationRevisions.get(id) === operationRevision) {
						trackOperationRevisions.delete(id)
					}
				}
			}
		)
	}

	async function updateTrack(
		id: string,
		updates: TrackUpdateInput,
		options?: { silent?: boolean }
	): Promise<LibraryTrack | null> {
		const context = await resolveMutationContext(accountGeneration)
		if (!context) return null
		const activity = beginMutationActivity(context, 'update')

		try {
			const result = await applyTrackUpdate(context, id, updates, {
				suppressSuccessToast: options?.silent,
				suppressErrorToast: false
			})
			if (result.stale || !isCurrentAccountContext(context)) return null
			reportDecodeIssues(result.issues, (message) => toast.warning(message))
			return result.track
		} finally {
			finishMutationActivity(activity)
		}
	}

	function createTrackBatchIssue(code: TrackBatchIssueCode): TrackBatchIssue {
		return { code, message: TRACK_BATCH_ISSUE_MESSAGES[code] }
	}

	function createFailedTrackBatchResult(
		id: string,
		status: 'stale' | 'not_found' | 'invalid' | 'unknown' | 'unattempted',
		code: TrackBatchIssueCode,
		operation: TrackBatchUpdateResult['operation']
	): TrackBatchUpdateResult {
		const issue = createTrackBatchIssue(code)
		return {
			id,
			status,
			success: false,
			track: null,
			issue,
			error: issue.message,
			operation
		}
	}

	function beginOptimisticBatchMutation(
		batchUpdate: TrackBatchUpdate
	): OptimisticBatchMutation | null {
		const trackIndex = tracks.value.findIndex(
			(track) => track.id === batchUpdate.id
		)
		if (trackIndex === -1) return null

		const originalTrack = tracks.value[trackIndex]!
		const optimisticTrack = {
			...originalTrack,
			...batchUpdate.updates
		} as LibraryTrack
		const operationRevision = nextMutationRevision()
		trackOperationRevisions.set(batchUpdate.id, operationRevision)
		tracks.value[trackIndex] = optimisticTrack
		return {
			id: batchUpdate.id,
			originalTrack,
			optimisticTrack,
			operationRevision
		}
	}

	function rollbackOptimisticBatchMutation(
		mutation: OptimisticBatchMutation | null
	): void {
		if (
			!mutation ||
			trackOperationRevisions.get(mutation.id) !== mutation.operationRevision
		) {
			return
		}
		const currentIndex = tracks.value.findIndex(
			(track) => track.id === mutation.id
		)
		if (
			currentIndex !== -1 &&
			toRaw(tracks.value[currentIndex]) === mutation.optimisticTrack
		) {
			tracks.value[currentIndex] = mutation.originalTrack
		}
	}

	function finishOptimisticBatchMutation(
		mutation: OptimisticBatchMutation | null
	): void {
		if (
			mutation &&
			trackOperationRevisions.get(mutation.id) === mutation.operationRevision
		) {
			trackOperationRevisions.delete(mutation.id)
		}
	}

	async function requestTrackEnrichmentChunk(
		context: FetchContext,
		updates: readonly TrackBatchUpdate[]
	): Promise<RepositoryTrackChunkResponse> {
		const repositories = repositoriesFor(context)
		if (!repositories) return { kind: 'cancelled' }
		const outcome = await repositories.tracks.updateBatch(context, updates)
		if (!isCurrentAccountContext(context) || outcome.status === 'stale') {
			return { kind: 'cancelled' }
		}
		if (outcome.status !== 'success') {
			return {
				kind: 'unknown',
				error:
					outcome.status === 'unavailable'
						? (outcome.error ?? new Error(outcome.reason))
						: new Error(outcome.reason)
			}
		}
		if (
			!runtime.acceptRepositoryRevision(context, outcome.repositoryRevision)
		) {
			return { kind: 'cancelled' }
		}
		return {
			kind: 'settled',
			results: outcome.value.results,
			decodeIssues: outcome.issues,
			refreshRequired: outcome.value.results.some(
				(result) =>
					result.status === 'unknown' ||
					result.issue?.code === 'invalid_response'
			),
			stoppedByCapacity: outcome.value.results.some(
				(result) => result.issue?.code === 'receipt_capacity'
			),
			stoppedByUnknown: outcome.value.results.some(
				(result) => result.status === 'unknown'
			)
		}
	}

	async function updateTracksBatch(
		batchUpdates: TrackBatchUpdate[],
		options?: {
			onProgress?: (
				completed: number,
				total: number,
				result: TrackBatchUpdateResult
			) => void
		}
	): Promise<TrackBatchUpdateOutcome> {
		const context = await resolveMutationContext(accountGeneration)
		if (!context) {
			return {
				results: batchUpdates.map((batchUpdate) =>
					createFailedTrackBatchResult(
						batchUpdate.id,
						'unattempted',
						'account_replaced',
						null
					)
				),
				cancelled: true,
				requiresReview: false
			}
		}
		const activity = beginMutationActivity(context, 'update')
		const orderedResults = new Array<TrackBatchUpdateResult | undefined>(
			batchUpdates.length
		)
		const decodeIssues: DecodeIssue[] = []
		let cancelled = false
		let stoppedByCapacity = false
		let requiresFreshReview = false
		let progressCount = 0
		let nextProgressOrdinal = 0

		const publishOrderedProgress = () => {
			while (nextProgressOrdinal < orderedResults.length) {
				const result = orderedResults[nextProgressOrdinal]
				if (!result) return
				nextProgressOrdinal += 1
				if (result.status === 'unattempted') continue
				progressCount += 1
				options?.onProgress?.(progressCount, batchUpdates.length, result)
			}
		}

		const idCounts = new Map<string, number>()
		for (const batchUpdate of batchUpdates) {
			idCounts.set(batchUpdate.id, (idCounts.get(batchUpdate.id) ?? 0) + 1)
		}
		const actionableEntries = batchUpdates
			.map((update, ordinal) => ({ ordinal, update }))
			.filter((entry) => {
				if ((idCounts.get(entry.update.id) ?? 0) === 1) return true
				orderedResults[entry.ordinal] = createFailedTrackBatchResult(
					entry.update.id,
					'invalid',
					'duplicate_track_id',
					null
				)
				return false
			})
		publishOrderedProgress()

		try {
			for (
				let chunkStart = 0;
				chunkStart < actionableEntries.length;
				chunkStart += TRACK_ENRICHMENT_BATCH_SIZE
			) {
				if (!isCurrentAccountContext(context)) {
					cancelled = true
					break
				}
				const entries = actionableEntries.slice(
					chunkStart,
					chunkStart + TRACK_ENRICHMENT_BATCH_SIZE
				)

				const chunkOutcome = await runSerializedTrackBatchOperation(
					context,
					entries.map((entry) => entry.update.id),
					{ kind: 'cancelled' } as const,
					async () => {
						if (!(await confirmMutationContext(context, true))) {
							return { kind: 'cancelled' } as const
						}
						const optimisticMutations = new Map(
							entries.map((entry) => [
								entry.update.id,
								beginOptimisticBatchMutation(entry.update)
							])
						)
						const response = await requestTrackEnrichmentChunk(
							context,
							entries.map((entry) => entry.update)
						)

						if (response.kind !== 'settled') {
							if (isCurrentAccountContext(context)) {
								for (const mutation of optimisticMutations.values()) {
									rollbackOptimisticBatchMutation(mutation)
								}
							}
							for (const mutation of optimisticMutations.values()) {
								finishOptimisticBatchMutation(mutation)
							}
							return response
						}

						const reconciledResults: TrackBatchUpdateResult[] = []
						for (const [index, serverResult] of response.results.entries()) {
							const entry = entries[index]!
							const mutation = optimisticMutations.get(entry.update.id) ?? null
							if (serverResult.status === 'updated' && serverResult.track) {
								try {
									if (serverResult.track.id !== entry.update.id) {
										throw new Error('Track batch response ID mismatch')
									}
									if (
										!isCurrentAccountContext(context) ||
										(mutation &&
											trackOperationRevisions.get(entry.update.id) !==
												mutation.operationRevision)
									) {
										return { kind: 'cancelled' } as const
									}
									recordCommittedTrackMutation(entry.update.id, context, {
										kind: 'update',
										row: serverResult.track
									})
									upsertTrack(serverResult.track)
									reconciledResults.push(serverResult)
								} catch {
									rollbackOptimisticBatchMutation(mutation)
									reconciledResults.push(
										createFailedTrackBatchResult(
											entry.update.id,
											'invalid',
											'invalid_response',
											serverResult.operation
										)
									)
								}
							} else {
								rollbackOptimisticBatchMutation(mutation)
								reconciledResults.push(serverResult)
							}
							finishOptimisticBatchMutation(mutation)
						}
						return {
							kind: 'settled',
							results: reconciledResults,
							decodeIssues: response.decodeIssues,
							refreshRequired: response.refreshRequired,
							stoppedByCapacity: response.stoppedByCapacity,
							stoppedByUnknown: response.stoppedByUnknown
						} as const
					}
				)

				if (chunkOutcome.kind === 'cancelled') {
					cancelled = true
					break
				}
				if (chunkOutcome.kind === 'unknown') {
					console.error('Track enrichment batch result could not be confirmed.')
					for (const entry of entries) {
						orderedResults[entry.ordinal] = createFailedTrackBatchResult(
							entry.update.id,
							'unknown',
							'request_unknown',
							null
						)
					}
					requiresFreshReview = true
					publishOrderedProgress()
					break
				}
				if (chunkOutcome.kind === 'capacity') {
					for (const entry of entries) {
						orderedResults[entry.ordinal] = createFailedTrackBatchResult(
							entry.update.id,
							'invalid',
							'receipt_capacity',
							null
						)
					}
					stoppedByCapacity = true
					publishOrderedProgress()
					break
				}

				decodeIssues.push(...chunkOutcome.decodeIssues)
				requiresFreshReview ||= chunkOutcome.refreshRequired
				for (const [index, entry] of entries.entries()) {
					orderedResults[entry.ordinal] = chunkOutcome.results[index]!
				}
				publishOrderedProgress()
				if (chunkOutcome.stoppedByCapacity) {
					stoppedByCapacity = true
					break
				}
				if (chunkOutcome.stoppedByUnknown) break
			}

			const unattemptedCode = cancelled
				? 'account_replaced'
				: stoppedByCapacity
					? 'receipt_capacity'
					: 'prior_chunk_unknown'
			for (const [ordinal, result] of orderedResults.entries()) {
				if (result) continue
				orderedResults[ordinal] = createFailedTrackBatchResult(
					batchUpdates[ordinal]!.id,
					'unattempted',
					unattemptedCode,
					null
				)
			}
			publishOrderedProgress()

			if (isCurrentAccountContext(context)) {
				reportDecodeIssues(decodeIssues, (message) => toast.warning(message))
				if (requiresFreshReview) await fetchAllTracks({ fresh: true })
			}
			const results = orderedResults as TrackBatchUpdateResult[]
			return {
				results,
				cancelled,
				requiresReview: results.some(
					(result) =>
						result.status === 'stale' ||
						result.status === 'not_found' ||
						result.status === 'invalid' ||
						result.status === 'unknown'
				)
			}
		} finally {
			finishMutationActivity(activity)
		}
	}

	async function deleteTrack(id: string): Promise<boolean> {
		const context = await resolveMutationContext(accountGeneration)
		if (!context) return false
		return await runSerializedTrackOperation(context, id, false, async () => {
			if (!(await confirmMutationContext(context))) return false
			const trackIndex = tracks.value.findIndex(
				(t: LibraryTrack) => t.id === id
			)
			if (trackIndex === -1) {
				toast.error('Track not found.')
				return false
			}
			const removedTrack = tracks.value[trackIndex]!
			const previousTrackId = tracks.value[trackIndex - 1]?.id
			const nextTrackId = tracks.value[trackIndex + 1]?.id
			const operationRevision = nextMutationRevision()
			trackOperationRevisions.set(id, operationRevision)
			tracks.value.splice(trackIndex, 1)
			try {
				const repositories = repositoriesFor(context)
				if (!repositories) return false
				const outcome = await repositories.tracks.delete(context, { id })
				if (
					!isCurrentAccountContext(context) ||
					outcome.status === 'stale' ||
					trackOperationRevisions.get(id) !== operationRevision
				) {
					return false
				}
				if (outcome.status !== 'success') {
					throw outcome.status === 'unavailable'
						? (outcome.error ?? new Error(outcome.reason))
						: new Error(outcome.reason)
				}
				if (
					!runtime.acceptRepositoryRevision(context, outcome.repositoryRevision)
				) {
					return false
				}
				recordCommittedTrackMutation(id, context, { kind: 'delete' })
				tracks.value = tracks.value.filter((track) => track.id !== id)
				toast.success('Track deleted successfully.')
				return true
			} catch (error) {
				if (
					!isCurrentAccountContext(context) ||
					trackOperationRevisions.get(id) !== operationRevision
				) {
					return false
				}
				console.error('Failed to delete track:', error)
				if (!tracks.value.some((track) => track.id === id)) {
					const nextIndex = nextTrackId
						? tracks.value.findIndex((track) => track.id === nextTrackId)
						: -1
					if (nextIndex !== -1) tracks.value.splice(nextIndex, 0, removedTrack)
					else {
						const previousIndex = previousTrackId
							? tracks.value.findIndex((track) => track.id === previousTrackId)
							: -1
						tracks.value.splice(previousIndex + 1, 0, removedTrack)
					}
				}
				toast.error('Error deleting track.')
				return false
			} finally {
				if (trackOperationRevisions.get(id) === operationRevision) {
					trackOperationRevisions.delete(id)
				}
			}
		})
	}

	function getTrackById(id: string): LibraryTrack | undefined {
		return tracksById.value.get(id)
	}

	function getTracksByRecordId(recordId: string): LibraryTrack[] {
		return [...(tracksByRecordId.value.get(recordId) ?? [])]
	}

	function removeTracksByRecordId(recordId: string) {
		const removedTracks = tracks.value.filter(
			(track) => track.record_id === recordId
		)
		const context = captureContext(accountGeneration)
		if (context) {
			for (const track of removedTracks) {
				recordCommittedTrackMutation(track.id, context, { kind: 'delete' })
			}
		}
		tracks.value = tracks.value.filter((track) => track.record_id !== recordId)
	}

	function searchTracks(query: string): LibraryTrack[] {
		if (!query.trim()) return tracks.value

		const lowercaseQuery = query.toLowerCase()
		return tracks.value.filter((track: LibraryTrack) => {
			// Search in title
			if (track.title.toLowerCase().includes(lowercaseQuery)) return true

			// Search in artists
			const artistMatch = track.artists.some((artist: DiscogsArtistDb) =>
				artist.name.toLowerCase().includes(lowercaseQuery)
			)
			if (artistMatch) return true

			// Search in extraartists
			const extraArtistMatch = track.extraartists.some(
				(artist: DiscogsArtistDb) =>
					artist.name.toLowerCase().includes(lowercaseQuery)
			)
			if (extraArtistMatch) return true

			// Search in genres
			const genreMatch = track.genres.some((genre: string) =>
				genre.toLowerCase().includes(lowercaseQuery)
			)
			if (genreMatch) return true

			// Search in position
			if (
				track.position &&
				track.position.toLowerCase().includes(lowercaseQuery)
			)
				return true

			// Search in BPM (convert to string for partial matches)
			if (track.bpm && track.bpm.toString().includes(query)) return true

			return false
		})
	}

	// Clear tracks when user signs out
	function clearTracks() {
		accountGeneration += 1
		fetchPromise = null
		freshFetchPromise = null
		activeFetchContext = null
		mutationRevision = 0
		trackMutationProvenance.clear()
		trackOperationRevisions.clear()
		trackOperationQueues.clear()
		mutationActivityCounts.create = 0
		mutationActivityCounts.update = 0
		isLoadingTracks.value = false
		isCreatingTrack.value = false
		isUpdatingTrack.value = false
		tracks.value = []
	}

	return {
		tracks,
		isLoadingTracks,
		isCreatingTrack,
		isUpdatingTrack,
		tracksCount,
		hasTracks,
		playableTracks,
		fetchAllTracks,
		createTrack,
		updateTrack,
		updateTracksBatch,
		deleteTrack,
		getTrackById,
		getTracksByRecordId,
		removeTracksByRecordId,
		searchTracks,
		clearTracks
	}
})
