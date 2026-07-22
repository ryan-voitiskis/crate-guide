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
export const BROWSER_LIBRARY_SCHEMA_VERSION = 2
export const BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION = 2
export const BROWSER_LIBRARY_REGISTRY_KEY = 'repository'
export const BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY = 'active-workspace'
export const BROWSER_LIBRARY_BROADCAST_CHANNEL_SUFFIX = 'changes-v1'
export const BROWSER_DRAFT_LEASE_TTL_MS = 60_000
export const BROWSER_DRAFT_LEASE_RENEW_INTERVAL_MS = 20_000
export const BROWSER_WORKFLOW_DRAFT_ENVELOPE_VERSION = 1

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

export type BrowserRepositoryRecoveryOutcome =
	| Readonly<{
			status: 'recovered'
			health: BrowserStorageHealth & Readonly<{ code: 'healthy' }>
	  }>
	| Readonly<{ status: 'not-found' }>
	| Readonly<{
			status: 'failed'
			health: BrowserStorageHealth
	  }>

export type BrowserStorageEstimateOutcome =
	| Readonly<{
			status: 'available'
			usageBytes: number
			quotaBytes: number
	  }>
	| Readonly<{ status: 'unsupported' | 'error' }>

export type BrowserCoverCompleteness = 'complete' | 'missing'

export type BrowserWorkspaceManifest = Readonly<{
	id: string
	repositoryId: string
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
	repositoryId: string
	catalogRevision: number
	updatedAt: string
}>

export type BrowserActiveWorkspaceState =
	| { status: 'none'; catalogRevision: number }
	| {
			status: 'active'
			catalogRevision: number
			workspaceId: string
			repositoryId: string
	  }
	| {
			status: 'corrupt'
			catalogRevision: number | null
			reason: 'invalid-marker' | 'missing-workspace' | 'repository-mismatch'
	  }

export type BrowserWorkspaceCatalogSnapshot = Readonly<{
	catalogRevision: number
	workspaces: readonly BrowserWorkspaceManifest[]
}>

export type BrowserWorkspaceIdentity = Readonly<{
	workspaceId: string
	repositoryId: string
}>

export type BrowserCatalogMutationResult<T> = Readonly<{
	value: T
	catalogRevision: number
}>

export type BrowserWorkspaceReadResult<T> = Readonly<{
	value: T
	repositoryRevision: number
}>

export type BrowserWorkspaceMutationResult<T> = BrowserWorkspaceReadResult<T>

export type BrowserWorkspaceCatalogMutationResult<T> = Readonly<{
	value: T
	catalogRevision: number
	repositoryRevision: number
}>

export type BrowserWorkspaceCatalogCas = BrowserWorkspaceIdentity &
	Readonly<{
		catalogRevision: number
		repositoryRevision: number
	}>

export type BrowserDraftCas = Readonly<{
	repositoryRevision: number
	draftRevision: number | null
}>

export type BrowserDraftLeaseCas = Readonly<{
	repositoryRevision: number
	leaseRevision: number
}>

export type BrowserDraftWriteCas = Readonly<{
	repositoryRevision: number
	draftRevision: number
	leaseRevision: number
}>

export type BrowserDraftReplaceCas = Readonly<{
	repositoryRevision: number
	draftId: string
	draftRevision: number
	observedLeaseRevision: number | null
}>

export type BrowserDeviceDraftReadResult<T> = Readonly<{
	value: T
	deviceRevision: number
}>

export type BrowserDeviceDraftCas = Readonly<{
	deviceRevision: number
	draftRevision: number | null
}>

export type BrowserDeviceDraftLeaseCas = Readonly<{
	deviceRevision: number
	leaseRevision: number
}>

export type BrowserDeviceDraftWriteCas = Readonly<{
	deviceRevision: number
	draftRevision: number
	leaseRevision: number
}>

export type BrowserDeviceDraftReplaceCas = Readonly<{
	deviceRevision: number
	draftId: string
	draftRevision: number
	observedLeaseRevision: number | null
}>

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

export type BrowserWorkflowDraftMetadata = Readonly<{
	id: string
	kind: BrowserWorkflowDraft['kind']
	draftRevision: number
	updatedAt: string
}>

export type BrowserWorkflowDraftReadState =
	| Readonly<{
			status: 'ready'
			metadata: BrowserWorkflowDraftMetadata
			draft: BrowserWorkflowDraft
	  }>
	| Readonly<{
			status: 'incompatible'
			metadata: BrowserWorkflowDraftMetadata
			schemaVersion: number
			reason: 'future-schema' | 'unsupported-schema'
	  }>
	| Readonly<{
			status: 'invalid'
			metadata: BrowserWorkflowDraftMetadata
	  }>

