import { afterEach, describe, expect, it, vi } from 'vitest'
import { openBrowserDeviceDraftRepository } from '../../app/repositories/deviceDrafts'
import {
	BROWSER_LIBRARY_STORES,
	openBrowserLibraryDatabase,
	requestResult,
	transactionComplete
} from '../../app/repositories/library/browser/browserLibrarySchema'
import type {
	BrowserDeviceDraftRepository,
	BrowserLibraryDependencies,
	BrowserWorkflowDraft,
	BrowserWorkspaceIdentity
} from '../../app/repositories/library/browser/browserLibraryTypes'
import {
	LOCAL_AUDIO_CACHE_DATABASE_NAME,
	clearLocalAudioAnalysisCache,
	getCachedLocalAudioResult,
	putCachedLocalAudioResult
} from '../../app/utils/localAudioCache'
import { createTrackEnrichmentDraftFixture } from '../fixtures/trackEnrichmentDraft'

const NOW = '2026-07-23T02:00:00.000Z'
const IDENTITY: BrowserWorkspaceIdentity = {
	workspaceId: 'cloud-workspace-a',
	repositoryId: 'cloud-repository-a'
}
const repositories = new Set<BrowserDeviceDraftRepository>()
const databases = new Set<string>()

function databaseName(label: string) {
	const name = `crate-guide-device-drafts-${label}-${crypto.randomUUID()}`
	databases.add(name)
	return name
}

function dependencies(
	databaseName: string,
	overrides: BrowserLibraryDependencies = {}
): BrowserLibraryDependencies {
	return {
		databaseName,
		now: () => new Date(NOW),
		...overrides
	}
}

async function openRepository(
	databaseName: string,
	overrides: BrowserLibraryDependencies = {},
	identity: BrowserWorkspaceIdentity = IDENTITY
) {
	const repository = await openBrowserDeviceDraftRepository({
		identity,
		dependencies: dependencies(databaseName, overrides)
	})
	repositories.add(repository)
	return repository
}

function deleteDatabase(name: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name)
		request.addEventListener('success', () => resolve(), { once: true })
		request.addEventListener(
			'error',
			() => reject(request.error ?? new Error(`Could not delete ${name}.`)),
			{ once: true }
		)
		request.addEventListener(
			'blocked',
			() =>
				reject(new Error(`Database deletion remained blocked for ${name}.`)),
			{ once: true }
		)
	})
}

async function readStoredDeviceState(
	databaseName: string,
	identity: BrowserWorkspaceIdentity = IDENTITY
) {
	const database = await openBrowserLibraryDatabase({ databaseName })
	try {
		const transaction = database.transaction(
			[
				BROWSER_LIBRARY_STORES.workspaces,
				BROWSER_LIBRARY_STORES.deviceDraftRepositories
			],
			'readonly'
		)
		const completion = transactionComplete(transaction)
		const [workspaceCount, deviceState] = await Promise.all([
			requestResult(
				transaction.objectStore(BROWSER_LIBRARY_STORES.workspaces).count()
			),
			requestResult(
				transaction
					.objectStore(BROWSER_LIBRARY_STORES.deviceDraftRepositories)
					.get([identity.workspaceId, identity.repositoryId])
			)
		])
		await completion
		return { workspaceCount, deviceState }
	} finally {
		database.close()
	}
}

async function replaceDraftSerializedPayload(
	databaseName: string,
	draftId: string,
	serializedPayload: string
) {
	const database = await openBrowserLibraryDatabase({ databaseName })
	try {
		const transaction = database.transaction(
			BROWSER_LIBRARY_STORES.drafts,
			'readwrite'
		)
		const completion = transactionComplete(transaction)
		const store = transaction.objectStore(BROWSER_LIBRARY_STORES.drafts)
		const row = await requestResult(
			store.get([IDENTITY.workspaceId, IDENTITY.repositoryId, draftId])
		)
		store.put({ ...(row as Record<string, unknown>), serializedPayload })
		await completion
	} finally {
		database.close()
	}
}

