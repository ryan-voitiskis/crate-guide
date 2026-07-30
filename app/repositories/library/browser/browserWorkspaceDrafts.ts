import {
	type BrowserDraftRevisionAuthority,
	type BrowserDraftRevisionState,
	assertBrowserDraftRevision,
	browserDraftRevisionStoreName,
	readBrowserDraftRevisionState,
	writeNextBrowserDraftRevision
} from './browserDraftRevision'
import {
	decodeBrowserDraftLease,
	decodeBrowserDraftLeaseOwnerToken,
	decodeBrowserDraftLeaseRow,
	decodeBrowserWorkflowDraft,
	decodeBrowserWorkflowDraftReadState,
	decodeBrowserWorkflowDraftRow,
	encodeBrowserDraftLeaseRow,
	encodeBrowserDraftLeaseTombstone,
	encodeBrowserWorkflowDraftRow
} from './browserLibraryCodecs'
import {
	BrowserRepositoryConflictError,
	BrowserRepositoryNotFoundError,
	BrowserStorageCodecError
} from './browserLibraryErrors'
import { runBrowserLibraryTransaction } from './browserLibraryRuntime'
import {
	BROWSER_LIBRARY_DRAFT_KIND_INDEX,
	BROWSER_LIBRARY_STORES,
	requestResult
} from './browserLibrarySchema'
import {
	BROWSER_DRAFT_LEASE_TTL_MS,
	type BrowserClaimedDraft,
	type BrowserClaimedDraftState,
	type BrowserDraftCas,
	type BrowserDraftLease,
	type BrowserDraftLeaseCas,
	type BrowserDraftReplaceCas,
	type BrowserDraftWriteCas,
	type BrowserLibraryDependencies,
	type BrowserStoredDraftLease,
	type BrowserStoredWorkflowDraft,
	type BrowserWorkflowDraft,
	type BrowserWorkspaceIdentity,
	type BrowserWorkspaceMutationResult
} from './browserLibraryTypes'

export type BrowserDraftOperationalCommit<T> = Readonly<{
	result: BrowserWorkspaceMutationResult<T>
	contentRevision: number
}>

function draftLeaseKey(identity: BrowserWorkspaceIdentity, draftId: string) {
	return [identity.workspaceId, identity.repositoryId, draftId]
}

function draftKey(identity: BrowserWorkspaceIdentity, draftId: string) {
	return [identity.workspaceId, identity.repositoryId, draftId]
}

function requiredDraftRow(
	value: unknown,
	identity: BrowserWorkspaceIdentity,
	draftId: string
): BrowserStoredWorkflowDraft {
	if (value === undefined) throw new BrowserRepositoryNotFoundError('draft')
	const row = decodeBrowserWorkflowDraftRow(
		value,
		identity.workspaceId,
		identity.repositoryId
	)
	if (row.id !== draftId) throw new BrowserStorageCodecError('/draft/id')
	return row
}

function assertDraftRevision(actual: number, expected: number) {
	if (actual !== expected) {
		throw new BrowserRepositoryConflictError('draft-revision', expected, actual)
	}
}

function hasMeaningfulDraftChange(
	previous: BrowserWorkflowDraft,
	next: BrowserWorkflowDraft
): boolean {
	const {
		draftRevision: _previousDraftRevision,
		updatedAt: _previousUpdatedAt,
		...previousPayload
	} = previous.payload
	const {
		draftRevision: _nextDraftRevision,
		updatedAt: _nextUpdatedAt,
		...nextPayload
	} = next.payload
	return JSON.stringify(previousPayload) !== JSON.stringify(nextPayload)
}

function draftLeaseConflict(
	expected: number | null,
	actual: number | null
): never {
	throw new BrowserRepositoryConflictError(
		'draft-lease',
		expected,
		actual,
		'The device-local draft editing lease changed before this operation could commit.'
	)
}

function leaseExpiry(renewedAt: string) {
	return new Date(
		Date.parse(renewedAt) + BROWSER_DRAFT_LEASE_TTL_MS
	).toISOString()
}

