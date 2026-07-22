import { toRaw } from 'vue'
import { toast } from 'vue-sonner'
import { getActivePinia } from 'pinia'
import {
	ensureCloudWorkbenchRuntime,
	ensureDemoWorkbenchRuntime
} from '~/composables/useWorkbench'
import type { WorkspaceOperationContext } from '~/repositories/library/contracts'
import type { RecordCoverChange } from '~/utils/recordCoverCoordinator'
import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { reportDecodeIssues } from '~/utils/supabaseRows'
import {
	getWorkbenchRuntime,
	isDemoWorkbenchPinia
} from '~/utils/workbenchPinia'
import type {
	LibraryRecord,
	ManualRecordWithTracksInput,
	RecordUpdateInput
} from '~~/shared/types/library'

export type RecordAccountContext = WorkspaceOperationContext & {
	generation: number
}

type CoverCleanupDrainOptions = {
	fresh?: boolean
	context?: RecordAccountContext
}

type LibraryFetchOptions = {
	fresh?: boolean
}

type RecordMutationProvenance = RecordAccountContext & { revision: number } & (
		| { kind: 'create' | 'update'; row: LibraryRecord }
		| { kind: 'delete' }
	)

type MutationActivity = 'create' | 'update' | 'cover' | 'delete'

type MutationActivityToken = {
	generation: number
	activity: MutationActivity
}

