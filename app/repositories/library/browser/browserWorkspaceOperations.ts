import {
	type BrowserDraftRevisionAuthority,
	browserDraftRevisionStoreName,
	readBrowserDraftRevisionState
} from './browserDraftRevision'
import {
	decodeBrowserCopyReceipt,
	decodeBrowserDraftLease,
	decodeBrowserDraftLeaseRow,
	decodeBrowserStorageHealth,
	decodeBrowserWorkflowDraftReadState,
	decodeBrowserWorkflowDraftRow,
	decodeBrowserWorkspaceManifest,
	decodeBrowserWorkspaceOperations
} from './browserLibraryCodecs'
import {
	BrowserRepositoryConflictError,
	BrowserRepositoryNotFoundError,
	BrowserStorageCodecError
} from './browserLibraryErrors'
import {
	browserLibraryTimestamp,
	runBrowserLibraryReadTransaction,
	runBrowserLibraryTransaction
} from './browserLibraryRuntime'
import {
	BROWSER_LIBRARY_DRAFT_IDENTITY_INDEX,
	BROWSER_LIBRARY_STORES,
	requestResult
} from './browserLibrarySchema'
import type {
	BrowserCopyReceipt,
	BrowserDraftLeaseState,
	BrowserLibraryDependencies,
	BrowserStorageHealth,
	BrowserWorkflowDraftEntry,
	BrowserWorkspaceIdentity,
	BrowserWorkspaceManifest,
	BrowserWorkspaceMutationResult,
	BrowserWorkspaceOperations,
	BrowserWorkspaceReadResult
} from './browserLibraryTypes'

export type BrowserOperationalCommit<T> = Readonly<{
	result: BrowserWorkspaceMutationResult<T>
	contentRevision: number
}>

function requiredManifest(
	value: unknown,
	identity: BrowserWorkspaceIdentity
): BrowserWorkspaceManifest {
	if (value === undefined) throw new BrowserRepositoryNotFoundError('workspace')
	const manifest = decodeBrowserWorkspaceManifest(value)
	if (
		manifest.id !== identity.workspaceId ||
		manifest.repositoryId !== identity.repositoryId
	) {
		throw new BrowserRepositoryNotFoundError('workspace')
	}
	return manifest
}

function requiredOperations(
	value: unknown,
	workspaceId: string
): BrowserWorkspaceOperations {
	if (value === undefined) {
		throw new BrowserStorageCodecError(
			'/operations',
			'The Local library operational metadata is missing.'
		)
	}
	return decodeBrowserWorkspaceOperations(value, workspaceId)
}

function assertRepositoryRevision(
	manifest: BrowserWorkspaceManifest,
	expected: number
) {
	if (manifest.repositoryRevision !== expected) {
		throw new BrowserRepositoryConflictError(
			'repository-revision',
			expected,
			manifest.repositoryRevision
		)
	}
}

function nextOperationalManifest(
	manifest: BrowserWorkspaceManifest,
	updatedAt: string
): BrowserWorkspaceManifest {
	return decodeBrowserWorkspaceManifest({
		...manifest,
		repositoryRevision: manifest.repositoryRevision + 1,
		updatedAt
	})
}

export function readBrowserWorkspaceOperations(
	database: IDBDatabase,
	identity: BrowserWorkspaceIdentity
): Promise<BrowserWorkspaceReadResult<BrowserWorkspaceOperations>> {
	return runBrowserLibraryReadTransaction(
		database,
		[BROWSER_LIBRARY_STORES.workspaces, BROWSER_LIBRARY_STORES.operations],
		async (transaction) => {
			const [storedManifest, storedOperations] = await Promise.all([
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.workspaces)
						.get(identity.workspaceId)
				),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.operations)
						.get(identity.workspaceId)
				)
			])
			const manifest = requiredManifest(storedManifest, identity)
			return {
				value: requiredOperations(storedOperations, identity.workspaceId),
				repositoryRevision: manifest.repositoryRevision
			}
		}
	)
}