function liveLease(
	identity: BrowserWorkspaceIdentity,
	draftId: string,
	ownerToken: string,
	leaseRevision: number,
	renewedAt: string,
	acquiredAt = renewedAt
) {
	const row = encodeBrowserDraftLeaseRow(
		identity,
		draftId,
		decodeBrowserDraftLeaseOwnerToken(ownerToken),
		{
			leaseRevision,
			acquiredAt,
			renewedAt,
			expiresAt: leaseExpiry(renewedAt)
		}
	)
	return { row, lease: decodeBrowserDraftLease(row) }
}

function requiredOwnedLease(
	value: unknown,
	identity: BrowserWorkspaceIdentity,
	draftId: string,
	ownerToken: string,
	expectedLeaseRevision: number,
	now: string,
	requireLive: boolean
): BrowserStoredDraftLease & { ownerToken: string } {
	decodeBrowserDraftLeaseOwnerToken(ownerToken)
	if (value === undefined) draftLeaseConflict(expectedLeaseRevision, null)
	const row = decodeBrowserDraftLeaseRow(value, identity, draftId)
	if (
		row.leaseRevision !== expectedLeaseRevision ||
		row.ownerToken === null ||
		row.ownerToken !== ownerToken
	) {
		draftLeaseConflict(expectedLeaseRevision, row.leaseRevision)
	}
	if (requireLive && Date.parse(now) >= Date.parse(row.expiresAt)) {
		draftLeaseConflict(expectedLeaseRevision, row.leaseRevision)
	}
	return row
}

function operationalCommit<T>(
	value: T,
	state: BrowserDraftRevisionState
): BrowserDraftOperationalCommit<T> {
	return {
		result: { value, repositoryRevision: state.repositoryRevision },
		contentRevision: state.contentRevision
	}
}

export function createBrowserWorkspaceDraftAndClaim(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	draft: BrowserWorkflowDraft,
	ownerToken: string,
	expected: BrowserDraftCas,
	committedAt: string
): Promise<BrowserDraftOperationalCommit<BrowserClaimedDraft>> {
	const encodedDraft = encodeBrowserWorkflowDraftRow(identity, draft)
	const persistedDraft = decodeBrowserWorkflowDraft(encodedDraft)
	const createdLease = liveLease(identity, draft.id, ownerToken, 0, committedAt)
	return runBrowserLibraryTransaction(
		database,
		[
			browserDraftRevisionStoreName(authority),
			BROWSER_LIBRARY_STORES.drafts,
			BROWSER_LIBRARY_STORES.draftLeases
		],
		'create-and-claim-draft',
		dependencies,
		async (transaction, writer) => {
			const draftStore = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
			const leaseStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.draftLeases
			)
			const [revisionState, storedDraft, storedKindDraft, storedLease] =
				await Promise.all([
					readBrowserDraftRevisionState(transaction, authority, identity, true),
					requestResult(draftStore.get(draftKey(identity, draft.id))),
					requestResult(
						draftStore
							.index(BROWSER_LIBRARY_DRAFT_KIND_INDEX)
							.get([identity.workspaceId, identity.repositoryId, draft.kind])
					),
					requestResult(leaseStore.get(draftLeaseKey(identity, draft.id)))
				])
			assertBrowserDraftRevision(
				revisionState,
				authority,
				expected.repositoryRevision
			)
			if (
				expected.draftRevision !== null ||
				persistedDraft.draftRevision !== 0
			) {
				throw new BrowserRepositoryConflictError(
					'draft-revision',
					0,
					persistedDraft.draftRevision,
					'A new device-local draft must start at revision 0.'
				)
			}
			if (storedDraft !== undefined || storedKindDraft !== undefined) {
				const existing = decodeBrowserWorkflowDraftRow(
					storedDraft ?? storedKindDraft,
					identity.workspaceId,
					identity.repositoryId
				)
				throw new BrowserRepositoryConflictError(
					storedDraft === undefined ? 'draft-kind' : 'draft-revision',
					null,
					existing.draftRevision
				)
			}
			if (storedLease !== undefined) {
				const existingLease = decodeBrowserDraftLeaseRow(
					storedLease,
					identity,
					draft.id
				)
				draftLeaseConflict(null, existingLease.leaseRevision)
			}
			writer.add(draftStore, encodedDraft)
			writer.add(leaseStore, createdLease.row)
			const updatedRevision = writeNextBrowserDraftRevision(
				transaction,
				writer,
				authority,
				identity,
				revisionState,
				committedAt
			)
			return operationalCommit(
				{ draft: persistedDraft, lease: createdLease.lease },
				updatedRevision
			)
		}
	)
}

