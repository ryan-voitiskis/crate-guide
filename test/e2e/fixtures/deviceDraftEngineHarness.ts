import { openBrowserDeviceDraftRepository } from '../../../app/repositories/deviceDrafts'
import type {
	BrowserDeviceDraftRepository,
	BrowserLibraryDependencies,
	BrowserRepositoryChange,
	BrowserWorkflowDraft,
	BrowserWorkspaceIdentity
} from '../../../app/repositories/library/browser/browserLibraryTypes'
import { BROWSER_LIBRARY_SCHEMA_VERSION } from '../../../app/repositories/library/browser/browserLibraryTypes'
import { createTrackEnrichmentDraftFixture } from '../../fixtures/trackEnrichmentDraft'

const FIXTURE_TIMESTAMP = '2026-07-23T06:00:00.000Z'

export type DeviceDraftLifecycle = {
	blockedUpgrade: number
	blockingUpgrade: number
	unexpectedClose: number
}

type RepositoryEntry = {
	lifecycle: DeviceDraftLifecycle
	repository: BrowserDeviceDraftRepository
}

export type DeviceDraftOperationOutcome =
	| { status: 'success'; value: unknown }
	| { status: 'rejected'; error: Record<string, unknown> }

export type DeviceDraftEngineHarness = {
	attemptOldOwnerMutations(
		repositoryKey: string,
		draftId: string,
		ownerToken: string,
		expectedDeviceRevision: number,
		expectedLeaseRevision: number
	): Promise<unknown>
	claimDraft(
		repositoryKey: string,
		draftId: string,
		ownerToken: string,
		expectedDeviceRevision: number
	): Promise<unknown>
	closeAll(): Promise<void>
	closeDeviceDraftRepository(repositoryKey: string): void
	createDraftAndClaim(
		repositoryKey: string,
		ownerToken: string,
		expectedDeviceRevision: number
	): Promise<unknown>
	databaseVersion(databaseName: string): Promise<number>
	deleteDatabase(databaseName: string): Promise<void>
	events(eventKey: string): BrowserRepositoryChange[]
	lifecycle(repositoryKey: string): DeviceDraftLifecycle
	openDeviceDraftRepository(
		repositoryKey: string,
		databaseName: string,
		identity: BrowserWorkspaceIdentity
	): Promise<void>
	readDraft(repositoryKey: string, draftId: string): Promise<unknown>
	readDraftOutcome(
		repositoryKey: string,
		draftId: string
	): Promise<DeviceDraftOperationOutcome>
	renewDraftLease(
		repositoryKey: string,
		draftId: string,
		ownerToken: string,
		expectedDeviceRevision: number,
		expectedLeaseRevision: number
	): Promise<DeviceDraftOperationOutcome>
	setClock(databaseName: string, timestamp: string): void
	subscribeDeviceDraftRepository(repositoryKey: string, eventKey: string): void
	takeOverDraft(
		repositoryKey: string,
		draftId: string,
		ownerToken: string,
		expectedDeviceRevision: number,
		expectedLeaseRevision: number
	): Promise<unknown>
	triggerAbortedUpgrade(databaseName: string): Promise<{
		blocked: boolean
		errorName: string
		upgradeStarted: boolean
	}>
}

const deviceDraftRepositories = new Map<string, RepositoryEntry>()
const subscriptions = new Map<string, () => void>()
const receivedEvents = new Map<string, BrowserRepositoryChange[]>()
const clockByDatabase = new Map<string, string>()