function draftLeaseState(
	storedLease: unknown,
	identity: BrowserWorkspaceIdentity,
	draftId: string,
	now: string
): BrowserDraftLeaseState {
	if (storedLease === undefined) {
		return { status: 'unclaimed', leaseRevision: null }
	}
	const row = decodeBrowserDraftLeaseRow(storedLease, identity, draftId)
	if (row.ownerToken === null) {
		return { status: 'unclaimed', leaseRevision: row.leaseRevision }
	}
	return {
		status: Date.parse(now) >= Date.parse(row.expiresAt) ? 'expired' : 'live',
		lease: decodeBrowserDraftLease(row)
	}
}

export function listBrowserWorkspaceDrafts(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity
): Promise<BrowserWorkspaceReadResult<readonly BrowserWorkflowDraftEntry[]>> {
	const now = browserLibraryTimestamp(dependencies)
	return runBrowserLibraryReadTransaction(
		database,
		[
			browserDraftRevisionStoreName(authority),
			BROWSER_LIBRARY_STORES.drafts,
			BROWSER_LIBRARY_STORES.draftLeases
		],
		async (transaction) => {
			const [revisionState, storedDrafts, storedLeases] = await Promise.all([
				readBrowserDraftRevisionState(transaction, authority, identity, true),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.drafts)
						.index(BROWSER_LIBRARY_DRAFT_IDENTITY_INDEX)
						.getAll([identity.workspaceId, identity.repositoryId])
				),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.draftLeases)
						.index(BROWSER_LIBRARY_DRAFT_IDENTITY_INDEX)
						.getAll([identity.workspaceId, identity.repositoryId])
				)
			])
			if (
				!revisionState.exists &&
				(storedDrafts.length > 0 || storedLeases.length > 0)
			) {
				throw new BrowserStorageCodecError('/deviceDraftRepository')
			}
			const leases = new Map<string, unknown>()
			for (const storedLease of storedLeases) {
				const row = decodeBrowserDraftLeaseRow(
					storedLease,
					identity,
					String((storedLease as { draftId?: unknown }).draftId)
				)
				if (leases.has(row.draftId)) {
					throw new BrowserStorageCodecError('/draftLease/draftId')
				}
				leases.set(row.draftId, row)
			}
			const drafts = storedDrafts
				.map((storedDraft): BrowserWorkflowDraftEntry => {
					const row = decodeBrowserWorkflowDraftRow(
						storedDraft,
						identity.workspaceId,
						identity.repositoryId
					)
					const lease = leases.get(row.id)
					leases.delete(row.id)
					return {
						draft: decodeBrowserWorkflowDraftReadState(row),
						lease: draftLeaseState(lease, identity, row.id, now)
					}
				})
				.sort(
					(left, right) =>
						right.draft.metadata.updatedAt.localeCompare(
							left.draft.metadata.updatedAt
						) || left.draft.metadata.id.localeCompare(right.draft.metadata.id)
				)
			if (leases.size > 0) {
				throw new BrowserStorageCodecError('/draftLease/orphan')
			}
			return {
				value: drafts,
				repositoryRevision: revisionState.repositoryRevision
			}
		}
	)
}

export function readBrowserWorkspaceDraft(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	draftId: string
): Promise<BrowserWorkspaceReadResult<BrowserWorkflowDraftEntry | null>> {
	const now = browserLibraryTimestamp(dependencies)
	return runBrowserLibraryReadTransaction(
		database,
		[
			browserDraftRevisionStoreName(authority),
			BROWSER_LIBRARY_STORES.drafts,
			BROWSER_LIBRARY_STORES.draftLeases
		],
		async (transaction) => {
			const [revisionState, storedDraft, storedLease] = await Promise.all([
				readBrowserDraftRevisionState(transaction, authority, identity, true),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.drafts)
						.get([identity.workspaceId, identity.repositoryId, draftId])
				),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.draftLeases)
						.get([identity.workspaceId, identity.repositoryId, draftId])
				)
			])
			if (
				!revisionState.exists &&
				(storedDraft !== undefined || storedLease !== undefined)
			) {
				throw new BrowserStorageCodecError('/deviceDraftRepository')
			}
			if (storedDraft === undefined && storedLease !== undefined) {
				throw new BrowserStorageCodecError('/draftLease/orphan')
			}
			return {
				value:
					storedDraft === undefined
						? null
						: (() => {
								const row = decodeBrowserWorkflowDraftRow(
									storedDraft,
									identity.workspaceId,
									identity.repositoryId
								)
								return {
									draft: decodeBrowserWorkflowDraftReadState(row),
									lease: draftLeaseState(storedLease, identity, draftId, now)
								}
							})(),
				repositoryRevision: revisionState.repositoryRevision
			}
		}
	)
}