export function claimBrowserWorkspaceDraft(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	draftId: string,
	ownerToken: string,
	expectedRepositoryRevision: number,
	committedAt: string
): Promise<BrowserDraftOperationalCommit<BrowserClaimedDraftState>> {
	return runBrowserLibraryTransaction(
		database,
		[
			browserDraftRevisionStoreName(authority),
			BROWSER_LIBRARY_STORES.drafts,
			BROWSER_LIBRARY_STORES.draftLeases
		],
		'claim-draft-lease',
		dependencies,
		async (transaction, writer) => {
			const draftStore = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
			const leaseStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.draftLeases
			)
			const [revisionState, storedDraft, storedLease] = await Promise.all([
				readBrowserDraftRevisionState(transaction, authority, identity, false),
				requestResult(draftStore.get(draftKey(identity, draftId))),
				requestResult(leaseStore.get(draftLeaseKey(identity, draftId)))
			])
			assertBrowserDraftRevision(
				revisionState,
				authority,
				expectedRepositoryRevision
			)
			const draft = requiredDraftRow(storedDraft, identity, draftId)
			let leaseRevision = 0
			if (storedLease !== undefined) {
				const existing = decodeBrowserDraftLeaseRow(
					storedLease,
					identity,
					draftId
				)
				if (
					existing.ownerToken !== null &&
					Date.parse(committedAt) < Date.parse(existing.expiresAt)
				) {
					draftLeaseConflict(null, existing.leaseRevision)
				}
				leaseRevision = existing.leaseRevision + 1
			}
			const claimed = liveLease(
				identity,
				draftId,
				ownerToken,
				leaseRevision,
				committedAt
			)
			writer.put(leaseStore, claimed.row)
			const updatedRevision = writeNextBrowserDraftRevision(
				transaction,
				writer,
				authority,
				identity,
				revisionState,
				committedAt
			)
			return operationalCommit(
				{
					draft: decodeBrowserWorkflowDraftReadState(draft),
					lease: claimed.lease
				},
				updatedRevision
			)
		}
	)
}

export function takeOverBrowserWorkspaceDraft(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	draftId: string,
	ownerToken: string,
	expected: BrowserDraftLeaseCas,
	committedAt: string
): Promise<BrowserDraftOperationalCommit<BrowserClaimedDraftState>> {
	return runBrowserLibraryTransaction(
		database,
		[
			browserDraftRevisionStoreName(authority),
			BROWSER_LIBRARY_STORES.drafts,
			BROWSER_LIBRARY_STORES.draftLeases
		],
		'take-over-draft-lease',
		dependencies,
		async (transaction, writer) => {
			const draftStore = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
			const leaseStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.draftLeases
			)
			const [revisionState, storedDraft, storedLease] = await Promise.all([
				readBrowserDraftRevisionState(transaction, authority, identity, false),
				requestResult(draftStore.get(draftKey(identity, draftId))),
				requestResult(leaseStore.get(draftLeaseKey(identity, draftId)))
			])
			assertBrowserDraftRevision(
				revisionState,
				authority,
				expected.repositoryRevision
			)
			const draft = requiredDraftRow(storedDraft, identity, draftId)
			if (storedLease === undefined) {
				draftLeaseConflict(expected.leaseRevision, null)
			}
			const existing = decodeBrowserDraftLeaseRow(
				storedLease,
				identity,
				draftId
			)
			if (existing.leaseRevision !== expected.leaseRevision) {
				draftLeaseConflict(expected.leaseRevision, existing.leaseRevision)
			}
			const claimed = liveLease(
				identity,
				draftId,
				ownerToken,
				existing.leaseRevision + 1,
				committedAt
			)
			writer.put(leaseStore, claimed.row)
			const updatedRevision = writeNextBrowserDraftRevision(
				transaction,
				writer,
				authority,
				identity,
				revisionState,
				committedAt
			)
			return operationalCommit(
				{
					draft: decodeBrowserWorkflowDraftReadState(draft),
					lease: claimed.lease
				},
				updatedRevision
			)
		}
	)
}

