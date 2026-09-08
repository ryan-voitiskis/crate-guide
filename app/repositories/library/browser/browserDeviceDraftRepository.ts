import {
	listBrowserWorkspaceDrafts,
	readBrowserWorkspaceDraft
} from './browserDraftReads'
import { DEVICE_DRAFT_REVISION_AUTHORITY } from './browserDraftRevision'
import { BrowserLibraryBroadcaster } from './browserLibraryBroadcast'
import {
	BrowserStorageError,
	normalizeBrowserRepositoryError
} from './browserLibraryErrors'
import { browserLibraryTimestamp } from './browserLibraryRuntime'
import { openBrowserLibraryDatabase } from './browserLibrarySchema'
import {
	BROWSER_LIBRARY_DATABASE_NAME,
	type BrowserClaimedDraft,
	type BrowserClaimedDraftState,
	type BrowserDeviceDraftCas,
	type BrowserDeviceDraftLeaseCas,
	type BrowserDeviceDraftReadResult,
	type BrowserDeviceDraftReplaceCas,
	type BrowserDeviceDraftRepository,
	type BrowserDeviceDraftWriteCas,
	type BrowserDraftLease,
	type BrowserLibraryDependencies,
	type BrowserRepositoryChange,
	type BrowserWorkflowDraft,
	type BrowserWorkflowDraftEntry,
	type BrowserWorkspaceIdentity,
	type OpenBrowserDeviceDraftRepositoryOptions
} from './browserLibraryTypes'
import {
	type BrowserDraftOperationalCommit,
	claimBrowserWorkspaceDraft,
	createBrowserWorkspaceDraftAndClaim,
	deleteBrowserWorkspaceDraft,
	releaseBrowserWorkspaceDraftLease,
	renewBrowserWorkspaceDraftLease,
	replaceBrowserWorkspaceDraftAndClaim,
	takeOverBrowserWorkspaceDraft,
	writeBrowserWorkspaceDraft
} from './browserWorkspaceDrafts'

function deviceResult<T>(
	commit: BrowserDraftOperationalCommit<T>
): BrowserDeviceDraftReadResult<T> {
	return {
		value: commit.result.value,
		deviceRevision: commit.result.repositoryRevision
	}
}

class BrowserDeviceDraftRepositoryImpl implements BrowserDeviceDraftRepository {
	readonly #broadcaster: BrowserLibraryBroadcaster
	#commandTail: Promise<void> = Promise.resolve()
	#closed = false

