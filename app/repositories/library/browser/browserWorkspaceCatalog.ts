import type { LibraryPreferences } from '~~/shared/types/library'
import { BrowserLibraryBroadcaster } from './browserLibraryBroadcast'
import {
	decodeBrowserActiveWorkspaceMarker,
	decodeBrowserRepositoryRegistry,
	decodeBrowserWorkspaceManifest,
	decodeBrowserWorkspaceOperations,
	encodeBrowserPreferencesRow
} from './browserLibraryCodecs'
import {
	BrowserRepositoryConflictError,
	BrowserRepositoryNotFoundError,
	BrowserStorageCodecError,
	BrowserStorageError,
	normalizeBrowserRepositoryError
} from './browserLibraryErrors'
import {
	browserLibraryRandomUUID,
	browserLibraryTimestamp,
	browserWorkspaceWideLockName,
	runBrowserLibraryReadTransaction,
	runBrowserLibraryTransaction,
	withOptionalBrowserLibraryLock
} from './browserLibraryRuntime'
import {
	BROWSER_LIBRARY_STORES,
	BROWSER_LIBRARY_WORKSPACE_INDEX,
	estimateBrowserLibraryStorage,
	openBrowserLibraryDatabase,
	probeBrowserLibraryStorage,
	requestResult
} from './browserLibrarySchema'
import {
	BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY,
	BROWSER_LIBRARY_DATABASE_NAME,
	BROWSER_LIBRARY_REGISTRY_KEY,
	BROWSER_LIBRARY_SCHEMA_VERSION,
	type BrowserActiveWorkspaceMarker,
	type BrowserActiveWorkspaceState,
	type BrowserCatalogMutationResult,
	type BrowserCopyReceipt,
	type BrowserDraftCas,
	type BrowserLibraryDependencies,
	type BrowserRepositoryChange,
	type BrowserRepositoryInvalidation,
	type BrowserRepositoryRegistry,
	type BrowserStorageHealth,
	type BrowserWorkflowDraft,
	type BrowserWorkspaceCatalog,
	type BrowserWorkspaceCatalogCas,
	type BrowserWorkspaceCatalogMutationResult,
	type BrowserWorkspaceCatalogSnapshot,
	type BrowserWorkspaceIdentity,
	type BrowserWorkspaceManifest,
	type BrowserWorkspaceMutationResult,
	type BrowserWorkspaceOperations,
	type BrowserWorkspaceReadResult,
	type CreateBrowserWorkspaceInput
} from './browserLibraryTypes'
import {
	type BrowserOperationalCommit,
	deleteBrowserWorkspaceDraft,
	listBrowserWorkspaceDrafts,
	readBrowserWorkspaceDraft,
	readBrowserWorkspaceOperations,
	recordBrowserWorkspaceExport,
	writeBrowserWorkspaceCopyReceipt,
	writeBrowserWorkspaceDraft,
	writeBrowserWorkspaceStorageHealth
} from './browserWorkspaceOperations'

const DEFAULT_BROWSER_LIBRARY_PREFERENCES: LibraryPreferences = {
	ui_theme: 'auto',
	key_format: 'camelot',
	list_layout: 'cover',
	selected_crate: '',
	turntable_pitch_range: 8,
	turntable_theme: 'silver'
}

const WORKSPACE_INDEXED_STORES = [
	BROWSER_LIBRARY_STORES.records,
	BROWSER_LIBRARY_STORES.tracks,
	BROWSER_LIBRARY_STORES.crates,
	BROWSER_LIBRARY_STORES.savedSets,
	BROWSER_LIBRARY_STORES.covers,
	BROWSER_LIBRARY_STORES.drafts
] as const

const REPOSITORY_DATA_STORES = [
	BROWSER_LIBRARY_STORES.workspaces,
	BROWSER_LIBRARY_STORES.operations,
	BROWSER_LIBRARY_STORES.preferences,
	...WORKSPACE_INDEXED_STORES
] as const

const DELETE_WORKSPACE_STORES = [
	BROWSER_LIBRARY_STORES.registry,
	...REPOSITORY_DATA_STORES
] as const

