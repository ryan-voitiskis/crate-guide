import {
	BrowserStorageError,
	normalizeBrowserRepositoryError
} from './browserLibraryErrors'
import {
	type BrowserLibraryStoreName,
	transactionComplete
} from './browserLibrarySchema'
import type { BrowserLibraryDependencies } from './browserLibraryTypes'

export class BrowserTransactionWriter {
	#ordinal = 0

	constructor(
		private readonly command: string,
		private readonly dependencies: BrowserLibraryDependencies
	) {}

	#step(store: IDBObjectStore, operation: 'add' | 'clear' | 'delete' | 'put') {
		this.#ordinal += 1
		this.dependencies.onTransactionStep?.({
			command: this.command,
			store: store.name,
			operation,
			ordinal: this.#ordinal
		})
	}

	add(store: IDBObjectStore, value: unknown, key?: IDBValidKey) {
		this.#step(store, 'add')
		return key === undefined ? store.add(value) : store.add(value, key)
	}

	clear(store: IDBObjectStore) {
		this.#step(store, 'clear')
		return store.clear()
	}

	delete(store: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
		this.#step(store, 'delete')
		return store.delete(key)
	}

	put(store: IDBObjectStore, value: unknown, key?: IDBValidKey) {
		this.#step(store, 'put')
		return key === undefined ? store.put(value) : store.put(value, key)
	}
}

export async function runBrowserLibraryTransaction<T>(
	database: IDBDatabase,
	storeNames: readonly BrowserLibraryStoreName[],
	command: string,
	dependencies: BrowserLibraryDependencies,
	callback: (
		transaction: IDBTransaction,
		writer: BrowserTransactionWriter
	) => Promise<T>
): Promise<T> {
	let transaction: IDBTransaction
	try {
		transaction = database.transaction([...storeNames], 'readwrite')
	} catch (error) {
		throw normalizeBrowserRepositoryError(error)
	}
	const completion = transactionComplete(transaction)
	const writer = new BrowserTransactionWriter(command, dependencies)

	try {
		const value = await callback(transaction, writer)
		await completion
		return value
	} catch (error) {
		try {
			transaction.abort()
		} catch {
			// A failed request may already have aborted the transaction.
		}
		await completion.catch(() => undefined)
		throw normalizeBrowserRepositoryError(error)
	}
}

export async function runBrowserLibraryReadTransaction<T>(
	database: IDBDatabase,
	storeNames: readonly BrowserLibraryStoreName[],
	callback: (transaction: IDBTransaction) => Promise<T>
): Promise<T> {
	let transaction: IDBTransaction
	try {
		transaction = database.transaction([...storeNames], 'readonly')
	} catch (error) {
		throw normalizeBrowserRepositoryError(error)
	}
	const completion = transactionComplete(transaction)
	try {
		const value = await callback(transaction)
		await completion
		return value
	} catch (error) {
		await completion.catch(() => undefined)
		throw normalizeBrowserRepositoryError(error)
	}
}

export function browserLibraryTimestamp(
	dependencies: BrowserLibraryDependencies
): string {
	return (dependencies.now?.() ?? new Date()).toISOString()
}

export function nextBrowserEntityTimestamp(
	existingTimestamp: string | null,
	wallClockTimestamp: string
): string {
	if (existingTimestamp === null) return wallClockTimestamp
	const existingMilliseconds = Date.parse(existingTimestamp)
	const wallClockMilliseconds = Date.parse(wallClockTimestamp)
	return wallClockMilliseconds > existingMilliseconds
		? wallClockTimestamp
		: new Date(existingMilliseconds + 1).toISOString()
}

export function browserLibraryRandomUUID(
	dependencies: BrowserLibraryDependencies
): string {
	const randomUUID = dependencies.randomUUID ?? globalThis.crypto?.randomUUID
	if (!randomUUID) {
		throw new BrowserStorageError(
			'unavailable',
			'This browser cannot create stable Local library identifiers.'
		)
	}
	return randomUUID.call(globalThis.crypto)
}

export function browserWorkspaceWideLockName(
	databaseName: string,
	workspaceId: string
): string {
	return `${databaseName}:workspace:${workspaceId}:wide-write`
}

export async function withOptionalBrowserLibraryLock<T>(
	dependencies: BrowserLibraryDependencies,
	name: string,
	callback: () => Promise<T>
): Promise<T> {
	const lockManager =
		dependencies.lockManager === undefined
			? globalThis.navigator?.locks
			: dependencies.lockManager
	if (!lockManager) return callback()

	try {
		return (await lockManager.request(name, { mode: 'exclusive' }, async () =>
			callback()
		)) as T
	} catch (error) {
		throw normalizeBrowserRepositoryError(error)
	}
}
