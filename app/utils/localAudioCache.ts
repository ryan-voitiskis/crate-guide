import type {
	LocalAudioAnalysis,
	LocalAudioTagMetadata
} from '~/types/localAudio'

const CACHE_DB_NAME = 'crate-guide-local-audio'
const CACHE_STORE_NAME = 'analysis-results'
const CACHE_DB_VERSION = 1

export type CachedLocalAudioResult = {
	cacheKey: string
	tags: LocalAudioTagMetadata
	analysis: LocalAudioAnalysis | null
	updatedAt: number
}

function openCacheDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION)

		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
				db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'cacheKey' })
			}
		}
		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result)
	})
}

export async function getCachedLocalAudioResult(
	cacheKey: string
): Promise<CachedLocalAudioResult | null> {
	const db = await openCacheDb()
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(CACHE_STORE_NAME, 'readonly')
		const request = transaction.objectStore(CACHE_STORE_NAME).get(cacheKey)
		let result: CachedLocalAudioResult | null = null

		request.onsuccess = () => {
			result = (request.result as CachedLocalAudioResult | undefined) ?? null
		}
		transaction.onabort = () => {
			db.close()
			reject(transaction.error ?? new Error('Cache read aborted'))
		}
		transaction.oncomplete = () => {
			db.close()
			resolve(result)
		}
	})
}

export async function putCachedLocalAudioResult(
	record: CachedLocalAudioResult
): Promise<void> {
	const db = await openCacheDb()
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(CACHE_STORE_NAME, 'readwrite')
		transaction.objectStore(CACHE_STORE_NAME).put(record)
		transaction.onabort = () => {
			db.close()
			reject(transaction.error ?? new Error('Cache write aborted'))
		}
		transaction.oncomplete = () => {
			db.close()
			resolve()
		}
	})
}
