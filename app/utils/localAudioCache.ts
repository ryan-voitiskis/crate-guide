import type {
	LocalAudioAnalysis,
	LocalAudioTagMetadata
} from '~/types/localAudio'
import { LOCAL_AUDIO_CACHE_GENERATION_PREFIX } from '~/utils/localAudio'
import localAudioCacheConfiguration from '../../shared/config/localAudioCache.json'

const LAST_PRUNED_METADATA_KEY = 'last-pruned-at'
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000

export const LOCAL_AUDIO_CACHE_DATABASE_NAME =
	localAudioCacheConfiguration.databaseName
export const LOCAL_AUDIO_CACHE_SCHEMA_VERSION =
	localAudioCacheConfiguration.schemaVersion
export const LOCAL_AUDIO_CACHE_MAX_ENTRIES =
	localAudioCacheConfiguration.maxEntries
export const LOCAL_AUDIO_CACHE_MAX_AGE_MS =
	localAudioCacheConfiguration.maxAgeDays * MILLISECONDS_PER_DAY
export const LOCAL_AUDIO_CACHE_WORKER_IDLE_MS =
	localAudioCacheConfiguration.workerIdleMs
export const LOCAL_AUDIO_CACHE_PERFORMANCE_BUDGETS = Object.freeze({
	hit1000: Object.freeze({
		...localAudioCacheConfiguration.performanceBudgets.hit1000
	}),
	hit10000: Object.freeze({
		...localAudioCacheConfiguration.performanceBudgets.hit10000
	}),
	cold1000: Object.freeze({
		...localAudioCacheConfiguration.performanceBudgets.cold1000
	}),
	cold10000: Object.freeze({
		...localAudioCacheConfiguration.performanceBudgets.cold10000
	}),
	maxPostBatchHeapGrowthBytes:
		localAudioCacheConfiguration.performanceBudgets.maxPostBatchHeapGrowthBytes
})

const CACHE_STORE_NAME = localAudioCacheConfiguration.resultStoreName
const CACHE_METADATA_STORE_NAME = localAudioCacheConfiguration.metadataStoreName
const CACHE_UPDATED_AT_INDEX_NAME =
	localAudioCacheConfiguration.updatedAtIndexName
const CACHE_READ_CHUNK_SIZE = localAudioCacheConfiguration.readChunkSize
const CACHE_WRITE_CHUNK_SIZE = localAudioCacheConfiguration.writeChunkSize
const CACHE_PRUNE_CHUNK_SIZE = localAudioCacheConfiguration.pruneChunkSize

export type CachedLocalAudioResult = {
	cacheKey: string
	tags: LocalAudioTagMetadata
	analysis: LocalAudioAnalysis | null
	updatedAt: number
}

type CacheMetadataRecord = {
	key: string
	value: number
}

type CacheIndexCursorPosition = {
	indexKey: IDBValidKey
	primaryKey: IDBValidKey
}

export type LocalAudioCacheMetrics = {
	connectionsOpened: number
	readTransactions: number
	writeTransactions: number
	pruneTransactions: number
	totalTransactions: number
	requestedRecords: number
	cacheHits: number
	cacheMisses: number
	queuedWrites: number
	committedWrites: number
}

export type LocalAudioCachePruneResult = {
	obsoleteGenerationEntries: number
	expiredEntries: number
	overflowEntries: number
	lastPrunedAt: number | null
	error: string | null
}

export type LocalAudioCacheStatus = {
	entryCount: number
	lastPrunedAt: number | null
	maxEntries: number
	maxAgeDays: number
	databaseName: string
}

export type LocalAudioCacheSession = {
	getMany: (
		cacheKeys: readonly string[]
	) => Promise<Map<string, CachedLocalAudioResult>>
	put: (record: CachedLocalAudioResult) => Promise<void>
	flush: () => Promise<void>
	prune: () => Promise<LocalAudioCachePruneResult>
	getMetrics: () => Readonly<LocalAudioCacheMetrics>
	close: () => Promise<void>
}

export type OpenLocalAudioCacheSessionOptions = {
	activeGenerationPrefix?: string
	now?: () => number
	onBlocked?: () => void
}

