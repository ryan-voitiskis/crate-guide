import { afterEach, describe, expect, it, vi } from 'vitest'
import { openBrowserDeviceDraftRepository } from '../../app/repositories/library/browser/browserDeviceDraftRepository'
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
const deviceDraftRepositories = new Set<
	Awaited<ReturnType<typeof openBrowserDeviceDraftRepository>>
>()
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

async function replaceDraftSerializedPayload(
	databaseName: string,
	workspaceId: string,
	repositoryId: string,
	draftId: string,
	serializedPayload: string
) {
	const database = await openBrowserLibraryDatabase({ databaseName })
	try {
		const transaction = database.transaction(
			BROWSER_LIBRARY_STORES.drafts,
			'readwrite'
		)
		const completion = transactionComplete(transaction)
		const store = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
		const row = await requestResult(
			store.get([workspaceId, repositoryId, draftId])
		)
		store.put({ ...(row as Record<string, unknown>), serializedPayload })
		await completion
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
	for (const value of deviceDraftRepositories) value.close()
	deviceDraftRepositories.clear()
	for (const value of catalogs) value.close()
	catalogs.clear()
	await Promise.all([...databases].map((name) => deleteDatabase(name)))
	databases.clear()
})

describe('browser workspace catalog', () => {
	it('persists a Cloud identity without creating a Local workspace or marker', async () => {
		const name = databaseName('cloud-device-draft')
		const cloudIdentity = {
			workspaceId: 'cloud-workspace-a',
			repositoryId: 'cloud-repository-a'
		}
		const repository = await openBrowserDeviceDraftRepository({
			identity: cloudIdentity,
			dependencies: dependencies(name)
		})
		deviceDraftRepositories.add(repository)
		expect(await repository.listDrafts()).toEqual({
			value: [],
			deviceRevision: 0
		})
		const draft = draftFixture(
			cloudIdentity.workspaceId,
			cloudIdentity.repositoryId
		)
		const claimed = await repository.createDraftAndClaim(
			draft,
			'cloud-device-owner',
			{ deviceRevision: 0, draftRevision: null }
		)
		expect(claimed).toMatchObject({
			deviceRevision: 1,
			value: { draft: { id: draft.id }, lease: { leaseRevision: 0 } }
		})
		await expect(
			repository.takeOverDraft(draft.id, 'stale-device-owner', {
				deviceRevision: 0,
				leaseRevision: 0
			})
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'device-revision',
			expected: 0,
			actual: 1
		})
		repository.close()
		const reopened = await openBrowserDeviceDraftRepository({
			identity: cloudIdentity,
			dependencies: dependencies(name)
		})
		deviceDraftRepositories.add(reopened)
		expect(await reopened.readDraft(draft.id)).toMatchObject({
			deviceRevision: 1,
			value: {
				draft: { status: 'ready', metadata: { draftRevision: 0 } },
				lease: { status: 'live', lease: { leaseRevision: 0 } }
			}
		})
		const changed = draftFixture(
			cloudIdentity.workspaceId,
			cloudIdentity.repositoryId,
			1,
			'2026-07-23T02:00:01.000Z'
		)
		changed.payload.ui.filter = 'review'
		expect(
			await reopened.writeDraft(changed, 'cloud-device-owner', {
				deviceRevision: 1,
				draftRevision: 0,
				leaseRevision: 0
			})
		).toMatchObject({
			deviceRevision: 2,
			value: { draftRevision: 1, payload: { ui: { filter: 'review' } } }
		})

		const localCatalog = await catalog(name)
		expect(await localCatalog.listWorkspaces()).toEqual({
			catalogRevision: 0,
			workspaces: []
		})
		expect(await localCatalog.readActiveWorkspace()).toEqual({
			status: 'none',
			catalogRevision: 0
		})
		expect(
			await reopened.deleteDraft(draft.id, 'cloud-device-owner', {
				deviceRevision: 2,
				draftRevision: 1,
				leaseRevision: 0
			})
		).toEqual({ value: undefined, deviceRevision: 3 })
		reopened.close()
		const afterDelete = await openBrowserDeviceDraftRepository({
			identity: cloudIdentity,
			dependencies: dependencies(name)
		})
		deviceDraftRepositories.add(afterDelete)
		expect(await afterDelete.readDraft(draft.id)).toEqual({
			value: null,
			deviceRevision: 3
		})
		expect(await localCatalog.listWorkspaces()).toEqual({
			catalogRevision: 0,
			workspaces: []
		})
		expect(await localCatalog.readActiveWorkspace()).toEqual({
			status: 'none',
			catalogRevision: 0
		})
		const nextRepositoryIdentity = {
			workspaceId: cloudIdentity.workspaceId,
			repositoryId: 'cloud-repository-b'
		}
		const nextRepository = await openBrowserDeviceDraftRepository({
			identity: nextRepositoryIdentity,
			dependencies: dependencies(name)
		})
		deviceDraftRepositories.add(nextRepository)
		const nextDraft = draftFixture(
			nextRepositoryIdentity.workspaceId,
			nextRepositoryIdentity.repositoryId
		)
		await expect(
			nextRepository.createDraftAndClaim(nextDraft, 'next-repository-owner', {
				deviceRevision: 0,
				draftRevision: null
			})
		).resolves.toMatchObject({ deviceRevision: 1 })
		expect(await afterDelete.listDrafts()).toEqual({
			value: [],
			deviceRevision: 3
		})
		expect(await nextRepository.listDrafts()).toMatchObject({
			deviceRevision: 1,
			value: [{ draft: { status: 'ready', metadata: { id: draft.id } } }]
		})
		const database = await openBrowserLibraryDatabase({ databaseName: name })
		try {
			const transaction = database.transaction(
				[
					BROWSER_LIBRARY_STORES.workspaces,
					BROWSER_LIBRARY_STORES.deviceDraftRepositories
				],
				'readonly'
			)
			const completion = transactionComplete(transaction)
			const [workspaceCount, deviceState] = await Promise.all([
				requestResult(
					transaction.objectStore(BROWSER_LIBRARY_STORES.workspaces).count()
				),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.deviceDraftRepositories)
						.get([cloudIdentity.workspaceId, cloudIdentity.repositoryId])
				)
			])
			await completion
			expect(workspaceCount).toBe(0)
			expect(deviceState).toMatchObject({
				...cloudIdentity,
				deviceRevision: 3
			})
		} finally {
			database.close()
		}
	})

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
		const ownerToken = 'owner-token-a'
		await expect(
			value.createDraftAndClaim(
				workspace,
				draftFixture(workspace.workspaceId, workspace.repositoryId, 2),
				ownerToken,
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

		const written = await value.createDraftAndClaim(
			workspace,
			draftWithRuntimeField,
			ownerToken,
			{
				repositoryRevision: 0,
				draftRevision: null
			}
		)
		expect(written).toMatchObject({
			value: {
				draft: createdDraft,
				lease: {
					leaseRevision: 0,
					acquiredAt: NOW,
					renewedAt: NOW,
					expiresAt: '2026-07-23T02:01:00.000Z'
				}
			},
			repositoryRevision: 1
		})
		expect(written.value.draft).not.toHaveProperty('transientViewState')
		expect(await value.readDraft(workspace, createdDraft.id)).toMatchObject({
			value: {
				draft: { status: 'ready', draft: createdDraft },
				lease: { status: 'live', lease: { leaseRevision: 0 } }
			},
			repositoryRevision: 1
		})
		expect(await value.listDrafts(workspace)).toMatchObject({
			value: [
				{
					draft: { status: 'ready', draft: createdDraft },
					lease: { status: 'live', lease: { leaseRevision: 0 } }
				}
			],
			repositoryRevision: 1
		})
		const noOpDraft = draftFixture(
			workspace.workspaceId,
			workspace.repositoryId,
			1,
			'2026-07-23T02:05:00.000Z'
		)
		await expect(
			value.writeDraft(workspace, noOpDraft, ownerToken, {
				repositoryRevision: 1,
				draftRevision: 0,
				leaseRevision: 0
			})
		).rejects.toMatchObject({ code: 'conflict', scope: 'draft-revision' })
		expect(await value.readDraft(workspace, createdDraft.id)).toMatchObject({
			repositoryRevision: 1,
			value: { draft: { metadata: { draftRevision: 0 } } }
		})

		const wrongOwnerToken = 'owner-token-must-never-leak'
		let wrongOwnerError: unknown
		try {
			await value.deleteDraft(workspace, createdDraft.id, wrongOwnerToken, {
				repositoryRevision: 1,
				draftRevision: 0,
				leaseRevision: 0
			})
		} catch (error) {
			wrongOwnerError = error
		}
		expect(wrongOwnerError).toMatchObject({
			code: 'conflict',
			scope: 'draft-lease'
		})
		expect(JSON.stringify(wrongOwnerError)).not.toContain(wrongOwnerToken)

		const updatedDraft = draftFixture(
			workspace.workspaceId,
			workspace.repositoryId,
			1,
			'2026-07-23T02:10:00.000Z'
		)
		updatedDraft.payload.ui.filter = 'review'
		expect(
			await value.writeDraft(workspace, updatedDraft, ownerToken, {
				repositoryRevision: 1,
				draftRevision: 0,
				leaseRevision: 0
			})
		).toMatchObject({ value: updatedDraft, repositoryRevision: 2 })
		await expect(
			value.writeDraft(workspace, updatedDraft, ownerToken, {
				repositoryRevision: 2,
				draftRevision: 0,
				leaseRevision: 0
			})
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'draft-revision',
			actual: 1
		})
		expect(
			await value.deleteDraft(workspace, updatedDraft.id, ownerToken, {
				repositoryRevision: 2,
				draftRevision: 1,
				leaseRevision: 0
			})
		).toEqual({ value: undefined, repositoryRevision: 3 })
		expect(await value.readDraft(workspace, updatedDraft.id)).toEqual({
			value: null,
			repositoryRevision: 3
		})
	})

	it('fences draft owners across renew, release, takeover, and exact expiry', async () => {
		const name = databaseName('draft-lease-lifecycle')
		let currentTime = NOW
		const first = await catalog(name, {
			now: () => new Date(currentTime)
		})
		const second = await catalog(name, {
			now: () => new Date(currentTime)
		})
		const observedChanges: unknown[] = []
		first.subscribe((change) => observedChanges.push(change))
		second.subscribe((change) => observedChanges.push(change))
		const created = await first.createWorkspace(
			{ id: 'workspace-a', name: 'Lease lifecycle' },
			0
		)
		const workspace = identity(created.value)
		const draft = draftFixture(workspace.workspaceId, workspace.repositoryId)
		const ownerA = 'lease-owner-a-secret'
		const ownerB = 'lease-owner-b-secret'
		const ownerC = 'lease-owner-c-secret'
		const ownerD = 'lease-owner-d-secret'

		const claimedA = await first.createDraftAndClaim(workspace, draft, ownerA, {
			repositoryRevision: 0,
			draftRevision: null
		})
		expect(claimedA).toMatchObject({
			repositoryRevision: 1,
			value: {
				draft: { draftRevision: 0 },
				lease: {
					leaseRevision: 0,
					expiresAt: '2026-07-23T02:01:00.000Z'
				}
			}
		})

		currentTime = '2026-07-23T02:00:20.000Z'
		const renewed = await first.renewDraftLease(workspace, draft.id, ownerA, {
			repositoryRevision: 1,
			leaseRevision: 0
		})
		expect(renewed).toMatchObject({
			repositoryRevision: 2,
			value: {
				leaseRevision: 1,
				acquiredAt: NOW,
				renewedAt: currentTime,
				expiresAt: '2026-07-23T02:01:20.000Z'
			}
		})
		expect(
			await readWorkspaceManifest(name, workspace.workspaceId)
		).toMatchObject({
			contentRevision: 0,
			repositoryRevision: 2
		})
		expect(await second.readDraft(workspace, draft.id)).toMatchObject({
			repositoryRevision: 2,
			value: {
				draft: { metadata: { draftRevision: 0 } },
				lease: { status: 'live', lease: { leaseRevision: 1 } }
			}
		})

		await first.releaseDraftLease(workspace, draft.id, ownerA, {
			repositoryRevision: 2,
			leaseRevision: 1
		})
		expect(await second.readDraft(workspace, draft.id)).toMatchObject({
			repositoryRevision: 3,
			value: { lease: { status: 'unclaimed', leaseRevision: 2 } }
		})
		const claimedB = await second.claimDraft(workspace, draft.id, ownerB, 3)
		expect(claimedB).toMatchObject({
			repositoryRevision: 4,
			value: { lease: { leaseRevision: 3 } }
		})
		const claimedC = await first.takeOverDraft(workspace, draft.id, ownerC, {
			repositoryRevision: 4,
			leaseRevision: 3
		})
		expect(claimedC).toMatchObject({
			repositoryRevision: 5,
			value: { lease: { leaseRevision: 4 } }
		})

		await expect(
			second.renewDraftLease(workspace, draft.id, ownerB, {
				repositoryRevision: 5,
				leaseRevision: 4
			})
		).rejects.toMatchObject({ code: 'conflict', scope: 'draft-lease' })
		const changedDraft = draftFixture(
			workspace.workspaceId,
			workspace.repositoryId,
			1,
			'2026-07-23T02:00:21.000Z'
		)
		changedDraft.payload.ui.filter = 'review'
		await expect(
			second.writeDraft(workspace, changedDraft, ownerB, {
				repositoryRevision: 5,
				draftRevision: 0,
				leaseRevision: 4
			})
		).rejects.toMatchObject({ code: 'conflict', scope: 'draft-lease' })
		await expect(
			second.deleteDraft(workspace, draft.id, ownerB, {
				repositoryRevision: 5,
				draftRevision: 0,
				leaseRevision: 4
			})
		).rejects.toMatchObject({ code: 'conflict', scope: 'draft-lease' })

		currentTime = '2026-07-23T02:01:20.000Z'
		expect(await second.readDraft(workspace, draft.id)).toMatchObject({
			value: { lease: { status: 'expired', lease: { leaseRevision: 4 } } }
		})
		const claimedD = await second.claimDraft(workspace, draft.id, ownerD, 5)
		expect(claimedD).toMatchObject({
			repositoryRevision: 6,
			value: { lease: { leaseRevision: 5 } }
		})
		await expect(
			first.renewDraftLease(workspace, draft.id, ownerC, {
				repositoryRevision: 6,
				leaseRevision: 5
			})
		).rejects.toMatchObject({ code: 'conflict', scope: 'draft-lease' })

		await vi.waitFor(() => expect(observedChanges.length).toBeGreaterThan(0))
		const serializedChanges = JSON.stringify(observedChanges)
		for (const owner of [ownerA, ownerB, ownerC, ownerD]) {
			expect(serializedChanges).not.toContain(owner)
		}
	})

	it('isolates invalid and incompatible payloads while preserving metadata deletion', async () => {
		const name = databaseName('draft-payload-isolation')
		const value = await catalog(name)
		const created = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Payload isolation' },
			0
		)
		const workspace = identity(created.value)
		const draft = draftFixture(workspace.workspaceId, workspace.repositoryId)
		const ownerToken = 'payload-repair-owner'
		await value.createDraftAndClaim(workspace, draft, ownerToken, {
			repositoryRevision: 0,
			draftRevision: null
		})
		await replaceDraftSerializedPayload(
			name,
			workspace.workspaceId,
			workspace.repositoryId,
			draft.id,
			'{'
		)

		expect(await value.readDraft(workspace, draft.id)).toMatchObject({
			repositoryRevision: 1,
			value: {
				draft: {
					status: 'invalid',
					metadata: { id: draft.id, draftRevision: 0 }
				},
				lease: { status: 'live', lease: { leaseRevision: 0 } }
			}
		})
		expect(await value.listDrafts(workspace)).toMatchObject({
			value: [{ draft: { status: 'invalid' } }]
		})
		await value.deleteDraft(workspace, draft.id, ownerToken, {
			repositoryRevision: 1,
			draftRevision: 0,
			leaseRevision: 0
		})

		await value.createDraftAndClaim(workspace, draft, ownerToken, {
			repositoryRevision: 2,
			draftRevision: null
		})
		await replaceDraftSerializedPayload(
			name,
			workspace.workspaceId,
			workspace.repositoryId,
			draft.id,
			JSON.stringify({ ...draft.payload, schemaVersion: 999 })
		)
		expect(await value.readDraft(workspace, draft.id)).toMatchObject({
			repositoryRevision: 3,
			value: {
				draft: {
					status: 'incompatible',
					schemaVersion: 999,
					reason: 'future-schema',
					metadata: { id: draft.id, draftRevision: 0 }
				}
			}
		})
		await expect(
			value.deleteDraft(workspace, draft.id, ownerToken, {
				repositoryRevision: 3,
				draftRevision: 0,
				leaseRevision: 0
			})
		).resolves.toEqual({ value: undefined, repositoryRevision: 4 })
	})

	it('atomically replaces a draft and claims the replacement behind an observed lease fence', async () => {
		const name = databaseName('replace-and-claim')
		const value = await catalog(name)
		const created = await value.createWorkspace(
			{ id: 'workspace-a', name: 'Replace draft' },
			0
		)
		const workspace = identity(created.value)
		const original = draftFixture(workspace.workspaceId, workspace.repositoryId)
		await value.createDraftAndClaim(workspace, original, 'original-owner', {
			repositoryRevision: 0,
			draftRevision: null
		})
		const replacementFixture = draftFixture(
			workspace.workspaceId,
			workspace.repositoryId
		)
		replacementFixture.payload.id = 'draft-b'
		const replacement = { ...replacementFixture, id: 'draft-b' }

		await expect(
			value.replaceDraftAndClaim(workspace, replacement, 'replacement-owner', {
				repositoryRevision: 1,
				draftId: original.id,
				draftRevision: 0,
				observedLeaseRevision: 99
			})
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'draft-lease',
			expected: 99,
			actual: 0
		})
		const replaced = await value.replaceDraftAndClaim(
			workspace,
			replacement,
			'replacement-owner',
			{
				repositoryRevision: 1,
				draftId: original.id,
				draftRevision: 0,
				observedLeaseRevision: 0
			}
		)
		expect(replaced).toMatchObject({
			repositoryRevision: 2,
			value: {
				draft: { id: 'draft-b', draftRevision: 0 },
				lease: { leaseRevision: 0 }
			}
		})
		expect(await value.readDraft(workspace, original.id)).toEqual({
			value: null,
			repositoryRevision: 2
		})
		expect(await value.readDraft(workspace, replacement.id)).toMatchObject({
			repositoryRevision: 2,
			value: {
				draft: { status: 'ready', draft: { id: 'draft-b' } },
				lease: { status: 'live', lease: { leaseRevision: 0 } }
			}
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
			value.createDraftAndClaim(staleIdentity, staleDraft, 'stale-owner', {
				repositoryRevision: 0,
				draftRevision: null
			})
		).rejects.toMatchObject(notFound)
		await expect(
			value.deleteDraft(staleIdentity, staleDraft.id, 'stale-owner', {
				repositoryRevision: 0,
				draftRevision: 0,
				leaseRevision: 0
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

	it('rolls back every create-and-claim write with its manifest revision', async () => {
		const name = databaseName('abort-draft')
		let abortOrdinal: number | null = null
		const value = await catalog(name, {
			createBroadcastChannel: () => null,
			onTransactionStep: ({ command, ordinal }) => {
				if (command === 'create-and-claim-draft' && ordinal === abortOrdinal) {
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

		for (const ordinal of [1, 2, 3]) {
			abortOrdinal = ordinal
			await expect(
				value.createDraftAndClaim(workspace, draft, 'atomic-owner', {
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

	it('rolls back every lease, draft, replace, and delete write at each step', async () => {
		type ScenarioContext = Readonly<{
			value: BrowserWorkspaceCatalog
			workspace: BrowserWorkspaceIdentity
			draft: BrowserWorkflowDraft
			ownerToken: string
		}>
		const scenarios: ReadonlyArray<{
			label: string
			command: string
			ordinals: readonly number[]
			prepare?: (context: ScenarioContext) => Promise<number>
			action: (
				context: ScenarioContext,
				repositoryRevision: number
			) => Promise<unknown>
			assert: (
				context: ScenarioContext,
				repositoryRevision: number
			) => Promise<void>
		}> = [
			{
				label: 'renew',
				command: 'renew-draft-lease',
				ordinals: [1, 2],
				action: ({ value, workspace, draft, ownerToken }, revision) =>
					value.renewDraftLease(workspace, draft.id, ownerToken, {
						repositoryRevision: revision,
						leaseRevision: 0
					}),
				assert: async ({ value, workspace, draft }, revision) => {
					expect(await value.readDraft(workspace, draft.id)).toMatchObject({
						repositoryRevision: revision,
						value: { lease: { status: 'live', lease: { leaseRevision: 0 } } }
					})
				}
			},
			{
				label: 'release',
				command: 'release-draft-lease',
				ordinals: [1, 2],
				action: ({ value, workspace, draft, ownerToken }, revision) =>
					value.releaseDraftLease(workspace, draft.id, ownerToken, {
						repositoryRevision: revision,
						leaseRevision: 0
					}),
				assert: async ({ value, workspace, draft }, revision) => {
					expect(await value.readDraft(workspace, draft.id)).toMatchObject({
						repositoryRevision: revision,
						value: { lease: { status: 'live', lease: { leaseRevision: 0 } } }
					})
				}
			},
			{
				label: 'claim',
				command: 'claim-draft-lease',
				ordinals: [1, 2],
				prepare: async ({ value, workspace, draft, ownerToken }) => {
					await value.releaseDraftLease(workspace, draft.id, ownerToken, {
						repositoryRevision: 1,
						leaseRevision: 0
					})
					return 2
				},
				action: ({ value, workspace, draft }, revision) =>
					value.claimDraft(workspace, draft.id, 'next-owner', revision),
				assert: async ({ value, workspace, draft }, revision) => {
					expect(await value.readDraft(workspace, draft.id)).toMatchObject({
						repositoryRevision: revision,
						value: { lease: { status: 'unclaimed', leaseRevision: 1 } }
					})
				}
			},
			{
				label: 'takeover',
				command: 'take-over-draft-lease',
				ordinals: [1, 2],
				action: ({ value, workspace, draft }, revision) =>
					value.takeOverDraft(workspace, draft.id, 'next-owner', {
						repositoryRevision: revision,
						leaseRevision: 0
					}),
				assert: async ({ value, workspace, draft }, revision) => {
					expect(await value.readDraft(workspace, draft.id)).toMatchObject({
						repositoryRevision: revision,
						value: { lease: { status: 'live', lease: { leaseRevision: 0 } } }
					})
				}
			},
			{
				label: 'write',
				command: 'write-draft',
				ordinals: [1, 2],
				action: ({ value, workspace, draft, ownerToken }, revision) => {
					const changed = draftFixture(
						workspace.workspaceId,
						workspace.repositoryId,
						1,
						'2026-07-23T02:00:01.000Z'
					)
					changed.payload.ui.filter = 'review'
					return value.writeDraft(workspace, changed, ownerToken, {
						repositoryRevision: revision,
						draftRevision: draft.draftRevision,
						leaseRevision: 0
					})
				},
				assert: async ({ value, workspace, draft }, revision) => {
					expect(await value.readDraft(workspace, draft.id)).toMatchObject({
						repositoryRevision: revision,
						value: { draft: { metadata: { draftRevision: 0 } } }
					})
				}
			},
			{
				label: 'replace',
				command: 'replace-and-claim-draft',
				ordinals: [1, 2, 3, 4, 5],
				action: ({ value, workspace, draft }, revision) => {
					const replacement = draftFixture(
						workspace.workspaceId,
						workspace.repositoryId
					)
					replacement.payload.id = 'draft-b'
					return value.replaceDraftAndClaim(
						workspace,
						{ ...replacement, id: 'draft-b' },
						'next-owner',
						{
							repositoryRevision: revision,
							draftId: draft.id,
							draftRevision: draft.draftRevision,
							observedLeaseRevision: 0
						}
					)
				},
				assert: async ({ value, workspace, draft }, revision) => {
					expect(await value.readDraft(workspace, draft.id)).toMatchObject({
						repositoryRevision: revision,
						value: { draft: { status: 'ready' }, lease: { status: 'live' } }
					})
					expect(await value.readDraft(workspace, 'draft-b')).toEqual({
						repositoryRevision: revision,
						value: null
					})
				}
			},
			{
				label: 'delete',
				command: 'delete-draft',
				ordinals: [1, 2, 3],
				action: ({ value, workspace, draft, ownerToken }, revision) =>
					value.deleteDraft(workspace, draft.id, ownerToken, {
						repositoryRevision: revision,
						draftRevision: draft.draftRevision,
						leaseRevision: 0
					}),
				assert: async ({ value, workspace, draft }, revision) => {
					expect(await value.readDraft(workspace, draft.id)).toMatchObject({
						repositoryRevision: revision,
						value: { draft: { status: 'ready' }, lease: { status: 'live' } }
					})
				}
			}
		]

		for (const scenario of scenarios) {
			for (const ordinal of scenario.ordinals) {
				let abortOrdinal: number | null = null
				const name = databaseName(`abort-${scenario.label}-${ordinal}`)
				const value = await catalog(name, {
					createBroadcastChannel: () => null,
					onTransactionStep: ({ command, ordinal: step }) => {
						if (command === scenario.command && step === abortOrdinal) {
							throw new Error(`Abort ${command} step ${step}`)
						}
					}
				})
				const created = await value.createWorkspace(
					{ id: 'workspace-a', name: `Abort ${scenario.label}` },
					0
				)
				const workspace = identity(created.value)
				const draft = draftFixture(
					workspace.workspaceId,
					workspace.repositoryId
				)
				const ownerToken = 'atomic-owner'
				await value.createDraftAndClaim(workspace, draft, ownerToken, {
					repositoryRevision: 0,
					draftRevision: null
				})
				const context = { value, workspace, draft, ownerToken }
				const repositoryRevision = scenario.prepare
					? await scenario.prepare(context)
					: 1
				abortOrdinal = ordinal

				await expect(
					scenario.action(context, repositoryRevision)
				).rejects.toMatchObject({ code: 'unknown' })
				await scenario.assert(context, repositoryRevision)
			}
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
		await countCatalog.createDraftAndClaim(
			countedWorkspace,
			draftFixture(countedWorkspace.workspaceId, countedWorkspace.repositoryId),
			'count-owner',
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
			await value.createDraftAndClaim(
				workspace,
				draftFixture(workspace.workspaceId, workspace.repositoryId),
				'preserved-owner',
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
				value: { draft: { metadata: { id: 'draft-a' } } },
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