export const useRecordsStore = defineStore('records', () => {
	const pinia = getActivePinia()
	const runtime =
		getWorkbenchRuntime(pinia) ??
		(isDemoWorkbenchPinia(pinia)
			? ensureDemoWorkbenchRuntime(pinia!)
			: ensureCloudWorkbenchRuntime(pinia!))
	const tracksStore = useTracksStore(pinia)

	const records = ref<LibraryRecord[]>([])
	const isLoadingRecords = ref(false)
	const isCreatingRecord = ref(false)
	const isUpdatingRecord = ref(false)
	const isUpdatingCover = ref(false)
	const isDeletingRecord = ref(false)
	let fetchPromise: Promise<boolean> | null = null
	let freshFetchPromise: Promise<boolean> | null = null
	let accountGeneration = 0
	let activeFetchContext: RecordAccountContext | null = null
	let mutationRevision = 0
	let operationRevision = 0
	const recordMutationProvenance = new Map<string, RecordMutationProvenance>()
	const recordOperationRevisions = new Map<string, number>()
	const recordOperationQueues = new Map<string, Promise<void>>()
	const mutationActivityCounts: Record<MutationActivity, number> = {
		create: 0,
		update: 0,
		cover: 0,
		delete: 0
	}

	const searchQuery = ref('')
	const isSearching = ref(false)

	const recordsCount = computed(() => records.value.length)
	const hasRecords = computed(() => records.value.length > 0)
	const recordsById = computed(
		() => new Map(records.value.map((record) => [record.id, record]))
	)

	// Search is derived from the authoritative library so active results cannot
	// retain stale record objects after a mutation or refresh.
	const hasSearchQuery = computed(() => searchQuery.value.length > 0)
	const searchResults = computed(() => {
		const query = searchQuery.value
		if (!query) return []

		return records.value.filter(
			(record) =>
				record.title.toLowerCase().includes(query) ||
				record.artists.some((artist) =>
					artist.name.toLowerCase().includes(query)
				) ||
				record.labels.some(
					(label) =>
						label.name.toLowerCase().includes(query) ||
						label.catno?.toLowerCase().includes(query)
				) ||
				Boolean(record.year?.toString().includes(query))
		)
	})
	const hasSearchResults = computed(() => searchResults.value.length > 0)
	const resultsCount = computed(() => searchResults.value.length)

	const displayedRecords = computed(() =>
		hasSearchQuery.value ? searchResults.value : records.value
	)

	function isCurrentAccountContext(context: RecordAccountContext): boolean {
		return (
			context.generation === accountGeneration && runtime.isCurrent(context)
		)
	}

	function isSameAccountContext(
		left: RecordAccountContext,
		right: RecordAccountContext
	): boolean {
		return (
			left.generation === right.generation &&
			left.workspaceId === right.workspaceId &&
			left.repositoryId === right.repositoryId &&
			left.activationGeneration === right.activationGeneration
		)
	}

	function captureContext(generation: number): RecordAccountContext | null {
		if (generation !== accountGeneration) return null
		const captured = runtime.capture()
		return { ...captured.context, generation }
	}

	function captureImmediateAccountContext(): RecordAccountContext | null {
		const captured = runtime.capture()
		return captured.descriptor.readOnly
			? null
			: { ...captured.context, generation: accountGeneration }
	}

	function isCurrentFetchContext(context: RecordAccountContext): boolean {
		return isCurrentAccountContext(context) && activeFetchContext === context
	}

	function repositoriesFor(context: RecordAccountContext) {
		if (!isCurrentAccountContext(context)) return null
		const captured = runtime.capture()
		return runtime.isCurrent(context) ? captured.repositories : null
	}

	function setMutationActivity(
		activity: MutationActivity,
		isActive: boolean
	): void {
		if (activity === 'create') isCreatingRecord.value = isActive
		else if (activity === 'update') isUpdatingRecord.value = isActive
		else if (activity === 'cover') isUpdatingCover.value = isActive
		else isDeletingRecord.value = isActive
	}

	function beginMutationActivity(
		activity: MutationActivity
	): MutationActivityToken {
		mutationActivityCounts[activity] += 1
		setMutationActivity(activity, true)
		return { generation: accountGeneration, activity }
	}

	function finishMutationActivity(token: MutationActivityToken): void {
		if (token.generation !== accountGeneration) return
		mutationActivityCounts[token.activity] = Math.max(
			0,
			mutationActivityCounts[token.activity] - 1
		)
		setMutationActivity(
			token.activity,
			mutationActivityCounts[token.activity] > 0
		)
	}

	async function captureAccountContext(): Promise<RecordAccountContext | null> {
		return captureImmediateAccountContext()
	}

	async function resolveMutationContext(
		generation: number
	): Promise<RecordAccountContext | null> {
		const context = captureContext(generation)
		if (!context || runtime.capture().descriptor.readOnly) return null
		return context
	}

	function nextOperationRevision(): number {
		operationRevision += 1
		return operationRevision
	}

	function recordCommittedMutation(
		id: string,
		context: RecordAccountContext,
		mutation:
			| { kind: 'create' | 'update'; row: LibraryRecord }
			| { kind: 'delete' }
	): void {
		mutationRevision += 1
		recordMutationProvenance.set(id, {
			...context,
			...mutation,
			revision: mutationRevision
		})
	}

	function upsertRecord(record: LibraryRecord): void {
		const currentIndex = records.value.findIndex(({ id }) => id === record.id)
		if (currentIndex !== -1) {
			records.value[currentIndex] = record
			return
		}
		records.value = sortCreatedAtDescIdDesc([...records.value, record])
	}

	function runSerializedRecordOperation<T>(
		context: RecordAccountContext,
		id: string,
		staleResult: T,
		operation: () => Promise<T>
	): Promise<T> {
		const previous = recordOperationQueues.get(id)
		const run = previous
			? previous
					.catch(() => undefined)
					.then(async () => {
						if (!isCurrentAccountContext(context)) return staleResult
						return await operation()
					})
			: isCurrentAccountContext(context)
				? operation()
				: Promise.resolve(staleResult)
		const completion = run.then(
			() => undefined,
			() => undefined
		)
		recordOperationQueues.set(id, completion)
		void completion.finally(() => {
			if (recordOperationQueues.get(id) === completion) {
				recordOperationQueues.delete(id)
			}
		})
		return run
	}

	function reconcileFetchedRecords(
		context: RecordAccountContext,
		startingRevision: number,
		fetchedRecords: LibraryRecord[]
	): LibraryRecord[] {
		const reconciled = new Map(
			fetchedRecords.map((record) => [record.id, record])
		)

		for (const [id, provenance] of recordMutationProvenance) {
			if (!isSameAccountContext(provenance, context)) {
				continue
			}

			if (provenance.revision > startingRevision) {
				if (provenance.kind === 'delete') reconciled.delete(id)
				else if (provenance.kind === 'update' || !reconciled.has(id)) {
					reconciled.set(id, provenance.row)
				} else {
					// A response that already contains a concurrently created row has
					// observed the insert and is the authoritative representation.
					recordMutationProvenance.delete(id)
				}
				continue
			}

			const fetchedRecord = reconciled.get(id)
			const confirmsMutation =
				provenance.kind === 'delete'
					? !fetchedRecord
					: provenance.kind === 'create'
						? Boolean(fetchedRecord)
						: Boolean(
								fetchedRecord &&
								JSON.stringify(fetchedRecord) === JSON.stringify(provenance.row)
							)
			if (confirmsMutation) recordMutationProvenance.delete(id)
		}

		return sortCreatedAtDescIdDesc([...reconciled.values()])
	}

	async function performFetchAllRecords(generation: number): Promise<boolean> {
		isLoadingRecords.value = true
		const context = captureContext(generation)
		try {
			if (!context) return false
			activeFetchContext = context
			const startingRevision = mutationRevision
			const repositories = repositoriesFor(context)
			if (!repositories) return false
			const outcome = await repositories.records.list(context)
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
			records.value = reconcileFetchedRecords(
				context,
				startingRevision,
				outcome.value
			)
			return true
		} catch (error) {
			if (!context || !isCurrentFetchContext(context)) return false
			console.error('Failed to fetch records:', error)
			toast.error('Error fetching records.')
			return false
		} finally {
			const isCurrentOperation = context
				? isCurrentFetchContext(context)
				: generation === accountGeneration
			if (isCurrentOperation) isLoadingRecords.value = false
			if (activeFetchContext === context) activeFetchContext = null
		}
	}

	function fetchAllRecords(
		options: LibraryFetchOptions = {}
	): Promise<boolean> {
		if (runtime.capture().descriptor.location === 'demo') {
			return Promise.resolve(true)
		}
		if (options.fresh) {
			if (freshFetchPromise) return freshFetchPromise

			const generation = accountGeneration
			const priorFetch = fetchPromise
			const createdFreshPromise = (async () => {
				if (priorFetch) await priorFetch
				if (generation !== accountGeneration) return false
				// A normal traversal started after the fresh request is already a valid
				// post-write snapshot, so it may be shared. Otherwise start one now.
				return await (fetchPromise ?? fetchAllRecords())
			})().finally(() => {
				if (freshFetchPromise === createdFreshPromise) freshFetchPromise = null
			})
			freshFetchPromise = createdFreshPromise
			return createdFreshPromise
		}

		if (fetchPromise) return fetchPromise

		const createdPromise = performFetchAllRecords(accountGeneration).finally(
			() => {
				if (fetchPromise === createdPromise) fetchPromise = null
			}
		)
		fetchPromise = createdPromise
		return createdPromise
	}

	async function createRecordWithTracks(
		recordInput: ManualRecordWithTracksInput
	): Promise<LibraryRecord | null> {
		const activity = beginMutationActivity('create')
		let context: RecordAccountContext | null = null

		try {
			context = await resolveMutationContext(activity.generation)
			if (!context) return null

			const repositories = repositoriesFor(context)
			if (!repositories) return null
			const outcome = await repositories.records.createWithTracks(
				context,
				recordInput
			)
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
			const committedRecord = outcome.value
			recordCommittedMutation(committedRecord.id, context, {
				kind: 'create',
				row: committedRecord
			})
			upsertRecord(committedRecord)

			const tracksInserted = recordInput.tracks.length
			toast.success(
				tracksInserted > 0
					? `Record and ${tracksInserted} ${tracksInserted === 1 ? 'track' : 'tracks'} created successfully.`
					: 'Record created successfully.'
			)

			const refreshResults = await Promise.allSettled([
				fetchAllRecords({ fresh: true }),
				tracksStore.fetchAllTracks({ fresh: true })
			])
			if (!isCurrentAccountContext(context)) return null
			let createdRecord = getRecordById(committedRecord.id)
			const refreshSucceeded =
				Boolean(createdRecord) &&
				refreshResults.every(
					(result) => result.status === 'fulfilled' && result.value === true
				)
			if (!createdRecord) {
				upsertRecord(committedRecord)
				createdRecord = committedRecord
			}
			if (!refreshSucceeded) {
				toast.warning(
					'Record created, but your library could not be fully refreshed.'
				)
			}

			return createdRecord
		} catch (error) {
			if (!context || !isCurrentAccountContext(context)) return null
			console.error('Failed to create record with tracks:', error)
			toast.error('Error creating record.')
			return null
		} finally {
			finishMutationActivity(activity)
		}
	}

	async function updateRecordForContext(
		context: RecordAccountContext,
		id: string,
		updates: RecordUpdateInput,
		activity: MutationActivityToken = beginMutationActivity('update')
	): Promise<LibraryRecord | null> {
		try {
			if (!isCurrentAccountContext(context)) return null
			return await runSerializedRecordOperation(context, id, null, async () => {
				const recordIndex = records.value.findIndex(
					(record) => record.id === id
				)
				if (recordIndex === -1) {
					toast.error('Record not found.')
					return null
				}

				const originalRecord = records.value[recordIndex]!
				const optimisticRecord = {
					...originalRecord,
					...updates
				} as LibraryRecord
				const currentOperationRevision = nextOperationRevision()
				recordOperationRevisions.set(id, currentOperationRevision)
				records.value[recordIndex] = optimisticRecord

				const rollbackIfOwned = () => {
					const currentIndex = records.value.findIndex(
						(record) => record.id === id
					)
					if (
						recordOperationRevisions.get(id) === currentOperationRevision &&
						currentIndex !== -1 &&
						toRaw(records.value[currentIndex]) === optimisticRecord
					) {
						records.value[currentIndex] = originalRecord
					}
				}

				try {
					const repositories = repositoriesFor(context)
					if (!repositories) return null
					const outcome = await repositories.records.update(context, {
						id,
						updates
					})
					if (!isCurrentAccountContext(context) || outcome.status === 'stale') {
						return null
					}
					if (outcome.status !== 'success') {
						throw outcome.status === 'unavailable'
							? (outcome.error ?? new Error(outcome.reason))
							: new Error(outcome.reason)
					}
					if (recordOperationRevisions.get(id) !== currentOperationRevision) {
						return null
					}
					if (
						!runtime.acceptRepositoryRevision(
							context,
							outcome.repositoryRevision
						)
					) {
						return null
					}
					reportDecodeIssues(outcome.issues, (message) =>
						toast.warning(message)
					)
					recordCommittedMutation(id, context, {
						kind: 'update',
						row: outcome.value
					})
					upsertRecord(outcome.value)
					toast.success('Record updated successfully.')
					return outcome.value
				} catch (error) {
					if (!isCurrentAccountContext(context)) return null
					if (recordOperationRevisions.get(id) !== currentOperationRevision) {
						return null
					}
					console.error('Failed to update record:', error)
					rollbackIfOwned()
					toast.error('Error updating record.')
					return null
				} finally {
					if (recordOperationRevisions.get(id) === currentOperationRevision) {
						recordOperationRevisions.delete(id)
					}
				}
			})
		} finally {
			finishMutationActivity(activity)
		}
	}

	async function updateRecord(
		id: string,
		updates: RecordUpdateInput
	): Promise<LibraryRecord | null> {
		const activity = beginMutationActivity('update')
		const immediateContext = captureImmediateAccountContext()
		if (immediateContext) {
			return updateRecordForContext(immediateContext, id, updates, activity)
		}
		const context = await resolveMutationContext(activity.generation)
		if (!context) {
			finishMutationActivity(activity)
			return null
		}
		return updateRecordForContext(context, id, updates, activity)
	}

	async function drainCoverCleanup(
		options: CoverCleanupDrainOptions = {}
	): Promise<boolean> {
		if (runtime.capture().descriptor.location === 'demo') return true
		const context = options.context ?? (await captureAccountContext())
		if (!context || !isCurrentAccountContext(context)) return false
		const repositories = repositoriesFor(context)
		if (!repositories) return false
		const outcome = await repositories.records.drainCoverCleanup(context, {
			fresh: options.fresh
		})
		if (!isCurrentAccountContext(context) || outcome.status === 'stale') {
			return false
		}
		if (outcome.status !== 'success') {
			console.error('Failed to drain record cover cleanup.')
			toast.warning('Some old cover files still need cleanup.')
			return false
		}
		return runtime.acceptRepositoryRevision(context, outcome.repositoryRevision)
	}

	async function updateRecordWithCover(
		id: string,
		updates: RecordUpdateInput,
		coverChange: RecordCoverChange
	): Promise<LibraryRecord | null> {
		if (coverChange.type === 'keep') return updateRecord(id, updates)

		const activity = beginMutationActivity('cover')
		let context: RecordAccountContext | null = null

		try {
			context = await resolveMutationContext(activity.generation)
			if (!context) return null
			if (!getRecordById(id)) {
				toast.error('Record not found.')
				return null
			}
			const operationContext = context
			const repositories = repositoriesFor(operationContext)
			if (!repositories) return null
			return await runSerializedRecordOperation(
				operationContext,
				id,
				null,
				async () => {
					const currentIndex = records.value.findIndex(
						(record) => record.id === id
					)
					if (currentIndex === -1) return null
					const originalRecord = records.value[currentIndex]!
					const optimisticRecord = { ...originalRecord, ...updates }
					const currentOperationRevision = nextOperationRevision()
					recordOperationRevisions.set(id, currentOperationRevision)
					records.value[currentIndex] = optimisticRecord
					try {
						const outcome = await repositories.records.updateWithCover(
							operationContext,
							{
								id,
								updates,
								change: coverChange
							}
						)
						if (
							!isCurrentAccountContext(operationContext) ||
							outcome.status === 'stale' ||
							recordOperationRevisions.get(id) !== currentOperationRevision
						) {
							return null
						}
						if (outcome.status !== 'success') {
							throw outcome.status === 'unavailable'
								? (outcome.error ?? new Error(outcome.reason))
								: new Error(outcome.reason)
						}
						if (
							!runtime.acceptRepositoryRevision(
								operationContext,
								outcome.repositoryRevision
							)
						) {
							return null
						}
						reportDecodeIssues(outcome.issues, (message) =>
							toast.warning(message)
						)
						recordCommittedMutation(id, operationContext, {
							kind: 'update',
							row: outcome.value
						})
						upsertRecord(outcome.value)
						toast.success('Record updated successfully.')
						return outcome.value
					} catch (error) {
						if (
							isCurrentAccountContext(operationContext) &&
							recordOperationRevisions.get(id) === currentOperationRevision
						) {
							const rollbackIndex = records.value.findIndex(
								(record) => record.id === id
							)
							if (
								rollbackIndex !== -1 &&
								toRaw(records.value[rollbackIndex]) === optimisticRecord
							) {
								records.value[rollbackIndex] = originalRecord
							}
						}
						throw error
					} finally {
						if (recordOperationRevisions.get(id) === currentOperationRevision) {
							recordOperationRevisions.delete(id)
						}
					}
				}
			)
		} catch (error) {
			if (!context || !isCurrentAccountContext(context)) return null
			console.error('Failed to update record cover:', error)
			toast.error(
				error instanceof Error ? error.message : 'Cover upload failed.'
			)
			return null
		} finally {
			finishMutationActivity(activity)
		}
	}

	async function removeRecordFromCollection(
		id: string,
		originatingContext?: RecordAccountContext
	): Promise<boolean> {
		const activity = beginMutationActivity('delete')
		let context: RecordAccountContext | null = null
		try {
			context = originatingContext ?? null
			if (!context) {
				context = await resolveMutationContext(activity.generation)
			}
			if (!context) return false
			const operationContext = context
			return await runSerializedRecordOperation(
				operationContext,
				id,
				false,
				async () => {
					if (
						originatingContext &&
						!isCurrentAccountContext(operationContext)
					) {
						return false
					}
					const currentOperationRevision = nextOperationRevision()
					recordOperationRevisions.set(id, currentOperationRevision)
					try {
						const repositories = repositoriesFor(operationContext)
						if (!repositories) return false
						const outcome = await repositories.records.removeFromCollection(
							operationContext,
							{ id }
						)
						if (
							!isCurrentAccountContext(operationContext) ||
							outcome.status === 'stale' ||
							recordOperationRevisions.get(id) !== currentOperationRevision
						) {
							return false
						}
						if (outcome.status !== 'success') {
							throw outcome.status === 'unavailable'
								? (outcome.error ?? new Error(outcome.reason))
								: new Error(outcome.reason)
						}
						if (
							!runtime.acceptRepositoryRevision(
								operationContext,
								outcome.repositoryRevision
							)
						) {
							return false
						}

						recordCommittedMutation(id, operationContext, { kind: 'delete' })
						records.value = records.value.filter((record) => record.id !== id)
						await drainCoverCleanup({ fresh: true, context: operationContext })
						if (!isCurrentAccountContext(operationContext)) return false

						toast.success('Record removed from collection')
						return true
					} finally {
						if (recordOperationRevisions.get(id) === currentOperationRevision) {
							recordOperationRevisions.delete(id)
						}
					}
				}
			)
		} catch (error) {
			if (!context || !isCurrentAccountContext(context)) return false
			console.error('Failed to remove record from collection:', error)
			toast.error('Failed to remove record')
			return false
		} finally {
			finishMutationActivity(activity)
		}
	}

	function getRecordById(id: string): LibraryRecord | undefined {
		return recordsById.value.get(id)
	}

	function getRecordsByIds(ids: string[]): LibraryRecord[] {
		return ids.flatMap((id) => {
			const record = recordsById.value.get(id)
			return record ? [record] : []
		})
	}

	async function performSearch(query: string) {
		isSearching.value = true
		try {
			searchQuery.value = query.trim().toLowerCase()
		} finally {
			isSearching.value = false
		}
	}

	function clearSearch() {
		searchQuery.value = ''
	}

	function clearRecords() {
		accountGeneration += 1
		runtime.capture().repositories.covers.reset()
		fetchPromise = null
		freshFetchPromise = null
		activeFetchContext = null
		mutationRevision = 0
		operationRevision = 0
		recordMutationProvenance.clear()
		recordOperationRevisions.clear()
		recordOperationQueues.clear()
		for (const activity of Object.keys(
			mutationActivityCounts
		) as MutationActivity[]) {
			mutationActivityCounts[activity] = 0
			setMutationActivity(activity, false)
		}
		isLoadingRecords.value = false
		records.value = []
		searchQuery.value = ''
	}

	return {
		records,
		isLoadingRecords,
		isCreatingRecord,
		isUpdatingRecord,
		isUpdatingCover,
		isDeletingRecord,
		recordsCount,
		hasRecords,
		searchQuery: readonly(searchQuery),
		searchResults: readonly(searchResults),
		isSearching: readonly(isSearching),
		hasSearchQuery,
		hasSearchResults,
		resultsCount,
		displayedRecords,
		captureAccountContext,
		isCurrentAccountContext,
		fetchAllRecords,
		createRecordWithTracks,
		updateRecord,
		updateRecordWithCover,
		drainCoverCleanup,
		removeRecordFromCollection,
		getRecordById,
		getRecordsByIds,
		performSearch,
		clearSearch,
		clearRecords
	}
})
