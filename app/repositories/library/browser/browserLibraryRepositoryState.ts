import type { RepositoryOutcome, WorkspaceOperationContext } from '../contracts'
import { BrowserLibraryBroadcaster } from './browserLibraryBroadcast'
import {
	decodeBrowserManagedCover,
	decodeBrowserRecordRow,
	decodeBrowserWorkspaceManifest
} from './browserLibraryCodecs'
import {
	BrowserRepositoryConflictError,
	BrowserRepositoryDomainConflictError,
	BrowserRepositoryNotFoundError,
	BrowserStorageCodecError,
	BrowserStorageError,
	normalizeBrowserRepositoryError,
	storageHealthFromError
} from './browserLibraryErrors'
import {
	type BrowserTransactionWriter,
	browserLibraryTimestamp,
	browserWorkspaceWideLockName,
	runBrowserLibraryReadTransaction,
	runBrowserLibraryTransaction,
	withOptionalBrowserLibraryLock
} from './browserLibraryRuntime'
import {
	BROWSER_LIBRARY_STORES,
	BROWSER_LIBRARY_WORKSPACE_INDEX,
	type BrowserLibraryStoreName,
	openBrowserLibraryDatabase,
	probeBrowserLibraryStorage,
	requestResult
} from './browserLibrarySchema'
import { readBrowserLibrarySnapshot } from './browserLibrarySnapshot'
import {
	BROWSER_LIBRARY_DATABASE_NAME,
	type BrowserLibraryDependencies,
	type BrowserLibrarySnapshot,
	type BrowserRepositoryChange,
	type BrowserRepositoryInvalidation,
	type BrowserRepositoryRecoveryOutcome,
	type BrowserWorkspaceManifest,
	type OpenBrowserLibraryRepositoryOptions
} from './browserLibraryTypes'

export type BrowserCommandMutation<T> = Readonly<{
	value: T
	mutated?: boolean
	invalidations?: readonly BrowserRepositoryInvalidation[]
	coverCompleteness?: BrowserWorkspaceManifest['coverCompleteness']
}>

type BrowserContentCommandOptions = Readonly<{
	name: string
	stores: readonly BrowserLibraryStoreName[]
	eventType?: BrowserRepositoryChange['type']
	wide?: boolean
}>

type CommittedCommand<T> = Readonly<{
	value: T
	manifest: BrowserWorkspaceManifest
	mutated: boolean
	invalidations: readonly BrowserRepositoryInvalidation[]
}>

function uniqueStores(
	stores: readonly BrowserLibraryStoreName[]
): BrowserLibraryStoreName[] {
	return Array.from(new Set([BROWSER_LIBRARY_STORES.workspaces, ...stores]))
}

function nextContentManifest(
	manifest: BrowserWorkspaceManifest,
	timestamp: string
): BrowserWorkspaceManifest {
	return decodeBrowserWorkspaceManifest({
		...manifest,
		updatedAt: timestamp,
		contentRevision: manifest.contentRevision + 1,
		repositoryRevision: manifest.repositoryRevision + 1,
		lastSuccessfulContentWriteAt: timestamp
	})
}

export class BrowserLibraryRepositoryState {
	readonly dependencies: BrowserLibraryDependencies
	readonly workspaceId: string
	readonly repositoryId: string
	readonly #isCurrentContext: OpenBrowserLibraryRepositoryOptions['isCurrentContext']
	readonly #databaseName: string
	readonly #broadcaster: BrowserLibraryBroadcaster
	#database: IDBDatabase
	#writeLeaseRevision: number
	#writeLeaseContentRevision: number
	#lastObservedDurableRevision: number
	#observationRevision = 0
	#workspaceMissing = false
	#conflictedRevision: number | undefined
	#readOnlyError: unknown = null
	#commandTail: Promise<void> = Promise.resolve()
	#closed = false

