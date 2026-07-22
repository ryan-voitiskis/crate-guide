import { openBrowserLibraryRepository } from '../../../app/repositories/library/browser/browserLibraryRepository'
import { browserWorkspaceWideLockName } from '../../../app/repositories/library/browser/browserLibraryRuntime'
import type {
	BrowserLibraryDependencies,
	BrowserLibraryRepository,
	BrowserRepositoryChange,
	BrowserWorkspaceCatalog,
	BrowserWorkspaceIdentity,
	BrowserWorkspaceManifest
} from '../../../app/repositories/library/browser/browserLibraryTypes'
import { createBrowserWorkspaceCatalog } from '../../../app/repositories/library/browser/browserWorkspaceCatalog'
import type {
	RepositoryOutcome,
	WorkspaceOperationContext
} from '../../../app/repositories/library/contracts'
import type {
	LibraryDataset,
	LibraryPreferences
} from '../../../shared/types/library'

const FIXTURE_TIMESTAMP = '2026-07-23T06:00:00.000Z'
const COVER_ASSET_ID = 'record-a/cover.webp'

export type AdapterWorkspaceIdentity = BrowserWorkspaceIdentity & {
	catalogRevision: number
	contentRevision: number
	repositoryRevision: number
}

type RepositoryEntry = {
	context: WorkspaceOperationContext
	lifecycle: {
		blockedUpgrade: number
		blockingUpgrade: number
		unexpectedClose: number
	}
	repository: BrowserLibraryRepository
}

type CatalogEntry = {
	catalog: BrowserWorkspaceCatalog
	databaseName: string
}

type HeldLock = {
	done: Promise<void>
	name: string
	release: () => void
}

type PendingOperation = {
	error: string | null
	promise: Promise<void>
	result: unknown
	settled: boolean
}

export type AdapterOutcomeSummary =
	| { status: 'success'; value?: unknown }
	| { status: 'stale' }
	| {
			status: 'conflict'
			reason: string
			currentRepositoryRevision?: number | null
	  }
	| { status: 'unavailable'; reason: string; error?: string }

export type AdapterSnapshotSummary = AdapterOutcomeSummary & {
	contentRevision?: number
	cover?: { size: number; text: string; type: string }
	coverCompleteness?: string
	crateRecordIds?: string[]
	durableRepositoryRevision?: number
	preferences?: LibraryPreferences
	recordCount?: number
	recordTitle?: string
	trackCount?: number
	trackRecordId?: string
}

export type BrowserLibraryAdapterHarness = {
	awaitPending(operationId: string): Promise<{
		error: string | null
		result: unknown
		settled: boolean
	}>
	closeAll(): Promise<void>
	closeCatalog(catalogKey: string): void
	closeRepository(repositoryKey: string): void
	createWorkspace(
		databaseName: string,
		workspaceId: string,
		name: string
	): Promise<AdapterWorkspaceIdentity>
	databaseVersion(databaseName: string): Promise<number>
	deleteDatabase(databaseName: string): Promise<void>
	deleteWorkspace(
		databaseName: string,
		expected: AdapterWorkspaceIdentity
	): Promise<{ catalogRevision: number }>
	events(eventKey: string): BrowserRepositoryChange[]
	holdWideLock(
		lockId: string,
		databaseName: string,
		workspaceId: string
	): Promise<string>
	lifecycle(repositoryKey: string): RepositoryEntry['lifecycle']
	manifest(repositoryKey: string): Promise<BrowserWorkspaceManifest | null>
	openCatalog(catalogKey: string, databaseName: string): Promise<void>
	openRepository(
		repositoryKey: string,
		databaseName: string,
		identity: BrowserWorkspaceIdentity
	): Promise<BrowserWorkspaceManifest | null>
	pending(operationId: string): {
		error: string | null
		result: unknown
		settled: boolean
	} | null
	readOperations(
		databaseName: string,
		identity: BrowserWorkspaceIdentity
	): Promise<unknown>
	readSnapshot(repositoryKey: string): Promise<AdapterSnapshotSummary>
	recordExport(
		databaseName: string,
		identity: BrowserWorkspaceIdentity,
		contentRevision: number,
		expectedRepositoryRevision: number
	): Promise<unknown>
	recoverRepository(repositoryKey: string): Promise<unknown>
	releaseWideLock(lockId: string): Promise<void>
	replaceSnapshot(
		repositoryKey: string,
		title: string,
		coverText: string
	): Promise<AdapterOutcomeSummary>
	startCatalogDelete(
		operationId: string,
		catalogKey: string,
		expected: AdapterWorkspaceIdentity
	): void
	startReplaceSnapshot(
		operationId: string,
		repositoryKey: string,
		title: string,
		coverText: string
	): void
	subscribeRepository(repositoryKey: string, eventKey: string): void
	triggerAbortedUpgrade(databaseName: string): Promise<{
		blocked: boolean
		errorName: string
		upgradeStarted: boolean
	}>
	updatePreferences(
		repositoryKey: string,
		patch: Partial<LibraryPreferences>
	): Promise<AdapterOutcomeSummary>
}

