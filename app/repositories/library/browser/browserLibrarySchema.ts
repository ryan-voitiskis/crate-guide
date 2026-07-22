import {
	BrowserStorageCodecError,
	BrowserStorageError,
	classifyBrowserStorageError,
	storageHealthFromError
} from './browserLibraryErrors'
import {
	BROWSER_LIBRARY_DATABASE_NAME,
	BROWSER_LIBRARY_SCHEMA_VERSION,
	type BrowserLibraryDependencies,
	type BrowserStorageHealth
} from './browserLibraryTypes'

export const BROWSER_LIBRARY_STORES = {
	registry: 'registry',
	workspaces: 'workspaces',
	operations: 'operations',
	preferences: 'preferences',
	records: 'records',
	tracks: 'tracks',
	crates: 'crates',
	savedSets: 'savedSets',
	covers: 'covers',
	drafts: 'drafts'
} as const

export type BrowserLibraryStoreName =
	(typeof BROWSER_LIBRARY_STORES)[keyof typeof BROWSER_LIBRARY_STORES]

export const BROWSER_LIBRARY_WORKSPACE_INDEX = 'by-workspace'
export const BROWSER_LIBRARY_TRACK_RECORD_INDEX = 'by-workspace-record'
export const BROWSER_LIBRARY_COVER_RECORD_INDEX = 'by-workspace-record'
export const BROWSER_LIBRARY_DRAFT_KIND_INDEX = 'by-workspace-kind'

type BrowserSchemaIndex = Readonly<{
	name: string
	keyPath: string | readonly string[]
	unique: boolean
}>

type BrowserSchemaStore = Readonly<{
	name: BrowserLibraryStoreName
	keyPath: string | readonly string[]
	indexes: readonly BrowserSchemaIndex[]
}>

export const BROWSER_LIBRARY_SCHEMA: readonly BrowserSchemaStore[] = [
	{ name: BROWSER_LIBRARY_STORES.registry, keyPath: 'key', indexes: [] },
	{ name: BROWSER_LIBRARY_STORES.workspaces, keyPath: 'id', indexes: [] },
	{
		name: BROWSER_LIBRARY_STORES.operations,
		keyPath: 'workspaceId',
		indexes: []
	},
	{
		name: BROWSER_LIBRARY_STORES.preferences,
		keyPath: 'workspaceId',
		indexes: []
	},
	{
		name: BROWSER_LIBRARY_STORES.records,
		keyPath: ['workspaceId', 'id'],
		indexes: [
			{
				name: BROWSER_LIBRARY_WORKSPACE_INDEX,
				keyPath: 'workspaceId',
				unique: false
			}
		]
	},
	{
		name: BROWSER_LIBRARY_STORES.tracks,
		keyPath: ['workspaceId', 'id'],
		indexes: [
			{
				name: BROWSER_LIBRARY_WORKSPACE_INDEX,
				keyPath: 'workspaceId',
				unique: false
			},
			{
				name: BROWSER_LIBRARY_TRACK_RECORD_INDEX,
				keyPath: ['workspaceId', 'record_id'],
				unique: false
			}
		]
	},
	{
		name: BROWSER_LIBRARY_STORES.crates,
		keyPath: ['workspaceId', 'id'],
		indexes: [
			{
				name: BROWSER_LIBRARY_WORKSPACE_INDEX,
				keyPath: 'workspaceId',
				unique: false
			}
		]
	},
	{
		name: BROWSER_LIBRARY_STORES.savedSets,
		keyPath: ['workspaceId', 'id'],
		indexes: [
			{
				name: BROWSER_LIBRARY_WORKSPACE_INDEX,
				keyPath: 'workspaceId',
				unique: false
			}
		]
	},
	{
		name: BROWSER_LIBRARY_STORES.covers,
		keyPath: ['workspaceId', 'assetId'],
		indexes: [
			{
				name: BROWSER_LIBRARY_WORKSPACE_INDEX,
				keyPath: 'workspaceId',
				unique: false
			},
			{
				name: BROWSER_LIBRARY_COVER_RECORD_INDEX,
				keyPath: ['workspaceId', 'recordId'],
				unique: true
			}
		]
	},
	{
		name: BROWSER_LIBRARY_STORES.drafts,
		keyPath: ['workspaceId', 'id'],
		indexes: [
			{
				name: BROWSER_LIBRARY_WORKSPACE_INDEX,
				keyPath: 'workspaceId',
				unique: false
			},
			{
				name: BROWSER_LIBRARY_DRAFT_KIND_INDEX,
				keyPath: ['workspaceId', 'kind'],
				unique: true
			}
		]
	}
] as const