function draftFixture(
	draftRevision = 0,
	updatedAt = NOW,
	identity: BrowserWorkspaceIdentity = IDENTITY
): BrowserWorkflowDraft {
	const payload = createTrackEnrichmentDraftFixture()
	payload.workspace.workspaceId = identity.workspaceId
	payload.workspace.repositoryId = identity.repositoryId
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

function replacementDraft(): BrowserWorkflowDraft {
	const replacement = draftFixture()
	replacement.payload.id = 'draft-b'
	return { ...replacement, id: 'draft-b' }
}

afterEach(async () => {
	for (const repository of repositories) repository.close()
	repositories.clear()
	await Promise.all([...databases].map((name) => deleteDatabase(name)))
	databases.clear()
})

describe('browser device draft repository', () => {
	it('persists a Cloud identity without creating a Local workspace', async () => {
		const name = databaseName('cloud-identity')
		const repository = await openRepository(name)
		expect(await repository.listDrafts()).toEqual({
			value: [],
			deviceRevision: 0
		})
		const draft = draftFixture()
		const claimed = await repository.createDraftAndClaim(
			draft,
			'cloud-device-owner',
			{ deviceRevision: 0, draftRevision: null }
		)
		expect(claimed).toMatchObject({
			deviceRevision: 1,
			value: { draft: { id: draft.id }, lease: { leaseRevision: 0 } }
		})
		await expect(
			repository.takeOverDraft(draft.id, 'stale-device-owner', {
				deviceRevision: 0,
				leaseRevision: 0
			})
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'device-revision',
			expected: 0,
			actual: 1
		})
		repository.close()
		const reopened = await openRepository(name)
		expect(await reopened.readDraft(draft.id)).toMatchObject({
			deviceRevision: 1,
			value: {
				draft: { status: 'ready', metadata: { draftRevision: 0 } },
				lease: { status: 'live', lease: { leaseRevision: 0 } }
			}
		})
		const changed = draftFixture(1, '2026-07-23T02:00:01.000Z')
		changed.payload.ui.filter = 'review'
		expect(
			await reopened.writeDraft(changed, 'cloud-device-owner', {
				deviceRevision: 1,
				draftRevision: 0,
				leaseRevision: 0
			})
		).toMatchObject({
			deviceRevision: 2,
			value: { draftRevision: 1, payload: { ui: { filter: 'review' } } }
		})
		expect(
			await reopened.deleteDraft(draft.id, 'cloud-device-owner', {
				deviceRevision: 2,
				draftRevision: 1,
				leaseRevision: 0
			})
		).toEqual({ value: undefined, deviceRevision: 3 })
		reopened.close()
		const afterDelete = await openRepository(name)
		expect(await afterDelete.readDraft(draft.id)).toEqual({
			value: null,
			deviceRevision: 3
		})

		const nextIdentity = {
			workspaceId: IDENTITY.workspaceId,
			repositoryId: 'cloud-repository-b'
		}
		const nextRepository = await openRepository(name, {}, nextIdentity)
		await expect(
			nextRepository.createDraftAndClaim(
				draftFixture(0, NOW, nextIdentity),
				'next-repository-owner',
				{ deviceRevision: 0, draftRevision: null }
			)
		).resolves.toMatchObject({ deviceRevision: 1 })
		expect(await afterDelete.listDrafts()).toEqual({
			value: [],
			deviceRevision: 3
		})
		expect(await nextRepository.listDrafts()).toMatchObject({
			deviceRevision: 1,
			value: [{ draft: { status: 'ready', metadata: { id: draft.id } } }]
		})
		const stored = await readStoredDeviceState(name)
		expect(stored.workspaceCount).toBe(0)
		expect(stored.deviceState).toMatchObject({
			...IDENTITY,
			deviceRevision: 3
		})
	})

	it('round-trips workflow drafts with explicit draft and device CAS', async () => {
		const name = databaseName('round-trip')
		const repository = await openRepository(name)
		const createdDraft = draftFixture()
		const ownerToken = 'owner-token-a'
		await expect(
			repository.createDraftAndClaim(draftFixture(2), ownerToken, {
				deviceRevision: 0,
				draftRevision: null
			})
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'draft-revision',
			expected: 0,
			actual: 2
		})
		expect(await repository.readDraft(createdDraft.id)).toEqual({
			value: null,
			deviceRevision: 0
		})
		const draftWithRuntimeField = {
			...createdDraft,
			transientViewState: 'must-not-be-returned'
		} as BrowserWorkflowDraft

		const written = await repository.createDraftAndClaim(
			draftWithRuntimeField,
			ownerToken,
			{ deviceRevision: 0, draftRevision: null }
		)
		expect(written).toMatchObject({
			value: {
				draft: createdDraft,
				lease: {
					leaseRevision: 0,
					acquiredAt: NOW,
					renewedAt: NOW,
					expiresAt: '2026-07-23T02:01:00.000Z'
				}
			},
			deviceRevision: 1
		})
		expect(written.value.draft).not.toHaveProperty('transientViewState')
		expect(await repository.readDraft(createdDraft.id)).toMatchObject({
			value: {
				draft: { status: 'ready', draft: createdDraft },
				lease: { status: 'live', lease: { leaseRevision: 0 } }
			},
			deviceRevision: 1
		})
		expect(await repository.listDrafts()).toMatchObject({
			value: [
				{
					draft: { status: 'ready', draft: createdDraft },
					lease: { status: 'live', lease: { leaseRevision: 0 } }
				}
			],
			deviceRevision: 1
		})
		await expect(
			repository.writeDraft(
				draftFixture(1, '2026-07-23T02:05:00.000Z'),
				ownerToken,
				{ deviceRevision: 1, draftRevision: 0, leaseRevision: 0 }
			)
		).rejects.toMatchObject({ code: 'conflict', scope: 'draft-revision' })
		expect(await repository.readDraft(createdDraft.id)).toMatchObject({
			deviceRevision: 1,
			value: { draft: { metadata: { draftRevision: 0 } } }
		})

		const wrongOwnerToken = 'owner-token-must-never-leak'
		let wrongOwnerError: unknown
		try {
			await repository.deleteDraft(createdDraft.id, wrongOwnerToken, {
				deviceRevision: 1,
				draftRevision: 0,
				leaseRevision: 0
			})
		} catch (error) {
			wrongOwnerError = error
		}
		expect(wrongOwnerError).toMatchObject({
			code: 'conflict',
			scope: 'draft-lease'
		})
		expect(JSON.stringify(wrongOwnerError)).not.toContain(wrongOwnerToken)

		const updatedDraft = draftFixture(1, '2026-07-23T02:10:00.000Z')
		updatedDraft.payload.ui.filter = 'review'
		expect(
			await repository.writeDraft(updatedDraft, ownerToken, {
				deviceRevision: 1,
				draftRevision: 0,
				leaseRevision: 0
			})
		).toMatchObject({ value: updatedDraft, deviceRevision: 2 })
		await expect(
			repository.writeDraft(updatedDraft, ownerToken, {
				deviceRevision: 2,
				draftRevision: 0,
				leaseRevision: 0
			})
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'draft-revision',
			actual: 1
		})
		expect(
			await repository.deleteDraft(updatedDraft.id, ownerToken, {
				deviceRevision: 2,
				draftRevision: 1,
				leaseRevision: 0
			})
		).toEqual({ value: undefined, deviceRevision: 3 })
		expect(await repository.readDraft(updatedDraft.id)).toEqual({
			value: null,
			deviceRevision: 3
		})
	})

	it('fences draft owners across renew, release, takeover, and exact expiry', async () => {
		const name = databaseName('lease-lifecycle')
		let currentTime = NOW
		const clock = { now: () => new Date(currentTime) }
		const first = await openRepository(name, clock)
		const second = await openRepository(name, clock)
		const observedChanges: unknown[] = []
		first.subscribe((change) => observedChanges.push(change))
		second.subscribe((change) => observedChanges.push(change))
		const draft = draftFixture()
		const ownerA = 'lease-owner-a-secret'
		const ownerB = 'lease-owner-b-secret'
		const ownerC = 'lease-owner-c-secret'
		const ownerD = 'lease-owner-d-secret'

		expect(
			await first.createDraftAndClaim(draft, ownerA, {
				deviceRevision: 0,
				draftRevision: null
			})
		).toMatchObject({
			deviceRevision: 1,
			value: {
				draft: { draftRevision: 0 },
				lease: { leaseRevision: 0, expiresAt: '2026-07-23T02:01:00.000Z' }
			}
		})

		currentTime = '2026-07-23T02:00:20.000Z'
		expect(
			await first.renewDraftLease(draft.id, ownerA, {
				deviceRevision: 1,
				leaseRevision: 0
			})
		).toMatchObject({
			deviceRevision: 2,
			value: {
				leaseRevision: 1,
				acquiredAt: NOW,
				renewedAt: currentTime,
				expiresAt: '2026-07-23T02:01:20.000Z'
			}
		})
		expect((await readStoredDeviceState(name)).deviceState).toMatchObject({
			deviceRevision: 2
		})
		expect(await second.readDraft(draft.id)).toMatchObject({
			deviceRevision: 2,
			value: {
				draft: { metadata: { draftRevision: 0 } },
				lease: { status: 'live', lease: { leaseRevision: 1 } }
			}
		})

		await first.releaseDraftLease(draft.id, ownerA, {
			deviceRevision: 2,
			leaseRevision: 1
		})
		expect(await second.readDraft(draft.id)).toMatchObject({
			deviceRevision: 3,
			value: { lease: { status: 'unclaimed', leaseRevision: 2 } }
		})
		expect(await second.claimDraft(draft.id, ownerB, 3)).toMatchObject({
			deviceRevision: 4,
			value: { lease: { leaseRevision: 3 } }
		})
		expect(
			await first.takeOverDraft(draft.id, ownerC, {
				deviceRevision: 4,
				leaseRevision: 3
			})
		).toMatchObject({
			deviceRevision: 5,
			value: { lease: { leaseRevision: 4 } }
		})

		await expect(
			second.renewDraftLease(draft.id, ownerB, {
				deviceRevision: 5,
				leaseRevision: 4
			})
		).rejects.toMatchObject({ code: 'conflict', scope: 'draft-lease' })
		const changedDraft = draftFixture(1, '2026-07-23T02:00:21.000Z')
		changedDraft.payload.ui.filter = 'review'
		await expect(
			second.writeDraft(changedDraft, ownerB, {
				deviceRevision: 5,
				draftRevision: 0,
				leaseRevision: 4
			})
		).rejects.toMatchObject({ code: 'conflict', scope: 'draft-lease' })
		await expect(
			second.deleteDraft(draft.id, ownerB, {
				deviceRevision: 5,
				draftRevision: 0,
				leaseRevision: 4
			})
		).rejects.toMatchObject({ code: 'conflict', scope: 'draft-lease' })

		currentTime = '2026-07-23T02:01:20.000Z'
		expect(await second.readDraft(draft.id)).toMatchObject({
			value: { lease: { status: 'expired', lease: { leaseRevision: 4 } } }
		})
		expect(await second.claimDraft(draft.id, ownerD, 5)).toMatchObject({
			deviceRevision: 6,
			value: { lease: { leaseRevision: 5 } }
		})
		await expect(
			first.renewDraftLease(draft.id, ownerC, {
				deviceRevision: 6,
				leaseRevision: 5
			})
		).rejects.toMatchObject({ code: 'conflict', scope: 'draft-lease' })

		await vi.waitFor(() => expect(observedChanges.length).toBeGreaterThan(0))
		const serializedChanges = JSON.stringify(observedChanges)
		for (const owner of [ownerA, ownerB, ownerC, ownerD]) {
			expect(serializedChanges).not.toContain(owner)
		}
	})

	it('isolates invalid and incompatible payloads while preserving metadata deletion', async () => {
		const name = databaseName('payload-isolation')
		const repository = await openRepository(name)
		const draft = draftFixture()
		const ownerToken = 'payload-repair-owner'
		await repository.createDraftAndClaim(draft, ownerToken, {
			deviceRevision: 0,
			draftRevision: null
		})
		await replaceDraftSerializedPayload(name, draft.id, '{')

		expect(await repository.readDraft(draft.id)).toMatchObject({
			deviceRevision: 1,
			value: {
				draft: {
					status: 'invalid',
					metadata: { id: draft.id, draftRevision: 0 }
				},
				lease: { status: 'live', lease: { leaseRevision: 0 } }
			}
		})
		expect(await repository.listDrafts()).toMatchObject({
			value: [{ draft: { status: 'invalid' } }]
		})
		await repository.deleteDraft(draft.id, ownerToken, {
			deviceRevision: 1,
			draftRevision: 0,
			leaseRevision: 0
		})

		await repository.createDraftAndClaim(draft, ownerToken, {
			deviceRevision: 2,
			draftRevision: null
		})
		await replaceDraftSerializedPayload(
			name,
			draft.id,
			JSON.stringify({ ...draft.payload, schemaVersion: 999 })
		)
		expect(await repository.readDraft(draft.id)).toMatchObject({
			deviceRevision: 3,
			value: {
				draft: {
					status: 'incompatible',
					schemaVersion: 999,
					reason: 'future-schema',
					metadata: { id: draft.id, draftRevision: 0 }
				}
			}
		})
		await expect(
			repository.deleteDraft(draft.id, ownerToken, {
				deviceRevision: 3,
				draftRevision: 0,
				leaseRevision: 0
			})
		).resolves.toEqual({ value: undefined, deviceRevision: 4 })
	})

	it('atomically replaces a draft and claims the replacement behind an observed lease fence', async () => {
		const name = databaseName('replace-and-claim')
		const repository = await openRepository(name)
		const original = draftFixture()
		await repository.createDraftAndClaim(original, 'original-owner', {
			deviceRevision: 0,
			draftRevision: null
		})
		const replacement = replacementDraft()

		await expect(
			repository.replaceDraftAndClaim(replacement, 'replacement-owner', {
				deviceRevision: 1,
				draftId: original.id,
				draftRevision: 0,
				observedLeaseRevision: 99
			})
		).rejects.toMatchObject({
			code: 'conflict',
			scope: 'draft-lease',
			expected: 99,
			actual: 0
		})
		expect(
			await repository.replaceDraftAndClaim(replacement, 'replacement-owner', {
				deviceRevision: 1,
				draftId: original.id,
				draftRevision: 0,
				observedLeaseRevision: 0
			})
		).toMatchObject({
			deviceRevision: 2,
			value: {
				draft: { id: 'draft-b', draftRevision: 0 },
				lease: { leaseRevision: 0 }
			}
		})
		expect(await repository.readDraft(original.id)).toEqual({
			value: null,
			deviceRevision: 2
		})
		expect(await repository.readDraft(replacement.id)).toMatchObject({
			deviceRevision: 2,
			value: {
				draft: { status: 'ready', draft: { id: 'draft-b' } },
				lease: { status: 'live', lease: { leaseRevision: 0 } }
			}
		})
	})

	it('keeps device drafts and the disposable audio cache in separate databases', async () => {
		const name = databaseName('audio-cache-separation')
		const openedNames: string[] = []
		const recordingFactory = {
			open(databaseName: string, version?: number) {
				openedNames.push(databaseName)
				return version === undefined
					? indexedDB.open(databaseName)
					: indexedDB.open(databaseName, version)
			}
		} as unknown as IDBFactory
		const cacheRecord = {
			cacheKey: `crate-guide-local-audio-v3|separation-${crypto.randomUUID()}`,
			tags: {
				title: 'Cached track',
				artist: 'Cached artist',
				album: null,
				genres: ['House'],
				durationSeconds: 180,
				bpm: 124,
				key: '8A'
			},
			analysis: null,
			updatedAt: Date.parse(NOW)
		}
		await clearLocalAudioAnalysisCache()
		await putCachedLocalAudioResult(cacheRecord)
		const repository = await openRepository(name, {
			indexedDB: recordingFactory,
			createBroadcastChannel: () => null
		})
		const draft = draftFixture()
		await repository.createDraftAndClaim(draft, 'separation-owner', {
			deviceRevision: 0,
			draftRevision: null
		})
		const beforeClear = await repository.readDraft(draft.id)

		await clearLocalAudioAnalysisCache()
		expect(await getCachedLocalAudioResult(cacheRecord.cacheKey)).toBeNull()
		expect(await repository.readDraft(draft.id)).toEqual(beforeClear)

		await putCachedLocalAudioResult(cacheRecord)
		await repository.deleteDraft(draft.id, 'separation-owner', {
			deviceRevision: 1,
			draftRevision: 0,
			leaseRevision: 0
		})
		expect(await getCachedLocalAudioResult(cacheRecord.cacheKey)).toEqual(
			cacheRecord
		)
		await clearLocalAudioAnalysisCache()

		expect(new Set(openedNames)).toEqual(new Set([name]))
		expect(openedNames).not.toContain(LOCAL_AUDIO_CACHE_DATABASE_NAME)
	})
})

