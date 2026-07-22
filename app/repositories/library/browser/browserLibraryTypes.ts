import type { TrackEnrichmentDraft } from '~/types/trackEnrichmentDraft'
import type {
	LibraryCoverChange,
	LibraryDataset,
	LibraryPreferences
} from '~~/shared/types/library'
import type {
	LibraryRepositoryBundle,
	RepositoryOutcome,
	WorkspaceOperationContext
} from '../contracts'

export const BROWSER_LIBRARY_DATABASE_NAME = 'crate-guide-library'
export const BROWSER_LIBRARY_SCHEMA_VERSION = 1
export const BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION = 1
export const BROWSER_LIBRARY_REGISTRY_KEY = 'repository'
export const BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY = 'active-workspace'

export type BrowserStorageHealthCode =
	| 'healthy'
	| 'unavailable'
	| 'quota'
	| 'blocked-upgrade'
	| 'corrupt'
	| 'unknown'

export type BrowserStorageHealth = Readonly<{
	code: BrowserStorageHealthCode
	message: string
	checkedAt: string
}>

export type BrowserCoverCompleteness = 'complete' | 'missing'

export type BrowserWorkspaceManifest = Readonly<{
	id: string
	name: string
	schemaVersion: number
	createdAt: string
	updatedAt: string
	contentRevision: number
	repositoryRevision: number
	lastSuccessfulContentWriteAt: string | null
	coverCompleteness: BrowserCoverCompleteness
}>

export type BrowserRepositoryRegistry = Readonly<{
	key: typeof BROWSER_LIBRARY_REGISTRY_KEY
	schemaVersion: number
	catalogRevision: number
	createdAt: string
	updatedAt: string
}>

export type BrowserActiveWorkspaceMarker = Readonly<{
	key: typeof BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY
	workspaceId: string
	catalogRevision: number
	updatedAt: string
}>

export type BrowserActiveWorkspaceState =
	| { status: 'none'; catalogRevision: number }
	| {
			status: 'active'
			catalogRevision: number
			workspaceId: string
	  }
	| {
			status: 'corrupt'
			catalogRevision: number | null
			reason: 'invalid-marker' | 'missing-workspace'
	  }

export type BrowserCopyReceiptPhase =
	| 'preparing'
	| 'metadata'
	| 'covers'
	| 'verification'
	| 'complete'

export type BrowserCopyReceiptStatus =
	| 'pending'
	| 'in-progress'
	| 'paused'
	| 'failed'
	| 'complete'

export type BrowserCopyReceipt = Readonly<{
	migrationId: string
	sourceContentRevision: number
	phase: BrowserCopyReceiptPhase
	status: BrowserCopyReceiptStatus
	createdAt: string
	updatedAt: string
}>

export type BrowserWorkspaceOperations = Readonly<{
	workspaceId: string
	lastExportedContentRevision: number | null
	lastExportedAt: string | null
	storageHealth: BrowserStorageHealth
	copyReceipt: BrowserCopyReceipt | null
}>

export type BrowserWorkflowDraft = Readonly<{
	id: string
	kind: 'track-enrichment'
	draftRevision: number
	updatedAt: string
	payload: TrackEnrichmentDraft
}>

export type BrowserLibrarySnapshot = Readonly<{
	dataset: LibraryDataset
	managedCovers: readonly BrowserManagedCover[]
	contentRevision: number
	repositoryRevision: number
	coverCompleteness: BrowserCoverCompleteness
}>

export type BrowserRepositoryEntityType =
	| 'workspace'
	| 'operations'
	| 'preferences'
	| 'records'
	| 'tracks'
	| 'crates'
	| 'saved-sets'
	| 'covers'
	| 'drafts'

export type BrowserRepositoryInvalidation = Readonly<{
	entity: BrowserRepositoryEntityType
	ids: readonly string[]
}>

export type BrowserRepositoryChange = Readonly<{
	protocolVersion: typeof BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION
	eventId: string
	senderId: string
	type: 'commit' | 'delete' | 'reset'
	workspaceId: string
	catalogRevision: number | null
	repositoryRevision: number | null
	contentRevision: number | null
	committedAt: string
	invalidations: readonly BrowserRepositoryInvalidation[]
}>

export type BrowserTransactionStep = Readonly<{
	command: string
	store: string
	operation: 'add' | 'clear' | 'delete' | 'put'
	ordinal: number
}>

