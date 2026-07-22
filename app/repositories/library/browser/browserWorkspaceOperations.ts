import {
	decodeBrowserCopyReceipt,
	decodeBrowserStorageHealth,
	decodeBrowserWorkflowDraft,
	decodeBrowserWorkflowDraftRow,
	decodeBrowserWorkspaceManifest,
	decodeBrowserWorkspaceOperations,
	encodeBrowserWorkflowDraftRow
} from './browserLibraryCodecs'
import {
	BrowserRepositoryConflictError,
	BrowserRepositoryNotFoundError,
	BrowserStorageCodecError
} from './browserLibraryErrors'
import {
	runBrowserLibraryReadTransaction,
	runBrowserLibraryTransaction
} from './browserLibraryRuntime'
import {
	BROWSER_LIBRARY_DRAFT_KIND_INDEX,
	BROWSER_LIBRARY_STORES,
	BROWSER_LIBRARY_WORKSPACE_INDEX,
	requestResult
} from './browserLibrarySchema'
import type {
	BrowserCopyReceipt,
	BrowserDraftCas,
	BrowserLibraryDependencies,
	BrowserStorageHealth,
	BrowserWorkflowDraft,
	BrowserWorkspaceManifest,
	BrowserWorkspaceMutationResult,
	BrowserWorkspaceOperations,
	BrowserWorkspaceReadResult
} from './browserLibraryTypes'

export type BrowserOperationalCommit<T> = Readonly<{
	result: BrowserWorkspaceMutationResult<T>
	contentRevision: number
}>

function requiredManifest(value: unknown): BrowserWorkspaceManifest {
	if (value === undefined) throw new BrowserRepositoryNotFoundError('workspace')
	return decodeBrowserWorkspaceManifest(value)
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
	workspaceId: string
): Promise<BrowserWorkspaceReadResult<BrowserWorkspaceOperations>> {
	return runBrowserLibraryReadTransaction(
		database,
		[BROWSER_LIBRARY_STORES.workspaces, BROWSER_LIBRARY_STORES.operations],
		async (transaction) => {
			const [storedManifest, storedOperations] = await Promise.all([
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.workspaces)
						.get(workspaceId)
				),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.operations)
						.get(workspaceId)
				)
			])
			const manifest = requiredManifest(storedManifest)
			return {
				value: requiredOperations(storedOperations, workspaceId),
				repositoryRevision: manifest.repositoryRevision
			}
		}
	)
}

export function listBrowserWorkspaceDrafts(
	database: IDBDatabase,
	workspaceId: string
): Promise<BrowserWorkspaceReadResult<readonly BrowserWorkflowDraft[]>> {
	return runBrowserLibraryReadTransaction(
		database,
		[BROWSER_LIBRARY_STORES.workspaces, BROWSER_LIBRARY_STORES.drafts],
		async (transaction) => {
			const [storedManifest, storedDrafts] = await Promise.all([
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.workspaces)
						.get(workspaceId)
				),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.drafts)
						.index(BROWSER_LIBRARY_WORKSPACE_INDEX)
						.getAll(workspaceId)
				)
			])
			const manifest = requiredManifest(storedManifest)
			const drafts = storedDrafts
				.map((row) =>
					decodeBrowserWorkflowDraft(
						decodeBrowserWorkflowDraftRow(row, workspaceId)
					)
				)
				.sort(
					(left, right) =>
						right.updatedAt.localeCompare(left.updatedAt) ||
						left.id.localeCompare(right.id)
				)
			return {
				value: drafts,
				repositoryRevision: manifest.repositoryRevision
			}
		}
	)
}

export function readBrowserWorkspaceDraft(
	database: IDBDatabase,
	workspaceId: string,
	draftId: string
): Promise<BrowserWorkspaceReadResult<BrowserWorkflowDraft | null>> {
	return runBrowserLibraryReadTransaction(
		database,
		[BROWSER_LIBRARY_STORES.workspaces, BROWSER_LIBRARY_STORES.drafts],
		async (transaction) => {
			const [storedManifest, storedDraft] = await Promise.all([
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.workspaces)
						.get(workspaceId)
				),
				requestResult(
					transaction
						.objectStore(BROWSER_LIBRARY_STORES.drafts)
						.get([workspaceId, draftId])
				)
			])
			const manifest = requiredManifest(storedManifest)
			return {
				value:
					storedDraft === undefined
						? null
						: decodeBrowserWorkflowDraft(
								decodeBrowserWorkflowDraftRow(storedDraft, workspaceId)
							),
				repositoryRevision: manifest.repositoryRevision
			}
		}
	)
}

async function mutateBrowserWorkspaceOperations(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	command: string,
	workspaceId: string,
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
				requestResult(workspaceStore.get(workspaceId)),
				requestResult(operationsStore.get(workspaceId))
			])
			const manifest = requiredManifest(storedManifest)
			assertRepositoryRevision(manifest, expectedRepositoryRevision)
			const operations = requiredOperations(storedOperations, workspaceId)
			const updatedOperations = decodeBrowserWorkspaceOperations(
				update(operations, manifest),
				workspaceId
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
	workspaceId: string,
	contentRevision: number,
	expectedRepositoryRevision: number,
	committedAt: string,
	exportedAt = committedAt
): Promise<BrowserOperationalCommit<BrowserWorkspaceOperations>> {
	return mutateBrowserWorkspaceOperations(
		database,
		dependencies,
		'record-export',
		workspaceId,
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
	workspaceId: string,
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
		workspaceId,
		expectedRepositoryRevision,
		committedAt,
		(operations) => ({ ...operations, copyReceipt: decodedReceipt })
	)
}

