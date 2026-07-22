import { toRaw } from 'vue'
import { toast } from 'vue-sonner'
import { getActivePinia } from 'pinia'
import { validateImportResult } from '~/utils/discogs-validation'
import {
	type RecordCoverAccountContext,
	type RecordCoverChange,
	createRecordCoverCoordinator
} from '~/utils/recordCoverCoordinator'
import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import { decodeRecordRow, reportDecodeIssues } from '~/utils/supabaseRows'
import { isDemoWorkbenchPinia } from '~/utils/workbenchPinia'

type ManualRecordTrackInput = {
	title: string
	artistName?: string | null
	position?: string | null
	duration?: number | null
	bpm?: number | null
	rpm?: number | null
	key?: number | null
	mode?: number | null
	genres?: string[]
	playable?: boolean
}

type ManualRecordWithTracksInput = {
	title: string
	artistName?: string | null
	labelName?: string | null
	catno?: string | null
	year?: number | null
	cover?: string | null
	defaultGenres?: string[]
	defaultRpm?: number | null
	tracks: ManualRecordTrackInput[]
}

export type RecordAccountContext = RecordCoverAccountContext

type CoverCleanupDrainOptions = {
	fresh?: boolean
	context?: RecordAccountContext
}

type LibraryFetchOptions = {
	fresh?: boolean
}

type RecordMutationProvenance = RecordAccountContext & { revision: number } & (
		| { kind: 'create' | 'update'; row: DatabaseRecord }
		| { kind: 'delete' }
	)

type MutationActivity = 'create' | 'update' | 'cover' | 'delete'

type MutationActivityToken = {
	generation: number
	activity: MutationActivity
}

function isExpectedRecordRemoval(
	value: unknown,
	expectedRecordId: string
): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const result = value as Record<string, unknown>
	return result.success === true && result.record_id === expectedRecordId
}

function buildArtistPayload(name?: string | null): DiscogsArtistDb[] {
	const trimmedName = name?.trim()
	return trimmedName ? [{ name: trimmedName, role: null }] : []
}

function buildLabelPayload(
	name?: string | null,
	catno?: string | null
): DiscogsLabelDb[] {
	const trimmedName = name?.trim()
	if (!trimmedName) return []

	const trimmedCatno = catno?.trim()
	return [
		{
			name: trimmedName,
			catno: trimmedCatno || undefined
		}
	]
}