function errorMessage(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`
	return String(error)
}

function requireDeviceDraftRepository(repositoryKey: string): RepositoryEntry {
	const entry = deviceDraftRepositories.get(repositoryKey)
	if (!entry) {
		throw new Error(`Device draft repository ${repositoryKey} is not open.`)
	}
	return entry
}

function dependencies(
	databaseName: string,
	lifecycle: DeviceDraftLifecycle
): BrowserLibraryDependencies {
	return {
		databaseName,
		now: () => new Date(clockByDatabase.get(databaseName) ?? FIXTURE_TIMESTAMP),
		onBlockedUpgrade: () => {
			lifecycle.blockedUpgrade += 1
		},
		onBlockingUpgrade: () => {
			lifecycle.blockingUpgrade += 1
		},
		onUnexpectedClose: () => {
			lifecycle.unexpectedClose += 1
		}
	}
}

function draftFixture(
	identity: BrowserWorkspaceIdentity,
	draftRevision = 0,
	updatedAt = FIXTURE_TIMESTAMP
): BrowserWorkflowDraft {
	const payload = createTrackEnrichmentDraftFixture()
	payload.workspace = {
		workspaceId: identity.workspaceId,
		repositoryId: identity.repositoryId,
		repositoryRevision: 0
	}
	payload.draftRevision = draftRevision
	payload.updatedAt = updatedAt
	return {
		id: payload.id,
		kind: 'track-enrichment',
		draftRevision,
		updatedAt,
		payload
	}
}

function summarizeError(error: unknown): Record<string, unknown> {
	if (!error || typeof error !== 'object') {
		return { message: errorMessage(error) }
	}
	const value = error as Record<string, unknown>
	return {
		code: value.code,
		scope: value.scope,
		expected: value.expected,
		actual: value.actual,
		message: error instanceof Error ? error.message : undefined
	}
}

async function settle(
	run: () => Promise<unknown>
): Promise<DeviceDraftOperationOutcome> {
	try {
		return { status: 'success', value: await run() }
	} catch (error) {
		return { status: 'rejected', error: summarizeError(error) }
	}
}

async function openDeviceDraftRepository(
	repositoryKey: string,
	databaseName: string,
	identity: BrowserWorkspaceIdentity
) {
	closeDeviceDraftRepository(repositoryKey)
	const lifecycle = {
		blockedUpgrade: 0,
		blockingUpgrade: 0,
		unexpectedClose: 0
	}
	deviceDraftRepositories.set(repositoryKey, {
		lifecycle,
		repository: await openBrowserDeviceDraftRepository({
			identity,
			dependencies: dependencies(databaseName, lifecycle)
		})
	})
}

function closeDeviceDraftRepository(repositoryKey: string) {
	const entry = deviceDraftRepositories.get(repositoryKey)
	if (!entry) return
	entry.repository.close()
	deviceDraftRepositories.delete(repositoryKey)
}

function setClock(databaseName: string, timestamp: string) {
	clockByDatabase.set(databaseName, new Date(timestamp).toISOString())
}

async function createDraftAndClaim(
	repositoryKey: string,
	ownerToken: string,
	expectedDeviceRevision: number
) {
	const { repository } = requireDeviceDraftRepository(repositoryKey)
	return repository.createDraftAndClaim(
		draftFixture(repository.identity),
		ownerToken,
		{
			deviceRevision: expectedDeviceRevision,
			draftRevision: null
		}
	)
}

async function readDraft(repositoryKey: string, draftId: string) {
	return requireDeviceDraftRepository(repositoryKey).repository.readDraft(
		draftId
	)
}

async function takeOverDraft(
	repositoryKey: string,
	draftId: string,
	ownerToken: string,
	expectedDeviceRevision: number,
	expectedLeaseRevision: number
) {
	return requireDeviceDraftRepository(repositoryKey).repository.takeOverDraft(
		draftId,
		ownerToken,
		{
			deviceRevision: expectedDeviceRevision,
			leaseRevision: expectedLeaseRevision
		}
	)
}

async function claimDraft(
	repositoryKey: string,
	draftId: string,
	ownerToken: string,
	expectedDeviceRevision: number
) {
	return requireDeviceDraftRepository(repositoryKey).repository.claimDraft(
		draftId,
		ownerToken,
		expectedDeviceRevision
	)
}

function renewDraftLease(
	repositoryKey: string,
	draftId: string,
	ownerToken: string,
	expectedDeviceRevision: number,
	expectedLeaseRevision: number
) {
	return settle(() =>
		requireDeviceDraftRepository(repositoryKey).repository.renewDraftLease(
			draftId,
			ownerToken,
			{
				deviceRevision: expectedDeviceRevision,
				leaseRevision: expectedLeaseRevision
			}
		)
	)
}

function readDraftOutcome(repositoryKey: string, draftId: string) {
	return settle(() => readDraft(repositoryKey, draftId))
}

async function attemptOldOwnerMutations(
	repositoryKey: string,
	draftId: string,
	ownerToken: string,
	expectedDeviceRevision: number,
	expectedLeaseRevision: number
) {
	const { repository } = requireDeviceDraftRepository(repositoryKey)
	const changed = draftFixture(
		repository.identity,
		1,
		new Date(Date.parse(FIXTURE_TIMESTAMP) + 1_000).toISOString()
	)
	changed.payload.ui.filter = 'review'
	const attempts = [
		() =>
			repository.renewDraftLease(draftId, ownerToken, {
				deviceRevision: expectedDeviceRevision,
				leaseRevision: expectedLeaseRevision
			}),
		() =>
			repository.writeDraft(changed, ownerToken, {
				deviceRevision: expectedDeviceRevision,
				draftRevision: 0,
				leaseRevision: expectedLeaseRevision
			}),
		() =>
			repository.deleteDraft(draftId, ownerToken, {
				deviceRevision: expectedDeviceRevision,
				draftRevision: 0,
				leaseRevision: expectedLeaseRevision
			})
	]
	const outcomes = []
	for (const attempt of attempts) {
		try {
			outcomes.push({ status: 'unexpected-success', value: await attempt() })
		} catch (error) {
			outcomes.push({ status: 'rejected', error: summarizeError(error) })
		}
	}
	return outcomes
}

function subscribeDeviceDraftRepository(
	repositoryKey: string,
	eventKey: string
) {
	subscriptions.get(eventKey)?.()
	const events: BrowserRepositoryChange[] = []
	receivedEvents.set(eventKey, events)
	const unsubscribe = requireDeviceDraftRepository(
		repositoryKey
	).repository.subscribe((change) => events.push(structuredClone(change)))
	subscriptions.set(eventKey, unsubscribe)
}

async function triggerAbortedUpgrade(databaseName: string) {
	return new Promise<{
		blocked: boolean
		errorName: string
		upgradeStarted: boolean
	}>((resolve, reject) => {
		let blocked = false
		let upgradeStarted = false
		const request = indexedDB.open(
			databaseName,
			BROWSER_LIBRARY_SCHEMA_VERSION + 1
		)
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
	for (const unsubscribe of subscriptions.values()) unsubscribe()
	subscriptions.clear()
	receivedEvents.clear()
	clockByDatabase.clear()
	for (const entry of deviceDraftRepositories.values()) {
		entry.repository.close()
	}
	deviceDraftRepositories.clear()
}

const harness: DeviceDraftEngineHarness = {
	attemptOldOwnerMutations,
	claimDraft,
	closeAll,
	closeDeviceDraftRepository,
	createDraftAndClaim,
	databaseVersion,
	deleteDatabase,
	events(eventKey) {
		return structuredClone(receivedEvents.get(eventKey) ?? [])
	},
	lifecycle(repositoryKey) {
		return { ...requireDeviceDraftRepository(repositoryKey).lifecycle }
	},
	openDeviceDraftRepository,
	readDraft,
	readDraftOutcome,
	renewDraftLease,
	setClock,
	subscribeDeviceDraftRepository,
	takeOverDraft,
	triggerAbortedUpgrade
}

declare global {
	interface Window {
		__deviceDraftEngineHarness: DeviceDraftEngineHarness
	}
}

window.__deviceDraftEngineHarness = harness
document.documentElement.dataset.deviceDraftEngineHarness = 'ready'