export function writeBrowserWorkspaceStorageHealth(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	workspaceId: string,
	health: BrowserStorageHealth,
	expectedRepositoryRevision: number,
	committedAt: string
): Promise<BrowserOperationalCommit<BrowserWorkspaceOperations>> {
	const decodedHealth = decodeBrowserStorageHealth(health)
	return mutateBrowserWorkspaceOperations(
		database,
		dependencies,
		'write-storage-health',
		workspaceId,
		expectedRepositoryRevision,
		committedAt,
		(operations) => ({ ...operations, storageHealth: decodedHealth })
	)
}

export function writeBrowserWorkspaceDraft(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	workspaceId: string,
	draft: BrowserWorkflowDraft,
	expected: BrowserDraftCas,
	committedAt: string
): Promise<BrowserOperationalCommit<BrowserWorkflowDraft>> {
	const encodedDraft = encodeBrowserWorkflowDraftRow(workspaceId, draft)
	const persistedDraft = decodeBrowserWorkflowDraft(encodedDraft)
	return runBrowserLibraryTransaction(
		database,
		[BROWSER_LIBRARY_STORES.workspaces, BROWSER_LIBRARY_STORES.drafts],
		'write-draft',
		dependencies,
		async (transaction, writer) => {
			const workspaceStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.workspaces
			)
			const draftStore = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
			const [storedManifest, storedDraft, storedKindDraft] = await Promise.all([
				requestResult(workspaceStore.get(workspaceId)),
				requestResult(draftStore.get([workspaceId, draft.id])),
				requestResult(
					draftStore
						.index(BROWSER_LIBRARY_DRAFT_KIND_INDEX)
						.get([workspaceId, draft.kind])
				)
			])
			const manifest = requiredManifest(storedManifest)
			assertRepositoryRevision(manifest, expected.repositoryRevision)

			if (expected.draftRevision === null) {
				if (persistedDraft.draftRevision !== 0) {
					throw new BrowserRepositoryConflictError(
						'draft-revision',
						0,
						persistedDraft.draftRevision,
						'A new Local library draft must start at revision 0.'
					)
				}
				if (storedDraft !== undefined || storedKindDraft !== undefined) {
					const existing = decodeBrowserWorkflowDraftRow(
						storedDraft ?? storedKindDraft,
						workspaceId
					)
					throw new BrowserRepositoryConflictError(
						storedDraft === undefined ? 'draft-kind' : 'draft-revision',
						null,
						existing.draftRevision
					)
				}
			} else {
				if (storedDraft === undefined) {
					throw new BrowserRepositoryNotFoundError('draft')
				}
				const existing = decodeBrowserWorkflowDraftRow(storedDraft, workspaceId)
				if (existing.draftRevision !== expected.draftRevision) {
					throw new BrowserRepositoryConflictError(
						'draft-revision',
						expected.draftRevision,
						existing.draftRevision
					)
				}
				if (draft.draftRevision !== expected.draftRevision + 1) {
					throw new BrowserRepositoryConflictError(
						'draft-revision',
						expected.draftRevision + 1,
						draft.draftRevision
					)
				}
				const existingKindDraft =
					storedKindDraft === undefined
						? null
						: decodeBrowserWorkflowDraftRow(storedKindDraft, workspaceId)
				if (existingKindDraft !== null && existingKindDraft.id !== draft.id) {
					throw new BrowserRepositoryConflictError('draft-kind', null, null)
				}
			}

			const updatedManifest = nextOperationalManifest(manifest, committedAt)
			writer.put(draftStore, encodedDraft)
			writer.put(workspaceStore, updatedManifest)
			return {
				result: {
					value: persistedDraft,
					repositoryRevision: updatedManifest.repositoryRevision
				},
				contentRevision: updatedManifest.contentRevision
			}
		}
	)
}

export function deleteBrowserWorkspaceDraft(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	workspaceId: string,
	draftId: string,
	expected: Omit<BrowserDraftCas, 'draftRevision'> & { draftRevision: number },
	committedAt: string
): Promise<BrowserOperationalCommit<void>> {
	return runBrowserLibraryTransaction(
		database,
		[BROWSER_LIBRARY_STORES.workspaces, BROWSER_LIBRARY_STORES.drafts],
		'delete-draft',
		dependencies,
		async (transaction, writer) => {
			const workspaceStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.workspaces
			)
			const draftStore = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
			const [storedManifest, storedDraft] = await Promise.all([
				requestResult(workspaceStore.get(workspaceId)),
				requestResult(draftStore.get([workspaceId, draftId]))
			])
			const manifest = requiredManifest(storedManifest)
			assertRepositoryRevision(manifest, expected.repositoryRevision)
			if (storedDraft === undefined) {
				throw new BrowserRepositoryNotFoundError('draft')
			}
			const draft = decodeBrowserWorkflowDraftRow(storedDraft, workspaceId)
			if (draft.draftRevision !== expected.draftRevision) {
				throw new BrowserRepositoryConflictError(
					'draft-revision',
					expected.draftRevision,
					draft.draftRevision
				)
			}
			const updatedManifest = nextOperationalManifest(manifest, committedAt)
			writer.delete(draftStore, [workspaceId, draftId])
			writer.put(workspaceStore, updatedManifest)
			return {
				result: {
					value: undefined,
					repositoryRevision: updatedManifest.repositoryRevision
				},
				contentRevision: updatedManifest.contentRevision
			}
		}
	)
}
