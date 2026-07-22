import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	BROWSER_LIBRARY_STORES,
	openBrowserLibraryDatabase,
	requestResult,
	transactionComplete
} from '../../app/repositories/library/browser/browserLibrarySchema'
import {
	BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY,
	BROWSER_LIBRARY_REGISTRY_KEY,
	BROWSER_LIBRARY_SCHEMA_VERSION,
	type BrowserLibraryDependencies,
	type BrowserWorkflowDraft,
	type BrowserWorkspaceCatalog,
	type BrowserWorkspaceIdentity,
	type BrowserWorkspaceManifest
} from '../../app/repositories/library/browser/browserLibraryTypes'
import { createBrowserWorkspaceCatalog } from '../../app/repositories/library/browser/browserWorkspaceCatalog'
import { createTrackEnrichmentDraftFixture } from '../fixtures/trackEnrichmentDraft'

const NOW = '2026-07-23T02:00:00.000Z'
const catalogs = new Set<BrowserWorkspaceCatalog>()
const databases = new Set<string>()

function databaseName(label: string) {
	const name = `crate-guide-browser-catalog-${label}-${crypto.randomUUID()}`
	databases.add(name)
	return name
}

function dependencies(
	databaseName: string,
	overrides: BrowserLibraryDependencies = {}
): BrowserLibraryDependencies {
	return {
		databaseName,
		now: () => new Date(NOW),
		...overrides
	}
}

