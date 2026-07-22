import {
	IDBKeyRange as FakeIDBKeyRange,
	IDBObjectStore as FakeIDBObjectStore
} from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_AUDIO_CACHE_GENERATION_PREFIX } from '~/utils/localAudio'
import {
	type CachedLocalAudioResult,
	LOCAL_AUDIO_CACHE_DATABASE_NAME,
	LOCAL_AUDIO_CACHE_MAX_AGE_MS,
	LOCAL_AUDIO_CACHE_MAX_ENTRIES,
	LOCAL_AUDIO_CACHE_PERFORMANCE_BUDGETS,
	LOCAL_AUDIO_CACHE_SCHEMA_VERSION,
	LOCAL_AUDIO_CACHE_WORKER_IDLE_MS,
	clearLocalAudioAnalysisCache,
	getCachedLocalAudioResult,
	getLocalAudioCacheStatus,
	isLocalAudioCacheSessionActive,
	openLocalAudioCacheSession,
	putCachedLocalAudioResult
} from '~/utils/localAudioCache'

const CACHE_DB_NAME = LOCAL_AUDIO_CACHE_DATABASE_NAME

function createRecord(
	cacheKey: string,
	overrides: Partial<CachedLocalAudioResult> = {}
): CachedLocalAudioResult {
	return {
		cacheKey,
		tags: {
			title: 'Cached track',
			artist: 'Cached artist',
			album: 'Cached album',
			genres: ['House'],
			durationSeconds: 180,
			bpm: 128,
			key: 'C minor'
		},
		analysis: null,
		updatedAt: 1,
		...overrides
	}
}

function deleteCacheDatabase(): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(CACHE_DB_NAME)
		request.onsuccess = () => resolve()
		request.onerror = () => reject(request.error)
		request.onblocked = () =>
			reject(new Error(`Deleting ${CACHE_DB_NAME} was blocked`))
	})
}

function instrumentConnections(options: { abortTransactions?: boolean } = {}) {
	const databases: IDBDatabase[] = []
	const originalOpen = indexedDB.open.bind(indexedDB)

	vi.spyOn(indexedDB, 'open').mockImplementation((name, version) => {
		const request =
			version === undefined ? originalOpen(name) : originalOpen(name, version)
		request.addEventListener('success', () => {
			const database = request.result
			databases.push(database)
			vi.spyOn(database, 'close')

			if (options.abortTransactions) {
				const originalTransaction = database.transaction.bind(database)
				vi.spyOn(database, 'transaction').mockImplementation(
					(storeNames, mode) => {
						const transaction = originalTransaction(storeNames, mode)
						queueMicrotask(() => transaction.abort())
						return transaction
					}
				)
			}
		})
		return request
	})

	return databases
}

function expectEveryConnectionClosed(databases: IDBDatabase[]) {
	expect(databases.length).toBeGreaterThan(0)
	for (const database of databases) {
		expect(database.close).toHaveBeenCalledTimes(1)
	}
}

function activeCacheKey(suffix: string): string {
	return `${LOCAL_AUDIO_CACHE_GENERATION_PREFIX}${suffix}|1|1`
}

function createLegacyDatabase(
	records: CachedLocalAudioResult[] = []
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(CACHE_DB_NAME, 1)
		request.onupgradeneeded = () => {
			request.result.createObjectStore('analysis-results', {
				keyPath: 'cacheKey'
			})
		}
		request.onerror = () => reject(request.error)
		request.onsuccess = () => {
			const database = request.result
			if (records.length === 0) {
				resolve(database)
				return
			}
			const transaction = database.transaction('analysis-results', 'readwrite')
			for (const record of records) {
				transaction.objectStore('analysis-results').put(record)
			}
			transaction.oncomplete = () => resolve(database)
			transaction.onabort = () => reject(transaction.error)
		}
	})
}

async function seedRecords(records: CachedLocalAudioResult[]) {
	const session = await openLocalAudioCacheSession()
	try {
		for (const record of records) await session.put(record)
		await session.flush()
	} finally {
		await session.close()
	}
}