	constructor(
		private readonly database: IDBDatabase,
		readonly identity: BrowserWorkspaceIdentity,
		private readonly dependencies: BrowserLibraryDependencies
	) {
		this.#broadcaster = new BrowserLibraryBroadcaster(
			dependencies,
			dependencies.databaseName ?? BROWSER_LIBRARY_DATABASE_NAME
		)
	}

	#ensureOpen() {
		if (this.#closed) {
			throw new BrowserStorageError(
				'unavailable',
				'This device-local draft repository connection is closed.'
			)
		}
	}

	#read<T>(callback: () => Promise<T>): Promise<T> {
		this.#ensureOpen()
		return callback().catch((error: unknown) => {
			throw normalizeBrowserRepositoryError(error)
		})
	}

	#enqueue<T>(callback: () => Promise<T>): Promise<T> {
		const command = this.#commandTail.then(async () => {
			this.#ensureOpen()
			try {
				return await callback()
			} catch (error) {
				throw normalizeBrowserRepositoryError(error)
			}
		})
		this.#commandTail = command.then(
			() => undefined,
			() => undefined
		)
		return command
	}

	#publish(
		draftIds: readonly string[],
		committedAt: string,
		type: 'commit' | 'delete' = 'commit'
	) {
		this.#broadcaster.publish({
			type,
			workspaceId: this.identity.workspaceId,
			repositoryId: this.identity.repositoryId,
			catalogRevision: null,
			// Device revisions are intentionally not library/server revisions.
			repositoryRevision: null,
			contentRevision: null,
			committedAt,
			invalidations: [{ entity: 'drafts', ids: [...draftIds] }]
		})
	}

	listDrafts(): Promise<
		BrowserDeviceDraftReadResult<readonly BrowserWorkflowDraftEntry[]>
	> {
		return this.#read(async () => {
			const result = await listBrowserWorkspaceDrafts(
				this.database,
				this.dependencies,
				DEVICE_DRAFT_REVISION_AUTHORITY,
				this.identity
			)
			return { value: result.value, deviceRevision: result.repositoryRevision }
		})
	}

	readDraft(
		draftId: string
	): Promise<BrowserDeviceDraftReadResult<BrowserWorkflowDraftEntry | null>> {
		return this.#read(async () => {
			const result = await readBrowserWorkspaceDraft(
				this.database,
				this.dependencies,
				DEVICE_DRAFT_REVISION_AUTHORITY,
				this.identity,
				draftId
			)
			return { value: result.value, deviceRevision: result.repositoryRevision }
		})
	}

	createDraftAndClaim(
		draft: BrowserWorkflowDraft,
		ownerToken: string,
		expected: BrowserDeviceDraftCas
	): Promise<BrowserDeviceDraftReadResult<BrowserClaimedDraft>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await createBrowserWorkspaceDraftAndClaim(
				this.database,
				this.dependencies,
				DEVICE_DRAFT_REVISION_AUTHORITY,
				this.identity,
				draft,
				ownerToken,
				{
					repositoryRevision: expected.deviceRevision,
					draftRevision: expected.draftRevision
				},
				committedAt
			)
			this.#publish([draft.id], committedAt)
			return deviceResult(commit)
		})
	}

	claimDraft(
		draftId: string,
		ownerToken: string,
		expectedDeviceRevision: number
	): Promise<BrowserDeviceDraftReadResult<BrowserClaimedDraftState>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await claimBrowserWorkspaceDraft(
				this.database,
				this.dependencies,
				DEVICE_DRAFT_REVISION_AUTHORITY,
				this.identity,
				draftId,
				ownerToken,
				expectedDeviceRevision,
				committedAt
			)
			this.#publish([draftId], committedAt)
			return deviceResult(commit)
		})
	}

	takeOverDraft(
		draftId: string,
		ownerToken: string,
		expected: BrowserDeviceDraftLeaseCas
	): Promise<BrowserDeviceDraftReadResult<BrowserClaimedDraftState>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await takeOverBrowserWorkspaceDraft(
				this.database,
				this.dependencies,
				DEVICE_DRAFT_REVISION_AUTHORITY,
				this.identity,
				draftId,
				ownerToken,
				{
					repositoryRevision: expected.deviceRevision,
					leaseRevision: expected.leaseRevision
				},
				committedAt
			)
			this.#publish([draftId], committedAt)
			return deviceResult(commit)
		})
	}

	renewDraftLease(
		draftId: string,
		ownerToken: string,
		expected: BrowserDeviceDraftLeaseCas
	): Promise<BrowserDeviceDraftReadResult<BrowserDraftLease>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await renewBrowserWorkspaceDraftLease(
				this.database,
				this.dependencies,
				DEVICE_DRAFT_REVISION_AUTHORITY,
				this.identity,
				draftId,
				ownerToken,
				{
					repositoryRevision: expected.deviceRevision,
					leaseRevision: expected.leaseRevision
				},
				committedAt
			)
			this.#publish([draftId], committedAt)
			return deviceResult(commit)
		})
	}

	releaseDraftLease(
		draftId: string,
		ownerToken: string,
		expected: BrowserDeviceDraftLeaseCas
	): Promise<BrowserDeviceDraftReadResult<void>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await releaseBrowserWorkspaceDraftLease(
				this.database,
				this.dependencies,
				DEVICE_DRAFT_REVISION_AUTHORITY,
				this.identity,
				draftId,
				ownerToken,
				{
					repositoryRevision: expected.deviceRevision,
					leaseRevision: expected.leaseRevision
				},
				committedAt
			)
			this.#publish([draftId], committedAt)
			return deviceResult(commit)
		})
	}

	writeDraft(
		draft: BrowserWorkflowDraft,
		ownerToken: string,
		expected: BrowserDeviceDraftWriteCas
	): Promise<BrowserDeviceDraftReadResult<BrowserWorkflowDraft>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await writeBrowserWorkspaceDraft(
				this.database,
				this.dependencies,
				DEVICE_DRAFT_REVISION_AUTHORITY,
				this.identity,
				draft,
				ownerToken,
				{
					repositoryRevision: expected.deviceRevision,
					draftRevision: expected.draftRevision,
					leaseRevision: expected.leaseRevision
				},
				committedAt
			)
			this.#publish([draft.id], committedAt)
			return deviceResult(commit)
		})
	}

	deleteDraft(
		draftId: string,
		ownerToken: string,
		expected: BrowserDeviceDraftWriteCas
	): Promise<BrowserDeviceDraftReadResult<void>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await deleteBrowserWorkspaceDraft(
				this.database,
				this.dependencies,
				DEVICE_DRAFT_REVISION_AUTHORITY,
				this.identity,
				draftId,
				ownerToken,
				{
					repositoryRevision: expected.deviceRevision,
					draftRevision: expected.draftRevision,
					leaseRevision: expected.leaseRevision
				},
				committedAt
			)
			this.#publish([draftId], committedAt, 'delete')
			return deviceResult(commit)
		})
	}

	replaceDraftAndClaim(
		draft: BrowserWorkflowDraft,
		ownerToken: string,
		expected: BrowserDeviceDraftReplaceCas
	): Promise<BrowserDeviceDraftReadResult<BrowserClaimedDraft>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await replaceBrowserWorkspaceDraftAndClaim(
				this.database,
				this.dependencies,
				DEVICE_DRAFT_REVISION_AUTHORITY,
				this.identity,
				draft,
				ownerToken,
				{
					repositoryRevision: expected.deviceRevision,
					draftId: expected.draftId,
					draftRevision: expected.draftRevision,
					observedLeaseRevision: expected.observedLeaseRevision
				},
				committedAt
			)
			this.#publish(
				Array.from(new Set([expected.draftId, draft.id])),
				committedAt
			)
			return deviceResult(commit)
		})
	}

	subscribe(listener: (change: BrowserRepositoryChange) => void): () => void {
		this.#ensureOpen()
		return this.#broadcaster.subscribe(listener)
	}

	close() {
		if (this.#closed) return
		this.#closed = true
		this.#broadcaster.close()
		this.database.close()
	}
}

export async function openBrowserDeviceDraftRepository(
	options: OpenBrowserDeviceDraftRepositoryOptions
): Promise<BrowserDeviceDraftRepository> {
	const dependencies = options.dependencies ?? {}
	const database = await openBrowserLibraryDatabase(dependencies)
	return new BrowserDeviceDraftRepositoryImpl(
		database,
		options.identity,
		dependencies
	)
}
