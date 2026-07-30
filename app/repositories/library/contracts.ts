import type { DecodeIssue } from '~/utils/supabaseRows'
import type {
	CoverReference,
	CrateCreateInput,
	CrateMetadataUpdate,
	ExternalRecordImportResult,
	ExternalRecordWithTracksInput,
	LibraryCoverChange,
	LibraryCrate,
	LibraryObservedView,
	LibraryPlayedTrackEntry,
	LibraryPreferences,
	LibraryRecord,
	LibrarySavedSet,
	LibraryTrack,
	LibraryTrackUpdateInput,
	ManualRecordWithTracksInput,
	RecordUpdateInput,
	TrackCreateInput
} from '~~/shared/types/library'
import type {
	TrackBatchUpdate,
	TrackBatchUpdateOutcome
} from '~~/shared/types/trackUpdates'

export type LibraryLocation = 'cloud' | 'browser' | 'demo'

export type WorkbenchCapabilities = {
	location: LibraryLocation
	canPersistSessions: boolean
	canMutateLibrary: boolean
	canManageCrates: boolean
	canConnectDiscogs: boolean
	canEnrichTracks: boolean
	canManageAccount: boolean
}

export type WorkspaceDescriptor = Readonly<{
	id: string
	repositoryId: string
	location: LibraryLocation
	displayLabel: string
	readOnly: boolean
	/**
	 * Highest adapter-local observation revision accepted by this runtime.
	 * This is a UI stale-result guard, not a durable or cross-client CAS token.
	 */
	repositoryRevision: number
	capabilities: WorkbenchCapabilities
}>

export type WorkspaceOperationContext = Readonly<{
	workspaceId: string
	repositoryId: string
	activationGeneration: number
}>

export type RepositoryUnavailableReason =
	'read-only' | 'offline' | 'unauthenticated' | 'transport'

export type RepositoryConflictReason =
	'not-found' | 'revision-mismatch' | 'precondition-failed' | 'integrity'

export type RepositoryOutcome<T> =
	| {
			status: 'success'
			value: T
			/** Adapter-local monotonic observation token; never an implicit CAS. */
			repositoryRevision: number
			issues: DecodeIssue[]
	  }
	| { status: 'stale' }
	| {
			status: 'conflict'
			reason: RepositoryConflictReason
			current?: unknown
	  }
	| {
			status: 'unavailable'
			reason: RepositoryUnavailableReason
			error?: unknown
	  }

export type RepositoryCommand<T> = Promise<RepositoryOutcome<T>>

export interface RecordsRepository {
	list(context: WorkspaceOperationContext): RepositoryCommand<LibraryRecord[]>
	findExistingDiscogsIds(
		context: WorkspaceOperationContext,
		discogsIds: readonly number[]
	): RepositoryCommand<Set<number>>
	importExternalWithTracks(
		context: WorkspaceOperationContext,
		input: ExternalRecordWithTracksInput
	): RepositoryCommand<ExternalRecordImportResult>
	createWithTracks(
		context: WorkspaceOperationContext,
		input: ManualRecordWithTracksInput
	): RepositoryCommand<LibraryRecord>
	update(
		context: WorkspaceOperationContext,
		input: { id: string; updates: RecordUpdateInput }
	): RepositoryCommand<LibraryRecord>
	updateWithCover(
		context: WorkspaceOperationContext,
		input: {
			id: string
			updates: RecordUpdateInput
			change: LibraryCoverChange
		}
	): RepositoryCommand<LibraryRecord>
	removeFromCollection(
		context: WorkspaceOperationContext,
		input: { id: string }
	): RepositoryCommand<{ id: string }>
	drainCoverCleanup(
		context: WorkspaceOperationContext,
		options?: { fresh?: boolean }
	): RepositoryCommand<void>
}

export interface TracksRepository {
	list(context: WorkspaceOperationContext): RepositoryCommand<LibraryTrack[]>
	create(
		context: WorkspaceOperationContext,
		input: TrackCreateInput
	): RepositoryCommand<LibraryTrack>
	update(
		context: WorkspaceOperationContext,
		input: { id: string; updates: LibraryTrackUpdateInput }
	): RepositoryCommand<LibraryTrack>
	updateBatch(
		context: WorkspaceOperationContext,
		updates: readonly TrackBatchUpdate[],
		options?: {
			onProgress?: (
				completed: number,
				total: number,
				result: TrackBatchUpdateOutcome['results'][number]
			) => void
		}
	): RepositoryCommand<TrackBatchUpdateOutcome>
	delete(
		context: WorkspaceOperationContext,
		input: { id: string }
	): RepositoryCommand<{ id: string }>
}

export interface CratesRepository {
	list(context: WorkspaceOperationContext): RepositoryCommand<LibraryCrate[]>
	create(
		context: WorkspaceOperationContext,
		input: CrateCreateInput
	): RepositoryCommand<LibraryCrate>
	updateMetadata(
		context: WorkspaceOperationContext,
		input: { id: string; updates: CrateMetadataUpdate }
	): RepositoryCommand<LibraryCrate>
	delete(
		context: WorkspaceOperationContext,
		input: { id: string }
	): RepositoryCommand<{ id: string }>
	addRecord(
		context: WorkspaceOperationContext,
		input: { crateId: string; recordId: string }
	): RepositoryCommand<LibraryCrate>
	removeRecord(
		context: WorkspaceOperationContext,
		input: { crateId: string; recordId: string }
	): RepositoryCommand<LibraryCrate>
}

export interface SavedSetsRepository {
	list(context: WorkspaceOperationContext): RepositoryCommand<LibrarySavedSet[]>
	save(
		context: WorkspaceOperationContext,
		input: {
			setId: string | null
			kind: 'auto' | 'manual'
			name: string | null
			playedTracks: readonly LibraryPlayedTrackEntry[]
		}
	): RepositoryCommand<LibrarySavedSet>
	delete(
		context: WorkspaceOperationContext,
		input: { id: string }
	): RepositoryCommand<{ id: string }>
}

export interface PreferencesRepository {
	read(
		context: WorkspaceOperationContext
	): RepositoryCommand<LibraryPreferences>
	update(
		context: WorkspaceOperationContext,
		patch: Partial<LibraryPreferences>
	): RepositoryCommand<LibraryPreferences>
}

export interface CoverResolver {
	resolve(
		context: WorkspaceOperationContext,
		reference: CoverReference
	): Promise<string | null>
	reset(): void
}

export interface LibraryRepositoryBundle {
	readonly id: string
	/**
	 * Reads a best-effort view. Backends may issue multiple storage reads, so
	 * callers must not use this as an atomic archive/backup snapshot.
	 */
	readObservedLibraryView(
		context: WorkspaceOperationContext
	): RepositoryCommand<LibraryObservedView>
	readonly records: RecordsRepository
	readonly tracks: TracksRepository
	readonly crates: CratesRepository
	readonly savedSets: SavedSetsRepository
	readonly preferences: PreferencesRepository
	readonly covers: CoverResolver
}