let activeSession = false

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function createCacheError(message: string, cause?: unknown): Error {
	return new Error(
		cause ? `${message}: ${formatError(cause)}` : message,
		cause === undefined ? undefined : { cause }
	)
}

function waitForTransaction(
	transaction: IDBTransaction,
	fallbackMessage: string
): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve()
		transaction.onabort = () =>
			reject(
				transaction.error ?? createCacheError(`${fallbackMessage} aborted`)
			)
		transaction.onerror = () => {
			// The abort event owns rejection so callers receive the transaction error.
		}
	})
}

function upgradeCacheSchema(request: IDBOpenDBRequest) {
	const database = request.result
	let resultStore: IDBObjectStore
	if (!database.objectStoreNames.contains(CACHE_STORE_NAME)) {
		resultStore = database.createObjectStore(CACHE_STORE_NAME, {
			keyPath: 'cacheKey'
		})
	} else {
		const transaction = request.transaction
		if (!transaction) {
			throw createCacheError('Cache upgrade transaction is unavailable')
		}
		resultStore = transaction.objectStore(CACHE_STORE_NAME)
	}

	if (!resultStore.indexNames.contains(CACHE_UPDATED_AT_INDEX_NAME)) {
		resultStore.createIndex(CACHE_UPDATED_AT_INDEX_NAME, 'updatedAt', {
			unique: false
		})
	}

	if (!database.objectStoreNames.contains(CACHE_METADATA_STORE_NAME)) {
		database.createObjectStore(CACHE_METADATA_STORE_NAME, { keyPath: 'key' })
	}
}

function openCacheDatabase(onBlocked?: () => void): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		let request: IDBOpenDBRequest
		let settled = false
		try {
			request = indexedDB.open(
				LOCAL_AUDIO_CACHE_DATABASE_NAME,
				LOCAL_AUDIO_CACHE_SCHEMA_VERSION
			)
		} catch (error) {
			reject(
				createCacheError('Local audio analysis cache is unavailable', error)
			)
			return
		}

		request.onupgradeneeded = () => upgradeCacheSchema(request)
		request.onblocked = () => {
			onBlocked?.()
			if (settled) return
			settled = true
			reject(
				createCacheError(
					'Local audio analysis cache upgrade is blocked by another tab'
				)
			)
		}
		request.onerror = () => {
			if (settled) return
			settled = true
			reject(
				request.error ??
					createCacheError('Opening local audio analysis cache failed')
			)
		}
		request.onsuccess = () => {
			if (settled) {
				request.result.close()
				return
			}
			settled = true
			resolve(request.result)
		}
	})
}

function assertCacheIdle() {
	if (activeSession) {
		throw createCacheError('Local audio analysis cache is busy')
	}
}

function advanceIndexCursorPastPosition(
	cursor: IDBCursor,
	position: CacheIndexCursorPosition
): boolean {
	const indexComparison = indexedDB.cmp(cursor.key, position.indexKey)
	if (indexComparison > 0) return false
	if (indexComparison < 0) {
		cursor.continuePrimaryKey(position.indexKey, position.primaryKey)
		return true
	}

	const primaryComparison = indexedDB.cmp(
		cursor.primaryKey,
		position.primaryKey
	)
	if (primaryComparison > 0) return false
	if (primaryComparison < 0) {
		cursor.continuePrimaryKey(position.indexKey, position.primaryKey)
		return true
	}

	cursor.continue()
	return true
}

export function isLocalAudioCacheSessionActive(): boolean {
	return activeSession
}

