import {
	decodeBrowserDeviceDraftRepository,
	decodeBrowserWorkspaceManifest
} from './browserLibraryCodecs'
import {
	BrowserRepositoryConflictError,
	BrowserRepositoryNotFoundError,
	BrowserStorageCodecError
} from './browserLibraryErrors'
import type { BrowserTransactionWriter } from './browserLibraryRuntime'
import {
	BROWSER_LIBRARY_STORES,
	type BrowserLibraryStoreName,
	requestResult
} from './browserLibrarySchema'
import type {
	BrowserStoredDeviceDraftRepository,
	BrowserWorkspaceIdentity,
	BrowserWorkspaceManifest
} from './browserLibraryTypes'

export type BrowserDraftRevisionAuthority = 'local-manifest' | 'device-draft'

export const LOCAL_DRAFT_REVISION_AUTHORITY: BrowserDraftRevisionAuthority =
	'local-manifest'
export const DEVICE_DRAFT_REVISION_AUTHORITY: BrowserDraftRevisionAuthority =
	'device-draft'

type BrowserDraftRevisionStoredValue =
	| BrowserWorkspaceManifest
	| BrowserStoredDeviceDraftRepository
	| null

export type BrowserDraftRevisionState = Readonly<{
	repositoryRevision: number
	contentRevision: number
	exists: boolean
	storedValue: BrowserDraftRevisionStoredValue
}>

export function browserDraftRevisionStoreName(
	authority: BrowserDraftRevisionAuthority
): BrowserLibraryStoreName {
	return authority === LOCAL_DRAFT_REVISION_AUTHORITY
		? BROWSER_LIBRARY_STORES.workspaces
		: BROWSER_LIBRARY_STORES.deviceDraftRepositories
}

function browserDraftRevisionKey(
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity
) {
	return authority === LOCAL_DRAFT_REVISION_AUTHORITY
		? identity.workspaceId
		: [identity.workspaceId, identity.repositoryId]
}

export async function readBrowserDraftRevisionState(
	transaction: IDBTransaction,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	allowMissingDeviceState: boolean
): Promise<BrowserDraftRevisionState> {
	const stored = await requestResult(
		transaction
			.objectStore(browserDraftRevisionStoreName(authority))
			.get(browserDraftRevisionKey(authority, identity))
	)
	if (authority === LOCAL_DRAFT_REVISION_AUTHORITY) {
		if (stored === undefined) {
			throw new BrowserRepositoryNotFoundError('workspace')
		}
		const manifest = decodeBrowserWorkspaceManifest(stored)
		if (
			manifest.id !== identity.workspaceId ||
			manifest.repositoryId !== identity.repositoryId
		) {
			throw new BrowserRepositoryNotFoundError('workspace')
		}
		return {
			repositoryRevision: manifest.repositoryRevision,
			contentRevision: manifest.contentRevision,
			exists: true,
			storedValue: manifest
		}
	}
	if (stored === undefined) {
		if (!allowMissingDeviceState) {
			throw new BrowserStorageCodecError('/deviceDraftRepository')
		}
		return {
			repositoryRevision: 0,
			contentRevision: 0,
			exists: false,
			storedValue: null
		}
	}
	const device = decodeBrowserDeviceDraftRepository(stored, identity)
	return {
		repositoryRevision: device.deviceRevision,
		contentRevision: 0,
		exists: true,
		storedValue: device
	}
}

export function assertBrowserDraftRevision(
	state: BrowserDraftRevisionState,
	authority: BrowserDraftRevisionAuthority,
	expected: number
) {
	if (state.repositoryRevision !== expected) {
		throw new BrowserRepositoryConflictError(
			authority === LOCAL_DRAFT_REVISION_AUTHORITY
				? 'repository-revision'
				: 'device-revision',
			expected,
			state.repositoryRevision
		)
	}
}

export function writeNextBrowserDraftRevision(
	transaction: IDBTransaction,
	writer: BrowserTransactionWriter,
	authority: BrowserDraftRevisionAuthority,
	identity: BrowserWorkspaceIdentity,
	state: BrowserDraftRevisionState,
	updatedAt: string
): BrowserDraftRevisionState {
	const store = transaction.objectStore(
		browserDraftRevisionStoreName(authority)
	)
	if (authority === LOCAL_DRAFT_REVISION_AUTHORITY) {
		if (!state.storedValue || !('contentRevision' in state.storedValue)) {
			throw new BrowserStorageCodecError('/workspace')
		}
		const manifest = decodeBrowserWorkspaceManifest({
			...state.storedValue,
			repositoryRevision: state.repositoryRevision + 1,
			updatedAt
		})
		writer.put(store, manifest)
		return {
			repositoryRevision: manifest.repositoryRevision,
			contentRevision: manifest.contentRevision,
			exists: true,
			storedValue: manifest
		}
	}
	const previous =
		state.storedValue && 'deviceRevision' in state.storedValue
			? state.storedValue
			: null
	const device = decodeBrowserDeviceDraftRepository(
		{
			workspaceId: identity.workspaceId,
			repositoryId: identity.repositoryId,
			deviceRevision: state.repositoryRevision + 1,
			createdAt: previous?.createdAt ?? updatedAt,
			updatedAt
		},
		identity
	)
	writer.put(store, device)
	return {
		repositoryRevision: device.deviceRevision,
		contentRevision: 0,
		exists: true,
		storedValue: device
	}
}