export type BrowserDraftLease = Readonly<{
	leaseRevision: number
	acquiredAt: string
	renewedAt: string
	expiresAt: string
}>

export type BrowserDraftLeaseState =
	| Readonly<{ status: 'unclaimed'; leaseRevision: number | null }>
	| Readonly<{
			status: 'live' | 'expired'
			lease: BrowserDraftLease
	  }>

export type BrowserWorkflowDraftEntry = Readonly<{
	draft: BrowserWorkflowDraftReadState
	lease: BrowserDraftLeaseState
}>

export type BrowserClaimedDraft = Readonly<{
	draft: BrowserWorkflowDraft
	lease: BrowserDraftLease
}>

export type BrowserClaimedDraftState = Readonly<{
	draft: BrowserWorkflowDraftReadState
	lease: BrowserDraftLease
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
	workspaceId: string | null
	repositoryId: string | null
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
	storageManager?: Pick<StorageManager, 'estimate'> | null
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
	envelopeVersion: typeof BROWSER_WORKFLOW_DRAFT_ENVELOPE_VERSION
	workspaceId: string
	repositoryId: string
	id: string
	kind: BrowserWorkflowDraft['kind']
	draftRevision: number
	updatedAt: string
	serializedPayload: string
}>

export type BrowserStoredDraftLease = Readonly<{
	workspaceId: string
	repositoryId: string
	draftId: string
	leaseRevision: number
}> &
	(
		| Readonly<{
				ownerToken: string
				acquiredAt: string
				renewedAt: string
				expiresAt: string
		  }>
		| Readonly<{
				ownerToken: null
				acquiredAt: null
				renewedAt: null
				expiresAt: null
		  }>
	)