export async function openLocalAudioCacheSession(
	options: OpenLocalAudioCacheSessionOptions = {}
): Promise<LocalAudioCacheSession> {
	assertCacheIdle()
	activeSession = true

	let database: IDBDatabase
	try {
		database = await openCacheDatabase(options.onBlocked)
	} catch (error) {
		activeSession = false
		throw error
	}

	const activeGenerationPrefix =
		options.activeGenerationPrefix ?? LOCAL_AUDIO_CACHE_GENERATION_PREFIX
	const now = options.now ?? Date.now
	const pendingWrites = new Map<string, CachedLocalAudioResult>()
	const protectedKeys = new Set<string>()
	const metrics = {
		connectionsOpened: 1,
		readTransactions: 0,
		writeTransactions: 0,
		pruneTransactions: 0,
		requestedRecords: 0,
		cacheHits: 0,
		cacheMisses: 0,
		queuedWrites: 0,
		committedWrites: 0
	}
	let closed = false
	let invalidated = false

	function releaseConnection() {
		if (closed) return
		closed = true
		database.close()
		activeSession = false
	}

	function assertOpen() {
		if (closed || invalidated) {
			throw createCacheError('Local audio analysis cache session is closed')
		}
	}

	function closeAfterFatalError(error: unknown): never {
		pendingWrites.clear()
		releaseConnection()
		throw error
	}

	database.onversionchange = () => {
		invalidated = true
		pendingWrites.clear()
		releaseConnection()
	}

	async function getMany(
		cacheKeys: readonly string[]
	): Promise<Map<string, CachedLocalAudioResult>> {
		assertOpen()
		const uniqueKeys = Array.from(new Set(cacheKeys))
		const results = new Map<string, CachedLocalAudioResult>()

		try {
			for (
				let offset = 0;
				offset < uniqueKeys.length;
				offset += CACHE_READ_CHUNK_SIZE
			) {
				const keys = uniqueKeys.slice(offset, offset + CACHE_READ_CHUNK_SIZE)
				const transaction = database.transaction(CACHE_STORE_NAME, 'readonly')
				const completion = waitForTransaction(transaction, 'Cache read')
				const store = transaction.objectStore(CACHE_STORE_NAME)
				metrics.readTransactions += 1

				for (const cacheKey of keys) {
					const request = store.get(cacheKey)
					request.onsuccess = () => {
						const record = request.result as CachedLocalAudioResult | undefined
						if (record) results.set(cacheKey, record)
					}
				}
				await completion
			}
		} catch (error) {
			closeAfterFatalError(error)
		}

		metrics.requestedRecords += uniqueKeys.length
		metrics.cacheHits += results.size
		metrics.cacheMisses += uniqueKeys.length - results.size
		return results
	}

	async function flushOneChunk() {
		assertOpen()
		const records = Array.from(pendingWrites.values()).slice(
			0,
			CACHE_WRITE_CHUNK_SIZE
		)
		if (records.length === 0) return

		try {
			const transaction = database.transaction(CACHE_STORE_NAME, 'readwrite')
			const completion = waitForTransaction(transaction, 'Cache write')
			const store = transaction.objectStore(CACHE_STORE_NAME)
			metrics.writeTransactions += 1
			for (const record of records) store.put(record)
			await completion
		} catch (error) {
			closeAfterFatalError(error)
		}

		for (const record of records) {
			if (pendingWrites.get(record.cacheKey) === record) {
				pendingWrites.delete(record.cacheKey)
			}
		}
		metrics.committedWrites += records.length
	}

	async function flush() {
		assertOpen()
		while (pendingWrites.size > 0) await flushOneChunk()
	}

	async function put(record: CachedLocalAudioResult) {
		assertOpen()
		pendingWrites.set(record.cacheKey, record)
		protectedKeys.add(record.cacheKey)
		metrics.queuedWrites += 1
		if (pendingWrites.size >= CACHE_WRITE_CHUNK_SIZE) {
			await flushOneChunk()
		}
	}

	async function deleteObsoleteGenerations(): Promise<number> {
		let deleted = 0
		let afterKey: IDBValidKey | undefined
		let exhausted = false

		while (!exhausted) {
			const transaction = database.transaction(CACHE_STORE_NAME, 'readwrite')
			const completion = waitForTransaction(
				transaction,
				'Obsolete cache-generation pruning'
			)
			const store = transaction.objectStore(CACHE_STORE_NAME)
			const range =
				afterKey === undefined
					? undefined
					: IDBKeyRange.lowerBound(afterKey, true)
			const request = store.openCursor(range)
			let scanned = 0
			metrics.pruneTransactions += 1

			request.onsuccess = () => {
				const cursor = request.result
				if (!cursor) {
					exhausted = true
					return
				}
				scanned += 1
				afterKey = cursor.primaryKey
				const cacheKey = String(cursor.primaryKey)
				if (
					!cacheKey.startsWith(activeGenerationPrefix) &&
					!protectedKeys.has(cacheKey)
				) {
					cursor.delete()
					deleted += 1
				}
				if (scanned < CACHE_PRUNE_CHUNK_SIZE) cursor.continue()
			}

			await completion
			if (scanned === 0) exhausted = true
		}

		return deleted
	}

	async function deleteExpiredEntries(prunedAt: number): Promise<number> {
		const cutoff = prunedAt - LOCAL_AUDIO_CACHE_MAX_AGE_MS
		let deleted = 0
		let exhausted = false
		let position: CacheIndexCursorPosition | null = null

		while (!exhausted) {
			const transaction = database.transaction(CACHE_STORE_NAME, 'readwrite')
			const completion = waitForTransaction(
				transaction,
				'Expired cache pruning'
			)
			const index = transaction
				.objectStore(CACHE_STORE_NAME)
				.index(CACHE_UPDATED_AT_INDEX_NAME)
			const range = position
				? IDBKeyRange.bound(position.indexKey, cutoff, false, true)
				: IDBKeyRange.upperBound(cutoff, true)
			const request = index.openCursor(range)
			let visitedInChunk = 0
			metrics.pruneTransactions += 1

			request.onsuccess = () => {
				const cursor = request.result
				if (!cursor) {
					exhausted = true
					return
				}
				visitedInChunk += 1
				if (position && advanceIndexCursorPastPosition(cursor, position)) {
					return
				}

				position = {
					indexKey: cursor.key,
					primaryKey: cursor.primaryKey
				}
				const cacheKey = String(cursor.primaryKey)
				if (!protectedKeys.has(cacheKey)) {
					cursor.delete()
					deleted += 1
				}
				if (visitedInChunk < CACHE_PRUNE_CHUNK_SIZE) cursor.continue()
			}

			await completion
			if (visitedInChunk === 0) exhausted = true
		}

		return deleted
	}

	async function countEntriesForPruning(): Promise<number> {
		const transaction = database.transaction(CACHE_STORE_NAME, 'readonly')
		const completion = waitForTransaction(transaction, 'Cache count')
		const request = transaction.objectStore(CACHE_STORE_NAME).count()
		let count = 0
		metrics.pruneTransactions += 1
		request.onsuccess = () => {
			count = request.result
		}
		await completion
		return count
	}

	async function deleteOverflowEntries(): Promise<number> {
		const entryCount = await countEntriesForPruning()
		let remaining = Math.max(0, entryCount - LOCAL_AUDIO_CACHE_MAX_ENTRIES)
		let deleted = 0
		let exhausted = false
		let position: CacheIndexCursorPosition | null = null

		while (remaining > 0 && !exhausted) {
			const transaction = database.transaction(CACHE_STORE_NAME, 'readwrite')
			const completion = waitForTransaction(transaction, 'Cache-cap pruning')
			const index = transaction
				.objectStore(CACHE_STORE_NAME)
				.index(CACHE_UPDATED_AT_INDEX_NAME)
			const range = position
				? IDBKeyRange.lowerBound(position.indexKey)
				: undefined
			const request = index.openCursor(range)
			let visitedInChunk = 0
			metrics.pruneTransactions += 1

			request.onsuccess = () => {
				const cursor = request.result
				if (!cursor) {
					exhausted = true
					return
				}
				visitedInChunk += 1
				if (position && advanceIndexCursorPastPosition(cursor, position)) {
					return
				}

				position = {
					indexKey: cursor.key,
					primaryKey: cursor.primaryKey
				}
				const cacheKey = String(cursor.primaryKey)
				if (!protectedKeys.has(cacheKey)) {
					cursor.delete()
					deleted += 1
					remaining -= 1
				}
				if (remaining > 0 && visitedInChunk < CACHE_PRUNE_CHUNK_SIZE) {
					cursor.continue()
				}
			}

			await completion
			if (visitedInChunk === 0) exhausted = true
		}

		return deleted
	}

	async function writeLastPrunedAt(prunedAt: number) {
		const transaction = database.transaction(
			CACHE_METADATA_STORE_NAME,
			'readwrite'
		)
		const completion = waitForTransaction(transaction, 'Cache metadata write')
		metrics.pruneTransactions += 1
		transaction.objectStore(CACHE_METADATA_STORE_NAME).put({
			key: LAST_PRUNED_METADATA_KEY,
			value: prunedAt
		} satisfies CacheMetadataRecord)
		await completion
	}

	async function prune(): Promise<LocalAudioCachePruneResult> {
		assertOpen()
		const result: LocalAudioCachePruneResult = {
			obsoleteGenerationEntries: 0,
			expiredEntries: 0,
			overflowEntries: 0,
			lastPrunedAt: null,
			error: null
		}

		try {
			await flush()
			const prunedAt = now()
			if (!Number.isFinite(prunedAt)) {
				throw createCacheError('Cache prune clock is invalid')
			}
			result.obsoleteGenerationEntries = await deleteObsoleteGenerations()
			result.expiredEntries = await deleteExpiredEntries(prunedAt)
			result.overflowEntries = await deleteOverflowEntries()
			await writeLastPrunedAt(prunedAt)
			result.lastPrunedAt = prunedAt
		} catch (error) {
			result.error = formatError(error)
		}

		return result
	}

	function getMetrics(): Readonly<LocalAudioCacheMetrics> {
		return Object.freeze({
			...metrics,
			totalTransactions:
				metrics.readTransactions +
				metrics.writeTransactions +
				metrics.pruneTransactions
		})
	}

	async function close() {
		if (closed) return
		try {
			await flush()
		} finally {
			releaseConnection()
		}
	}

	return { getMany, put, flush, prune, getMetrics, close }
}

