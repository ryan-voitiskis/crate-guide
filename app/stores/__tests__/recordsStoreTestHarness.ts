import { createPinia, setActivePinia } from 'pinia'
import { resetRecordIdCounter } from 'test/mocks/fixtures/records'
import { expect, vi } from 'vitest'

let recordsStoreFactory:
	(typeof import('../recordsStore'))['useRecordsStore'] | null = null
let coverCleanupInvokeTimeoutMs: number | null = null
let coverCleanupMaxPages: number | null = null

const mockCreateSupabaseClient = vi.fn()

const mockToast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({
	toast: mockToast
}))

const mockProcessRecordCoverFile = vi.fn()

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@supabase/supabase-js')>()),
	createClient: mockCreateSupabaseClient
}))

vi.mock('~/utils/recordCover', async (importOriginal) => ({
	...(await importOriginal<typeof import('~/utils/recordCover')>()),
	processRecordCoverFile: mockProcessRecordCoverFile
}))

const mockUserStore: {
	supaUser: { id: string } | null
	resolveAuthenticatedUserId: ReturnType<typeof vi.fn>
} = {
	supaUser: { id: 'test-user-id' },
	resolveAuthenticatedUserId: vi.fn()
}

function createMockQueryBuilder() {
	const builder = {
		select: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue({ data: [], error: null }),
		single: vi.fn().mockResolvedValue({ data: null, error: null })
	}
	return builder
}

const mockQueryBuilder = createMockQueryBuilder()

const mockStorageBucket = {
	upload: vi.fn().mockResolvedValue({ data: null, error: null }),
	remove: vi.fn().mockResolvedValue({ data: null, error: null })
}

const mockGlobalStorageBucket = {
	upload: vi.fn().mockResolvedValue({ data: null, error: null }),
	remove: vi.fn().mockResolvedValue({ data: null, error: null })
}

const mockBoundRecordQuery = {
	select: vi.fn().mockReturnThis(),
	eq: vi.fn().mockReturnThis(),
	maybeSingle: vi.fn()
}

const mockBoundFunctionsInvoke = vi
	.fn()
	.mockResolvedValue({ data: null, error: null })
const mockGlobalFunctionsInvoke = vi
	.fn()
	.mockResolvedValue({ data: null, error: null })

const mockBoundSupabaseClient = {
	from: vi.fn(() => mockBoundRecordQuery),
	functions: { invoke: mockBoundFunctionsInvoke },
	storage: { from: vi.fn(() => mockStorageBucket) }
}

function successfulRemovalResponse(recordId: string) {
	return {
		data: { success: true, record_id: recordId },
		error: null
	}
}

function defaultRpcImplementation(
	rpcName: string,
	args?: Record<string, unknown>
) {
	return Promise.resolve(
		rpcName === 'remove_record_from_collection' &&
			typeof args?.target_record_id === 'string'
			? successfulRemovalResponse(args.target_record_id)
			: { data: null, error: null }
	)
}

const mockSupabaseClient = {
	from: vi.fn(() => mockQueryBuilder),
	rpc: vi.fn().mockImplementation(defaultRpcImplementation),
	functions: {
		invoke: mockGlobalFunctionsInvoke
	},
	auth: {
		getSession: vi.fn()
	},
	storage: {
		from: vi.fn(() => mockGlobalStorageBucket)
	}
}

const mockTracksStore = {
	fetchAllTracks: vi.fn()
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, reject, resolve }
}

function cleanupResponse(processed = 0, removed = processed) {
	return {
		data: { processed, removed, deferred: 0 },
		error: null
	}
}

function expectCleanupInvocationsWithoutBodies(count: number) {
	if (coverCleanupInvokeTimeoutMs === null) {
		throw new Error('Records store harness is not ready.')
	}
	expect(mockBoundFunctionsInvoke).toHaveBeenCalledTimes(count)
	for (let callIndex = 1; callIndex <= count; callIndex += 1) {
		const [functionName, options] =
			mockBoundFunctionsInvoke.mock.calls[callIndex - 1]!
		expect(functionName).toBe('cleanup-record-covers')
		expect(options).toMatchObject({
			signal: expect.any(AbortSignal),
			timeout: coverCleanupInvokeTimeoutMs
		})
		expect(options).not.toHaveProperty('body')
	}
}