export function renewBrowserWorkspaceDraftLease(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	draftId: string,
	ownerToken: string,
	expected: BrowserDraftLeaseCas,
	committedAt: string
): Promise<BrowserDraftOperationalCommit<BrowserDraftLease>> {
	return runBrowserLibraryTransaction(
		database,
		[
			browserDraftRevisionStoreName(authority),
			BROWSER_LIBRARY_STORES.drafts,
			BROWSER_LIBRARY_STORES.draftLeases
		],
		'renew-draft-lease',
		dependencies,
		async (transaction, writer) => {
			const draftStore = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
			const leaseStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.draftLeases
			)
			const [revisionState, storedDraft, storedLease] = await Promise.all([
				readBrowserDraftRevisionState(transaction, authority, identity, false),
				requestResult(draftStore.get(draftKey(identity, draftId))),
				requestResult(leaseStore.get(draftLeaseKey(identity, draftId)))
			])
			assertBrowserDraftRevision(
				revisionState,
				authority,
				expected.repositoryRevision
			)
			requiredDraftRow(storedDraft, identity, draftId)
			const existing = requiredOwnedLease(
				storedLease,
				identity,
				draftId,
				ownerToken,
				expected.leaseRevision,
				committedAt,
				true
			)
			const renewed = liveLease(
				identity,
				draftId,
				ownerToken,
				existing.leaseRevision + 1,
				committedAt,
				existing.acquiredAt
			)
			writer.put(leaseStore, renewed.row)
			const updatedRevision = writeNextBrowserDraftRevision(
				transaction,
				writer,
				authority,
				identity,
				revisionState,
				committedAt
			)
			return operationalCommit(renewed.lease, updatedRevision)
		}
	)
}

export function releaseBrowserWorkspaceDraftLease(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	draftId: string,
	ownerToken: string,
	expected: BrowserDraftLeaseCas,
	committedAt: string
): Promise<BrowserDraftOperationalCommit<void>> {
	return runBrowserLibraryTransaction(
		database,
		[
			browserDraftRevisionStoreName(authority),
			BROWSER_LIBRARY_STORES.drafts,
			BROWSER_LIBRARY_STORES.draftLeases
		],
		'release-draft-lease',
		dependencies,
		async (transaction, writer) => {
			const draftStore = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
			const leaseStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.draftLeases
			)
			const [revisionState, storedDraft, storedLease] = await Promise.all([
				readBrowserDraftRevisionState(transaction, authority, identity, false),
				requestResult(draftStore.get(draftKey(identity, draftId))),
				requestResult(leaseStore.get(draftLeaseKey(identity, draftId)))
			])
			assertBrowserDraftRevision(
				revisionState,
				authority,
				expected.repositoryRevision
			)
			requiredDraftRow(storedDraft, identity, draftId)
			const existing = requiredOwnedLease(
				storedLease,
				identity,
				draftId,
				ownerToken,
				expected.leaseRevision,
				committedAt,
				false
			)
			writer.put(
				leaseStore,
				encodeBrowserDraftLeaseTombstone(
					identity,
					draftId,
					existing.leaseRevision + 1
				)
			)
			const updatedRevision = writeNextBrowserDraftRevision(
				transaction,
				writer,
				authority,
				identity,
				revisionState,
				committedAt
			)
			return operationalCommit(undefined, updatedRevision)
		}
	)
}

