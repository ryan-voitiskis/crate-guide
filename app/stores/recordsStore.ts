import { toast } from 'vue-sonner'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { getActivePinia } from 'pinia'
import { validateImportResult } from '~/utils/discogs-validation'
import {
	RECORD_COVER_BUCKET,
	type RecordCoverCrop,
	processRecordCoverFile
} from '~/utils/recordCover'
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

export type RecordAccountContext = {
	generation: number
	userId: string
}

type CoverCleanupPage = {
	processed: number
	removed: number
	deferred: 0
}

type CoverCleanupPageResult =
	| { status: 'success'; page: CoverCleanupPage; invocationEpoch: number }
	| { status: 'failed' }
	| { status: 'cancelled' }

type CoverCleanupDrainOptions = {
	fresh?: boolean
	context?: RecordAccountContext
}

type MutationActivity = 'create' | 'update' | 'cover' | 'delete'

type MutationActivityToken = {
	generation: number
	activity: MutationActivity
}

type AccountBoundSupabaseClient = Pick<
	SupabaseClient<Database>,
	'from' | 'functions' | 'storage'
>

// This mirrors the Edge response contract. It is intentionally separate from
// the client's total-work guard so changing one bound cannot silently change the
// other.
export const COVER_CLEANUP_PAGE_SIZE = 100
export const COVER_CLEANUP_MAX_PAGES = 100
// @supabase/functions-js 2.97.0 supports both timeout and signal natively, so
// each request has a wall-clock bound and remains abortable on account reset.
export const COVER_CLEANUP_INVOKE_TIMEOUT_MS = 20_000
const COVER_CLEANUP_RETRY_DELAYS_MS = [0, 250, 1000] as const

function isNonnegativeSafeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function decodeCoverCleanupPage(value: unknown): CoverCleanupPage | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null
	const { processed, removed, deferred } = value as Record<string, unknown>
	if (
		!isNonnegativeSafeInteger(processed) ||
		!isNonnegativeSafeInteger(removed) ||
		!isNonnegativeSafeInteger(deferred) ||
		processed > COVER_CLEANUP_PAGE_SIZE ||
		removed > processed ||
		deferred !== 0
	)
		return null

	return { processed, removed, deferred }
}