function createStore(database: IDBDatabase, definition: BrowserSchemaStore) {
	const store = database.createObjectStore(definition.name, {
		keyPath: definition.keyPath as string | string[]
	})
	for (const index of definition.indexes) {
		store.createIndex(index.name, index.keyPath as string | string[], {
			unique: index.unique
		})
	}
}

const BROWSER_LIBRARY_MIGRATIONS: Readonly<
	Record<number, (database: IDBDatabase) => void>
> = {
	1(database) {
		for (const store of BROWSER_LIBRARY_SCHEMA) createStore(database, store)
	}
}

function upgradeSchema(
	database: IDBDatabase,
	oldVersion: number,
	newVersion: number | null
) {
	const targetVersion = newVersion ?? BROWSER_LIBRARY_SCHEMA_VERSION
	for (let version = oldVersion + 1; version <= targetVersion; version += 1) {
		const migrate = BROWSER_LIBRARY_MIGRATIONS[version]
		if (!migrate) {
			throw new BrowserStorageCodecError(
				`/schema/${version}`,
				`No Local library migration exists for schema version ${version}.`
			)
		}
		migrate(database)
	}
}

function listNames(names: DOMStringList): string[] {
	return Array.from({ length: names.length }, (_, index) => names.item(index)!)
}

function keyPathMatches(
	actual: string | string[] | null,
	expected: string | readonly string[]
): boolean {
	if (typeof expected === 'string') return actual === expected
	return (
		Array.isArray(actual) &&
		actual.length === expected.length &&
		actual.every((value, index) => value === expected[index])
	)
}

export async function assertBrowserLibrarySchema(
	database: IDBDatabase
): Promise<void> {
	const actualStores = listNames(database.objectStoreNames).sort()
	const expectedStores = BROWSER_LIBRARY_SCHEMA.map(({ name }) => name).sort()
	if (actualStores.join('\u0000') !== expectedStores.join('\u0000')) {
		throw new BrowserStorageCodecError('/schema/stores')
	}

	const transaction = database.transaction(expectedStores, 'readonly')
	const completion = transactionComplete(transaction)
	for (const definition of BROWSER_LIBRARY_SCHEMA) {
		const store = transaction.objectStore(definition.name)
		if (!keyPathMatches(store.keyPath, definition.keyPath)) {
			throw new BrowserStorageCodecError(
				`/schema/stores/${definition.name}/keyPath`
			)
		}
		if (store.autoIncrement) {
			throw new BrowserStorageCodecError(
				`/schema/stores/${definition.name}/autoIncrement`
			)
		}
		const actualIndexes = listNames(store.indexNames).sort()
		const expectedIndexes = definition.indexes.map(({ name }) => name).sort()
		if (actualIndexes.join('\u0000') !== expectedIndexes.join('\u0000')) {
			throw new BrowserStorageCodecError(
				`/schema/stores/${definition.name}/indexes`
			)
		}
		for (const expectedIndex of definition.indexes) {
			const index = store.index(expectedIndex.name)
			if (!keyPathMatches(index.keyPath, expectedIndex.keyPath)) {
				throw new BrowserStorageCodecError(
					`/schema/stores/${definition.name}/indexes/${expectedIndex.name}/keyPath`
				)
			}
			if (index.unique !== expectedIndex.unique) {
				throw new BrowserStorageCodecError(
					`/schema/stores/${definition.name}/indexes/${expectedIndex.name}/unique`
				)
			}
		}
	}
	await completion
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.addEventListener('success', () => resolve(request.result), {
			once: true
		})
		request.addEventListener(
			'error',
			() => reject(request.error ?? new Error('IndexedDB request failed.')),
			{ once: true }
		)
	})
}

export function transactionComplete(
	transaction: IDBTransaction
): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.addEventListener('complete', () => resolve(), { once: true })
		transaction.addEventListener(
			'abort',
			() =>
				reject(
					transaction.error ?? new Error('IndexedDB transaction was aborted.')
				),
			{ once: true }
		)
		transaction.addEventListener(
			'error',
			() => {
				// The abort event owns rejection and preserves the transaction error.
			},
			{ once: true }
		)
	})
}