export type BrowserStoredDeviceDraftRepository = Readonly<{
	workspaceId: string
	repositoryId: string
	deviceRevision: number
	createdAt: string
	updatedAt: string
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

export type OpenBrowserLibraryRepositoryOptions = {
	workspaceId: string
	repositoryId: string
	isCurrentContext(context: WorkspaceOperationContext): boolean
	dependencies?: BrowserLibraryDependencies
}

export type OpenBrowserDeviceDraftRepositoryOptions = {
	identity: BrowserWorkspaceIdentity
	dependencies?: BrowserLibraryDependencies
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
	recoverStorage(): Promise<BrowserRepositoryRecoveryOutcome>
	subscribe(listener: (change: BrowserRepositoryChange) => void): () => void
	close(): void
}

export interface BrowserWorkspaceCatalog {
	probe(): Promise<BrowserStorageHealth>
	estimateStorage(): Promise<BrowserStorageEstimateOutcome>
	listWorkspaces(): Promise<BrowserWorkspaceCatalogSnapshot>
	readActiveWorkspace(): Promise<BrowserActiveWorkspaceState>
	createWorkspace(
		input: CreateBrowserWorkspaceInput,
		expectedCatalogRevision: number
	): Promise<BrowserCatalogMutationResult<BrowserWorkspaceManifest>>
	activateWorkspace(
		identity: BrowserWorkspaceIdentity | null,
		expectedCatalogRevision: number
	): Promise<BrowserActiveWorkspaceState>
	renameWorkspace(
		name: string,
		expected: BrowserWorkspaceCatalogCas
	): Promise<BrowserWorkspaceCatalogMutationResult<BrowserWorkspaceManifest>>
	deleteWorkspace(
		expected: BrowserWorkspaceCatalogCas
	): Promise<BrowserCatalogMutationResult<void>>
	readOperations(
		identity: BrowserWorkspaceIdentity
	): Promise<BrowserWorkspaceReadResult<BrowserWorkspaceOperations>>
	listDrafts(
		identity: BrowserWorkspaceIdentity
	): Promise<BrowserWorkspaceReadResult<readonly BrowserWorkflowDraftEntry[]>>
	readDraft(
		identity: BrowserWorkspaceIdentity,
		draftId: string
	): Promise<BrowserWorkspaceReadResult<BrowserWorkflowDraftEntry | null>>
	recordExport(
		identity: BrowserWorkspaceIdentity,
		contentRevision: number,
		expectedRepositoryRevision: number,
		exportedAt?: string
	): Promise<BrowserWorkspaceMutationResult<BrowserWorkspaceOperations>>
	createDraftAndClaim(
		identity: BrowserWorkspaceIdentity,
		draft: BrowserWorkflowDraft,
		ownerToken: string,
		expected: BrowserDraftCas
	): Promise<BrowserWorkspaceMutationResult<BrowserClaimedDraft>>
	claimDraft(
		identity: BrowserWorkspaceIdentity,
		draftId: string,
		ownerToken: string,
		expectedRepositoryRevision: number
	): Promise<BrowserWorkspaceMutationResult<BrowserClaimedDraftState>>
	takeOverDraft(
		identity: BrowserWorkspaceIdentity,
		draftId: string,
		ownerToken: string,
		expected: BrowserDraftLeaseCas
	): Promise<BrowserWorkspaceMutationResult<BrowserClaimedDraftState>>
	renewDraftLease(
		identity: BrowserWorkspaceIdentity,
		draftId: string,
		ownerToken: string,
		expected: BrowserDraftLeaseCas
	): Promise<BrowserWorkspaceMutationResult<BrowserDraftLease>>
	releaseDraftLease(
		identity: BrowserWorkspaceIdentity,
		draftId: string,
		ownerToken: string,
		expected: BrowserDraftLeaseCas
	): Promise<BrowserWorkspaceMutationResult<void>>
	writeDraft(
		identity: BrowserWorkspaceIdentity,
		draft: BrowserWorkflowDraft,
		ownerToken: string,
		expected: BrowserDraftWriteCas
	): Promise<BrowserWorkspaceMutationResult<BrowserWorkflowDraft>>
	deleteDraft(
		identity: BrowserWorkspaceIdentity,
		draftId: string,
		ownerToken: string,
		expected: Omit<BrowserDraftWriteCas, 'draftRevision'> & {
			draftRevision: number
		}
	): Promise<BrowserWorkspaceMutationResult<void>>
	replaceDraftAndClaim(
		identity: BrowserWorkspaceIdentity,
		draft: BrowserWorkflowDraft,
		ownerToken: string,
		expected: BrowserDraftReplaceCas
	): Promise<BrowserWorkspaceMutationResult<BrowserClaimedDraft>>
	writeCopyReceipt(
		identity: BrowserWorkspaceIdentity,
		receipt: BrowserCopyReceipt | null,
		expectedRepositoryRevision: number
	): Promise<BrowserWorkspaceMutationResult<BrowserWorkspaceOperations>>
	writeStorageHealth(
		identity: BrowserWorkspaceIdentity,
		health: BrowserStorageHealth,
		expectedRepositoryRevision: number
	): Promise<BrowserWorkspaceMutationResult<BrowserWorkspaceOperations>>
	subscribe(listener: (change: BrowserRepositoryChange) => void): () => void
	close(): void
}

export interface BrowserDeviceDraftRepository {
	readonly identity: BrowserWorkspaceIdentity
	listDrafts(): Promise<
		BrowserDeviceDraftReadResult<readonly BrowserWorkflowDraftEntry[]>
	>
	readDraft(
		draftId: string
	): Promise<BrowserDeviceDraftReadResult<BrowserWorkflowDraftEntry | null>>
	createDraftAndClaim(
		draft: BrowserWorkflowDraft,
		ownerToken: string,
		expected: BrowserDeviceDraftCas
	): Promise<BrowserDeviceDraftReadResult<BrowserClaimedDraft>>
	claimDraft(
		draftId: string,
		ownerToken: string,
		expectedDeviceRevision: number
	): Promise<BrowserDeviceDraftReadResult<BrowserClaimedDraftState>>
	takeOverDraft(
		draftId: string,
		ownerToken: string,
		expected: BrowserDeviceDraftLeaseCas
	): Promise<BrowserDeviceDraftReadResult<BrowserClaimedDraftState>>
	renewDraftLease(
		draftId: string,
		ownerToken: string,
		expected: BrowserDeviceDraftLeaseCas
	): Promise<BrowserDeviceDraftReadResult<BrowserDraftLease>>
	releaseDraftLease(
		draftId: string,
		ownerToken: string,
		expected: BrowserDeviceDraftLeaseCas
	): Promise<BrowserDeviceDraftReadResult<void>>
	writeDraft(
		draft: BrowserWorkflowDraft,
		ownerToken: string,
		expected: BrowserDeviceDraftWriteCas
	): Promise<BrowserDeviceDraftReadResult<BrowserWorkflowDraft>>
	deleteDraft(
		draftId: string,
		ownerToken: string,
		expected: BrowserDeviceDraftWriteCas
	): Promise<BrowserDeviceDraftReadResult<void>>
	replaceDraftAndClaim(
		draft: BrowserWorkflowDraft,
		ownerToken: string,
		expected: BrowserDeviceDraftReplaceCas
	): Promise<BrowserDeviceDraftReadResult<BrowserClaimedDraft>>
	subscribe(listener: (change: BrowserRepositoryChange) => void): () => void
	close(): void
}
