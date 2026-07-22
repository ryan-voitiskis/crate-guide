import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	BROWSER_LIBRARY_SCHEMA,
	BROWSER_LIBRARY_STORES,
	assertBrowserLibrarySchema,
	estimateBrowserLibraryStorage,
	openBrowserLibraryDatabase,
	probeBrowserLibraryStorage,
	requestResult,
	transactionComplete
} from '../../app/repositories/library/browser/browserLibrarySchema'

const databases = new Set<string>()

function databaseName(label: string) {
	const name = `crate-guide-library-foundation-${label}-${crypto.randomUUID()}`
	databases.add(name)
	return name
}

function deleteDatabase(name: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name)
		request.addEventListener('success', () => resolve(), { once: true })
		request.addEventListener(
			'error',
			() => reject(request.error ?? new Error(`Could not delete ${name}.`)),
			{ once: true }
		)
		request.addEventListener(
			'blocked',
			() =>
				reject(new Error(`Database deletion remained blocked for ${name}.`)),
			{ once: true }
		)
	})
}

afterEach(async () => {
	await Promise.all([...databases].map((name) => deleteDatabase(name)))
	databases.clear()
})

describe('browser library IndexedDB foundation', () => {
	it('creates and verifies the exact versioned native schema', async () => {
		const database = await openBrowserLibraryDatabase({
			databaseName: databaseName('schema')
		})

		try {
			await expect(
				assertBrowserLibrarySchema(database)
			).resolves.toBeUndefined()
			expect([...database.objectStoreNames].sort()).toEqual(
				BROWSER_LIBRARY_SCHEMA.map(({ name }) => name).sort()
			)
			const transaction = database.transaction(
				BROWSER_LIBRARY_SCHEMA.map(({ name }) => name),
				'readonly'
			)
			const completion = transactionComplete(transaction)
			for (const definition of BROWSER_LIBRARY_SCHEMA) {
				const store = transaction.objectStore(definition.name)
				expect(store.keyPath).toEqual(definition.keyPath)
				expect(store.autoIncrement).toBe(false)
				for (const expectedIndex of definition.indexes) {
					const index = store.index(expectedIndex.name)
					expect(index.keyPath).toEqual(expectedIndex.keyPath)
					expect(index.unique).toBe(expectedIndex.unique)
				}
			}
			await completion
		} finally {
			database.close()
		}
	})

	it('reopens a completed schema without recreating its stores', async () => {
		const name = databaseName('reopen')
		const first = await openBrowserLibraryDatabase({ databaseName: name })
		const write = first.transaction(
			BROWSER_LIBRARY_STORES.registry,
			'readwrite'
		)
		const writeComplete = transactionComplete(write)
		write.objectStore(BROWSER_LIBRARY_STORES.registry).put({
			key: 'migration-sentinel',
			value: 'preserved'
		})
		await writeComplete
		first.close()

		const reopened = await openBrowserLibraryDatabase({ databaseName: name })
		try {
			const read = reopened.transaction(
				BROWSER_LIBRARY_STORES.registry,
				'readonly'
			)
			const readComplete = transactionComplete(read)
			const value = await requestResult(
				read
					.objectStore(BROWSER_LIBRARY_STORES.registry)
					.get('migration-sentinel')
			)
			await readComplete
			expect(value).toEqual({
				key: 'migration-sentinel',
				value: 'preserved'
			})
		} finally {
			reopened.close()
		}
	})

	it('fails closed when an existing schema does not match the contract', async () => {
		const name = databaseName('corrupt')
		const request = indexedDB.open(name, 1)
		request.addEventListener('upgradeneeded', () => {
			request.result.createObjectStore('registry', { keyPath: 'wrongKey' })
		})
		const malformed = await requestResult(request)
		malformed.close()

		await expect(
			openBrowserLibraryDatabase({ databaseName: name })
		).rejects.toMatchObject({ code: 'corrupt' })
	})

	it('commits scalar and Blob values, reopens to verify them, then cleans up', async () => {
		const name = databaseName('probe')
		const steps: string[] = []
		const open = vi.fn((databaseName: string, version?: number) =>
			indexedDB.open(databaseName, version)
		)
		const health = await probeBrowserLibraryStorage({
			databaseName: name,
			indexedDB: { open } as unknown as IDBFactory,
			now: () => new Date('2026-07-23T01:00:00.000Z'),
			randomUUID: () => 'probe-a',
			onTransactionStep: (step) =>
				steps.push(`${step.ordinal}:${step.operation}`)
		})

		expect(health).toEqual({
			code: 'healthy',
			message: 'Local library storage is available.',
			checkedAt: '2026-07-23T01:00:00.000Z'
		})
		expect(steps).toEqual(['1:put', '2:put', '3:delete', '4:delete'])
		expect(open).toHaveBeenCalledTimes(3)

		const database = await openBrowserLibraryDatabase({ databaseName: name })
		try {
			const transaction = database.transaction(
				BROWSER_LIBRARY_STORES.registry,
				'readonly'
			)
			const completion = transactionComplete(transaction)
			const rows = await requestResult(
				transaction.objectStore(BROWSER_LIBRARY_STORES.registry).getAll()
			)
			await completion
			expect(rows).toEqual([])
		} finally {
			database.close()
		}
	})

	it('classifies an injected quota abort without leaving a phantom probe row', async () => {
		const name = databaseName('quota')
		const health = await probeBrowserLibraryStorage({
			databaseName: name,
			randomUUID: () => 'probe-quota',
			onTransactionStep: ({ ordinal }) => {
				if (ordinal === 2) {
					throw new DOMException(
						'Injected quota failure.',
						'QuotaExceededError'
					)
				}
			}
		})

		expect(health.code).toBe('quota')
		const database = await openBrowserLibraryDatabase({ databaseName: name })
		try {
			const transaction = database.transaction(
				BROWSER_LIBRARY_STORES.registry,
				'readonly'
			)
			const completion = transactionComplete(transaction)
			const count = await requestResult(
				transaction.objectStore(BROWSER_LIBRARY_STORES.registry).count()
			)
			await completion
			expect(count).toBe(0)
		} finally {
			database.close()
		}
	})

	it('classifies unavailable and blocked opens through explicit recovery states', async () => {
		const unavailableFactory = {
			open() {
				throw new DOMException('Storage disabled.', 'SecurityError')
			}
		} as unknown as IDBFactory
		await expect(
			openBrowserLibraryDatabase({ indexedDB: unavailableFactory })
		).rejects.toMatchObject({ code: 'unavailable' })

		const blockedRequest = new EventTarget() as unknown as IDBOpenDBRequest
		const blockedFactory = {
			open() {
				queueMicrotask(() => blockedRequest.dispatchEvent(new Event('blocked')))
				return blockedRequest
			}
		} as unknown as IDBFactory
		const onBlockedUpgrade = vi.fn(() => {
			throw new Error('Diagnostic hook failure')
		})
		await expect(
			openBrowserLibraryDatabase({
				indexedDB: blockedFactory,
				onBlockedUpgrade
			})
		).rejects.toMatchObject({ code: 'blocked-upgrade' })
		expect(onBlockedUpgrade).toHaveBeenCalledOnce()
	})

	it('closes a live connection on versionchange and reports the blocking tab', async () => {
		const name = databaseName('versionchange')
		const onBlockingUpgrade = vi.fn(() => {
			throw new Error('Diagnostic hook failure')
		})
		const database = await openBrowserLibraryDatabase({
			databaseName: name,
			onBlockingUpgrade
		})

		const upgrade = indexedDB.open(name, 2)
		const upgraded = await requestResult(upgrade)
		try {
			expect(onBlockingUpgrade).toHaveBeenCalledOnce()
			expect(() =>
				database.transaction(BROWSER_LIBRARY_STORES.registry, 'readonly')
			).toThrow()
		} finally {
			upgraded.close()
		}
	})

	it('does not leak private DOMException detail through health classification', async () => {
		const health = await probeBrowserLibraryStorage({
			indexedDB: {
				open() {
					throw new DOMException('profile path /Users/example', 'SecurityError')
				}
			} as unknown as IDBFactory,
			now: () => new Date('2026-07-23T01:00:00.000Z')
		})

		expect(health.code).toBe('unavailable')
		expect(health.message).not.toContain('/Users/example')
		expect(health.checkedAt).toBe('2026-07-23T01:00:00.000Z')
	})

	it('reports only finite approximate storage estimates without privacy inference', async () => {
		await expect(
			estimateBrowserLibraryStorage({ storageManager: null })
		).resolves.toEqual({ status: 'unsupported' })
		await expect(
			estimateBrowserLibraryStorage({
				storageManager: {
					estimate: async () => ({ usage: 1_024, quota: 8_192 })
				}
			})
		).resolves.toEqual({
			status: 'available',
			usageBytes: 1_024,
			quotaBytes: 8_192
		})
		for (const estimate of [
			async () => ({ usage: Number.POSITIVE_INFINITY, quota: 8_192 }),
			async () => ({ usage: 1_024 }),
			async () => {
				throw new DOMException('Private mode detail', 'UnknownError')
			}
		]) {
			await expect(
				estimateBrowserLibraryStorage({
					storageManager: { estimate } as Pick<StorageManager, 'estimate'>
				})
			).resolves.toEqual({ status: 'error' })
		}
	})
})