function requiredRegistry(value: unknown): BrowserRepositoryRegistry {
	if (value === undefined) {
		throw new BrowserStorageCodecError(
			'/registry',
			'The Local library registry is missing.'
		)
	}
	return decodeBrowserRepositoryRegistry(value)
}

function requiredManifest(
	value: unknown,
	identity?: BrowserWorkspaceIdentity
): BrowserWorkspaceManifest {
	if (value === undefined) throw new BrowserRepositoryNotFoundError('workspace')
	const manifest = decodeBrowserWorkspaceManifest(value)
	if (
		identity &&
		(manifest.id !== identity.workspaceId ||
			manifest.repositoryId !== identity.repositoryId)
	) {
		throw new BrowserRepositoryNotFoundError('workspace')
	}
	return manifest
}

function assertCatalogRevision(
	registry: BrowserRepositoryRegistry,
	expected: number
) {
	if (registry.catalogRevision !== expected) {
		throw new BrowserRepositoryConflictError(
			'catalog-revision',
			expected,
			registry.catalogRevision
		)
	}
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

function nextRegistry(
	registry: BrowserRepositoryRegistry,
	updatedAt: string
): BrowserRepositoryRegistry {
	return decodeBrowserRepositoryRegistry({
		...registry,
		catalogRevision: registry.catalogRevision + 1,
		updatedAt
	})
}

async function initializeBrowserRepositoryRegistry(
	database: IDBDatabase,
	dependencies: BrowserLibraryDependencies
): Promise<BrowserRepositoryRegistry> {
	return runBrowserLibraryTransaction(
		database,
		[BROWSER_LIBRARY_STORES.registry, ...REPOSITORY_DATA_STORES],
		'initialize-registry',
		dependencies,
		async (transaction, writer) => {
			const registryStore = transaction.objectStore(
				BROWSER_LIBRARY_STORES.registry
			)
			const [storedRegistry, activeMarker, dataCounts] = await Promise.all([
				requestResult(registryStore.get(BROWSER_LIBRARY_REGISTRY_KEY)),
				requestResult(registryStore.get(BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY)),
				Promise.all(
					REPOSITORY_DATA_STORES.map((storeName) =>
						requestResult(transaction.objectStore(storeName).count())
					)
				)
			])

			if (storedRegistry !== undefined) {
				return decodeBrowserRepositoryRegistry(storedRegistry)
			}
			if (
				dataCounts.some((count) => count !== 0) ||
				activeMarker !== undefined
			) {
				throw new BrowserStorageCodecError(
					'/registry',
					'The Local library registry is missing while repository data remains.'
				)
			}

			const timestamp = browserLibraryTimestamp(dependencies)
			const registry = decodeBrowserRepositoryRegistry({
				key: BROWSER_LIBRARY_REGISTRY_KEY,
				schemaVersion: BROWSER_LIBRARY_SCHEMA_VERSION,
				catalogRevision: 0,
				createdAt: timestamp,
				updatedAt: timestamp
			})
			writer.add(registryStore, registry)
			return registry
		}
	)
}

class BrowserWorkspaceCatalogImpl implements BrowserWorkspaceCatalog {
	readonly #databaseName: string
	readonly #broadcaster: BrowserLibraryBroadcaster
	#commandTail: Promise<void> = Promise.resolve()
	#closed = false
	#lastHealth: BrowserStorageHealth

	constructor(
		private readonly database: IDBDatabase,
		private readonly dependencies: BrowserLibraryDependencies,
		health: BrowserStorageHealth
	) {
		this.#databaseName =
			dependencies.databaseName ?? BROWSER_LIBRARY_DATABASE_NAME
		this.#lastHealth = health
		this.#broadcaster = new BrowserLibraryBroadcaster(
			dependencies,
			this.#databaseName
		)
	}

	#ensureOpen() {
		if (this.#closed) {
			throw new BrowserStorageError(
				'unavailable',
				'This Local library catalog connection is closed.'
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
		change: Omit<
			BrowserRepositoryChange,
			'protocolVersion' | 'eventId' | 'senderId'
		>
	) {
		this.#broadcaster.publish(change)
	}

	async probe(): Promise<BrowserStorageHealth> {
		return this.#read(async () => {
			const health = await probeBrowserLibraryStorage(this.dependencies)
			this.#lastHealth = health
			return health
		})
	}

	estimateStorage() {
		return estimateBrowserLibraryStorage(this.dependencies)
	}

	listWorkspaces(): Promise<BrowserWorkspaceCatalogSnapshot> {
		return this.#read(() =>
			runBrowserLibraryReadTransaction(
				this.database,
				[BROWSER_LIBRARY_STORES.registry, BROWSER_LIBRARY_STORES.workspaces],
				async (transaction) => {
					const [storedRegistry, storedWorkspaces] = await Promise.all([
						requestResult(
							transaction
								.objectStore(BROWSER_LIBRARY_STORES.registry)
								.get(BROWSER_LIBRARY_REGISTRY_KEY)
						),
						requestResult(
							transaction
								.objectStore(BROWSER_LIBRARY_STORES.workspaces)
								.getAll()
						)
					])
					const registry = requiredRegistry(storedRegistry)
					const workspaces = storedWorkspaces
						.map(decodeBrowserWorkspaceManifest)
						.sort(
							(left, right) =>
								left.createdAt.localeCompare(right.createdAt) ||
								left.name.localeCompare(right.name) ||
								left.id.localeCompare(right.id)
						)
					return {
						catalogRevision: registry.catalogRevision,
						workspaces
					}
				}
			)
		)
	}

	readActiveWorkspace(): Promise<BrowserActiveWorkspaceState> {
		return this.#read(() =>
			runBrowserLibraryReadTransaction(
				this.database,
				[BROWSER_LIBRARY_STORES.registry, BROWSER_LIBRARY_STORES.workspaces],
				async (transaction) => {
					const registryStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.registry
					)
					const [storedRegistry, storedMarker] = await Promise.all([
						requestResult(registryStore.get(BROWSER_LIBRARY_REGISTRY_KEY)),
						requestResult(
							registryStore.get(BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY)
						)
					])
					const registry = requiredRegistry(storedRegistry)
					if (storedMarker === undefined) {
						return {
							status: 'none',
							catalogRevision: registry.catalogRevision
						}
					}

					let marker: BrowserActiveWorkspaceMarker
					try {
						marker = decodeBrowserActiveWorkspaceMarker(storedMarker)
					} catch {
						return {
							status: 'corrupt',
							catalogRevision: registry.catalogRevision,
							reason: 'invalid-marker'
						}
					}
					if (marker.catalogRevision > registry.catalogRevision) {
						return {
							status: 'corrupt',
							catalogRevision: registry.catalogRevision,
							reason: 'invalid-marker'
						}
					}
					const storedWorkspace = await requestResult(
						transaction
							.objectStore(BROWSER_LIBRARY_STORES.workspaces)
							.get(marker.workspaceId)
					)
					if (storedWorkspace === undefined) {
						return {
							status: 'corrupt',
							catalogRevision: registry.catalogRevision,
							reason: 'missing-workspace'
						}
					}
					const manifest = decodeBrowserWorkspaceManifest(storedWorkspace)
					if (manifest.repositoryId !== marker.repositoryId) {
						return {
							status: 'corrupt',
							catalogRevision: registry.catalogRevision,
							reason: 'repository-mismatch'
						}
					}
					return {
						status: 'active',
						catalogRevision: registry.catalogRevision,
						workspaceId: marker.workspaceId,
						repositoryId: marker.repositoryId
					}
				}
			)
		)
	}

	createWorkspace(
		input: CreateBrowserWorkspaceInput,
		expectedCatalogRevision: number
	): Promise<BrowserCatalogMutationResult<BrowserWorkspaceManifest>> {
		return this.#enqueue(async () => {
			const timestamp = browserLibraryTimestamp(this.dependencies)
			const workspaceId =
				input.id ?? browserLibraryRandomUUID(this.dependencies)
			const repositoryId = browserLibraryRandomUUID(this.dependencies)
			const name = input.name.trim()
			const result = await runBrowserLibraryTransaction<
				BrowserCatalogMutationResult<BrowserWorkspaceManifest>
			>(
				this.database,
				[
					BROWSER_LIBRARY_STORES.registry,
					BROWSER_LIBRARY_STORES.workspaces,
					BROWSER_LIBRARY_STORES.operations,
					BROWSER_LIBRARY_STORES.preferences
				],
				'create-workspace',
				this.dependencies,
				async (transaction, writer) => {
					const registryStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.registry
					)
					const workspaceStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.workspaces
					)
					const [storedRegistry, storedWorkspace] = await Promise.all([
						requestResult(registryStore.get(BROWSER_LIBRARY_REGISTRY_KEY)),
						requestResult(workspaceStore.get(workspaceId))
					])
					const registry = requiredRegistry(storedRegistry)
					assertCatalogRevision(registry, expectedCatalogRevision)
					if (storedWorkspace !== undefined) {
						throw new BrowserRepositoryConflictError(
							'workspace-exists',
							null,
							null,
							'A Local library workspace already uses this identifier.'
						)
					}

					const manifest = decodeBrowserWorkspaceManifest({
						id: workspaceId,
						repositoryId,
						name,
						schemaVersion: BROWSER_LIBRARY_SCHEMA_VERSION,
						createdAt: timestamp,
						updatedAt: timestamp,
						contentRevision: 0,
						repositoryRevision: 0,
						lastSuccessfulContentWriteAt: null,
						coverCompleteness: 'complete'
					})
					const operations = decodeBrowserWorkspaceOperations(
						{
							workspaceId,
							lastExportedContentRevision: null,
							lastExportedAt: null,
							storageHealth: this.#lastHealth,
							copyReceipt: null
						},
						workspaceId
					)
					const next = nextRegistry(registry, timestamp)
					writer.add(workspaceStore, manifest)
					writer.add(
						transaction.objectStore(BROWSER_LIBRARY_STORES.preferences),
						encodeBrowserPreferencesRow(
							workspaceId,
							DEFAULT_BROWSER_LIBRARY_PREFERENCES
						)
					)
					writer.add(
						transaction.objectStore(BROWSER_LIBRARY_STORES.operations),
						operations
					)
					writer.put(registryStore, next)
					if (input.activate) {
						writer.put(
							registryStore,
							decodeBrowserActiveWorkspaceMarker({
								key: BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY,
								workspaceId,
								repositoryId,
								catalogRevision: next.catalogRevision,
								updatedAt: timestamp
							})
						)
					}
					return { value: manifest, catalogRevision: next.catalogRevision }
				}
			)
			this.#publish({
				type: 'commit',
				workspaceId,
				repositoryId,
				catalogRevision: result.catalogRevision,
				repositoryRevision: result.value.repositoryRevision,
				contentRevision: result.value.contentRevision,
				committedAt: timestamp,
				invalidations: [{ entity: 'workspace', ids: [workspaceId] }]
			})
			return result
		})
	}

	activateWorkspace(
		identity: BrowserWorkspaceIdentity | null,
		expectedCatalogRevision: number
	): Promise<BrowserActiveWorkspaceState> {
		return this.#enqueue(async () => {
			const timestamp = browserLibraryTimestamp(this.dependencies)
			const result =
				await runBrowserLibraryTransaction<BrowserActiveWorkspaceState>(
					this.database,
					[BROWSER_LIBRARY_STORES.registry, BROWSER_LIBRARY_STORES.workspaces],
					'activate-workspace',
					this.dependencies,
					async (transaction, writer) => {
						const registryStore = transaction.objectStore(
							BROWSER_LIBRARY_STORES.registry
						)
						const registry = requiredRegistry(
							await requestResult(
								registryStore.get(BROWSER_LIBRARY_REGISTRY_KEY)
							)
						)
						assertCatalogRevision(registry, expectedCatalogRevision)
						if (identity !== null) {
							const storedWorkspace = await requestResult(
								transaction
									.objectStore(BROWSER_LIBRARY_STORES.workspaces)
									.get(identity.workspaceId)
							)
							requiredManifest(storedWorkspace, identity)
						}
						const next = nextRegistry(registry, timestamp)
						writer.put(registryStore, next)
						if (identity === null) {
							writer.delete(registryStore, BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY)
							return {
								status: 'none',
								catalogRevision: next.catalogRevision
							}
						}
						writer.put(
							registryStore,
							decodeBrowserActiveWorkspaceMarker({
								key: BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY,
								workspaceId: identity.workspaceId,
								repositoryId: identity.repositoryId,
								catalogRevision: next.catalogRevision,
								updatedAt: timestamp
							})
						)
						return {
							status: 'active',
							catalogRevision: next.catalogRevision,
							workspaceId: identity.workspaceId,
							repositoryId: identity.repositoryId
						}
					}
				)
			this.#publish({
				type: 'commit',
				workspaceId: identity?.workspaceId ?? null,
				repositoryId: identity?.repositoryId ?? null,
				catalogRevision: result.catalogRevision,
				repositoryRevision: null,
				contentRevision: null,
				committedAt: timestamp,
				invalidations: [
					{
						entity: 'workspace',
						ids: identity === null ? [] : [identity.workspaceId]
					}
				]
			})
			return result
		})
	}

	renameWorkspace(
		name: string,
		expected: BrowserWorkspaceCatalogCas
	): Promise<BrowserWorkspaceCatalogMutationResult<BrowserWorkspaceManifest>> {
		return this.#enqueue(async () => {
			const timestamp = browserLibraryTimestamp(this.dependencies)
			const result = await runBrowserLibraryTransaction(
				this.database,
				[BROWSER_LIBRARY_STORES.registry, BROWSER_LIBRARY_STORES.workspaces],
				'rename-workspace',
				this.dependencies,
				async (transaction, writer) => {
					const registryStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.registry
					)
					const workspaceStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.workspaces
					)
					const [storedRegistry, storedManifest] = await Promise.all([
						requestResult(registryStore.get(BROWSER_LIBRARY_REGISTRY_KEY)),
						requestResult(workspaceStore.get(expected.workspaceId))
					])
					const registry = requiredRegistry(storedRegistry)
					const manifest = requiredManifest(storedManifest, expected)
					assertCatalogRevision(registry, expected.catalogRevision)
					assertRepositoryRevision(manifest, expected.repositoryRevision)
					const renamed = decodeBrowserWorkspaceManifest({
						...manifest,
						name: name.trim(),
						updatedAt: timestamp,
						repositoryRevision: manifest.repositoryRevision + 1
					})
					const next = nextRegistry(registry, timestamp)
					writer.put(workspaceStore, renamed)
					writer.put(registryStore, next)
					return {
						value: renamed,
						catalogRevision: next.catalogRevision,
						repositoryRevision: renamed.repositoryRevision
					}
				}
			)
			this.#publish({
				type: 'commit',
				workspaceId: expected.workspaceId,
				repositoryId: expected.repositoryId,
				catalogRevision: result.catalogRevision,
				repositoryRevision: result.repositoryRevision,
				contentRevision: result.value.contentRevision,
				committedAt: timestamp,
				invalidations: [{ entity: 'workspace', ids: [expected.workspaceId] }]
			})
			return result
		})
	}

	deleteWorkspace(
		expected: BrowserWorkspaceCatalogCas
	): Promise<BrowserCatalogMutationResult<void>> {
		return this.#enqueue(() =>
			withOptionalBrowserLibraryLock(
				this.dependencies,
				browserWorkspaceWideLockName(this.#databaseName, expected.workspaceId),
				async () => {
					const timestamp = browserLibraryTimestamp(this.dependencies)
					const result = await runBrowserLibraryTransaction(
						this.database,
						DELETE_WORKSPACE_STORES,
						'delete-workspace',
						this.dependencies,
						async (transaction, writer) => {
							const registryStore = transaction.objectStore(
								BROWSER_LIBRARY_STORES.registry
							)
							const workspaceStore = transaction.objectStore(
								BROWSER_LIBRARY_STORES.workspaces
							)
							const [storedRegistry, storedManifest, storedMarker, entityKeys] =
								await Promise.all([
									requestResult(
										registryStore.get(BROWSER_LIBRARY_REGISTRY_KEY)
									),
									requestResult(workspaceStore.get(expected.workspaceId)),
									requestResult(
										registryStore.get(BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY)
									),
									Promise.all(
										WORKSPACE_INDEXED_STORES.map((storeName) =>
											requestResult(
												transaction
													.objectStore(storeName)
													.index(BROWSER_LIBRARY_WORKSPACE_INDEX)
													.getAllKeys(expected.workspaceId)
											)
										)
									)
								])
							const registry = requiredRegistry(storedRegistry)
							const manifest = requiredManifest(storedManifest, expected)
							assertCatalogRevision(registry, expected.catalogRevision)
							assertRepositoryRevision(manifest, expected.repositoryRevision)

							for (const [storeIndex, keys] of entityKeys.entries()) {
								const store = transaction.objectStore(
									WORKSPACE_INDEXED_STORES[storeIndex]!
								)
								for (const key of keys) writer.delete(store, key)
							}
							writer.delete(
								transaction.objectStore(BROWSER_LIBRARY_STORES.operations),
								expected.workspaceId
							)
							writer.delete(
								transaction.objectStore(BROWSER_LIBRARY_STORES.preferences),
								expected.workspaceId
							)
							writer.delete(workspaceStore, expected.workspaceId)
							if (storedMarker !== undefined) {
								let marker: BrowserActiveWorkspaceMarker | null = null
								try {
									marker = decodeBrowserActiveWorkspaceMarker(storedMarker)
								} catch {
									// Preserve a corrupt marker for explicit diagnosis/recovery.
								}
								if (
									marker?.workspaceId === expected.workspaceId &&
									marker.repositoryId === expected.repositoryId
								) {
									writer.delete(
										registryStore,
										BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY
									)
								}
							}
							const next = nextRegistry(registry, timestamp)
							writer.put(registryStore, next)
							return { value: undefined, catalogRevision: next.catalogRevision }
						}
					)
					this.#publish({
						type: 'delete',
						workspaceId: expected.workspaceId,
						repositoryId: expected.repositoryId,
						catalogRevision: result.catalogRevision,
						repositoryRevision: null,
						contentRevision: null,
						committedAt: timestamp,
						invalidations: [
							{ entity: 'workspace', ids: [expected.workspaceId] },
							...WORKSPACE_INDEXED_STORES.map(
								(entity): BrowserRepositoryInvalidation => ({
									entity:
										entity === BROWSER_LIBRARY_STORES.savedSets
											? 'saved-sets'
											: entity,
									ids: []
								})
							),
							{ entity: 'operations', ids: [expected.workspaceId] },
							{ entity: 'preferences', ids: [expected.workspaceId] }
						]
					})
					return result
				}
			)
		)
	}

	readOperations(
		identity: BrowserWorkspaceIdentity
	): Promise<BrowserWorkspaceReadResult<BrowserWorkspaceOperations>> {
		return this.#read(() =>
			readBrowserWorkspaceOperations(this.database, identity)
		)
	}

	listDrafts(
		identity: BrowserWorkspaceIdentity
	): Promise<BrowserWorkspaceReadResult<readonly BrowserWorkflowDraft[]>> {
		return this.#read(() => listBrowserWorkspaceDrafts(this.database, identity))
	}

	readDraft(
		identity: BrowserWorkspaceIdentity,
		draftId: string
	): Promise<BrowserWorkspaceReadResult<BrowserWorkflowDraft | null>> {
		return this.#read(() =>
			readBrowserWorkspaceDraft(this.database, identity, draftId)
		)
	}

	#publishOperationalCommit<T>(
		identity: BrowserWorkspaceIdentity,
		committedAt: string,
		commit: BrowserOperationalCommit<T>,
		entity: 'operations' | 'drafts',
		ids: readonly string[],
		type: 'commit' | 'delete' = 'commit'
	): BrowserWorkspaceMutationResult<T> {
		this.#publish({
			type,
			workspaceId: identity.workspaceId,
			repositoryId: identity.repositoryId,
			catalogRevision: null,
			repositoryRevision: commit.result.repositoryRevision,
			contentRevision: commit.contentRevision,
			committedAt,
			invalidations: [{ entity, ids }]
		})
		return commit.result
	}

	recordExport(
		identity: BrowserWorkspaceIdentity,
		contentRevision: number,
		expectedRepositoryRevision: number,
		exportedAt?: string
	): Promise<BrowserWorkspaceMutationResult<BrowserWorkspaceOperations>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await recordBrowserWorkspaceExport(
				this.database,
				this.dependencies,
				identity,
				contentRevision,
				expectedRepositoryRevision,
				committedAt,
				exportedAt
			)
			return this.#publishOperationalCommit(
				identity,
				committedAt,
				commit,
				'operations',
				[identity.workspaceId]
			)
		})
	}

	writeCopyReceipt(
		identity: BrowserWorkspaceIdentity,
		receipt: BrowserCopyReceipt | null,
		expectedRepositoryRevision: number
	): Promise<BrowserWorkspaceMutationResult<BrowserWorkspaceOperations>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await writeBrowserWorkspaceCopyReceipt(
				this.database,
				this.dependencies,
				identity,
				receipt,
				expectedRepositoryRevision,
				committedAt
			)
			return this.#publishOperationalCommit(
				identity,
				committedAt,
				commit,
				'operations',
				[identity.workspaceId]
			)
		})
	}

	writeStorageHealth(
		identity: BrowserWorkspaceIdentity,
		health: BrowserStorageHealth,
		expectedRepositoryRevision: number
	): Promise<BrowserWorkspaceMutationResult<BrowserWorkspaceOperations>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await writeBrowserWorkspaceStorageHealth(
				this.database,
				this.dependencies,
				identity,
				health,
				expectedRepositoryRevision,
				committedAt
			)
			return this.#publishOperationalCommit(
				identity,
				committedAt,
				commit,
				'operations',
				[identity.workspaceId]
			)
		})
	}

	writeDraft(
		identity: BrowserWorkspaceIdentity,
		draft: BrowserWorkflowDraft,
		expected: BrowserDraftCas
	): Promise<BrowserWorkspaceMutationResult<BrowserWorkflowDraft>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await writeBrowserWorkspaceDraft(
				this.database,
				this.dependencies,
				identity,
				draft,
				expected,
				committedAt
			)
			return this.#publishOperationalCommit(
				identity,
				committedAt,
				commit,
				'drafts',
				[draft.id]
			)
		})
	}

	deleteDraft(
		identity: BrowserWorkspaceIdentity,
		draftId: string,
		expected: Omit<BrowserDraftCas, 'draftRevision'> & { draftRevision: number }
	): Promise<BrowserWorkspaceMutationResult<void>> {
		return this.#enqueue(async () => {
			const committedAt = browserLibraryTimestamp(this.dependencies)
			const commit = await deleteBrowserWorkspaceDraft(
				this.database,
				this.dependencies,
				identity,
				draftId,
				expected,
				committedAt
			)
			return this.#publishOperationalCommit(
				identity,
				committedAt,
				commit,
				'drafts',
				[draftId],
				'delete'
			)
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

export async function createBrowserWorkspaceCatalog(
	dependencies: BrowserLibraryDependencies = {}
): Promise<BrowserWorkspaceCatalog> {
	const health = await probeBrowserLibraryStorage(dependencies)
	if (health.code !== 'healthy') {
		throw new BrowserStorageError(health.code, health.message)
	}

	const database = await openBrowserLibraryDatabase(dependencies)
	try {
		await initializeBrowserRepositoryRegistry(database, dependencies)
		return new BrowserWorkspaceCatalogImpl(database, dependencies, health)
	} catch (error) {
		database.close()
		throw normalizeBrowserRepositoryError(error)
	}
}