const repositories = new Map<string, RepositoryEntry>()
const catalogs = new Map<string, CatalogEntry>()
const subscriptions = new Map<string, () => void>()
const receivedEvents = new Map<string, BrowserRepositoryChange[]>()
const heldLocks = new Map<string, HeldLock>()
const pendingOperations = new Map<string, PendingOperation>()

function errorMessage(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`
	return String(error)
}

function summarizeOutcome<T>(
	outcome: RepositoryOutcome<T>
): AdapterOutcomeSummary {
	if (outcome.status === 'success') return { status: 'success' }
	if (outcome.status === 'stale') return { status: 'stale' }
	if (outcome.status === 'unavailable') {
		return {
			status: 'unavailable',
			reason: outcome.reason,
			error: outcome.error ? errorMessage(outcome.error) : undefined
		}
	}
	const current = outcome.current
	return {
		status: 'conflict',
		reason: outcome.reason,
		currentRepositoryRevision:
			current && typeof current === 'object' && 'repositoryRevision' in current
				? (current as { repositoryRevision?: number | null }).repositoryRevision
				: undefined
	}
}

function requireRepository(repositoryKey: string): RepositoryEntry {
	const entry = repositories.get(repositoryKey)
	if (!entry) throw new Error(`Repository ${repositoryKey} is not open.`)
	return entry
}

function requireCatalog(catalogKey: string): CatalogEntry {
	const entry = catalogs.get(catalogKey)
	if (!entry) throw new Error(`Catalog ${catalogKey} is not open.`)
	return entry
}

function dependencies(
	databaseName: string,
	lifecycle?: RepositoryEntry['lifecycle']
): BrowserLibraryDependencies {
	return {
		databaseName,
		onBlockedUpgrade: () => {
			if (lifecycle) lifecycle.blockedUpgrade += 1
		},
		onBlockingUpgrade: () => {
			if (lifecycle) lifecycle.blockingUpgrade += 1
		},
		onUnexpectedClose: () => {
			if (lifecycle) lifecycle.unexpectedClose += 1
		}
	}
}

function dataset(title: string): LibraryDataset {
	return {
		records: [
			{
				id: 'record-a',
				title,
				artists: [{ name: 'Adapter Artist', role: null }],
				labels: [{ name: 'Adapter Label', catno: 'ADAPTER-1' }],
				year: 2026,
				cover: {
					kind: 'browser',
					assetId: COVER_ASSET_ID,
					fallbackUrl: null
				},
				discogs_id: null,
				discogs_release_url: null,
				created_at: FIXTURE_TIMESTAMP,
				updated_at: FIXTURE_TIMESTAMP
			}
		],
		tracks: [
			{
				id: 'track-a',
				record_id: 'record-a',
				title: 'Adapter Track',
				artists: [{ name: 'Adapter Artist', role: null }],
				extraartists: [],
				position: 'A1',
				duration: 180_000,
				bpm: 128,
				rpm: 33,
				key: 5,
				mode: 0,
				genres: ['House'],
				time_signature_upper: null,
				time_signature_lower: null,
				playable: true,
				beatport_data: null,
				audio_features: null,
				created_at: FIXTURE_TIMESTAMP,
				updated_at: FIXTURE_TIMESTAMP
			}
		],
		crates: [
			{
				id: 'crate-a',
				name: 'Adapter Crate',
				description: null,
				color: null,
				records: ['record-a'],
				created_at: FIXTURE_TIMESTAMP,
				updated_at: FIXTURE_TIMESTAMP
			}
		],
		savedSets: [
			{
				id: 'set-a',
				name: 'Adapter Set',
				played_tracks: [
					{
						track_id: 'track-a',
						time_added: Date.parse(FIXTURE_TIMESTAMP),
						adjusted_bpm: null,
						transition_rating: null
					}
				],
				created_at: FIXTURE_TIMESTAMP,
				updated_at: FIXTURE_TIMESTAMP
			}
		],
		preferences: {
			ui_theme: 'auto',
			key_format: 'camelot',
			list_layout: 'cover',
			selected_crate: 'crate-a',
			turntable_pitch_range: 8,
			turntable_theme: 'black'
		}
	}
}

async function createWorkspace(
	databaseName: string,
	workspaceId: string,
	name: string
): Promise<AdapterWorkspaceIdentity> {
	const catalog = await createBrowserWorkspaceCatalog(
		dependencies(databaseName)
	)
	try {
		const created = await catalog.createWorkspace(
			{ id: workspaceId, name, activate: true },
			0
		)
		return {
			workspaceId: created.value.id,
			repositoryId: created.value.repositoryId,
			catalogRevision: created.catalogRevision,
			contentRevision: created.value.contentRevision,
			repositoryRevision: created.value.repositoryRevision
		}
	} finally {
		catalog.close()
	}
}

async function openRepository(
	repositoryKey: string,
	databaseName: string,
	identity: BrowserWorkspaceIdentity
): Promise<BrowserWorkspaceManifest | null> {
	closeRepository(repositoryKey)
	const lifecycle = {
		blockedUpgrade: 0,
		blockingUpgrade: 0,
		unexpectedClose: 0
	}
	const context: WorkspaceOperationContext = {
		workspaceId: identity.workspaceId,
		repositoryId: identity.repositoryId,
		activationGeneration: 0
	}
	const repository = await openBrowserLibraryRepository({
		workspaceId: identity.workspaceId,
		repositoryId: identity.repositoryId,
		isCurrentContext: (candidate) =>
			candidate.workspaceId === context.workspaceId &&
			candidate.repositoryId === context.repositoryId &&
			candidate.activationGeneration === context.activationGeneration,
		dependencies: dependencies(databaseName, lifecycle)
	})
	repositories.set(repositoryKey, { context, lifecycle, repository })
	return repository.readManifest()
}

function closeRepository(repositoryKey: string) {
	const entry = repositories.get(repositoryKey)
	if (!entry) return
	entry.repository.close()
	repositories.delete(repositoryKey)
}

async function openCatalog(catalogKey: string, databaseName: string) {
	closeCatalog(catalogKey)
	const catalog = await createBrowserWorkspaceCatalog(
		dependencies(databaseName)
	)
	catalogs.set(catalogKey, { catalog, databaseName })
}

function closeCatalog(catalogKey: string) {
	const entry = catalogs.get(catalogKey)
	if (!entry) return
	entry.catalog.close()
	catalogs.delete(catalogKey)
}

async function replaceSnapshot(
	repositoryKey: string,
	title: string,
	coverText: string
): Promise<AdapterOutcomeSummary> {
	const entry = requireRepository(repositoryKey)
	const outcome = await entry.repository.replaceSnapshot(entry.context, {
		snapshot: dataset(title),
		covers: new Map([
			[COVER_ASSET_ID, new Blob([coverText], { type: 'image/webp' })]
		])
	})
	return summarizeOutcome(outcome)
}

async function readSnapshot(
	repositoryKey: string
): Promise<AdapterSnapshotSummary> {
	const entry = requireRepository(repositoryKey)
	const outcome = await entry.repository.readLibrarySnapshot(entry.context)
	if (outcome.status !== 'success') return summarizeOutcome(outcome)
	const firstRecord = outcome.value.dataset.records[0]
	const firstTrack = outcome.value.dataset.tracks[0]
	const firstCrate = outcome.value.dataset.crates[0]
	const firstCover = outcome.value.managedCovers[0]
	return {
		status: 'success',
		contentRevision: outcome.value.contentRevision,
		durableRepositoryRevision: outcome.value.repositoryRevision,
		coverCompleteness: outcome.value.coverCompleteness,
		recordCount: outcome.value.dataset.records.length,
		trackCount: outcome.value.dataset.tracks.length,
		recordTitle: firstRecord?.title,
		trackRecordId: firstTrack?.record_id,
		crateRecordIds: firstCrate ? [...firstCrate.records] : undefined,
		preferences: outcome.value.dataset.preferences,
		cover: firstCover
			? {
					size: firstCover.blob.size,
					text: await firstCover.blob.text(),
					type: firstCover.blob.type
				}
			: undefined
	}
}

async function updatePreferences(
	repositoryKey: string,
	patch: Partial<LibraryPreferences>
): Promise<AdapterOutcomeSummary> {
	const entry = requireRepository(repositoryKey)
	const outcome = await entry.repository.preferences.update(
		entry.context,
		patch
	)
	if (outcome.status !== 'success') return summarizeOutcome(outcome)
	return { status: 'success', value: outcome.value }
}

async function recordExport(
	databaseName: string,
	identity: BrowserWorkspaceIdentity,
	contentRevision: number,
	expectedRepositoryRevision: number
) {
	const catalog = await createBrowserWorkspaceCatalog(
		dependencies(databaseName)
	)
	try {
		return await catalog.recordExport(
			identity,
			contentRevision,
			expectedRepositoryRevision,
			FIXTURE_TIMESTAMP
		)
	} finally {
		catalog.close()
	}
}

async function readOperations(
	databaseName: string,
	identity: BrowserWorkspaceIdentity
) {
	const catalog = await createBrowserWorkspaceCatalog(
		dependencies(databaseName)
	)
	try {
		return await catalog.readOperations(identity)
	} finally {
		catalog.close()
	}
}

async function deleteWorkspace(
	databaseName: string,
	expected: AdapterWorkspaceIdentity
) {
	const catalog = await createBrowserWorkspaceCatalog(
		dependencies(databaseName)
	)
	try {
		return await catalog.deleteWorkspace(expected)
	} finally {
		catalog.close()
	}
}

function subscribeRepository(repositoryKey: string, eventKey: string) {
	subscriptions.get(eventKey)?.()
	const events: BrowserRepositoryChange[] = []
	receivedEvents.set(eventKey, events)
	const unsubscribe = requireRepository(repositoryKey).repository.subscribe(
		(change) => events.push(structuredClone(change))
	)
	subscriptions.set(eventKey, unsubscribe)
}

function startPending(operationId: string, run: () => Promise<unknown>) {
	if (pendingOperations.has(operationId)) {
		throw new Error(`Pending operation ${operationId} already exists.`)
	}
	const state: PendingOperation = {
		error: null,
		promise: Promise.resolve(),
		result: null,
		settled: false
	}
	state.promise = run()
		.then((result) => {
			state.result = result
		})
		.catch((error: unknown) => {
			state.error = errorMessage(error)
		})
		.finally(() => {
			state.settled = true
		})
	pendingOperations.set(operationId, state)
}

function pending(operationId: string) {
	const state = pendingOperations.get(operationId)
	return state
		? { error: state.error, result: state.result, settled: state.settled }
		: null
}

async function awaitPending(operationId: string) {
	const state = pendingOperations.get(operationId)
	if (!state) throw new Error(`Pending operation ${operationId} is missing.`)
	await state.promise
	return { error: state.error, result: state.result, settled: state.settled }
}

function startReplaceSnapshot(
	operationId: string,
	repositoryKey: string,
	title: string,
	coverText: string
) {
	startPending(operationId, () =>
		replaceSnapshot(repositoryKey, title, coverText)
	)
}

function startCatalogDelete(
	operationId: string,
	catalogKey: string,
	expected: AdapterWorkspaceIdentity
) {
	startPending(operationId, async () => {
		const { catalog } = requireCatalog(catalogKey)
		return catalog.deleteWorkspace(expected)
	})
}

async function holdWideLock(
	lockId: string,
	databaseName: string,
	workspaceId: string
): Promise<string> {
	if (heldLocks.has(lockId)) throw new Error(`Lock ${lockId} is already held.`)
	const lockManager = navigator.locks
	if (!lockManager?.request) {
		throw new Error('This browser does not provide the Web Locks API.')
	}
	const name = browserWorkspaceWideLockName(databaseName, workspaceId)
	let release = () => undefined
	const gate = new Promise<void>((resolve) => {
		release = resolve
	})
	let acquiredResolve = () => undefined
	let acquiredReject = (_error: unknown) => undefined
	const acquired = new Promise<void>((resolve, reject) => {
		acquiredResolve = resolve
		acquiredReject = reject
	})
	const done = Promise.resolve(
		lockManager.request(name, { mode: 'exclusive' }, async () => {
			acquiredResolve()
			await gate
		})
	).then(() => undefined)
	void done.catch(acquiredReject)
	heldLocks.set(lockId, { done, name, release })
	await acquired
	return name
}

async function releaseWideLock(lockId: string) {
	const held = heldLocks.get(lockId)
	if (!held) return
	held.release()
	await held.done
	heldLocks.delete(lockId)
}

async function triggerAbortedUpgrade(databaseName: string) {
	return new Promise<{
		blocked: boolean
		errorName: string
		upgradeStarted: boolean
	}>((resolve, reject) => {
		let blocked = false
		let upgradeStarted = false
		const request = indexedDB.open(databaseName, 2)
		request.addEventListener('blocked', () => {
			blocked = true
		})
		request.addEventListener('upgradeneeded', () => {
			upgradeStarted = true
			try {
				request.transaction?.abort()
			} catch (error) {
				reject(error)
			}
		})
		request.addEventListener('error', () => {
			resolve({
				blocked,
				errorName: request.error?.name ?? 'unknown',
				upgradeStarted
			})
		})
		request.addEventListener('success', () => {
			request.result.close()
			reject(
				new Error('The deliberately aborted upgrade unexpectedly committed.')
			)
		})
	})
}

function deleteDatabase(databaseName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(databaseName)
		request.addEventListener('success', () => resolve(), { once: true })
		request.addEventListener(
			'error',
			() => reject(request.error ?? new Error('Database deletion failed.')),
			{ once: true }
		)
		request.addEventListener(
			'blocked',
			() => reject(new Error(`Database ${databaseName} remained blocked.`)),
			{ once: true }
		)
	})
}

function databaseVersion(databaseName: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(databaseName)
		request.addEventListener('success', () => {
			const version = request.result.version
			request.result.close()
			resolve(version)
		})
		request.addEventListener(
			'error',
			() => reject(request.error ?? new Error('Database open failed.')),
			{ once: true }
		)
	})
}

async function closeAll() {
	for (const held of heldLocks.values()) held.release()
	await Promise.allSettled([...heldLocks.values()].map((held) => held.done))
	heldLocks.clear()
	await Promise.allSettled(
		[...pendingOperations.values()].map((operation) => operation.promise)
	)
	pendingOperations.clear()
	for (const unsubscribe of subscriptions.values()) unsubscribe()
	subscriptions.clear()
	receivedEvents.clear()
	for (const entry of repositories.values()) entry.repository.close()
	repositories.clear()
	for (const entry of catalogs.values()) entry.catalog.close()
	catalogs.clear()
}

const harness: BrowserLibraryAdapterHarness = {
	awaitPending,
	closeAll,
	closeCatalog,
	closeRepository,
	createWorkspace,
	databaseVersion,
	deleteDatabase,
	deleteWorkspace,
	events(eventKey) {
		return structuredClone(receivedEvents.get(eventKey) ?? [])
	},
	holdWideLock,
	lifecycle(repositoryKey) {
		return { ...requireRepository(repositoryKey).lifecycle }
	},
	manifest(repositoryKey) {
		return requireRepository(repositoryKey).repository.readManifest()
	},
	openCatalog,
	openRepository,
	pending,
	readOperations,
	readSnapshot,
	recordExport,
	recoverRepository(repositoryKey) {
		return requireRepository(repositoryKey).repository.recoverStorage()
	},
	releaseWideLock,
	replaceSnapshot,
	startCatalogDelete,
	startReplaceSnapshot,
	subscribeRepository,
	triggerAbortedUpgrade,
	updatePreferences
}

declare global {
	interface Window {
		__browserLibraryAdapterHarness: BrowserLibraryAdapterHarness
	}
}

window.__browserLibraryAdapterHarness = harness
document.documentElement.dataset.browserLibraryAdapterHarness = 'ready'