function timeoutAwareNeverSettlingInvoke(
	_functionName: string,
	options: { signal: AbortSignal; timeout: number }
): Promise<{ data: null; error: Error }> {
	return new Promise((resolvePromise) => {
		let timeoutId: ReturnType<typeof setTimeout> | null = null
		let didSettle = false
		const finish = (reason: string) => {
			if (didSettle) return
			didSettle = true
			if (timeoutId !== null) clearTimeout(timeoutId)
			options.signal.removeEventListener('abort', handleAbort)
			resolvePromise({ data: null, error: new Error(reason) })
		}
		const handleAbort = () => finish('aborted')
		timeoutId = setTimeout(() => finish('timed out'), options.timeout)
		options.signal.addEventListener('abort', handleAbort, { once: true })
	})
}

vi.stubGlobal('useUserStore', () => mockUserStore)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)
vi.stubGlobal('useRuntimeConfig', () => ({
	public: {
		supabase: {
			url: 'https://supabase.test.invalid',
			key: 'test-anon-key'
		}
	}
}))
vi.stubGlobal('useTracksStore', () => mockTracksStore)

export async function resetRecordsStoreHarness(): Promise<void> {
	if (!recordsStoreFactory) {
		recordsStoreFactory = (await import('../recordsStore')).useRecordsStore
		const cleanupContract = await import('~/utils/recordCoverCoordinator')
		coverCleanupInvokeTimeoutMs =
			cleanupContract.COVER_CLEANUP_INVOKE_TIMEOUT_MS
		coverCleanupMaxPages = cleanupContract.COVER_CLEANUP_MAX_PAGES
	}
	vi.clearAllMocks()
	resetRecordIdCounter()
	setActivePinia(createPinia())

	Object.assign(mockQueryBuilder, createMockQueryBuilder())
	mockSupabaseClient.from.mockReturnValue(mockQueryBuilder)
	mockSupabaseClient.rpc
		.mockReset()
		.mockImplementation(defaultRpcImplementation)
	mockBoundFunctionsInvoke.mockReset().mockResolvedValue(cleanupResponse())
	mockGlobalFunctionsInvoke.mockReset().mockResolvedValue(cleanupResponse())
	mockSupabaseClient.auth.getSession.mockImplementation(async () => ({
		data: {
			session: mockUserStore.supaUser
				? {
						access_token: `token:${mockUserStore.supaUser.id}`,
						user: { id: mockUserStore.supaUser.id }
					}
				: null
		},
		error: null
	}))
	mockSupabaseClient.storage.from.mockReturnValue(mockGlobalStorageBucket)
	mockBoundSupabaseClient.from.mockReturnValue(mockBoundRecordQuery)
	mockBoundSupabaseClient.storage.from.mockReturnValue(mockStorageBucket)
	mockBoundRecordQuery.select.mockReturnThis()
	mockBoundRecordQuery.eq.mockReturnThis()
	mockBoundRecordQuery.maybeSingle.mockResolvedValue({
		data: { cover_storage_path: null },
		error: null
	})
	mockCreateSupabaseClient.mockReturnValue(mockBoundSupabaseClient)
	mockStorageBucket.upload.mockResolvedValue({ data: null, error: null })
	mockStorageBucket.remove.mockResolvedValue({ data: null, error: null })
	mockGlobalStorageBucket.upload.mockResolvedValue({ data: null, error: null })
	mockGlobalStorageBucket.remove.mockResolvedValue({ data: null, error: null })
	mockProcessRecordCoverFile.mockResolvedValue(
		new Blob(['processed-cover'], { type: 'image/webp' })
	)
	mockTracksStore.fetchAllTracks.mockResolvedValue(true)

	mockUserStore.supaUser = { id: 'test-user-id' }
	mockUserStore.resolveAuthenticatedUserId.mockImplementation(async () => {
		if (!mockUserStore.supaUser?.id) throw new Error('User not logged in.')
		return mockUserStore.supaUser.id
	})
}

export function createRecordsStore() {
	if (!recordsStoreFactory)
		throw new Error('Records store harness is not ready.')
	return recordsStoreFactory()
}

export function getCoverCleanupMaxPages(): number {
	if (coverCleanupMaxPages === null) {
		throw new Error('Records store harness is not ready.')
	}
	return coverCleanupMaxPages
}

export {
	cleanupResponse,
	createDeferred,
	expectCleanupInvocationsWithoutBodies,
	mockBoundFunctionsInvoke,
	mockBoundRecordQuery,
	mockBoundSupabaseClient,
	mockCreateSupabaseClient,
	mockGlobalFunctionsInvoke,
	mockGlobalStorageBucket,
	mockProcessRecordCoverFile,
	mockQueryBuilder,
	mockStorageBucket,
	mockSupabaseClient,
	mockToast,
	mockTracksStore,
	mockUserStore,
	successfulRemovalResponse,
	timeoutAwareNeverSettlingInvoke
}
