import {
	type BrowserDraftRevisionAuthority,
	browserDraftRevisionStoreName,
	readBrowserDraftRevisionState
} from './browserDraftRevision'
import {
	decodeBrowserDraftLease,
	decodeBrowserDraftLeaseRow,
	decodeBrowserWorkflowDraftReadState,
	decodeBrowserWorkflowDraftRow
} from './browserLibraryCodecs'
import { BrowserStorageCodecError } from './browserLibraryErrors'
import {
	browserLibraryTimestamp,
	runBrowserLibraryReadTransaction
} from './browserLibraryRuntime'
import {
	BROWSER_LIBRARY_DRAFT_IDENTITY_INDEX,
	BROWSER_LIBRARY_STORES,
	requestResult
} from './browserLibrarySchema'
import type {
	BrowserDraftLeaseState,
	BrowserLibraryDependencies,
	BrowserWorkflowDraftEntry,
	BrowserWorkspaceIdentity,
	BrowserWorkspaceReadResult
} from './browserLibraryTypes'

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
