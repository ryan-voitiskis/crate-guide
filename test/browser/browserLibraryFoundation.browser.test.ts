import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	BROWSER_LIBRARY_SCHEMA,
	BROWSER_LIBRARY_STORES,
	BROWSER_LIBRARY_V1_SCHEMA,
	assertBrowserLibrarySchema,
	estimateBrowserLibraryStorage,
	openBrowserLibraryDatabase,
	probeBrowserLibraryStorage,
	requestResult,
	transactionComplete
} from '../../app/repositories/library/browser/browserLibrarySchema'
import {
	BROWSER_LIBRARY_REGISTRY_KEY,
	BROWSER_LIBRARY_SCHEMA_VERSION,
	BROWSER_WORKFLOW_DRAFT_ENVELOPE_VERSION
} from '../../app/repositories/library/browser/browserLibraryTypes'
import { encodeTrackEnrichmentDraft } from '../../app/utils/trackEnrichmentDraftCodec'
import { createTrackEnrichmentDraftFixture } from '../fixtures/trackEnrichmentDraft'

const NOW = '2026-07-23T01:00:00.000Z'

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

async function createVersionOneDatabase(
	name: string,
	options: { includeWorkspace?: boolean } = {}
) {
	const includeWorkspace = options.includeWorkspace ?? true
	const request = indexedDB.open(name, 1)
	request.addEventListener('upgradeneeded', () => {
		for (const definition of BROWSER_LIBRARY_V1_SCHEMA) {
			const store = request.result.createObjectStore(definition.name, {
				keyPath: definition.keyPath as string | string[]
			})
			for (const index of definition.indexes) {
				store.createIndex(index.name, index.keyPath as string | string[], {
					unique: index.unique
				})
			}
		}
	})
	const database = await requestResult(request)
	const payload = createTrackEnrichmentDraftFixture()
	payload.workspace = {
		workspaceId: 'workspace-a',
		repositoryId: 'repository-a',
		repositoryRevision: 0
	}
	payload.draftRevision = 0
	payload.updatedAt = NOW
	const serializedPayload = encodeTrackEnrichmentDraft(payload)
	try {
		const transaction = database.transaction(
			[
				BROWSER_LIBRARY_STORES.registry,
				BROWSER_LIBRARY_STORES.workspaces,
				BROWSER_LIBRARY_STORES.drafts
			],
			'readwrite'
		)
		const completion = transactionComplete(transaction)
		transaction.objectStore(BROWSER_LIBRARY_STORES.registry).put({
			key: BROWSER_LIBRARY_REGISTRY_KEY,
			schemaVersion: 1,
			catalogRevision: 0,
			createdAt: NOW,
			updatedAt: NOW
		})
		if (includeWorkspace) {
			transaction.objectStore(BROWSER_LIBRARY_STORES.workspaces).put({
				id: 'workspace-a',
				repositoryId: 'repository-a',
				name: 'Migrated workspace',
				schemaVersion: 1,
				createdAt: NOW,
				updatedAt: NOW,
				contentRevision: 0,
				repositoryRevision: 0,
				lastSuccessfulContentWriteAt: null,
				coverCompleteness: 'complete'
			})
		}
		transaction.objectStore(BROWSER_LIBRARY_STORES.drafts).put({
			workspaceId: 'workspace-a',
			id: payload.id,
			kind: 'track-enrichment',
			draftRevision: payload.draftRevision,
			updatedAt: payload.updatedAt,
			serializedPayload
		})
		await completion
	} finally {
		database.close()
	}
	return serializedPayload
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

	it('migrates populated v1 metadata without decoding or changing draft bytes', async () => {
		const name = databaseName('v1-populated-migration')
		const serializedPayload = await createVersionOneDatabase(name)
		const database = await openBrowserLibraryDatabase({ databaseName: name })
		try {
			expect(database.version).toBe(BROWSER_LIBRARY_SCHEMA_VERSION)
			const transaction = database.transaction(
				[
					BROWSER_LIBRARY_STORES.registry,
					BROWSER_LIBRARY_STORES.workspaces,
					BROWSER_LIBRARY_STORES.drafts,
					BROWSER_LIBRARY_STORES.draftLeases,
					BROWSER_LIBRARY_STORES.deviceDraftRepositories
				],
				'readonly'
			)
			const completion = transactionComplete(transaction)
			const [registry, workspace, draft, leaseCount, deviceState] =
				await Promise.all([
					requestResult(
						transaction
							.objectStore(BROWSER_LIBRARY_STORES.registry)
							.get(BROWSER_LIBRARY_REGISTRY_KEY)
					),
					requestResult(
						transaction
							.objectStore(BROWSER_LIBRARY_STORES.workspaces)
							.get('workspace-a')
					),
					requestResult(
						transaction
							.objectStore(BROWSER_LIBRARY_STORES.drafts)
							.get(['workspace-a', 'repository-a', 'draft-a'])
					),
					requestResult(
						transaction.objectStore(BROWSER_LIBRARY_STORES.draftLeases).count()
					),
					requestResult(
						transaction
							.objectStore(BROWSER_LIBRARY_STORES.deviceDraftRepositories)
							.get(['workspace-a', 'repository-a'])
					)
				])
			await completion
			expect(registry).toMatchObject({
				schemaVersion: BROWSER_LIBRARY_SCHEMA_VERSION
			})
			expect(workspace).toMatchObject({
				repositoryId: 'repository-a',
				schemaVersion: BROWSER_LIBRARY_SCHEMA_VERSION
			})
			expect(draft).toEqual({
				workspaceId: 'workspace-a',
				repositoryId: 'repository-a',
				envelopeVersion: BROWSER_WORKFLOW_DRAFT_ENVELOPE_VERSION,
				id: 'draft-a',
				kind: 'track-enrichment',
				draftRevision: 0,
				updatedAt: NOW,
				serializedPayload
			})
			expect(leaseCount).toBe(0)
			expect(deviceState).toEqual({
				workspaceId: 'workspace-a',
				repositoryId: 'repository-a',
				deviceRevision: 0,
				createdAt: NOW,
				updatedAt: NOW
			})
		} finally {
			database.close()
		}
	})

	it('aborts an unbound v1 draft migration and leaves the v1 bytes intact', async () => {
		const name = databaseName('v1-unbound-migration')
		const serializedPayload = await createVersionOneDatabase(name, {
			includeWorkspace: false
		})
		await expect(
			openBrowserLibraryDatabase({ databaseName: name })
		).rejects.toMatchObject({ code: 'corrupt' })

		const rawRequest = indexedDB.open(name)
		const database = await requestResult(rawRequest)
		try {
			expect(database.version).toBe(1)
			expect(
				database.objectStoreNames.contains(BROWSER_LIBRARY_STORES.draftLeases)
			).toBe(false)
			expect(
				database.objectStoreNames.contains(
					BROWSER_LIBRARY_STORES.deviceDraftRepositories
				)
			).toBe(false)
			const transaction = database.transaction(
				BROWSER_LIBRARY_STORES.drafts,
				'readonly'
			)
			const completion = transactionComplete(transaction)
			const stored = await requestResult(
				transaction
					.objectStore(BROWSER_LIBRARY_STORES.drafts)
					.get(['workspace-a', 'draft-a'])
			)
			await completion
			expect(stored).toMatchObject({ serializedPayload })
			expect(stored).not.toHaveProperty('repositoryId')
			expect(stored).not.toHaveProperty('envelopeVersion')
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

		const upgrade = indexedDB.open(name, BROWSER_LIBRARY_SCHEMA_VERSION + 1)
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
