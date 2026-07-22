import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import {
	RECORD_COVER_BUCKET,
	type RecordCoverCrop,
	processRecordCoverFile
} from './recordCover'

export type RecordCoverAccountContext = Readonly<{
	generation: number
	userId: string
}>

export type RecordCoverChange =
	| { type: 'keep' }
	| { type: 'remove' }
	| { type: 'upload'; file: File; crop: RecordCoverCrop }

export type RecordCoverMutationOutcome<TRecord = DatabaseRecord> =
	| { status: 'updated'; record: TRecord }
	| { status: 'not-updated' }
	| { status: 'stale' }
	| { status: 'failed'; error: unknown }

type AccountBoundSupabaseClient = Pick<
	SupabaseClient<Database>,
	'from' | 'functions' | 'storage'
>

type CoverCleanupPage = {
	processed: number
	removed: number
	deferred: 0
}

type CoverCleanupPageResult =
	| { status: 'success'; page: CoverCleanupPage; invocationEpoch: number }
	| { status: 'failed' }
	| { status: 'cancelled' }

type PersistCoverPath<TRecord> = (
	path: string | null,
	onResponseFailure?: () => Promise<void>
) => Promise<TRecord | null>

type RecordCoverCoordinatorDependencies = {
	supabase: Pick<SupabaseClient<Database>, 'auth'>
	resolveAuthenticatedUserId: () => Promise<string>
	isCurrentAccountContext: (context: RecordCoverAccountContext) => boolean
	getSupabaseConfig: () => { key: string; url: string }
	onCleanupFailure: () => void
	createAccountBoundClient?: (options: {
		accessToken: string
		key: string
		url: string
	}) => AccountBoundSupabaseClient
	processCoverFile?: typeof processRecordCoverFile
}

type RecordCoverMutation<TRecord> = {
	context: RecordCoverAccountContext
	recordId: string
	change: Exclude<RecordCoverChange, { type: 'keep' }>
	persistCoverPath: PersistCoverPath<TRecord>
}

type DrainOptions = {
	fresh?: boolean
}