describe('browser device draft repository transaction aborts', () => {
	it('rolls back every create-and-claim write with its device revision', async () => {
		const name = databaseName('abort-create')
		let abortOrdinal: number | null = null
		const repository = await openRepository(name, {
			createBroadcastChannel: () => null,
			onTransactionStep: ({ command, ordinal }) => {
				if (command === 'create-and-claim-draft' && ordinal === abortOrdinal) {
					throw new Error(`Abort draft step ${ordinal}`)
				}
			}
		})
		const draft = draftFixture()

		for (const ordinal of [1, 2, 3]) {
			abortOrdinal = ordinal
			await expect(
				repository.createDraftAndClaim(draft, 'atomic-owner', {
					deviceRevision: 0,
					draftRevision: null
				})
			).rejects.toMatchObject({ code: 'unknown' })
			expect(await repository.readDraft(draft.id)).toEqual({
				value: null,
				deviceRevision: 0
			})
		}
		expect((await readStoredDeviceState(name)).deviceState).toBeUndefined()
	})

	it('rolls back every lease, draft, replace, and delete write at each step', async () => {
		type ScenarioContext = Readonly<{
			repository: BrowserDeviceDraftRepository
			draft: BrowserWorkflowDraft
			ownerToken: string
		}>
		const scenarios: ReadonlyArray<{
			label: string
			command: string
			ordinals: readonly number[]
			prepare?: (context: ScenarioContext) => Promise<number>
			action: (
				context: ScenarioContext,
				deviceRevision: number
			) => Promise<unknown>
			assert: (
				context: ScenarioContext,
				deviceRevision: number
			) => Promise<void>
		}> = [
			{
				label: 'renew',
				command: 'renew-draft-lease',
				ordinals: [1, 2],
				action: ({ repository, draft, ownerToken }, revision) =>
					repository.renewDraftLease(draft.id, ownerToken, {
						deviceRevision: revision,
						leaseRevision: 0
					}),
				assert: async ({ repository, draft }, revision) => {
					expect(await repository.readDraft(draft.id)).toMatchObject({
						deviceRevision: revision,
						value: { lease: { status: 'live', lease: { leaseRevision: 0 } } }
					})
				}
			},
			{
				label: 'release',
				command: 'release-draft-lease',
				ordinals: [1, 2],
				action: ({ repository, draft, ownerToken }, revision) =>
					repository.releaseDraftLease(draft.id, ownerToken, {
						deviceRevision: revision,
						leaseRevision: 0
					}),
				assert: async ({ repository, draft }, revision) => {
					expect(await repository.readDraft(draft.id)).toMatchObject({
						deviceRevision: revision,
						value: { lease: { status: 'live', lease: { leaseRevision: 0 } } }
					})
				}
			},
			{
				label: 'claim',
				command: 'claim-draft-lease',
				ordinals: [1, 2],
				prepare: async ({ repository, draft, ownerToken }) => {
					await repository.releaseDraftLease(draft.id, ownerToken, {
						deviceRevision: 1,
						leaseRevision: 0
					})
					return 2
				},
				action: ({ repository, draft }, revision) =>
					repository.claimDraft(draft.id, 'next-owner', revision),
				assert: async ({ repository, draft }, revision) => {
					expect(await repository.readDraft(draft.id)).toMatchObject({
						deviceRevision: revision,
						value: { lease: { status: 'unclaimed', leaseRevision: 1 } }
					})
				}
			},
			{
				label: 'takeover',
				command: 'take-over-draft-lease',
				ordinals: [1, 2],
				action: ({ repository, draft }, revision) =>
					repository.takeOverDraft(draft.id, 'next-owner', {
						deviceRevision: revision,
						leaseRevision: 0
					}),
				assert: async ({ repository, draft }, revision) => {
					expect(await repository.readDraft(draft.id)).toMatchObject({
						deviceRevision: revision,
						value: { lease: { status: 'live', lease: { leaseRevision: 0 } } }
					})
				}
			},
			{
				label: 'write',
				command: 'write-draft',
				ordinals: [1, 2],
				action: ({ repository, draft, ownerToken }, revision) => {
					const changed = draftFixture(1, '2026-07-23T02:00:01.000Z')
					changed.payload.ui.filter = 'review'
					return repository.writeDraft(changed, ownerToken, {
						deviceRevision: revision,
						draftRevision: draft.draftRevision,
						leaseRevision: 0
					})
				},
				assert: async ({ repository, draft }, revision) => {
					expect(await repository.readDraft(draft.id)).toMatchObject({
						deviceRevision: revision,
						value: { draft: { metadata: { draftRevision: 0 } } }
					})
				}
			},
			{
				label: 'replace',
				command: 'replace-and-claim-draft',
				ordinals: [1, 2, 3, 4, 5],
				action: ({ repository, draft }, revision) =>
					repository.replaceDraftAndClaim(replacementDraft(), 'next-owner', {
						deviceRevision: revision,
						draftId: draft.id,
						draftRevision: draft.draftRevision,
						observedLeaseRevision: 0
					}),
				assert: async ({ repository, draft }, revision) => {
					expect(await repository.readDraft(draft.id)).toMatchObject({
						deviceRevision: revision,
						value: { draft: { status: 'ready' }, lease: { status: 'live' } }
					})
					expect(await repository.readDraft('draft-b')).toEqual({
						deviceRevision: revision,
						value: null
					})
				}
			},
			{
				label: 'delete',
				command: 'delete-draft',
				ordinals: [1, 2, 3],
				action: ({ repository, draft, ownerToken }, revision) =>
					repository.deleteDraft(draft.id, ownerToken, {
						deviceRevision: revision,
						draftRevision: draft.draftRevision,
						leaseRevision: 0
					}),
				assert: async ({ repository, draft }, revision) => {
					expect(await repository.readDraft(draft.id)).toMatchObject({
						deviceRevision: revision,
						value: { draft: { status: 'ready' }, lease: { status: 'live' } }
					})
				}
			}
		]

		for (const scenario of scenarios) {
			for (const ordinal of scenario.ordinals) {
				let abortOrdinal: number | null = null
				const name = databaseName(`abort-${scenario.label}-${ordinal}`)
				const repository = await openRepository(name, {
					createBroadcastChannel: () => null,
					onTransactionStep: ({ command, ordinal: step }) => {
						if (command === scenario.command && step === abortOrdinal) {
							throw new Error(`Abort ${command} step ${step}`)
						}
					}
				})
				const draft = draftFixture()
				const ownerToken = 'atomic-owner'
				await repository.createDraftAndClaim(draft, ownerToken, {
					deviceRevision: 0,
					draftRevision: null
				})
				const context = { repository, draft, ownerToken }
				const deviceRevision = scenario.prepare
					? await scenario.prepare(context)
					: 1
				abortOrdinal = ordinal

				await expect(
					scenario.action(context, deviceRevision)
				).rejects.toMatchObject({ code: 'unknown' })
				await scenario.assert(context, deviceRevision)
			}
		}
	})
})
