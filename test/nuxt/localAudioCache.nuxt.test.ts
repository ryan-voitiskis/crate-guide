import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	type CachedLocalAudioResult,
	getCachedLocalAudioResult,
	putCachedLocalAudioResult
} from '~/utils/localAudioCache'

const CACHE_DB_NAME = 'crate-guide-local-audio'

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

describe('localAudioCache', () => {
	beforeEach(async () => {
		await deleteCacheDatabase()
	})

	afterEach(async () => {
		vi.restoreAllMocks()
		await deleteCacheDatabase()
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
})