// This mirrors the Edge response contract. It stays separate from the client
// page cap so changing one bound cannot silently change the other.
export const COVER_CLEANUP_PAGE_SIZE = 100
export const COVER_CLEANUP_MAX_PAGES = 100
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

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<boolean> {
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

export function createRecordCoverCoordinator<TRecord = DatabaseRecord>(
	dependencies: RecordCoverCoordinatorDependencies
) {
	let cleanupPromise: Promise<boolean> | null = null
	let cleanupPromiseContext: RecordCoverAccountContext | null = null
	let activeCleanupController: {
		context: RecordCoverAccountContext
		controller: AbortController
	} | null = null
	let requestedCleanupEpoch = 0
	let completedCleanupEpoch = 0
	let invocationStartedCleanupEpoch = 0

	function isSameAccountContext(
		left: RecordCoverAccountContext | null,
		right: RecordCoverAccountContext
	): boolean {
		return left?.generation === right.generation && left.userId === right.userId
	}

	async function createAccountBoundClient(
		context: RecordCoverAccountContext
	): Promise<AccountBoundSupabaseClient | null> {
		if (!dependencies.isCurrentAccountContext(context)) return null
		const { data, error } = await dependencies.supabase.auth.getSession()
		if (!dependencies.isCurrentAccountContext(context)) return null
		const session = data.session
		if (
			error ||
			!session ||
			session.user.id !== context.userId ||
			!session.access_token
		) {
			throw new Error('Authenticated account request could not start.')
		}

		const { key, url } = dependencies.getSupabaseConfig()
		const accessToken = session.access_token
		if (dependencies.createAccountBoundClient) {
			return dependencies.createAccountBoundClient({ accessToken, key, url })
		}
		return createClient<Database>(url, key, {
			accessToken: async () => accessToken
		})
	}

	async function removeUncommittedObject(
		storageClient: AccountBoundSupabaseClient,
		context: RecordCoverAccountContext | null,
		path: string
	): Promise<boolean> {
		if (context && !dependencies.isCurrentAccountContext(context)) return false
		try {
			const { error } = await storageClient.storage
				.from(RECORD_COVER_BUCKET)
				.remove([path])
			if (context && !dependencies.isCurrentAccountContext(context))
				return false
			if (error) throw error
			return true
		} catch {
			if (context && !dependencies.isCurrentAccountContext(context))
				return false
			console.error('Failed to remove uncommitted record cover object.')
			return false
		}
	}

	async function reconcileSubmittedObject(
		accountClient: AccountBoundSupabaseClient,
		context: RecordCoverAccountContext,
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
			await removeUncommittedObject(accountClient, null, path)
		} catch {
			// An unavailable authoritative read is ambiguous, so preserve the object.
		}
	}

	async function invokeCleanupPage(
		context: RecordCoverAccountContext,
		accountClient: AccountBoundSupabaseClient
	): Promise<CoverCleanupPageResult> {
		for (const retryDelayMs of COVER_CLEANUP_RETRY_DELAYS_MS) {
			if (!dependencies.isCurrentAccountContext(context)) {
				return { status: 'cancelled' }
			}
			const abortController = new AbortController()
			activeCleanupController = { context, controller: abortController }

			try {
				if (
					retryDelayMs > 0 &&
					!(await waitForRetry(retryDelayMs, abortController.signal))
				)
					return { status: 'cancelled' }
				if (!dependencies.isCurrentAccountContext(context)) {
					return { status: 'cancelled' }
				}
				const invocationEpoch = requestedCleanupEpoch
				invocationStartedCleanupEpoch = invocationEpoch
				const { data, error } = await accountClient.functions.invoke(
					'cleanup-record-covers',
					{
						signal: abortController.signal,
						timeout: COVER_CLEANUP_INVOKE_TIMEOUT_MS
					}
				)
				if (!dependencies.isCurrentAccountContext(context)) {
					return { status: 'cancelled' }
				}
				if (error) continue

				const page = decodeCoverCleanupPage(data)
				if (page) return { status: 'success', page, invocationEpoch }
			} catch {
				if (!dependencies.isCurrentAccountContext(context)) {
					return { status: 'cancelled' }
				}
			} finally {
				if (
					activeCleanupController?.controller === abortController &&
					isSameAccountContext(activeCleanupController.context, context)
				) {
					activeCleanupController = null
				}
			}
		}

		return { status: 'failed' }
	}

	async function performCleanup(
		context: RecordCoverAccountContext
	): Promise<boolean> {
		if (!dependencies.isCurrentAccountContext(context)) return false
		const userId = await dependencies
			.resolveAuthenticatedUserId()
			.catch(() => null as string | null)
		if (
			!dependencies.isCurrentAccountContext(context) ||
			!userId ||
			userId !== context.userId
		)
			return false
		const accountClient = await createAccountBoundClient(context).catch(
			() => null
		)
		if (!accountClient || !dependencies.isCurrentAccountContext(context)) {
			return false
		}

		for (
			let pageIndex = 0;
			pageIndex < COVER_CLEANUP_MAX_PAGES;
			pageIndex += 1
		) {
			if (!dependencies.isCurrentAccountContext(context)) return false
			const result = await invokeCleanupPage(context, accountClient)
			if (!dependencies.isCurrentAccountContext(context)) return false
			if (result.status === 'cancelled') return false
			if (result.status === 'failed') {
				dependencies.onCleanupFailure()
				return false
			}
			if (result.page.processed < COVER_CLEANUP_PAGE_SIZE) {
				completedCleanupEpoch = Math.max(
					completedCleanupEpoch,
					result.invocationEpoch
				)
				if (
					completedCleanupEpoch >= requestedCleanupEpoch &&
					invocationStartedCleanupEpoch >= requestedCleanupEpoch
				)
					return true
			}
		}

		dependencies.onCleanupFailure()
		return false
	}

	function drain(
		context: RecordCoverAccountContext,
		options: DrainOptions = {}
	): Promise<boolean> {
		if (!dependencies.isCurrentAccountContext(context)) {
			return Promise.resolve(false)
		}
		if (options.fresh) {
			requestedCleanupEpoch += 1
		} else if (
			!cleanupPromise &&
			completedCleanupEpoch >= requestedCleanupEpoch
		) {
			requestedCleanupEpoch += 1
		}
		if (cleanupPromise) {
			return isSameAccountContext(cleanupPromiseContext, context)
				? cleanupPromise
				: Promise.resolve(false)
		}

		const createdPromise = performCleanup(context).finally(() => {
			if (
				cleanupPromise === createdPromise &&
				isSameAccountContext(cleanupPromiseContext, context)
			) {
				cleanupPromise = null
				cleanupPromiseContext = null
			}
		})
		cleanupPromise = createdPromise
		cleanupPromiseContext = context
		return createdPromise
	}

	async function mutate(
		mutation: RecordCoverMutation<TRecord>
	): Promise<RecordCoverMutationOutcome<TRecord>> {
		const { change, context, persistCoverPath, recordId } = mutation
		let accountClient: AccountBoundSupabaseClient | null = null
		let newPath: string | null = null
		let didStartMetadataUpdate = false
		let didReconcileMetadataResponse = false

		try {
			if (change.type === 'upload') {
				const blob = await (
					dependencies.processCoverFile ?? processRecordCoverFile
				)(change.file, change.crop)
				if (!dependencies.isCurrentAccountContext(context)) {
					return { status: 'stale' }
				}
				accountClient = await createAccountBoundClient(context)
				if (!accountClient || !dependencies.isCurrentAccountContext(context)) {
					return { status: 'stale' }
				}
				newPath = `${context.userId}/${recordId}/${crypto.randomUUID()}.webp`
				const { error } = await accountClient.storage
					.from(RECORD_COVER_BUCKET)
					.upload(newPath, blob, {
						cacheControl: '300',
						contentType: 'image/webp',
						upsert: false
					})
				if (!dependencies.isCurrentAccountContext(context)) {
					await removeUncommittedObject(accountClient, null, newPath)
					return { status: 'stale' }
				}
				if (error) throw error
			}

			// A failed metadata response can follow a committed update, so the
			// persistence boundary reconciles before this coordinator deletes anything.
			didStartMetadataUpdate = true
			const submittedClient = accountClient
			const submittedPath = newPath
			const record = await persistCoverPath(
				newPath,
				submittedPath && submittedClient
					? async () => {
							didReconcileMetadataResponse = true
							await reconcileSubmittedObject(
								submittedClient,
								context,
								recordId,
								submittedPath
							)
						}
					: undefined
			)
			if (!dependencies.isCurrentAccountContext(context)) {
				if (newPath && accountClient && !didReconcileMetadataResponse) {
					await reconcileSubmittedObject(
						accountClient,
						context,
						recordId,
						newPath
					)
				}
				return { status: 'stale' }
			}
			if (!record) return { status: 'not-updated' }

			await drain(context, { fresh: true })
			if (!dependencies.isCurrentAccountContext(context)) {
				return { status: 'stale' }
			}
			return { status: 'updated', record }
		} catch (error) {
			if (newPath && accountClient && !didStartMetadataUpdate) {
				await removeUncommittedObject(accountClient, null, newPath)
			}
			return dependencies.isCurrentAccountContext(context)
				? { status: 'failed', error }
				: { status: 'stale' }
		}
	}

	function reset(): void {
		activeCleanupController?.controller.abort()
		activeCleanupController = null
		cleanupPromise = null
		cleanupPromiseContext = null
		requestedCleanupEpoch = 0
		completedCleanupEpoch = 0
		invocationStartedCleanupEpoch = 0
	}

	return { drain, mutate, reset }
}