async function catalog(
	databaseName: string,
	overrides: BrowserLibraryDependencies = {}
) {
	const value = await createBrowserWorkspaceCatalog(
		dependencies(databaseName, overrides)
	)
	catalogs.add(value)
	return value
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

async function writeRegistryValue(databaseName: string, value: unknown) {
	const database = await openBrowserLibraryDatabase({ databaseName })
	try {
		const transaction = database.transaction(
			BROWSER_LIBRARY_STORES.registry,
			'readwrite'
		)
		const completion = transactionComplete(transaction)
		transaction.objectStore(BROWSER_LIBRARY_STORES.registry).put(value)
		await completion
	} finally {
		database.close()
	}
}

async function readWorkspaceManifest(
	databaseName: string,
	workspaceId: string
) {
	const database = await openBrowserLibraryDatabase({ databaseName })
	try {
		const transaction = database.transaction(
			BROWSER_LIBRARY_STORES.workspaces,
			'readonly'
		)
		const completion = transactionComplete(transaction)
		const stored = await requestResult(
			transaction
				.objectStore(BROWSER_LIBRARY_STORES.workspaces)
				.get(workspaceId)
		)
		await completion
		return stored
	} finally {
		database.close()
	}
}

function draftFixture(
	workspaceId: string,
	repositoryId: string,
	draftRevision = 0,
	updatedAt = NOW
): BrowserWorkflowDraft {
	const payload = createTrackEnrichmentDraftFixture()
	payload.workspace.workspaceId = workspaceId
	payload.workspace.repositoryId = repositoryId
	payload.draftRevision = draftRevision
	payload.updatedAt = updatedAt
	return {
		id: payload.id,
		kind: 'track-enrichment',
		draftRevision,
		updatedAt,
		payload
	}
}

function identity(
	manifest: Pick<BrowserWorkspaceManifest, 'id' | 'repositoryId'>
): BrowserWorkspaceIdentity {
	return { workspaceId: manifest.id, repositoryId: manifest.repositoryId }
}

afterEach(async () => {
	for (const value of catalogs) value.close()
	catalogs.clear()
	await Promise.all([...databases].map((name) => deleteDatabase(name)))
	databases.clear()
})

describe('browser workspace catalog', () => {
	it('initializes once and commits create, list, rename, activate, and delete with exact CAS', async () => {
		const name = databaseName('lifecycle')
		const value = await catalog(name)

		expect(await value.listWorkspaces()).toEqual({
			catalogRevision: 0,
			workspaces: []
		})
		const createdA = await value.createWorkspace(
			{ id: 'workspace-a', name: '  Main crate  ', activate: true },
			0
		)
		expect(createdA).toMatchObject({
			catalogRevision: 1,
			value: {
				id: 'workspace-a',
				name: 'Main crate',
				contentRevision: 0,
				repositoryRevision: 0
			}
		})
		const createdB = await value.createWorkspace(
			{ id: 'workspace-b', name: 'Second crate' },
			1
		)
		expect(createdB.catalogRevision).toBe(2)
		expect(await value.readActiveWorkspace()).toEqual({
			status: 'active',
			catalogRevision: 2,
			workspaceId: 'workspace-a',
			repositoryId: createdA.value.repositoryId
		})

		const renamed = await value.renameWorkspace('Archive crate', {
			...identity(createdA.value),
			catalogRevision: 2,
			repositoryRevision: 0
		})
		expect(renamed).toMatchObject({
			catalogRevision: 3,
			repositoryRevision: 1,
			value: {
				name: 'Archive crate',
				contentRevision: 0,
				repositoryRevision: 1
			}
		})
		expect(
			(await value.listWorkspaces()).workspaces.map(({ id }) => id)
		).toEqual(['workspace-a', 'workspace-b'])

		expect(await value.activateWorkspace(identity(createdB.value), 3)).toEqual({
			status: 'active',
			catalogRevision: 4,
			workspaceId: 'workspace-b',
			repositoryId: createdB.value.repositoryId
		})
		expect(
			await value.deleteWorkspace({
				...identity(createdB.value),
				catalogRevision: 4,
				repositoryRevision: 0
			})
		).toEqual({ value: undefined, catalogRevision: 5 })
		expect(await value.readActiveWorkspace()).toEqual({
			status: 'none',
			catalogRevision: 5
		})
		expect(
			(await value.listWorkspaces()).workspaces.map(({ id }) => id)
		).toEqual(['workspace-a'])

		value.close()
		catalogs.delete(value)
		const reopened = await catalog(name)
		expect(await reopened.listWorkspaces()).toMatchObject({
			catalogRevision: 5,
			workspaces: [{ id: 'workspace-a', name: 'Archive crate' }]
		})
	})

	it('rejects stale catalog and workspace revisions across two live instances', async () => {
		const name = databaseName('cas')
		const first = await catalog(name, { createBroadcastChannel: () => null })
		const second = await catalog(name, { createBroadcastChannel: () => null })
		const created = await first.createWorkspace(
			{ id: 'workspace-a', name: 'First' },
			0
		)

		await expect(
			second.createWorkspace({ id: 'workspace-b', name: 'Stale' }, 0)
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'catalog-revision',
			expected: 0,
			actual: 1
		})
		const renamed = await first.renameWorkspace('Renamed', {
			...identity(created.value),
			catalogRevision: 1,
			repositoryRevision: 0
		})
		expect(renamed.repositoryRevision).toBe(1)
		await expect(
			second.renameWorkspace('Lost edit', {
				...identity(created.value),
				catalogRevision: 2,
				repositoryRevision: 0
			})
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'repository-revision',
			expected: 0,
			actual: 1
		})
		expect((await second.listWorkspaces()).workspaces[0]!.name).toBe('Renamed')
	})

	it('enumerates intact workspaces without repairing absent, malformed, or dangling active markers', async () => {
		const name = databaseName('marker-recovery')
		const value = await catalog(name)
		const created = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Safe workspace' },
			0
		)

		expect(await value.readActiveWorkspace()).toEqual({
			status: 'none',
			catalogRevision: 1
		})
		await writeRegistryValue(name, {
			key: BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY,
			workspaceId: '',
			catalogRevision: 1,
			updatedAt: NOW
		})
		expect(await value.readActiveWorkspace()).toEqual({
			status: 'corrupt',
			catalogRevision: 1,
			reason: 'invalid-marker'
		})
		expect((await value.listWorkspaces()).workspaces).toMatchObject([
			{ id: 'workspace-a', name: 'Safe workspace' }
		])

		await writeRegistryValue(name, {
			key: BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY,
			workspaceId: 'missing-workspace',
			repositoryId: 'missing-repository',
			catalogRevision: 1,
			updatedAt: NOW
		})
		expect(await value.readActiveWorkspace()).toEqual({
			status: 'corrupt',
			catalogRevision: 1,
			reason: 'missing-workspace'
		})
		expect((await value.listWorkspaces()).workspaces).toHaveLength(1)

		expect(await value.activateWorkspace(identity(created.value), 1)).toEqual({
			status: 'active',
			catalogRevision: 2,
			workspaceId: 'workspace-a',
			repositoryId: created.value.repositoryId
		})
	})

	it('increments only repository revision for exports, receipts, and storage health', async () => {
		const name = databaseName('operations')
		const value = await catalog(name)
		const created = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Operations' },
			0
		)
		const workspace = identity(created.value)

		const initial = await value.readOperations(workspace)
		expect(initial).toMatchObject({
			repositoryRevision: 0,
			value: {
				lastExportedContentRevision: null,
				lastExportedAt: null,
				storageHealth: { code: 'healthy' },
				copyReceipt: null
			}
		})
		const exported = await value.recordExport(
			workspace,
			0,
			0,
			'2026-07-23T02:05:00.000Z'
		)
		expect(exported).toMatchObject({
			repositoryRevision: 1,
			value: {
				lastExportedContentRevision: 0,
				lastExportedAt: '2026-07-23T02:05:00.000Z'
			}
		})
		const receipt = {
			migrationId: 'migration-a',
			sourceContentRevision: 0,
			phase: 'metadata' as const,
			status: 'in-progress' as const,
			createdAt: NOW,
			updatedAt: NOW
		}
		const copied = await value.writeCopyReceipt(workspace, receipt, 1)
		expect(copied).toMatchObject({
			repositoryRevision: 2,
			value: { copyReceipt: receipt }
		})
		const unhealthy = await value.writeStorageHealth(
			workspace,
			{
				code: 'quota',
				message: 'Storage is full.',
				checkedAt: NOW
			},
			2
		)
		expect(unhealthy).toMatchObject({
			repositoryRevision: 3,
			value: { storageHealth: { code: 'quota' } }
		})
		expect(await readWorkspaceManifest(name, 'workspace-a')).toMatchObject({
			contentRevision: 0,
			repositoryRevision: 3
		})

		await expect(value.recordExport(workspace, 0, 2)).rejects.toMatchObject({
			code: 'conflict',
			scope: 'repository-revision',
			actual: 3
		})
	})

	it('round-trips workflow drafts with explicit draft and repository CAS', async () => {
		const name = databaseName('drafts')
		const value = await catalog(name)
		const created = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Drafts' },
			0
		)
		const workspace = identity(created.value)
		const createdDraft = draftFixture(
			workspace.workspaceId,
			workspace.repositoryId
		)
		await expect(
			value.writeDraft(
				workspace,
				draftFixture(workspace.workspaceId, workspace.repositoryId, 2),
				{
					repositoryRevision: 0,
					draftRevision: null
				}
			)
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'draft-revision',
			expected: 0,
			actual: 2
		})
		expect(await value.readDraft(workspace, createdDraft.id)).toEqual({
			value: null,
			repositoryRevision: 0
		})
		const draftWithRuntimeField = {
			...createdDraft,
			transientViewState: 'must-not-be-returned'
		} as BrowserWorkflowDraft

		const written = await value.writeDraft(workspace, draftWithRuntimeField, {
			repositoryRevision: 0,
			draftRevision: null
		})
		expect(written).toEqual({ value: createdDraft, repositoryRevision: 1 })
		expect(written.value).not.toHaveProperty('transientViewState')
		expect(await value.readDraft(workspace, createdDraft.id)).toMatchObject({
			value: createdDraft,
			repositoryRevision: 1
		})
		expect(await value.listDrafts(workspace)).toMatchObject({
			value: [createdDraft],
			repositoryRevision: 1
		})

		const updatedDraft = draftFixture(
			workspace.workspaceId,
			workspace.repositoryId,
			1,
			'2026-07-23T02:10:00.000Z'
		)
		expect(
			await value.writeDraft(workspace, updatedDraft, {
				repositoryRevision: 1,
				draftRevision: 0
			})
		).toMatchObject({ value: updatedDraft, repositoryRevision: 2 })
		await expect(
			value.writeDraft(workspace, updatedDraft, {
				repositoryRevision: 2,
				draftRevision: 0
			})
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'draft-revision',
			actual: 1
		})
		expect(
			await value.deleteDraft(workspace, updatedDraft.id, {
				repositoryRevision: 2,
				draftRevision: 1
			})
		).toEqual({ value: undefined, repositoryRevision: 3 })
		expect(await value.readDraft(workspace, updatedDraft.id)).toEqual({
			value: null,
			repositoryRevision: 3
		})
	})

	it('broadcasts only committed catalog changes and isolates subscriber failures', async () => {
		const name = databaseName('broadcast')
		const first = await catalog(name)
		const second = await catalog(name)
		const received = new Promise<string | null>((resolve) => {
			second.subscribe((change) => resolve(change.workspaceId))
		})
		first.subscribe(() => {
			throw new Error('Subscriber failure must not alter durable success.')
		})

		const created = await first.createWorkspace(
			{ id: 'workspace-a', name: 'Broadcast' },
			0
		)
		expect(created.catalogRevision).toBe(1)
		await expect(received).resolves.toBe('workspace-a')
	})

	it('uses an optional exclusive lock for wide workspace deletion', async () => {
		const name = databaseName('lock')
		const request = vi.fn(
			async (
				_lockName: string,
				_options: LockOptions,
				callback: () => Promise<unknown>
			) => callback()
		)
		const value = await catalog(name, {
			lockManager: { request } as unknown as LockManager
		})
		const created = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Lock' },
			0
		)

		await value.deleteWorkspace({
			...identity(created.value),
			catalogRevision: 1,
			repositoryRevision: 0
		})
		expect(request).toHaveBeenCalledWith(
			`${name}:workspace:workspace-a:wide-write`,
			{ mode: 'exclusive' },
			expect.any(Function)
		)
	})

	it('rejects stale catalog identities after a workspace id is recreated', async () => {
		const name = databaseName('recreated-catalog-identity')
		const value = await catalog(name, { createBroadcastChannel: () => null })
		const original = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Original' },
			0
		)
		const originalIdentity = identity(original.value)
		await value.deleteWorkspace({
			...originalIdentity,
			catalogRevision: 1,
			repositoryRevision: 0
		})
		const replacement = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Replacement' },
			2
		)
		expect(replacement.value.repositoryId).not.toBe(
			originalIdentity.repositoryId
		)

		await expect(
			value.activateWorkspace(originalIdentity, 3)
		).rejects.toMatchObject({ code: 'not-found', entity: 'workspace' })
		await expect(
			value.renameWorkspace('Stale rename', {
				...originalIdentity,
				catalogRevision: 3,
				repositoryRevision: 0
			})
		).rejects.toMatchObject({ code: 'not-found', entity: 'workspace' })
		await expect(
			value.deleteWorkspace({
				...originalIdentity,
				catalogRevision: 3,
				repositoryRevision: 0
			})
		).rejects.toMatchObject({ code: 'not-found', entity: 'workspace' })
		expect(await value.listWorkspaces()).toMatchObject({
			catalogRevision: 3,
			workspaces: [
				{
					id: 'workspace-a',
					name: 'Replacement',
					repositoryId: replacement.value.repositoryId,
					repositoryRevision: 0
				}
			]
		})
	})

	it('rejects every operational family for a stale recreated identity', async () => {
		const name = databaseName('recreated-operational-identity')
		const value = await catalog(name, { createBroadcastChannel: () => null })
		const original = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Original' },
			0
		)
		const staleIdentity = identity(original.value)
		await value.deleteWorkspace({
			...staleIdentity,
			catalogRevision: 1,
			repositoryRevision: 0
		})
		const replacement = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Replacement' },
			2
		)
		const staleDraft = draftFixture(
			staleIdentity.workspaceId,
			staleIdentity.repositoryId
		)
		const notFound = { code: 'not-found', entity: 'workspace' }

		await expect(value.readOperations(staleIdentity)).rejects.toMatchObject(
			notFound
		)
		await expect(value.listDrafts(staleIdentity)).rejects.toMatchObject(
			notFound
		)
		await expect(
			value.readDraft(staleIdentity, staleDraft.id)
		).rejects.toMatchObject(notFound)
		await expect(value.recordExport(staleIdentity, 0, 0)).rejects.toMatchObject(
			notFound
		)
		await expect(
			value.writeCopyReceipt(staleIdentity, null, 0)
		).rejects.toMatchObject(notFound)
		await expect(
			value.writeStorageHealth(
				staleIdentity,
				{ code: 'healthy', message: '', checkedAt: NOW },
				0
			)
		).rejects.toMatchObject(notFound)
		await expect(
			value.writeDraft(staleIdentity, staleDraft, {
				repositoryRevision: 0,
				draftRevision: null
			})
		).rejects.toMatchObject(notFound)
		await expect(
			value.deleteDraft(staleIdentity, staleDraft.id, {
				repositoryRevision: 0,
				draftRevision: 0
			})
		).rejects.toMatchObject(notFound)

		const replacementIdentity = identity(replacement.value)
		expect(await value.readOperations(replacementIdentity)).toMatchObject({
			repositoryRevision: 0,
			value: { lastExportedContentRevision: null, copyReceipt: null }
		})
		expect(await value.listDrafts(replacementIdentity)).toEqual({
			value: [],
			repositoryRevision: 0
		})
	})

	it('reports an active marker bound to another repository incarnation', async () => {
		const name = databaseName('marker-repository-mismatch')
		const value = await catalog(name)
		await value.createWorkspace({ id: 'workspace-a', name: 'Current' }, 0)
		await writeRegistryValue(name, {
			key: BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY,
			workspaceId: 'workspace-a',
			repositoryId: 'different-repository',
			catalogRevision: 1,
			updatedAt: NOW
		})

		expect(await value.readActiveWorkspace()).toEqual({
			status: 'corrupt',
			catalogRevision: 1,
			reason: 'repository-mismatch'
		})
	})
})