export const useRecordsStore = defineStore('records', () => {
	const supabase = useSupabaseClient<Database>()
	const pinia = getActivePinia()
	const isDemoStore = isDemoWorkbenchPinia(pinia)
	const user = useUserStore(pinia)
	const tracksStore = useTracksStore(pinia)

	const records = ref<DatabaseRecord[]>([])
	const isLoadingRecords = ref(false)
	const isCreatingRecord = ref(false)
	const isUpdatingRecord = ref(false)
	const isUpdatingCover = ref(false)
	const isDeletingRecord = ref(false)
	let fetchPromise: Promise<boolean> | null = null
	let freshFetchPromise: Promise<boolean> | null = null
	let accountGeneration = 0
	let accountUserId: string | null = null
	let activeFetchUserId: string | null = null
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
			context.generation === accountGeneration &&
			accountUserId === context.userId
		)
	}

	function getCoverSupabaseConfig(): { key: string; url: string } {
		const config = useRuntimeConfig().public.supabase as {
			key?: unknown
			url?: unknown
		}
		if (
			typeof config.url !== 'string' ||
			!config.url ||
			typeof config.key !== 'string' ||
			!config.key
		) {
			throw new Error('Authenticated account request could not start.')
		}
		return { key: config.key, url: config.url }
	}

	const coverCoordinator = createRecordCoverCoordinator({
		supabase,
		resolveAuthenticatedUserId: () => user.resolveAuthenticatedUserId(),
		isCurrentAccountContext,
		getSupabaseConfig: getCoverSupabaseConfig,
		onCleanupFailure: () => {
			console.error('Failed to drain record cover cleanup.')
			toast.warning('Some old cover files still need cleanup.')
		}
	})

	function adoptAccountContext(
		generation: number,
		userId: string
	): RecordAccountContext | null {
		if (generation !== accountGeneration) return null
		if (accountUserId !== null && accountUserId !== userId) return null
		accountUserId = userId
		return { generation, userId }
	}

	function getReactiveUserId(): string | null {
		const reactiveUserId = user.supaUserId
		if (typeof reactiveUserId === 'string' && reactiveUserId) {
			return reactiveUserId
		}
		const reactiveUser = user.supaUser as { id?: unknown; sub?: unknown } | null
		const candidate = reactiveUser?.sub ?? reactiveUser?.id
		return typeof candidate === 'string' && candidate ? candidate : null
	}

	function captureImmediateAccountContext(): RecordAccountContext | null {
		const userId = getReactiveUserId()
		return userId ? adoptAccountContext(accountGeneration, userId) : null
	}

	function isCurrentFetchContext(context: RecordAccountContext): boolean {
		return (
			isCurrentAccountContext(context) && activeFetchUserId === context.userId
		)
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
		if (isDemoStore) return null
		const generation = accountGeneration
		try {
			const userId = await user.resolveAuthenticatedUserId()
			return adoptAccountContext(generation, userId)
		} catch {
			return null
		}
	}

	async function resolveMutationContext(
		generation: number
	): Promise<RecordAccountContext | null> {
		if (isDemoStore || generation !== accountGeneration) return null
		try {
			const userId = await user.resolveAuthenticatedUserId()
			return adoptAccountContext(generation, userId)
		} catch (error) {
			if (generation !== accountGeneration) return null
			console.error('Auth failed in recordsStore mutation:', error)
			toast.error('You must be signed in to update your collection.')
			return null
		}
	}

	async function confirmMutationContext(
		context: RecordAccountContext
	): Promise<boolean> {
		if (!isCurrentAccountContext(context)) return false
		try {
			const userId = await user.resolveAuthenticatedUserId()
			return isCurrentAccountContext(context) && userId === context.userId
		} catch (error) {
			if (!isCurrentAccountContext(context)) return false
			console.error('Auth failed in recordsStore mutation:', error)
			toast.error('You must be signed in to update your collection.')
			return false
		}
	}

	function nextOperationRevision(): number {
		operationRevision += 1
		return operationRevision
	}

	function recordCommittedMutation(
		id: string,
		context: RecordAccountContext,
		mutation:
			| { kind: 'create' | 'update'; row: DatabaseRecord }
			| { kind: 'delete' }
	): void {
		mutationRevision += 1
		recordMutationProvenance.set(id, {
			...context,
			...mutation,
			revision: mutationRevision
		})
	}

	function upsertRecord(record: DatabaseRecord): void {
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
		fetchedRecords: DatabaseRecord[]
	): DatabaseRecord[] {
		const reconciled = new Map(
			fetchedRecords.map((record) => [record.id, record])
		)

		for (const [id, provenance] of recordMutationProvenance) {
			if (
				provenance.generation !== context.generation ||
				provenance.userId !== context.userId
			) {
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
		let context: RecordAccountContext | null = null
		try {
			let userId: string
			try {
				userId = await user.resolveAuthenticatedUserId()
			} catch (error) {
				if (generation !== accountGeneration) return false
				console.error('Auth failed in recordsStore:', error)
				toast.error('Failed to load data')
				return false
			}
			context = adoptAccountContext(generation, userId)
			if (!context) return false
			activeFetchUserId = userId
			const startingRevision = mutationRevision

			const rows = await fetchAllSupabasePages(async (cursor, pageSize) => {
				let query = supabase
					.from('records')
					.select('*')
					.eq('user_id', userId)
					.order('id', { ascending: false })
				if (cursor !== null) query = query.lt('id', cursor)
				return await query.limit(pageSize)
			})
			if (!isCurrentFetchContext(context)) return false

			const decodedRows = rows.map(decodeRecordRow)
			const issues = decodedRows.flatMap((decoded) => decoded.issues)
			reportDecodeIssues(issues, (message) => toast.warning(message))
			const fetchedRecords = decodedRows.map((decoded) => decoded.row)
			records.value = reconcileFetchedRecords(
				context,
				startingRevision,
				fetchedRecords
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
		}
	}

	function fetchAllRecords(
		options: LibraryFetchOptions = {}
	): Promise<boolean> {
		if (isDemoStore) return Promise.resolve(true)
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
	): Promise<DatabaseRecord | null> {
		const activity = beginMutationActivity('create')
		let context: RecordAccountContext | null = null

		try {
			context = await resolveMutationContext(activity.generation)
			if (!context) return null

			const recordArtists = buildArtistPayload(recordInput.artistName)
			const defaultGenres = recordInput.defaultGenres ?? []

			const recordPayload = {
				user_id: context.userId,
				discogs_id: null,
				discogs_release_url: null,
				title: recordInput.title.trim(),
				artists: recordArtists,
				labels: buildLabelPayload(recordInput.labelName, recordInput.catno),
				year: recordInput.year ?? null,
				cover: recordInput.cover?.trim() || null
			}

			const trackPayloads = recordInput.tracks.map((track) => {
				const trackArtists = buildArtistPayload(track.artistName)

				return {
					title: track.title.trim(),
					artists: trackArtists.length ? trackArtists : recordArtists,
					extraartists: [],
					position: track.position?.trim() || null,
					duration: track.duration ?? null,
					bpm: track.bpm ?? null,
					rpm: track.rpm ?? recordInput.defaultRpm ?? null,
					key: track.key ?? null,
					mode: track.mode ?? null,
					genres: track.genres?.length ? track.genres : defaultGenres,
					time_signature_upper: null,
					time_signature_lower: null,
					playable: track.playable ?? true
				}
			})

			const { data, error } = await supabase.rpc('import_record_with_tracks', {
				record: recordPayload,
				tracks: trackPayloads
			})

			if (!isCurrentAccountContext(context)) return null
			if (error) throw error

			const result = validateImportResult(data)
			if (!result.record_id) {
				throw new Error('Manual record import did not return a record ID')
			}

			// The RPC is committed at this point. Keep an ownership-validated local
			// representation so a refresh problem cannot look like a failed create or
			// invite the user to submit the same record again.
			const committedRecord: DatabaseRecord = {
				...recordPayload,
				id: result.record_id,
				cover_storage_path: null,
				created_at: null,
				updated_at: null
			}
			recordCommittedMutation(committedRecord.id, context, {
				kind: 'create',
				row: committedRecord
			})
			upsertRecord(committedRecord)

			const tracksInserted = result.tracks_inserted ?? trackPayloads.length
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
		updates: Partial<
			Omit<DatabaseRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>
		>,
		activity: MutationActivityToken = beginMutationActivity('update'),
		confirmBeforeServer = false,
		onResponseFailure?: () => Promise<void>
	): Promise<DatabaseRecord | null> {
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
				} as DatabaseRecord
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
					if (confirmBeforeServer && !(await confirmMutationContext(context))) {
						if (isCurrentAccountContext(context)) rollbackIfOwned()
						return null
					}
					const { data, error } = await supabase
						.from('records')
						.update(updates)
						.eq('id', id)
						.select()
						.single()

					if (!isCurrentAccountContext(context)) return null
					if (error) {
						await onResponseFailure?.()
						throw error
					}
					if (recordOperationRevisions.get(id) !== currentOperationRevision) {
						return null
					}

					const decoded = decodeRecordRow(data)
					reportDecodeIssues(decoded.issues, (message) =>
						toast.warning(message)
					)
					recordCommittedMutation(id, context, {
						kind: 'update',
						row: decoded.row
					})
					upsertRecord(decoded.row)
					toast.success('Record updated successfully.')
					return decoded.row
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
		updates: Partial<
			Omit<DatabaseRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>
		>
	): Promise<DatabaseRecord | null> {
		const activity = beginMutationActivity('update')
		const immediateContext = captureImmediateAccountContext()
		if (immediateContext) {
			return updateRecordForContext(
				immediateContext,
				id,
				updates,
				activity,
				true
			)
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
		if (isDemoStore) return true
		const context = options.context ?? (await captureAccountContext())
		if (!context || !isCurrentAccountContext(context)) return false
		return coverCoordinator.drain(context, { fresh: options.fresh })
	}

	async function updateRecordWithCover(
		id: string,
		updates: Partial<
			Omit<DatabaseRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>
		>,
		coverChange: RecordCoverChange
	): Promise<DatabaseRecord | null> {
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
			const ownedContext = context
			const outcome = await coverCoordinator.mutate({
				context: ownedContext,
				recordId: id,
				change: coverChange,
				persistCoverPath: (coverStoragePath, onResponseFailure) =>
					updateRecordForContext(
						ownedContext,
						id,
						{
							...updates,
							cover_storage_path: coverStoragePath
						},
						beginMutationActivity('update'),
						false,
						onResponseFailure
					)
			})
			if (outcome.status === 'failed') throw outcome.error
			return outcome.status === 'updated' ? outcome.record : null
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
						!(await confirmMutationContext(operationContext))
					) {
						return false
					}
					const currentOperationRevision = nextOperationRevision()
					recordOperationRevisions.set(id, currentOperationRevision)
					try {
						const { data, error } = await supabase.rpc(
							'remove_record_from_collection',
							{ target_record_id: id }
						)

						if (
							!isCurrentAccountContext(operationContext) ||
							recordOperationRevisions.get(id) !== currentOperationRevision
						) {
							return false
						}
						if (error) throw error
						if (!isExpectedRecordRemoval(data, id)) {
							throw new Error('Invalid record removal response.')
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

	function getRecordById(id: string): DatabaseRecord | undefined {
		return recordsById.value.get(id)
	}

	function getRecordsByIds(ids: string[]): DatabaseRecord[] {
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
		coverCoordinator.reset()
		fetchPromise = null
		freshFetchPromise = null
		accountUserId = null
		activeFetchUserId = null
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