async function mutateBrowserWorkspaceOperations(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	command: string,
	identity: BrowserWorkspaceIdentity,
	expectedRepositoryRevision: number,
	committedAt: string,
	update: (
		operations: BrowserWorkspaceOperations,
		manifest: BrowserWorkspaceManifest
	) => BrowserWorkspaceOperations
): Promise<BrowserOperationalCommit<BrowserWorkspaceOperations>> {
	return runBrowserLibraryTransaction(
		database,
		[BROWSER_LIBRARY_STORES.workspaces, BROWSER_LIBRARY_STORES.operations],
		command,
		dependencies,
		async (transaction, writer) => {
			const workspaceStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.workspaces
			)
			const operationsStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.operations
			)
			const [storedManifest, storedOperations] = await Promise.all([
				requestResult(workspaceStore.get(identity.workspaceId)),
				requestResult(operationsStore.get(identity.workspaceId))
			])
			const manifest = requiredManifest(storedManifest, identity)
			assertRepositoryRevision(manifest, expectedRepositoryRevision)
			const operations = requiredOperations(
				storedOperations,
				identity.workspaceId
			)
			const updatedOperations = decodeBrowserWorkspaceOperations(
				update(operations, manifest),
				identity.workspaceId
			)
			const updatedManifest = nextOperationalManifest(manifest, committedAt)
			writer.put(operationsStore, updatedOperations)
			writer.put(workspaceStore, updatedManifest)
			return {
				result: {
					value: updatedOperations,
					repositoryRevision: updatedManifest.repositoryRevision
				},
				contentRevision: updatedManifest.contentRevision
			}
		}
	)
}

export function recordBrowserWorkspaceExport(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	identity: BrowserWorkspaceIdentity,
	contentRevision: number,
	expectedRepositoryRevision: number,
	committedAt: string,
	exportedAt = committedAt
): Promise<BrowserOperationalCommit<BrowserWorkspaceOperations>> {
	return mutateBrowserWorkspaceOperations(
		database,
		dependencies,
		'record-export',
		identity,
		expectedRepositoryRevision,
		committedAt,
		(operations, manifest) => {
			if (
				contentRevision > manifest.contentRevision ||
				(operations.lastExportedContentRevision !== null &&
					contentRevision < operations.lastExportedContentRevision)
			) {
				throw new BrowserRepositoryConflictError(
					'export-revision',
					manifest.contentRevision,
					contentRevision,
					'The exported Local library revision is not current for this workspace.'
				)
			}
			return {
				...operations,
				lastExportedContentRevision: contentRevision,
				lastExportedAt: exportedAt
			}
		}
	)
}

export function writeBrowserWorkspaceCopyReceipt(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	identity: BrowserWorkspaceIdentity,
	receipt: BrowserCopyReceipt | null,
	expectedRepositoryRevision: number,
	committedAt: string
): Promise<BrowserOperationalCommit<BrowserWorkspaceOperations>> {
	const decodedReceipt =
		receipt === null ? null : decodeBrowserCopyReceipt(receipt)
	return mutateBrowserWorkspaceOperations(
		database,
		dependencies,
		'write-copy-receipt',
		identity,
		expectedRepositoryRevision,
		committedAt,
		(operations) => ({ ...operations, copyReceipt: decodedReceipt })
	)
}

export function writeBrowserWorkspaceStorageHealth(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	identity: BrowserWorkspaceIdentity,
	health: BrowserStorageHealth,
	expectedRepositoryRevision: number,
	committedAt: string
): Promise<BrowserOperationalCommit<BrowserWorkspaceOperations>> {
	const decodedHealth = decodeBrowserStorageHealth(health)
	return mutateBrowserWorkspaceOperations(
		database,
		dependencies,
		'write-storage-health',
		identity,
		expectedRepositoryRevision,
		committedAt,
		(operations) => ({ ...operations, storageHealth: decodedHealth })
	)
}