async function withIdleCacheDatabase<T>(
	operation: (database: IDBDatabase) => Promise<T>
): Promise<T> {
	assertCacheIdle()
	activeSession = true
	let database: IDBDatabase | null = null
	try {
		database = await openCacheDatabase()
		database.onversionchange = () => database?.close()
		return await operation(database)
	} finally {
		database?.close()
		activeSession = false
	}
}

export async function getLocalAudioCacheStatus(): Promise<LocalAudioCacheStatus> {
	return withIdleCacheDatabase(async (database) => {
		const transaction = database.transaction(
			[CACHE_STORE_NAME, CACHE_METADATA_STORE_NAME],
			'readonly'
		)
		const completion = waitForTransaction(transaction, 'Cache status read')
		const countRequest = transaction.objectStore(CACHE_STORE_NAME).count()
		const metadataRequest = transaction
			.objectStore(CACHE_METADATA_STORE_NAME)
			.get(LAST_PRUNED_METADATA_KEY)
		let entryCount = 0
		let lastPrunedAt: number | null = null
		countRequest.onsuccess = () => {
			entryCount = countRequest.result
		}
		metadataRequest.onsuccess = () => {
			const record = metadataRequest.result as CacheMetadataRecord | undefined
			lastPrunedAt = Number.isFinite(record?.value)
				? (record?.value ?? null)
				: null
		}
		await completion

		return {
			entryCount,
			lastPrunedAt,
			maxEntries: LOCAL_AUDIO_CACHE_MAX_ENTRIES,
			maxAgeDays: localAudioCacheConfiguration.maxAgeDays,
			databaseName: LOCAL_AUDIO_CACHE_DATABASE_NAME
		}
	})
}

export async function clearLocalAudioAnalysisCache(): Promise<void> {
	await withIdleCacheDatabase(async (database) => {
		const transaction = database.transaction(
			[CACHE_STORE_NAME, CACHE_METADATA_STORE_NAME],
			'readwrite'
		)
		const completion = waitForTransaction(transaction, 'Cache clear')
		transaction.objectStore(CACHE_STORE_NAME).clear()
		transaction.objectStore(CACHE_METADATA_STORE_NAME).clear()
		await completion
	})
}

export async function getCachedLocalAudioResult(
	cacheKey: string
): Promise<CachedLocalAudioResult | null> {
	const session = await openLocalAudioCacheSession()
	try {
		return (await session.getMany([cacheKey])).get(cacheKey) ?? null
	} finally {
		await session.close()
	}
}

export async function putCachedLocalAudioResult(
	record: CachedLocalAudioResult
): Promise<void> {
	const session = await openLocalAudioCacheSession()
	try {
		await session.put(record)
	} finally {
		await session.close()
	}
}