export function writeBrowserWorkspaceDraft(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	draft: BrowserWorkflowDraft,
	ownerToken: string,
	expected: BrowserDraftWriteCas,
	committedAt: string
): Promise<BrowserDraftOperationalCommit<BrowserWorkflowDraft>> {
	const encodedDraft = encodeBrowserWorkflowDraftRow(identity, draft)
	const persistedDraft = decodeBrowserWorkflowDraft(encodedDraft)
	return runBrowserLibraryTransaction(
		database,
		[
			browserDraftRevisionStoreName(authority),
			BROWSER_LIBRARY_STORES.drafts,
			BROWSER_LIBRARY_STORES.draftLeases
		],
		'write-draft',
		dependencies,
		async (transaction, writer) => {
			const draftStore = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
			const leaseStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.draftLeases
			)
			const [revisionState, storedDraft, storedKindDraft, storedLease] =
				await Promise.all([
					readBrowserDraftRevisionState(
						transaction,
						authority,
						identity,
						false
					),
					requestResult(draftStore.get(draftKey(identity, draft.id))),
					requestResult(
						draftStore
							.index(BROWSER_LIBRARY_DRAFT_KIND_INDEX)
							.get([identity.workspaceId, identity.repositoryId, draft.kind])
					),
					requestResult(leaseStore.get(draftLeaseKey(identity, draft.id)))
				])
			assertBrowserDraftRevision(
				revisionState,
				authority,
				expected.repositoryRevision
			)
			const existing = requiredDraftRow(storedDraft, identity, draft.id)
			assertDraftRevision(existing.draftRevision, expected.draftRevision)
			assertDraftRevision(draft.draftRevision, expected.draftRevision + 1)
			const existingState = decodeBrowserWorkflowDraftReadState(existing)
			if (
				existingState.status === 'ready' &&
				!hasMeaningfulDraftChange(existingState.draft, persistedDraft)
			) {
				throw new BrowserRepositoryConflictError(
					'draft-revision',
					expected.draftRevision,
					existing.draftRevision,
					'The device-local draft payload has no meaningful changes to save.'
				)
			}
			if (Date.parse(draft.updatedAt) <= Date.parse(existing.updatedAt)) {
				throw new BrowserRepositoryConflictError(
					'draft-revision',
					expected.draftRevision,
					existing.draftRevision,
					'The device-local draft update timestamp must advance monotonically.'
				)
			}
			const kindDraft = requiredDraftRow(storedKindDraft, identity, draft.id)
			if (kindDraft.id !== draft.id) {
				throw new BrowserRepositoryConflictError('draft-kind', null, null)
			}
			requiredOwnedLease(
				storedLease,
				identity,
				draft.id,
				ownerToken,
				expected.leaseRevision,
				committedAt,
				true
			)
			writer.put(draftStore, encodedDraft)
			const updatedRevision = writeNextBrowserDraftRevision(
				transaction,
				writer,
				authority,
				identity,
				revisionState,
				committedAt
			)
			return operationalCommit(persistedDraft, updatedRevision)
		}
	)
}

export function deleteBrowserWorkspaceDraft(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	draftId: string,
	ownerToken: string,
	expected: BrowserDraftWriteCas,
	committedAt: string
): Promise<BrowserDraftOperationalCommit<void>> {
	return runBrowserLibraryTransaction(
		database,
		[
			browserDraftRevisionStoreName(authority),
			BROWSER_LIBRARY_STORES.drafts,
			BROWSER_LIBRARY_STORES.draftLeases
		],
		'delete-draft',
		dependencies,
		async (transaction, writer) => {
			const draftStore = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
			const leaseStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.draftLeases
			)
			const [revisionState, storedDraft, storedLease] = await Promise.all([
				readBrowserDraftRevisionState(transaction, authority, identity, false),
				requestResult(draftStore.get(draftKey(identity, draftId))),
				requestResult(leaseStore.get(draftLeaseKey(identity, draftId)))
			])
			assertBrowserDraftRevision(
				revisionState,
				authority,
				expected.repositoryRevision
			)
			const draft = requiredDraftRow(storedDraft, identity, draftId)
			assertDraftRevision(draft.draftRevision, expected.draftRevision)
			requiredOwnedLease(
				storedLease,
				identity,
				draftId,
				ownerToken,
				expected.leaseRevision,
				committedAt,
				true
			)
			writer.delete(draftStore, draftKey(identity, draftId))
			writer.delete(leaseStore, draftLeaseKey(identity, draftId))
			const updatedRevision = writeNextBrowserDraftRevision(
				transaction,
				writer,
				authority,
				identity,
				revisionState,
				committedAt
			)
			return operationalCommit(undefined, updatedRevision)
		}
	)
}