export function openBrowserLibraryDatabase(
	dependencies: BrowserLibraryDependencies = {}
): Promise<IDBDatabase> {
	const factory = dependencies.indexedDB ?? globalThis.indexedDB
	if (!factory) {
		return Promise.reject(
			new BrowserStorageError(
				'unavailable',
				'This browser does not provide IndexedDB storage.'
			)
		)
	}
	const databaseName =
		dependencies.databaseName ?? BROWSER_LIBRARY_DATABASE_NAME

	return new Promise((resolve, reject) => {
		let request: IDBOpenDBRequest
		let settled = false
		let upgradeError: unknown = null
		try {
			request = factory.open(databaseName, BROWSER_LIBRARY_SCHEMA_VERSION)
		} catch (error) {
			reject(
				classifyBrowserStorageError(
					error,
					'The Local library database could not be opened.'
				)
			)
			return
		}

		request.addEventListener('upgradeneeded', (event) => {
			try {
				upgradeSchema(
					request.result,
					(event as IDBVersionChangeEvent).oldVersion,
					(event as IDBVersionChangeEvent).newVersion
				)
			} catch (error) {
				upgradeError = error
				request.transaction?.abort()
			}
		})
		request.addEventListener('blocked', () => {
			dependencies.onBlockedUpgrade?.()
			if (settled) return
			settled = true
			reject(
				new BrowserStorageError(
					'blocked-upgrade',
					'Another tab is blocking the Local library storage upgrade.'
				)
			)
		})
		request.addEventListener('error', () => {
			if (settled) return
			settled = true
			reject(
				upgradeError instanceof BrowserStorageError
					? upgradeError
					: classifyBrowserStorageError(
							request.error ?? upgradeError,
							'The Local library database could not be opened.'
						)
			)
		})
		request.addEventListener('success', () => {
			const database = request.result
			database.addEventListener('versionchange', () => {
				dependencies.onBlockingUpgrade?.()
				database.close()
			})
			database.addEventListener('close', () => {
				dependencies.onUnexpectedClose?.()
			})
			if (settled) {
				database.close()
				return
			}

			void assertBrowserLibrarySchema(database).then(
				() => {
					if (settled) {
						database.close()
						return
					}
					settled = true
					resolve(database)
				},
				(error: unknown) => {
					database.close()
					if (settled) return
					settled = true
					reject(classifyBrowserStorageError(error))
				}
			)
		})
	})
}

export async function probeBrowserLibraryStorage(
	dependencies: BrowserLibraryDependencies = {}
): Promise<BrowserStorageHealth> {
	let checkedAt: string
	try {
		checkedAt = (dependencies.now?.() ?? new Date()).toISOString()
	} catch (error) {
		return storageHealthFromError(error, new Date(0).toISOString())
	}

	let database: IDBDatabase | null = null
	try {
		database = await openBrowserLibraryDatabase(dependencies)
		const transaction = database.transaction(
			BROWSER_LIBRARY_STORES.registry,
			'readwrite'
		)
		const completion = transactionComplete(transaction)
		const store = transaction.objectStore(BROWSER_LIBRARY_STORES.registry)
		const randomUUID =
			dependencies.randomUUID ?? (() => globalThis.crypto.randomUUID())
		const probeKey = `health-probe:${randomUUID()}`

		try {
			dependencies.onTransactionStep?.({
				command: 'probe',
				store: BROWSER_LIBRARY_STORES.registry,
				operation: 'put',
				ordinal: 1
			})
			store.put({ key: probeKey, checkedAt })
			dependencies.onTransactionStep?.({
				command: 'probe',
				store: BROWSER_LIBRARY_STORES.registry,
				operation: 'delete',
				ordinal: 2
			})
			store.delete(probeKey)
			await completion
		} catch (error) {
			try {
				transaction.abort()
			} catch {
				// The transaction may already have aborted because a request failed.
			}
			await completion.catch(() => undefined)
			throw error
		}

		return {
			code: 'healthy',
			message: 'Local library storage is available.',
			checkedAt
		}
	} catch (error) {
		return storageHealthFromError(error, checkedAt)
	} finally {
		database?.close()
	}
}