function waitForCoverCleanupRetry(
	delayMs: number,
	signal: AbortSignal
): Promise<boolean> {
	if (signal.aborted) return Promise.resolve(false)
	return new Promise((resolvePromise) => {
		let timeoutId: ReturnType<typeof setTimeout> | null = null
		const finish = (didWait: boolean) => {
			if (timeoutId !== null) clearTimeout(timeoutId)
			signal.removeEventListener('abort', handleAbort)
			resolvePromise(didWait)
		}
		const handleAbort = () => finish(false)
		timeoutId = setTimeout(() => finish(true), delayMs)
		signal.addEventListener('abort', handleAbort, { once: true })
	})
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
	let coverCleanupPromise: Promise<boolean> | null = null
	let coverCleanupPromiseContext: RecordAccountContext | null = null
	let activeCoverCleanupController: {
		context: RecordAccountContext
		controller: AbortController
	} | null = null
	let requestedCoverCleanupEpoch = 0
	let completedCoverCleanupEpoch = 0
	let invocationStartedCoverCleanupEpoch = 0
	let accountGeneration = 0
	let accountUserId: string | null = null
	let activeFetchUserId: string | null = null
	const mutationActivityCounts: Record<MutationActivity, number> = {
		create: 0,
		update: 0,
		cover: 0,
		delete: 0
	}

	// Search state
	const searchQuery = ref('')
	const searchResults = ref<DatabaseRecord[]>([])
	const isSearching = ref(false)

	const recordsCount = computed(() => records.value.length)
	const hasRecords = computed(() => records.value.length > 0)
	const recordsById = computed(
		() => new Map(records.value.map((record) => [record.id, record]))
	)

	// Search computed properties
	const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
	const hasSearchResults = computed(() => searchResults.value.length > 0)
	const resultsCount = computed(() => searchResults.value.length)

	// Display the right data based on search state
	const displayedRecords = computed(() =>
		hasSearchQuery.value ? searchResults.value : records.value
	)

	function isCurrentAccountContext(context: RecordAccountContext): boolean {
		return (
			context.generation === accountGeneration &&
			accountUserId === context.userId
		)
	}

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

	async function createAccountBoundSupabaseClient(
		context: RecordAccountContext
	): Promise<AccountBoundSupabaseClient | null> {
		if (!isCurrentAccountContext(context)) return null
		const { data, error } = await supabase.auth.getSession()
		if (!isCurrentAccountContext(context)) return null
		const session = data.session
		if (
			error ||
			!session ||
			session.user.id !== context.userId ||
			!session.access_token
		) {
			throw new Error('Authenticated account request could not start.')
		}

		const supabaseConfig = useRuntimeConfig().public.supabase as {
			key?: unknown
			url?: unknown
		}
		if (
			typeof supabaseConfig.url !== 'string' ||
			!supabaseConfig.url ||
			typeof supabaseConfig.key !== 'string' ||
			!supabaseConfig.key
		) {
			throw new Error('Authenticated account request could not start.')
		}

		const accessToken = session.access_token
		return createClient<Database>(supabaseConfig.url, supabaseConfig.key, {
			accessToken: async () => accessToken
		})
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

			const rows = await fetchAllSupabasePages(async (from, to) => {
				return await supabase
					.from('records')
					.select('*')
					.eq('user_id', userId)
					.order('created_at', { ascending: false })
					.order('id', { ascending: false })
					.range(from, to)
			})
			if (!isCurrentFetchContext(context)) return false

			const decodedRows = rows.map(decodeRecordRow)
			const issues = decodedRows.flatMap((decoded) => decoded.issues)
			reportDecodeIssues(issues, (message) => toast.warning(message))
			records.value = decodedRows.map((decoded) => decoded.row)
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

	function fetchAllRecords(): Promise<boolean> {
		if (isDemoStore) return Promise.resolve(true)
		if (fetchPromise) return fetchPromise

		const createdPromise = performFetchAllRecords(accountGeneration).finally(
			() => {
				if (fetchPromise === createdPromise) fetchPromise = null
			}
		)
		fetchPromise = createdPromise
		return createdPromise
	}

	async function createRecord(
		recordData: Omit<DatabaseRecord, 'id' | 'created_at' | 'updated_at'>
	): Promise<DatabaseRecord | null> {
		const activity = beginMutationActivity('create')
		let context: RecordAccountContext | null = null
		try {
			context = await resolveMutationContext(activity.generation)
			if (!context) return null

			const { data, error } = await supabase
				.from('records')
				.insert({
					...recordData,
					user_id: context.userId
				})
				.select()
				.single()

			if (!isCurrentAccountContext(context)) return null
			if (error) throw error

			const decoded = decodeRecordRow(data)
			reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
			records.value.unshift(decoded.row)
			toast.success('Record created successfully.')
			return decoded.row
		} catch (error) {
			if (!context || !isCurrentAccountContext(context)) return null
			console.error('Failed to create record:', error)
			toast.error('Error creating record.')
			return null
		} finally {
			finishMutationActivity(activity)
		}
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

			await Promise.all([fetchAllRecords(), tracksStore.fetchAllTracks()])
			if (!isCurrentAccountContext(context)) return null

			const createdRecord = result.record_id
				? getRecordById(result.record_id)
				: records.value[0]

			const tracksInserted = result.tracks_inserted ?? trackPayloads.length
			toast.success(
				tracksInserted > 0
					? `Record and ${tracksInserted} ${tracksInserted === 1 ? 'track' : 'tracks'} created successfully.`
					: 'Record created successfully.'
			)

			return createdRecord ?? null
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
		if (!isCurrentAccountContext(context)) {
			finishMutationActivity(activity)
			return null
		}

		// Optimistic update
		const recordIndex = records.value.findIndex(
			(r: DatabaseRecord) => r.id === id
		)
		if (recordIndex === -1) {
			toast.error('Record not found.')
			finishMutationActivity(activity)
			return null
		}

		const originalRecord = records.value[recordIndex]
		records.value[recordIndex] = {
			...originalRecord,
			...updates
		} as DatabaseRecord

		try {
			if (confirmBeforeServer && !(await confirmMutationContext(context))) {
				if (isCurrentAccountContext(context)) {
					records.value[recordIndex] = originalRecord!
				}
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

			const decoded = decodeRecordRow(data)
			reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
			records.value[recordIndex] = decoded.row
			toast.success('Record updated successfully.')
			return decoded.row
		} catch (error) {
			if (!isCurrentAccountContext(context)) return null
			console.error('Failed to update record:', error)
			// Revert optimistic update (index was validated above, originalRecord is defined)
			records.value[recordIndex] = originalRecord!
			toast.error('Error updating record.')
			return null
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

	async function removeUncommittedCoverObject(
		storageClient: AccountBoundSupabaseClient,
		context: RecordAccountContext | null,
		path: string
	): Promise<boolean> {
		if (context && !isCurrentAccountContext(context)) return false
		try {
			const { error } = await storageClient.storage
				.from(RECORD_COVER_BUCKET)
				.remove([path])
			if (context && !isCurrentAccountContext(context)) return false
			if (error) throw error
			return true
		} catch {
			if (context && !isCurrentAccountContext(context)) return false
			console.error('Failed to remove uncommitted record cover object.')
			return false
		}
	}

	async function reconcileSubmittedCoverObject(
		accountClient: AccountBoundSupabaseClient,
		context: RecordAccountContext,
		recordId: string,
		path: string
	): Promise<void> {
		try {
			const { data, error } = await accountClient
				.from('records')
				.select('cover_storage_path')
				.eq('id', recordId)
				.eq('user_id', context.userId)
				.maybeSingle()
			if (error || data?.cover_storage_path === path) return
			await removeUncommittedCoverObject(accountClient, null, path)
		} catch {
			// An unavailable authoritative read is ambiguous: preserve the object.
		}
	}

	function isSameAccountContext(
		left: RecordAccountContext | null,
		right: RecordAccountContext
	): boolean {
		return left?.generation === right.generation && left.userId === right.userId
	}

	async function invokeCoverCleanupPage(
		context: RecordAccountContext,
		accountClient: AccountBoundSupabaseClient
	): Promise<CoverCleanupPageResult> {
		for (const retryDelayMs of COVER_CLEANUP_RETRY_DELAYS_MS) {
			if (!isCurrentAccountContext(context)) {
				return { status: 'cancelled' }
			}
			const abortController = new AbortController()
			activeCoverCleanupController = {
				context,
				controller: abortController
			}

			try {
				if (
					retryDelayMs > 0 &&
					!(await waitForCoverCleanupRetry(
						retryDelayMs,
						abortController.signal
					))
				)
					return { status: 'cancelled' }
				if (!isCurrentAccountContext(context)) {
					return { status: 'cancelled' }
				}
				const invocationEpoch = requestedCoverCleanupEpoch
				invocationStartedCoverCleanupEpoch = invocationEpoch
				const { data, error } = await accountClient.functions.invoke(
					'cleanup-record-covers',
					{
						signal: abortController.signal,
						timeout: COVER_CLEANUP_INVOKE_TIMEOUT_MS
					}
				)
				if (!isCurrentAccountContext(context)) {
					return { status: 'cancelled' }
				}
				if (error) continue

				const page = decodeCoverCleanupPage(data)
				if (page) return { status: 'success', page, invocationEpoch }
			} catch {
				if (!isCurrentAccountContext(context)) {
					return { status: 'cancelled' }
				}
			} finally {
				if (
					activeCoverCleanupController?.controller === abortController &&
					isSameAccountContext(activeCoverCleanupController.context, context)
				) {
					activeCoverCleanupController = null
				}
			}
		}

		return { status: 'failed' }
	}

	function reportCoverCleanupFailure(context: RecordAccountContext): false {
		if (!isCurrentAccountContext(context)) return false
		console.error('Failed to drain record cover cleanup.')
		toast.warning('Some old cover files still need cleanup.')
		return false
	}

	async function performCoverCleanup(
		context: RecordAccountContext
	): Promise<boolean> {
		if (!isCurrentAccountContext(context)) return false
		const userId = await user
			.resolveAuthenticatedUserId()
			.catch(() => null as string | null)
		if (
			!isCurrentAccountContext(context) ||
			!userId ||
			userId !== context.userId
		)
			return false
		const accountClient = await createAccountBoundSupabaseClient(context).catch(
			() => null
		)
		if (!accountClient || !isCurrentAccountContext(context)) return false

		for (
			let pageIndex = 0;
			pageIndex < COVER_CLEANUP_MAX_PAGES;
			pageIndex += 1
		) {
			if (!isCurrentAccountContext(context)) return false
			const result = await invokeCoverCleanupPage(context, accountClient)
			if (!isCurrentAccountContext(context)) return false
			if (result.status === 'cancelled') return false
			if (result.status === 'failed') {
				return reportCoverCleanupFailure(context)
			}
			if (result.page.processed < COVER_CLEANUP_PAGE_SIZE) {
				completedCoverCleanupEpoch = Math.max(
					completedCoverCleanupEpoch,
					result.invocationEpoch
				)
				if (
					completedCoverCleanupEpoch >= requestedCoverCleanupEpoch &&
					invocationStartedCoverCleanupEpoch >= requestedCoverCleanupEpoch
				)
					return true
			}
		}

		return reportCoverCleanupFailure(context)
	}

	function drainCoverCleanup(
		options: CoverCleanupDrainOptions = {}
	): Promise<boolean> {
		if (isDemoStore) return Promise.resolve(true)
		const contextPromise = options.context
			? Promise.resolve(options.context)
			: captureAccountContext()

		return contextPromise.then((context) => {
			if (!context || !isCurrentAccountContext(context)) return false
			if (options.fresh) {
				requestedCoverCleanupEpoch += 1
			} else if (
				!coverCleanupPromise &&
				completedCoverCleanupEpoch >= requestedCoverCleanupEpoch
			) {
				requestedCoverCleanupEpoch += 1
			}
			if (coverCleanupPromise) {
				return isSameAccountContext(coverCleanupPromiseContext, context)
					? coverCleanupPromise
					: false
			}

			const createdPromise = performCoverCleanup(context).finally(() => {
				if (
					coverCleanupPromise === createdPromise &&
					isSameAccountContext(coverCleanupPromiseContext, context)
				) {
					coverCleanupPromise = null
					coverCleanupPromiseContext = null
				}
			})
			coverCleanupPromise = createdPromise
			coverCleanupPromiseContext = context
			return createdPromise
		})
	}

	async function updateRecordWithCover(
		id: string,
		updates: Partial<
			Omit<DatabaseRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>
		>,
		coverChange:
			| { type: 'keep' }
			| { type: 'remove' }
			| { type: 'upload'; file: File; crop: RecordCoverCrop }
	): Promise<DatabaseRecord | null> {
		if (coverChange.type === 'keep') return updateRecord(id, updates)

		const activity = beginMutationActivity('cover')
		let context: RecordAccountContext | null = null
		let accountStorageClient: AccountBoundSupabaseClient | null = null
		let newPath: string | null = null
		let didStartMetadataUpdate = false
		let didReconcileMetadataResponse = false

		try {
			context = await resolveMutationContext(activity.generation)
			if (!context) return null
			if (!getRecordById(id)) {
				toast.error('Record not found.')
				return null
			}

			if (coverChange.type === 'upload') {
				const blob = await processRecordCoverFile(
					coverChange.file,
					coverChange.crop
				)
				if (!isCurrentAccountContext(context)) return null
				accountStorageClient = await createAccountBoundSupabaseClient(context)
				if (!accountStorageClient || !isCurrentAccountContext(context))
					return null
				newPath = `${context.userId}/${id}/${crypto.randomUUID()}.webp`
				const { error } = await accountStorageClient.storage
					.from(RECORD_COVER_BUCKET)
					.upload(newPath, blob, {
						cacheControl: '300',
						contentType: 'image/webp',
						upsert: false
					})
				if (!isCurrentAccountContext(context)) {
					await removeUncommittedCoverObject(
						accountStorageClient,
						null,
						newPath
					)
					return null
				}
				if (error) throw error
			}

			// Once submitted, reconcile against A's authoritative row before deleting;
			// a response failure can still follow a committed metadata update.
			didStartMetadataUpdate = true
			const submittedClient = accountStorageClient
			const submittedContext = context
			const submittedPath = newPath
			const updatedRecord = await updateRecordForContext(
				submittedContext,
				id,
				{
					...updates,
					cover_storage_path: newPath
				},
				beginMutationActivity('update'),
				false,
				submittedPath && submittedClient
					? async () => {
							didReconcileMetadataResponse = true
							await reconcileSubmittedCoverObject(
								submittedClient,
								submittedContext,
								id,
								submittedPath
							)
						}
					: undefined
			)
			if (!isCurrentAccountContext(context)) {
				if (newPath && accountStorageClient && !didReconcileMetadataResponse) {
					await reconcileSubmittedCoverObject(
						accountStorageClient,
						context,
						id,
						newPath
					)
				}
				return null
			}

			if (!updatedRecord) return null

			await drainCoverCleanup({ fresh: true, context })
			if (!isCurrentAccountContext(context)) return null

			return updatedRecord
		} catch (error) {
			if (newPath && accountStorageClient && !didStartMetadataUpdate) {
				await removeUncommittedCoverObject(accountStorageClient, null, newPath)
			}
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

	async function deleteRecord(id: string): Promise<boolean> {
		const activity = beginMutationActivity('delete')
		let context: RecordAccountContext | null = null
		let recordIndex = -1
		let removedRecord: DatabaseRecord | undefined
		let confirmBeforeServer = false

		try {
			context = captureImmediateAccountContext()
			if (context) confirmBeforeServer = true
			else context = await resolveMutationContext(activity.generation)
			if (!context) return false

			// Optimistic update
			recordIndex = records.value.findIndex((r: DatabaseRecord) => r.id === id)
			if (recordIndex === -1) {
				toast.error('Record not found.')
				return false
			}
			removedRecord = records.value.splice(recordIndex, 1)[0]
			if (confirmBeforeServer && !(await confirmMutationContext(context))) {
				if (isCurrentAccountContext(context) && removedRecord) {
					records.value.splice(recordIndex, 0, removedRecord)
				}
				return false
			}

			const { error } = await supabase.from('records').delete().eq('id', id)
			if (!isCurrentAccountContext(context)) return false
			if (error) throw error
			await drainCoverCleanup({ fresh: true, context })
			if (!isCurrentAccountContext(context)) return false
			toast.success('Record deleted successfully.')
			return true
		} catch (error) {
			if (!context || !isCurrentAccountContext(context)) return false
			console.error('Failed to delete record:', error)
			// Revert optimistic update (removedRecord is already DatabaseRecord)
			if (removedRecord) records.value.splice(recordIndex, 0, removedRecord)
			toast.error('Error deleting record.')
			return false
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
			if (context) {
				if (
					!isCurrentAccountContext(context) ||
					!(await confirmMutationContext(context))
				)
					return false
			} else {
				context = await resolveMutationContext(activity.generation)
			}
			if (!context) return false
			const { error } = await supabase.rpc('remove_record_from_collection', {
				target_record_id: id
			})

			if (!isCurrentAccountContext(context)) return false
			if (error) throw error

			records.value = records.value.filter((record) => record.id !== id)
			searchResults.value = searchResults.value.filter(
				(record) => record.id !== id
			)
			await drainCoverCleanup({ fresh: true, context })
			if (!isCurrentAccountContext(context)) return false

			toast.success('Record removed from collection')
			return true
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
		searchQuery.value = query

		if (!query.trim()) {
			searchResults.value = []
			return
		}

		isSearching.value = true
		try {
			searchResults.value = records.value.filter(
				(record: DatabaseRecord) =>
					record.title.toLowerCase().includes(query.toLowerCase()) ||
					record.artists.some((artist: DiscogsArtistDb) =>
						artist.name.toLowerCase().includes(query.toLowerCase())
					) ||
					record.labels.some((label: DiscogsLabelDb) =>
						label.name.toLowerCase().includes(query.toLowerCase())
					) ||
					(record.year && record.year.toString().includes(query))
			)
		} catch (error) {
			console.error('Failed to search records:', error)
			toast.error('Error searching your collection')
			searchResults.value = []
		} finally {
			isSearching.value = false
		}
	}

	function clearSearch() {
		searchQuery.value = ''
		searchResults.value = []
	}

	function clearRecords() {
		accountGeneration += 1
		activeCoverCleanupController?.controller.abort()
		activeCoverCleanupController = null
		fetchPromise = null
		coverCleanupPromise = null
		coverCleanupPromiseContext = null
		requestedCoverCleanupEpoch = 0
		completedCoverCleanupEpoch = 0
		invocationStartedCoverCleanupEpoch = 0
		accountUserId = null
		activeFetchUserId = null
		for (const activity of Object.keys(
			mutationActivityCounts
		) as MutationActivity[]) {
			mutationActivityCounts[activity] = 0
			setMutationActivity(activity, false)
		}
		isLoadingRecords.value = false
		records.value = []
		searchResults.value = []
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
		createRecord,
		createRecordWithTracks,
		updateRecord,
		updateRecordWithCover,
		drainCoverCleanup,
		deleteRecord,
		removeRecordFromCollection,
		getRecordById,
		getRecordsByIds,
		performSearch,
		clearSearch,
		clearRecords
	}
})