export function replaceBrowserWorkspaceDraftAndClaim(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	draft: BrowserWorkflowDraft,
	ownerToken: string,
	expected: BrowserDraftReplaceCas,
	committedAt: string
): Promise<BrowserDraftOperationalCommit<BrowserClaimedDraft>> {
	const encodedDraft = encodeBrowserWorkflowDraftRow(identity, draft)
	const persistedDraft = decodeBrowserWorkflowDraft(encodedDraft)
	if (persistedDraft.draftRevision !== 0) {
		throw new BrowserRepositoryConflictError(
			'draft-revision',
			0,
			persistedDraft.draftRevision
		)
	}
	return runBrowserLibraryTransaction(
		database,
		[
			browserDraftRevisionStoreName(authority),
			BROWSER_LIBRARY_STORES.drafts,
			BROWSER_LIBRARY_STORES.draftLeases
		],
		'replace-and-claim-draft',
		dependencies,
		async (transaction, writer) => {
			const draftStore = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
			const leaseStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.draftLeases
			)
			const previousLeaseKey = draftLeaseKey(identity, expected.draftId)
			const nextLeaseKey = draftLeaseKey(identity, draft.id)
			const [
				revisionState,
				storedDraft,
				storedKindDraft,
				storedLease,
				storedNextDraft,
				storedNextLease
			] = await Promise.all([
				readBrowserDraftRevisionState(transaction, authority, identity, false),
				requestResult(draftStore.get(draftKey(identity, expected.draftId))),
				requestResult(
					draftStore
						.index(BROWSER_LIBRARY_DRAFT_KIND_INDEX)
						.get([identity.workspaceId, identity.repositoryId, draft.kind])
				),
				requestResult(leaseStore.get(previousLeaseKey)),
				draft.id === expected.draftId
					? Promise.resolve(undefined)
					: requestResult(draftStore.get(draftKey(identity, draft.id))),
				draft.id === expected.draftId
					? Promise.resolve(undefined)
					: requestResult(leaseStore.get(nextLeaseKey))
			])
			assertBrowserDraftRevision(
				revisionState,
				authority,
				expected.repositoryRevision
			)
			const previous = requiredDraftRow(storedDraft, identity, expected.draftId)
			assertDraftRevision(previous.draftRevision, expected.draftRevision)
			const kindDraft = requiredDraftRow(
				storedKindDraft,
				identity,
				expected.draftId
			)
			if (kindDraft.id !== expected.draftId) {
				throw new BrowserRepositoryConflictError('draft-kind', null, null)
			}
			let nextLeaseRevision = 0
			if (storedLease === undefined) {
				if (expected.observedLeaseRevision !== null) {
					draftLeaseConflict(expected.observedLeaseRevision, null)
				}
			} else {
				const previousLease = decodeBrowserDraftLeaseRow(
					storedLease,
					identity,
					expected.draftId
				)
				if (expected.observedLeaseRevision !== previousLease.leaseRevision) {
					draftLeaseConflict(
						expected.observedLeaseRevision,
						previousLease.leaseRevision
					)
				}
				if (draft.id === expected.draftId) {
					nextLeaseRevision = previousLease.leaseRevision + 1
				}
			}
			if (storedNextDraft !== undefined) {
				const nextDraft = decodeBrowserWorkflowDraftRow(
					storedNextDraft,
					identity.workspaceId,
					identity.repositoryId
				)
				throw new BrowserRepositoryConflictError(
					'draft-revision',
					null,
					nextDraft.draftRevision
				)
			}
			if (storedNextLease !== undefined) {
				const nextLease = decodeBrowserDraftLeaseRow(
					storedNextLease,
					identity,
					draft.id
				)
				draftLeaseConflict(null, nextLease.leaseRevision)
			}
			const claimed = liveLease(
				identity,
				draft.id,
				ownerToken,
				nextLeaseRevision,
				committedAt
			)
			if (draft.id !== expected.draftId) {
				writer.delete(draftStore, draftKey(identity, expected.draftId))
				if (storedLease !== undefined)
					writer.delete(leaseStore, previousLeaseKey)
			}
			writer.put(draftStore, encodedDraft)
			writer.put(leaseStore, claimed.row)
			const updatedRevision = writeNextBrowserDraftRevision(
				transaction,
				writer,
				authority,
				identity,
				revisionState,
				committedAt
			)
			return operationalCommit(
				{ draft: persistedDraft, lease: claimed.lease },
				updatedRevision
			)
		}
	)
}