describe('browser workspace catalog transaction aborts', () => {
	it('rolls back every create-workspace write before reporting failure', async () => {
		const name = databaseName('abort-create')
		let abortOrdinal: number | null = null
		const value = await catalog(name, {
			createBroadcastChannel: () => null,
			onTransactionStep: ({ command, ordinal }) => {
				if (command === 'create-workspace' && ordinal === abortOrdinal) {
					throw new Error(`Abort create step ${ordinal}`)
				}
			}
		})

		for (const ordinal of [1, 2, 3, 4, 5]) {
			abortOrdinal = ordinal
			await expect(
				value.createWorkspace(
					{ id: 'workspace-a', name: 'Atomic', activate: true },
					0
				)
			).rejects.toMatchObject({ code: 'unknown' })
			expect(await value.listWorkspaces()).toEqual({
				catalogRevision: 0,
				workspaces: []
			})
			expect(await value.readActiveWorkspace()).toEqual({
				status: 'none',
				catalogRevision: 0
			})
		}

		abortOrdinal = null
		await expect(
			value.createWorkspace(
				{ id: 'workspace-a', name: 'Atomic', activate: true },
				0
			)
		).resolves.toMatchObject({ catalogRevision: 1 })
	})

	it('rolls back every draft write with its manifest revision', async () => {
		const name = databaseName('abort-draft')
		let abortOrdinal: number | null = null
		const value = await catalog(name, {
			createBroadcastChannel: () => null,
			onTransactionStep: ({ command, ordinal }) => {
				if (command === 'write-draft' && ordinal === abortOrdinal) {
					throw new Error(`Abort draft step ${ordinal}`)
				}
			}
		})
		const created = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Draft abort' },
			0
		)
		const workspace = identity(created.value)
		const draft = draftFixture(workspace.workspaceId, workspace.repositoryId)

		for (const ordinal of [1, 2]) {
			abortOrdinal = ordinal
			await expect(
				value.writeDraft(workspace, draft, {
					repositoryRevision: 0,
					draftRevision: null
				})
			).rejects.toMatchObject({ code: 'unknown' })
			expect(await value.readDraft(workspace, draft.id)).toEqual({
				value: null,
				repositoryRevision: 0
			})
		}
	})

	it('rolls back every wide-delete write without clearing the active workspace', async () => {
		const countName = databaseName('delete-count')
		const steps: number[] = []
		const countCatalog = await catalog(countName, {
			createBroadcastChannel: () => null,
			onTransactionStep: ({ command, ordinal }) => {
				if (command === 'delete-workspace') steps.push(ordinal)
			}
		})
		const counted = await countCatalog.createWorkspace(
			{ id: 'workspace-a', name: 'Count', activate: true },
			0
		)
		const countedWorkspace = identity(counted.value)
		await countCatalog.writeDraft(
			countedWorkspace,
			draftFixture(countedWorkspace.workspaceId, countedWorkspace.repositoryId),
			{
				repositoryRevision: 0,
				draftRevision: null
			}
		)
		await countCatalog.deleteWorkspace({
			...countedWorkspace,
			catalogRevision: 1,
			repositoryRevision: 1
		})
		expect(steps.length).toBeGreaterThan(4)

		for (const abortAt of steps) {
			const name = databaseName(`abort-delete-${abortAt}`)
			let enabled = false
			const value = await catalog(name, {
				createBroadcastChannel: () => null,
				onTransactionStep: ({ command, ordinal }) => {
					if (
						enabled &&
						command === 'delete-workspace' &&
						ordinal === abortAt
					) {
						throw new Error(`Abort delete step ${ordinal}`)
					}
				}
			})
			const created = await value.createWorkspace(
				{ id: 'workspace-a', name: 'Preserved', activate: true },
				0
			)
			const workspace = identity(created.value)
			await value.writeDraft(
				workspace,
				draftFixture(workspace.workspaceId, workspace.repositoryId),
				{
					repositoryRevision: 0,
					draftRevision: null
				}
			)
			enabled = true

			await expect(
				value.deleteWorkspace({
					...workspace,
					catalogRevision: 1,
					repositoryRevision: 1
				})
			).rejects.toMatchObject({ code: 'unknown' })
			expect(await value.readActiveWorkspace()).toEqual({
				status: 'active',
				catalogRevision: 1,
				workspaceId: 'workspace-a',
				repositoryId: workspace.repositoryId
			})
			expect(await value.readDraft(workspace, 'draft-a')).toMatchObject({
				value: { id: 'draft-a' },
				repositoryRevision: 1
			})
		}
	})

	it('does not create a registry beside orphaned workspace data', async () => {
		const name = databaseName('orphan')
		const database = await openBrowserLibraryDatabase({ databaseName: name })
		try {
			const transaction = database.transaction(
				BROWSER_LIBRARY_STORES.workspaces,
				'readwrite'
			)
			const completion = transactionComplete(transaction)
			transaction.objectStore(BROWSER_LIBRARY_STORES.workspaces).put({
				id: 'orphan',
				repositoryId: 'orphan-repository',
				name: 'Orphan',
				schemaVersion: BROWSER_LIBRARY_SCHEMA_VERSION,
				createdAt: NOW,
				updatedAt: NOW,
				contentRevision: 0,
				repositoryRevision: 0,
				lastSuccessfulContentWriteAt: null,
				coverCompleteness: 'complete'
			})
			await completion
		} finally {
			database.close()
		}

		await expect(catalog(name)).rejects.toMatchObject({ code: 'corrupt' })
		const check = await openBrowserLibraryDatabase({ databaseName: name })
		try {
			const transaction = check.transaction(
				BROWSER_LIBRARY_STORES.registry,
				'readonly'
			)
			const completion = transactionComplete(transaction)
			const registry = await requestResult(
				transaction
					.objectStore(BROWSER_LIBRARY_STORES.registry)
					.get(BROWSER_LIBRARY_REGISTRY_KEY)
			)
			await completion
			expect(registry).toBeUndefined()
		} finally {
			check.close()
		}
	})

	it('does not create a registry beside orphaned non-workspace data', async () => {
		const name = databaseName('orphan-operations')
		const database = await openBrowserLibraryDatabase({ databaseName: name })
		try {
			const transaction = database.transaction(
				BROWSER_LIBRARY_STORES.operations,
				'readwrite'
			)
			const completion = transactionComplete(transaction)
			transaction.objectStore(BROWSER_LIBRARY_STORES.operations).put({
				workspaceId: 'orphan-workspace',
				unexpected: 'orphaned operational data'
			})
			await completion
		} finally {
			database.close()
		}

		await expect(catalog(name)).rejects.toMatchObject({ code: 'corrupt' })
		const check = await openBrowserLibraryDatabase({ databaseName: name })
		try {
			const transaction = check.transaction(
				BROWSER_LIBRARY_STORES.registry,
				'readonly'
			)
			const completion = transactionComplete(transaction)
			const registry = await requestResult(
				transaction
					.objectStore(BROWSER_LIBRARY_STORES.registry)
					.get(BROWSER_LIBRARY_REGISTRY_KEY)
			)
			await completion
			expect(registry).toBeUndefined()
		} finally {
			check.close()
		}
	})
})