export type BrowserBroadcastChannel = Pick<
	BroadcastChannel,
	'addEventListener' | 'close' | 'postMessage' | 'removeEventListener'
>

export type BrowserLibraryDependencies = {
	databaseName?: string
	indexedDB?: IDBFactory
	now?: () => Date
	randomUUID?: () => string
	createBroadcastChannel?: (name: string) => BrowserBroadcastChannel | null
	lockManager?: Pick<LockManager, 'request'> | null
	createObjectURL?: (blob: Blob) => string
	revokeObjectURL?: (url: string) => void
	processCoverFile?: (
		file: File,
		crop: Extract<LibraryCoverChange, { type: 'upload' }>['crop']
	) => Promise<Blob>
	onTransactionStep?: (step: BrowserTransactionStep) => void
	onBlockedUpgrade?: () => void
	onBlockingUpgrade?: () => void
	onUnexpectedClose?: () => void
}

export type BrowserStoredPreferences = Readonly<{
	workspaceId: string
	value: LibraryPreferences
}>

export type BrowserManagedCover = Readonly<{
	workspaceId: string
	assetId: string
	recordId: string
	blob: Blob
	createdAt: string
	updatedAt: string
}>

export type BrowserStoredWorkflowDraft = Readonly<{
	workspaceId: string
	id: string
	kind: BrowserWorkflowDraft['kind']
	draftRevision: number
	updatedAt: string
	serializedPayload: string
}>

export type CreateBrowserWorkspaceInput = {
	id?: string
	name: string
	activate?: boolean
}

export type ReplaceBrowserSnapshotInput = {
	snapshot: LibraryDataset
	covers?: ReadonlyMap<string, Blob> | Readonly<Record<string, Blob>>
}

export interface BrowserLibraryRepository extends LibraryRepositoryBundle {
	readonly workspaceId: string
	readManifest(): Promise<BrowserWorkspaceManifest | null>
	readLibrarySnapshot(
		context: WorkspaceOperationContext
	): Promise<RepositoryOutcome<BrowserLibrarySnapshot>>
	replaceSnapshot(
		context: WorkspaceOperationContext,
		input: ReplaceBrowserSnapshotInput
	): Promise<RepositoryOutcome<LibraryDataset>>
	readManagedCover(assetId: string): Promise<Blob | null>
	recoverStorage(): Promise<BrowserStorageHealth>
	subscribe(listener: (change: BrowserRepositoryChange) => void): () => void
	close(): void
}

export interface BrowserWorkspaceCatalog {
	probe(): Promise<BrowserStorageHealth>
	listWorkspaces(): Promise<BrowserWorkspaceManifest[]>
	readActiveWorkspace(): Promise<BrowserActiveWorkspaceState>
	createWorkspace(
		input: CreateBrowserWorkspaceInput
	): Promise<BrowserWorkspaceManifest>
	activateWorkspace(
		workspaceId: string | null,
		expectedCatalogRevision: number
	): Promise<BrowserActiveWorkspaceState>
	renameWorkspace(
		workspaceId: string,
		name: string,
		expectedRepositoryRevision: number
	): Promise<BrowserWorkspaceManifest>
	deleteWorkspace(
		workspaceId: string,
		expectedRepositoryRevision: number
	): Promise<void>
	openWorkspace(workspaceId: string): Promise<BrowserLibraryRepository>
	readOperations(
		workspaceId: string
	): Promise<BrowserWorkspaceOperations | null>
	listDrafts(workspaceId: string): Promise<BrowserWorkflowDraft[]>
	readDraft(
		workspaceId: string,
		draftId: string
	): Promise<BrowserWorkflowDraft | null>
	recordExport(
		workspaceId: string,
		contentRevision: number,
		exportedAt?: string
	): Promise<BrowserWorkspaceOperations>
	writeDraft(
		workspaceId: string,
		draft: BrowserWorkflowDraft,
		expectedDraftRevision: number | null
	): Promise<BrowserWorkflowDraft>
	deleteDraft(
		workspaceId: string,
		draftId: string,
		expectedDraftRevision: number
	): Promise<void>
	writeCopyReceipt(
		workspaceId: string,
		receipt: BrowserCopyReceipt | null
	): Promise<BrowserWorkspaceOperations>
	close(): void
}