	constructor(
		database: IDBDatabase,
		options: OpenBrowserLibraryRepositoryOptions,
		initialSnapshot: BrowserLibrarySnapshot
	) {
		this.#database = database
		this.dependencies = options.dependencies ?? {}
		this.workspaceId = options.workspaceId
		this.repositoryId = options.repositoryId
		this.#isCurrentContext = options.isCurrentContext
		this.#databaseName =
			this.dependencies.databaseName ?? BROWSER_LIBRARY_DATABASE_NAME
		this.#writeLeaseRevision = initialSnapshot.repositoryRevision
		this.#writeLeaseContentRevision = initialSnapshot.contentRevision
		this.#lastObservedDurableRevision = initialSnapshot.repositoryRevision
		this.#broadcaster = new BrowserLibraryBroadcaster(
			this.dependencies,
			this.#databaseName
		)
		this.#attachDatabase(database)
		this.#broadcaster.subscribe((change) => this.#observeChange(change))
	}

	get database() {
		return this.#database
	}

	get closed() {
		return this.#closed
	}

	#attachDatabase(database: IDBDatabase) {
		database.addEventListener('versionchange', () => {
			this.markReadOnly(
				new BrowserStorageError(
					'blocked-upgrade',
					'The Local library connection closed for a storage upgrade.'
				)
			)
		})
		database.addEventListener('close', () => {
			if (this.#closed || database !== this.#database) return
			this.markReadOnly(
				new BrowserStorageError(
					'unavailable',
					'The Local library storage connection closed unexpectedly.'
				)
			)
		})
	}

	#isCurrent(context: WorkspaceOperationContext) {
		return (
			!this.#closed &&
			context.workspaceId === this.workspaceId &&
			context.repositoryId === this.repositoryId &&
			this.#isCurrentContext(context)
		)
	}

	isCurrentContext(context: WorkspaceOperationContext) {
		return this.#isCurrent(context)
	}

	#assertManifestIdentity(manifest: BrowserWorkspaceManifest) {
		if (manifest.id !== this.workspaceId) {
			throw new BrowserStorageCodecError('/workspace/workspaceId')
		}
		if (manifest.repositoryId !== this.repositoryId) {
			throw new BrowserRepositoryNotFoundError('workspace')
		}
	}

	#observeDurableRevision(repositoryRevision: number, contentRevision: number) {
		if (repositoryRevision < this.#lastObservedDurableRevision) return
		if (repositoryRevision > this.#lastObservedDurableRevision) {
			this.#lastObservedDurableRevision = repositoryRevision
			this.#observationRevision += 1
		}
		if (contentRevision !== this.#writeLeaseContentRevision) {
			this.#conflictedRevision = repositoryRevision
		}
	}

	#observeChange(change: BrowserRepositoryChange) {
		if (
			change.workspaceId !== this.workspaceId ||
			change.repositoryId !== this.repositoryId
		) {
			return
		}
		if (change.type === 'delete') {
			this.#markWorkspaceMissing()
			return
		}
		if (change.repositoryRevision !== null && change.contentRevision !== null) {
			this.#observeDurableRevision(
				change.repositoryRevision,
				change.contentRevision
			)
		}
	}

	#markWorkspaceMissing() {
		this.#workspaceMissing = true
		this.#conflictedRevision = undefined
	}

	markReadOnly(error: unknown) {
		if (this.#closed) return
		this.#readOnlyError = error
	}

	#complete<T>(value: T): RepositoryOutcome<T> {
		return {
			status: 'success',
			value,
			repositoryRevision: this.#observationRevision,
			issues: []
		}
	}

	#readFailure<T>(error: unknown): RepositoryOutcome<T> {
		if (error instanceof BrowserRepositoryNotFoundError) {
			if (error.entity === 'workspace') this.#markWorkspaceMissing()
			return { status: 'conflict', reason: 'not-found' }
		}
		if (error instanceof BrowserRepositoryConflictError) {
			if (error.actual === null) {
				this.#markWorkspaceMissing()
				return { status: 'conflict', reason: 'not-found' }
			}
			this.#conflictedRevision = error.actual
			return {
				status: 'conflict',
				reason: 'revision-mismatch',
				current: { repositoryRevision: error.actual }
			}
		}
		if (error instanceof BrowserRepositoryDomainConflictError) {
			return {
				status: 'conflict',
				reason: error.reason,
				current: error.current
			}
		}
		if (error instanceof BrowserStorageCodecError) {
			this.markReadOnly(error)
			return { status: 'conflict', reason: 'integrity', current: error }
		}
		const normalized = normalizeBrowserRepositoryError(error)
		this.markReadOnly(normalized)
		return { status: 'unavailable', reason: 'transport', error: normalized }
	}

	#writeFailure<T>(error: unknown): RepositoryOutcome<T> {
		if (error instanceof BrowserRepositoryNotFoundError) {
			if (error.entity === 'workspace') this.#markWorkspaceMissing()
			return { status: 'conflict', reason: 'not-found' }
		}
		if (error instanceof BrowserRepositoryConflictError) {
			if (error.actual === null) {
				this.#markWorkspaceMissing()
				return { status: 'conflict', reason: 'not-found' }
			}
			this.#conflictedRevision = error.actual
			return {
				status: 'conflict',
				reason: 'revision-mismatch',
				current: { repositoryRevision: error.actual }
			}
		}
		if (error instanceof BrowserRepositoryDomainConflictError) {
			return {
				status: 'conflict',
				reason: error.reason,
				current: error.current
			}
		}
		if (error instanceof BrowserStorageCodecError) {
			this.markReadOnly(error)
			return { status: 'conflict', reason: 'integrity', current: error }
		}
		const normalized = normalizeBrowserRepositoryError(error)
		this.markReadOnly(normalized)
		return { status: 'unavailable', reason: 'read-only', error: normalized }
	}

	#enqueue<T>(callback: () => Promise<T>): Promise<T> {
		const command = this.#commandTail.then(callback)
		this.#commandTail = command.then(
			() => undefined,
			() => undefined
		)
		return command
	}

	async read<T>(
		context: WorkspaceOperationContext,
		stores: readonly BrowserLibraryStoreName[],
		callback: (transaction: IDBTransaction) => Promise<T>
	): Promise<RepositoryOutcome<T>> {
		if (!this.#isCurrent(context)) return { status: 'stale' }
		if (this.#workspaceMissing) {
			return { status: 'conflict', reason: 'not-found' }
		}
		if (this.#closed) {
			return { status: 'unavailable', reason: 'read-only' }
		}
		try {
			const observed = await runBrowserLibraryReadTransaction(
				this.#database,
				uniqueStores(stores),
				async (transaction) => {
					const [storedManifest, value] = await Promise.all([
						requestResult(
							transaction
								.objectStore(BROWSER_LIBRARY_STORES.workspaces)
								.get(this.workspaceId)
						),
						callback(transaction)
					])
					if (storedManifest === undefined) {
						throw new BrowserRepositoryNotFoundError('workspace')
					}
					const manifest = decodeBrowserWorkspaceManifest(storedManifest)
					this.#assertManifestIdentity(manifest)
					return { manifest, value }
				}
			)
			this.#observeDurableRevision(
				observed.manifest.repositoryRevision,
				observed.manifest.contentRevision
			)
			return this.#isCurrent(context)
				? this.#complete(observed.value)
				: { status: 'stale' }
		} catch (error) {
			return this.#isCurrent(context)
				? this.#readFailure(error)
				: { status: 'stale' }
		}
	}

	async readSnapshot(
		context: WorkspaceOperationContext
	): Promise<RepositoryOutcome<BrowserLibrarySnapshot>> {
		if (!this.#isCurrent(context)) return { status: 'stale' }
		if (this.#workspaceMissing) {
			return { status: 'conflict', reason: 'not-found' }
		}
		if (this.#closed) {
			return { status: 'unavailable', reason: 'read-only' }
		}
		try {
			const snapshot = await readBrowserLibrarySnapshot(
				this.#database,
				this.workspaceId,
				this.repositoryId
			)
			this.#observeDurableRevision(
				snapshot.repositoryRevision,
				snapshot.contentRevision
			)
			return this.#isCurrent(context)
				? this.#complete(snapshot)
				: { status: 'stale' }
		} catch (error) {
			return this.#isCurrent(context)
				? this.#readFailure(error)
				: { status: 'stale' }
		}
	}

	command<T>(
		context: WorkspaceOperationContext,
		options: BrowserContentCommandOptions,
		callback: (
			transaction: IDBTransaction,
			writer: BrowserTransactionWriter,
			manifest: BrowserWorkspaceManifest,
			timestamp: string
		) => Promise<BrowserCommandMutation<T>>
	): Promise<RepositoryOutcome<T>> {
		return this.#enqueue(async () => {
			if (!this.#isCurrent(context)) return { status: 'stale' }
			if (this.#workspaceMissing) {
				return { status: 'conflict', reason: 'not-found' }
			}
			if (this.#closed || this.#readOnlyError) {
				return {
					status: 'unavailable',
					reason: 'read-only',
					error: this.#readOnlyError ?? undefined
				}
			}
			if (this.#conflictedRevision !== undefined) {
				return {
					status: 'conflict',
					reason: 'revision-mismatch',
					current: { repositoryRevision: this.#conflictedRevision }
				}
			}

			const execute = async () => {
				const timestamp = browserLibraryTimestamp(this.dependencies)
				return runBrowserLibraryTransaction(
					this.#database,
					uniqueStores(options.stores),
					options.name,
					this.dependencies,
					async (transaction, writer): Promise<CommittedCommand<T>> => {
						const workspaceStore = transaction.objectStore(
							BROWSER_LIBRARY_STORES.workspaces
						)
						const storedManifest = await requestResult(
							workspaceStore.get(this.workspaceId)
						)
						if (storedManifest === undefined) {
							throw new BrowserRepositoryNotFoundError('workspace')
						}
						const manifest = decodeBrowserWorkspaceManifest(storedManifest)
						this.#assertManifestIdentity(manifest)
						if (
							manifest.contentRevision !== this.#writeLeaseContentRevision ||
							manifest.repositoryRevision < this.#writeLeaseRevision
						) {
							throw new BrowserRepositoryConflictError(
								'repository-revision',
								this.#writeLeaseRevision,
								manifest.repositoryRevision
							)
						}

						const mutation = await callback(
							transaction,
							writer,
							manifest,
							timestamp
						)
						if (mutation.mutated === false) {
							return {
								value: mutation.value,
								manifest,
								mutated: false,
								invalidations: []
							}
						}

						const committedManifest = nextContentManifest(
							{
								...manifest,
								coverCompleteness:
									mutation.coverCompleteness ?? manifest.coverCompleteness
							},
							timestamp
						)
						writer.put(workspaceStore, committedManifest)
						return {
							value: mutation.value,
							manifest: committedManifest,
							mutated: true,
							invalidations: mutation.invalidations ?? []
						}
					}
				)
			}

			try {
				const committed = options.wide
					? await withOptionalBrowserLibraryLock(
							this.dependencies,
							browserWorkspaceWideLockName(
								this.#databaseName,
								this.workspaceId
							),
							execute
						)
					: await execute()

				if (committed.mutated) {
					this.#writeLeaseRevision = committed.manifest.repositoryRevision
					this.#writeLeaseContentRevision = committed.manifest.contentRevision
					this.#workspaceMissing = false
					this.#conflictedRevision = undefined
					this.#observeDurableRevision(
						committed.manifest.repositoryRevision,
						committed.manifest.contentRevision
					)
					this.#broadcaster.publish({
						type: options.eventType ?? 'commit',
						workspaceId: this.workspaceId,
						repositoryId: this.repositoryId,
						catalogRevision: null,
						repositoryRevision: committed.manifest.repositoryRevision,
						contentRevision: committed.manifest.contentRevision,
						committedAt: committed.manifest.updatedAt,
						invalidations: committed.invalidations
					})
				}
				return this.#isCurrent(context)
					? this.#complete(committed.value)
					: { status: 'stale' }
			} catch (error) {
				return this.#isCurrent(context)
					? this.#writeFailure(error)
					: { status: 'stale' }
			}
		})
	}

	async readManifest(): Promise<BrowserWorkspaceManifest | null> {
		if (this.#closed) {
			throw new BrowserStorageError(
				'unavailable',
				'This Local library repository is closed.'
			)
		}
		try {
			const storedManifest = await runBrowserLibraryReadTransaction(
				this.#database,
				[BROWSER_LIBRARY_STORES.workspaces],
				(transaction) =>
					requestResult(
						transaction
							.objectStore(BROWSER_LIBRARY_STORES.workspaces)
							.get(this.workspaceId)
					)
			)
			if (storedManifest === undefined) {
				this.#markWorkspaceMissing()
				return null
			}
			const manifest = decodeBrowserWorkspaceManifest(storedManifest)
			this.#assertManifestIdentity(manifest)
			this.#observeDurableRevision(
				manifest.repositoryRevision,
				manifest.contentRevision
			)
			return manifest
		} catch (error) {
			if (
				error instanceof BrowserRepositoryNotFoundError &&
				error.entity === 'workspace'
			) {
				this.#markWorkspaceMissing()
				return null
			}
			this.markReadOnly(error)
			throw normalizeBrowserRepositoryError(error)
		}
	}

	async readManagedCover(assetId: string): Promise<Blob | null> {
		if (this.#closed) return null
		if (this.#workspaceMissing) {
			throw new BrowserRepositoryNotFoundError('workspace')
		}
		try {
			const result = await runBrowserLibraryReadTransaction(
				this.#database,
				[
					BROWSER_LIBRARY_STORES.workspaces,
					BROWSER_LIBRARY_STORES.records,
					BROWSER_LIBRARY_STORES.covers
				],
				async (transaction) => {
					const recordStore = transaction.objectStore(
						BROWSER_LIBRARY_STORES.records
					)
					const [storedManifest, storedCover] = await Promise.all([
						requestResult(
							transaction
								.objectStore(BROWSER_LIBRARY_STORES.workspaces)
								.get(this.workspaceId)
						),
						requestResult(
							transaction
								.objectStore(BROWSER_LIBRARY_STORES.covers)
								.get([this.workspaceId, assetId])
						)
					])
					if (storedCover !== undefined) {
						const cover = decodeBrowserManagedCover(
							storedCover,
							this.workspaceId
						)
						return {
							storedManifest,
							cover,
							storedRecord: await requestResult(
								recordStore.get([this.workspaceId, cover.recordId])
							),
							storedRecords: null
						}
					}
					return {
						storedManifest,
						cover: null,
						storedRecord: undefined,
						storedRecords: await requestResult(
							recordStore
								.index(BROWSER_LIBRARY_WORKSPACE_INDEX)
								.getAll(this.workspaceId)
						)
					}
				}
			)
			if (result.storedManifest === undefined) {
				throw new BrowserRepositoryNotFoundError('workspace')
			}
			const manifest = decodeBrowserWorkspaceManifest(result.storedManifest)
			this.#assertManifestIdentity(manifest)
			this.#observeDurableRevision(
				manifest.repositoryRevision,
				manifest.contentRevision
			)
			if (result.cover !== null) {
				if (result.storedRecord === undefined) {
					throw new BrowserStorageCodecError('/snapshot/covers/recordId')
				}
				const record = decodeBrowserRecordRow(
					result.storedRecord,
					this.workspaceId
				)
				if (
					record.cover.kind !== 'browser' ||
					record.cover.assetId !== assetId ||
					result.cover.recordId !== record.id
				) {
					throw new BrowserStorageCodecError('/snapshot/covers/orphan')
				}
				return result.cover.blob
			}

			const referencingRecords = result.storedRecords!.filter((row) => {
				const record = decodeBrowserRecordRow(row, this.workspaceId)
				return (
					record.cover.kind === 'browser' && record.cover.assetId === assetId
				)
			})
			if (referencingRecords.length === 0) {
				return null
			}
			if (referencingRecords.length > 1) {
				throw new BrowserStorageCodecError('/snapshot/covers/assetId')
			}
			if (manifest.coverCompleteness === 'complete') {
				throw new BrowserStorageCodecError('/snapshot/covers/missing')
			}
			return null
		} catch (error) {
			if (
				error instanceof BrowserRepositoryNotFoundError &&
				error.entity === 'workspace'
			) {
				this.#markWorkspaceMissing()
				throw error
			}
			this.markReadOnly(error)
			throw normalizeBrowserRepositoryError(error)
		}
	}

	recoverStorage(): Promise<BrowserRepositoryRecoveryOutcome> {
		return this.#enqueue(async () => {
			if (this.#closed) {
				return {
					status: 'failed',
					health: {
						code: 'unavailable',
						message: 'This Local library repository is closed.',
						checkedAt: browserLibraryTimestamp(this.dependencies)
					}
				}
			}

			const health = await probeBrowserLibraryStorage(this.dependencies)
			if (health.code !== 'healthy') return { status: 'failed', health }

			let replacementDatabase: IDBDatabase | null = null
			try {
				replacementDatabase = await openBrowserLibraryDatabase(
					this.dependencies
				)
				const snapshot = await readBrowserLibrarySnapshot(
					replacementDatabase,
					this.workspaceId,
					this.repositoryId
				)
				const previousDatabase = this.#database
				this.#database = replacementDatabase
				this.#attachDatabase(replacementDatabase)
				replacementDatabase = null
				previousDatabase.close()
				const observedRevisionChanged =
					this.#lastObservedDurableRevision !== snapshot.repositoryRevision
				this.#lastObservedDurableRevision = snapshot.repositoryRevision
				if (observedRevisionChanged) this.#observationRevision += 1
				this.#writeLeaseRevision = snapshot.repositoryRevision
				this.#writeLeaseContentRevision = snapshot.contentRevision
				this.#workspaceMissing = false
				this.#conflictedRevision = undefined
				this.#readOnlyError = null
				return {
					status: 'recovered',
					health: { ...health, code: 'healthy' }
				}
			} catch (error) {
				replacementDatabase?.close()
				if (error instanceof BrowserRepositoryNotFoundError) {
					this.#markWorkspaceMissing()
					return { status: 'not-found' }
				}
				this.markReadOnly(error)
				return {
					status: 'failed',
					health: storageHealthFromError(
						error,
						browserLibraryTimestamp(this.dependencies)
					)
				}
			}
		})
	}

	subscribe(listener: (change: BrowserRepositoryChange) => void) {
		if (this.#closed) return () => undefined
		return this.#broadcaster.subscribe(listener)
	}

	close() {
		if (this.#closed) return
		this.#closed = true
		this.#broadcaster.close()
		this.#database.close()
	}
}