describe('localAudioCache', () => {
	beforeEach(async () => {
		vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange)
		await deleteCacheDatabase()
	})

	afterEach(async () => {
		vi.restoreAllMocks()
		await deleteCacheDatabase()
		vi.unstubAllGlobals()
	})

	it('pins immutable retention, lifecycle, and performance budgets', () => {
		expect({
			schemaVersion: LOCAL_AUDIO_CACHE_SCHEMA_VERSION,
			maxEntries: LOCAL_AUDIO_CACHE_MAX_ENTRIES,
			maxAgeDays: LOCAL_AUDIO_CACHE_MAX_AGE_MS / (24 * 60 * 60 * 1_000),
			workerIdleMs: LOCAL_AUDIO_CACHE_WORKER_IDLE_MS,
			performance: LOCAL_AUDIO_CACHE_PERFORMANCE_BUDGETS
		}).toEqual({
			schemaVersion: 2,
			maxEntries: 20_000,
			maxAgeDays: 90,
			workerIdleMs: 30_000,
			performance: {
				hit1000: {
					maxConnections: 1,
					maxTransactions: 25,
					maxWallTimeMs: 1_000
				},
				hit10000: {
					maxConnections: 1,
					maxTransactions: 130,
					maxWallTimeMs: 5_000
				},
				cold1000: {
					maxConnections: 1,
					maxTransactions: 40,
					maxWallTimeMs: 1_500
				},
				cold10000: {
					maxConnections: 1,
					maxTransactions: 230,
					maxWallTimeMs: 7_500
				},
				maxPostBatchHeapGrowthBytes: 67_108_864
			}
		})
		expect(Object.isFrozen(LOCAL_AUDIO_CACHE_PERFORMANCE_BUDGETS)).toBe(true)
		expect(
			Object.isFrozen(LOCAL_AUDIO_CACHE_PERFORMANCE_BUDGETS.hit10000)
		).toBe(true)
	})

	it('creates the store on first write and reads the record back', async () => {
		const databases = instrumentConnections()
		const record = createRecord('first-key')

		await putCachedLocalAudioResult(record)
		await expect(getCachedLocalAudioResult(record.cacheKey)).resolves.toEqual(
			record
		)

		expect(databases).toHaveLength(2)
		expectEveryConnectionClosed(databases)
	})

	it('returns null for a missing key and closes the connection', async () => {
		const databases = instrumentConnections()

		await expect(getCachedLocalAudioResult('missing-key')).resolves.toBeNull()

		expect(databases).toHaveLength(1)
		expectEveryConnectionClosed(databases)
	})

	it('replaces an existing key with the latest record', async () => {
		const databases = instrumentConnections()
		const first = createRecord('replacement-key')
		const latest = createRecord('replacement-key', {
			tags: { ...first.tags, bpm: 132 },
			updatedAt: 2
		})

		await putCachedLocalAudioResult(first)
		await putCachedLocalAudioResult(latest)
		await expect(getCachedLocalAudioResult(first.cacheKey)).resolves.toEqual(
			latest
		)

		expect(databases).toHaveLength(3)
		expectEveryConnectionClosed(databases)
	})

	it('rejects an asynchronous transaction failure and closes cleanly', async () => {
		const databases = instrumentConnections({ abortTransactions: true })

		await expect(
			putCachedLocalAudioResult(createRecord('aborted-key'))
		).rejects.toBeDefined()

		expect(databases).toHaveLength(1)
		expectEveryConnectionClosed(databases)
	})

	it('upgrades the v1 cache forward without clearing existing results', async () => {
		const record = createRecord(activeCacheKey('legacy'))
		const legacyDatabase = await createLegacyDatabase([record])
		legacyDatabase.close()

		const session = await openLocalAudioCacheSession()
		const results = await session.getMany([record.cacheKey])
		await session.close()

		expect(LOCAL_AUDIO_CACHE_SCHEMA_VERSION).toBe(2)
		expect(results.get(record.cacheKey)).toEqual(record)
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(CACHE_DB_NAME)
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		const transaction = database.transaction('analysis-results', 'readonly')
		expect(
			transaction
				.objectStore('analysis-results')
				.indexNames.contains('updatedAt')
		).toBe(true)
		expect(database.objectStoreNames.contains('cache-metadata')).toBe(true)
		database.close()
	})

	it('reports a blocked upgrade and releases the session lock', async () => {
		const legacyDatabase = await createLegacyDatabase()
		const onBlocked = vi.fn()

		await expect(openLocalAudioCacheSession({ onBlocked })).rejects.toThrow(
			'upgrade is blocked by another tab'
		)
		expect(onBlocked).toHaveBeenCalledTimes(1)
		expect(isLocalAudioCacheSessionActive()).toBe(false)

		legacyDatabase.close()
		await new Promise((resolve) => setTimeout(resolve, 0))
	})

	it('closes and invalidates a session when another context upgrades the schema', async () => {
		const session = await openLocalAudioCacheSession()
		const upgradeDatabase = await new Promise<IDBDatabase>(
			(resolve, reject) => {
				const request = indexedDB.open(
					CACHE_DB_NAME,
					LOCAL_AUDIO_CACHE_SCHEMA_VERSION + 1
				)
				request.onsuccess = () => resolve(request.result)
				request.onerror = () => reject(request.error)
			}
		)

		await expect(session.getMany(['after-versionchange'])).rejects.toThrow(
			'cache session is closed'
		)
		expect(isLocalAudioCacheSessionActive()).toBe(false)
		upgradeDatabase.close()
	})

	it('releases the session lock when opening IndexedDB throws', async () => {
		vi.spyOn(indexedDB, 'open').mockImplementation(() => {
			throw new DOMException('Storage disabled', 'SecurityError')
		})

		await expect(openLocalAudioCacheSession()).rejects.toThrow(
			'Local audio analysis cache is unavailable'
		)
		expect(isLocalAudioCacheSessionActive()).toBe(false)
	})

	it('uses one connection with chunked hits, misses, and buffered writes', async () => {
		const records = Array.from({ length: 600 }, (_, index) =>
			createRecord(activeCacheKey(`batched-${index}`), { updatedAt: index + 1 })
		)
		const session = await openLocalAudioCacheSession()
		for (const record of records) await session.put(record)
		await session.flush()

		const requestedKeys = [
			...records.map((record) => record.cacheKey),
			activeCacheKey('missing')
		]
		const results = await session.getMany(requestedKeys)
		const metrics = session.getMetrics()
		await session.close()

		expect(results.size).toBe(600)
		expect(metrics).toMatchObject({
			connectionsOpened: 1,
			readTransactions: 3,
			writeTransactions: 6,
			requestedRecords: 601,
			cacheHits: 600,
			cacheMisses: 1,
			queuedWrites: 600,
			committedWrites: 600,
			totalTransactions: 9
		})
	})

	it('rejects a concurrent session and clear while the cache is active', async () => {
		const session = await openLocalAudioCacheSession()

		await expect(openLocalAudioCacheSession()).rejects.toThrow(
			'analysis cache is busy'
		)
		await expect(clearLocalAudioAnalysisCache()).rejects.toThrow(
			'analysis cache is busy'
		)

		await session.close()
		const clearOperation = clearLocalAudioAnalysisCache()
		expect(isLocalAudioCacheSessionActive()).toBe(true)
		await expect(openLocalAudioCacheSession()).rejects.toThrow(
			'analysis cache is busy'
		)
		await clearOperation
		expect(isLocalAudioCacheSessionActive()).toBe(false)

		const replacement = await openLocalAudioCacheSession()
		expect(replacement).toBeDefined()
		await replacement.close()
	})

	it('removes obsolete generations before preserving the active generation', async () => {
		const obsolete = createRecord(
			'old-analyzer|old-config|old-tags|track|1|1',
			{
				updatedAt: 10_000
			}
		)
		const active = createRecord(activeCacheKey('active'), { updatedAt: 10_000 })
		await seedRecords([obsolete, active])

		const session = await openLocalAudioCacheSession({ now: () => 20_000 })
		const result = await session.prune()
		const remaining = await session.getMany([
			obsolete.cacheKey,
			active.cacheKey
		])
		await session.close()

		expect(result).toMatchObject({
			obsoleteGenerationEntries: 1,
			expiredEntries: 0,
			overflowEntries: 0,
			lastPrunedAt: 20_000,
			error: null
		})
		expect(remaining.has(obsolete.cacheKey)).toBe(false)
		expect(remaining.get(active.cacheKey)).toEqual(active)
	})

	it('expires entries strictly older than 90 days', async () => {
		const now = LOCAL_AUDIO_CACHE_MAX_AGE_MS + 50_000
		const expired = createRecord(activeCacheKey('expired'), {
			updatedAt: now - LOCAL_AUDIO_CACHE_MAX_AGE_MS - 1
		})
		const boundary = createRecord(activeCacheKey('boundary'), {
			updatedAt: now - LOCAL_AUDIO_CACHE_MAX_AGE_MS
		})
		const recent = createRecord(activeCacheKey('recent'), { updatedAt: now })
		await seedRecords([expired, boundary, recent])

		const session = await openLocalAudioCacheSession({ now: () => now })
		const result = await session.prune()
		const remaining = await session.getMany(
			[expired, boundary, recent].map((record) => record.cacheKey)
		)
		await session.close()

		expect(result.expiredEntries).toBe(1)
		expect(remaining.has(expired.cacheKey)).toBe(false)
		expect(remaining.has(boundary.cacheKey)).toBe(true)
		expect(remaining.has(recent.cacheKey)).toBe(true)
	})

	it('prunes oldest-write overflow without deleting the active session batch', async () => {
		const records = Array.from(
			{ length: LOCAL_AUDIO_CACHE_MAX_ENTRIES },
			(_, index) =>
				createRecord(activeCacheKey(`cap-${String(index).padStart(5, '0')}`), {
					updatedAt: 100 + index
				})
		)
		await seedRecords(records)

		const protectedRecord = createRecord(activeCacheKey('just-written'), {
			updatedAt: 0
		})
		const session = await openLocalAudioCacheSession({ now: () => 1_000_000 })
		await session.put(protectedRecord)
		await session.flush()
		const result = await session.prune()
		const remaining = await session.getMany([
			protectedRecord.cacheKey,
			records[0]!.cacheKey,
			records[1]!.cacheKey
		])
		await session.close()

		expect(result.overflowEntries).toBe(1)
		expect(remaining.has(protectedRecord.cacheKey)).toBe(true)
		expect(remaining.has(records[0]!.cacheKey)).toBe(false)
		expect(remaining.has(records[1]!.cacheKey)).toBe(true)
		expect((await getLocalAudioCacheStatus()).entryCount).toBe(
			LOCAL_AUDIO_CACHE_MAX_ENTRIES
		)
	}, 20_000)

	it('exposes count and last-pruned state and clears only the analysis cache', async () => {
		await seedRecords([createRecord(activeCacheKey('status'))])
		const session = await openLocalAudioCacheSession({ now: () => 987_654 })
		await session.prune()
		await session.close()

		await expect(getLocalAudioCacheStatus()).resolves.toMatchObject({
			entryCount: 1,
			lastPrunedAt: 987_654,
			maxEntries: 20_000,
			maxAgeDays: 90,
			databaseName: CACHE_DB_NAME
		})

		await clearLocalAudioAnalysisCache()
		await expect(getLocalAudioCacheStatus()).resolves.toMatchObject({
			entryCount: 0,
			lastPrunedAt: null
		})
	})

	it('closes the session after a quota-style buffered write failure', async () => {
		const session = await openLocalAudioCacheSession()
		vi.spyOn(FakeIDBObjectStore.prototype, 'put').mockImplementation(() => {
			throw new DOMException('Quota exhausted', 'QuotaExceededError')
		})
		await session.put(createRecord(activeCacheKey('quota')))

		await expect(session.flush()).rejects.toThrow('Quota exhausted')
		expect(isLocalAudioCacheSessionActive()).toBe(false)
		await expect(session.getMany(['closed'])).rejects.toThrow(
			'cache session is closed'
		)
	})
})
