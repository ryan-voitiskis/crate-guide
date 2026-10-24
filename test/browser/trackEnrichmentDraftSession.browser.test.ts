import { type EffectScope, computed, effectScope, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTrackEnrichmentDraftSession } from '../../app/composables/useTrackEnrichmentDraftSession'
import type {
	TrackEnrichmentResumedReview,
	TrackEnrichmentWorkflow
} from '../../app/composables/useTrackEnrichmentWorkflow'
import { openBrowserDeviceDraftRepository } from '../../app/repositories/deviceDrafts'
import type {
	BrowserDeviceDraftRepository,
	BrowserLibraryDependencies
} from '../../app/repositories/deviceDrafts/contracts'
import type { LibraryRepositoryBundle } from '../../app/repositories/library/contracts'
import type { RekordboxXmlTrack } from '../../app/utils/rekordboxXml'
import { buildTrackEnrichmentRows } from '../../app/utils/trackEnrichment'
import type { EnrichmentRow } from '../../app/utils/trackEnrichmentTypes'
import { createWorkbenchRuntime } from '../../app/utils/workbenchPinia'
import type { LibraryTrack } from '../../shared/types/library'

const NOW = '2026-07-23T04:00:00.000Z'
const scopes = new Set<EffectScope>()
const repositories = new Set<BrowserDeviceDraftRepository>()
const databases = new Set<string>()

function databaseName(label: string) {
	const name = `crate-guide-enrichment-draft-${label}-${crypto.randomUUID()}`
	databases.add(name)
	return name
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

function track(overrides: Partial<LibraryTrack> = {}): LibraryTrack {
	return {
		id: 'track-1',
		record_id: 'record-1',
		title: 'Track One',
		artists: [{ name: 'Artist', role: null }],
		extraartists: [],
		position: 'A1',
		duration: 240_000,
		bpm: null,
		rpm: null,
		key: null,
		mode: null,
		genres: [],
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true,
		beatport_data: null,
		audio_features: null,
		created_at: null,
		updated_at: '2026-07-23T03:00:00.000Z',
		...overrides
	}
}

function source(): RekordboxXmlTrack {
	return {
		sourceType: 'rekordboxXml',
		index: 0,
		trackId: 'xml-1',
		name: 'Track One',
		artist: 'Artist',
		album: null,
		genre: 'House',
		kind: 'WAV File',
		totalTimeSeconds: 240,
		year: 2026,
		averageBpm: 128,
		dateAdded: '2026-07-23',
		bitRate: 1_411,
		sampleRate: 44_100,
		comments: null,
		playCount: 1,
		rating: 0,
		location: '/Users/alice/Music/Track One.wav',
		locationHint: 'Artist/Release/Track One.wav',
		remixer: null,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		label: null,
		warnings: []
	}
}

function reviewRows(currentTrack = track()): EnrichmentRow[] {
	return buildTrackEnrichmentRows({
		sources: [source()],
		tracks: [currentTrack],
		records: []
	})
}

function workflowHarness(initialRows: EnrichmentRow[] = []) {
	const rows = ref(initialRows)
	const stagedRowIds = ref(
		new Set(initialRows.filter((row) => row.defaultStaged).map((row) => row.id))
	)
	const selectedFilter =
		ref<TrackEnrichmentWorkflow['selectedFilter']['value']>('ready')
	const selectedFileName = ref<string | null>(
		initialRows.length > 0 ? 'collection.xml' : null
	)
	const isReviewReadOnly = ref(false)
	const lastApplySummary =
		ref<TrackEnrichmentWorkflow['lastApplySummary']['value']>(null)
	const loadResumedReview = vi.fn((review: TrackEnrichmentResumedReview) => {
		rows.value = review.rows
		stagedRowIds.value = new Set(review.stagedRowIds)
		selectedFilter.value = review.selectedFilter
		selectedFileName.value = review.fileLabel
	})
	const startAnotherSource = vi.fn(() => {
		rows.value = []
		stagedRowIds.value = new Set()
		selectedFilter.value = 'ready'
		selectedFileName.value = null
		lastApplySummary.value = null
		isReviewReadOnly.value = false
	})
	const workflow = {
		rows,
		stagedRowIds,
		selectedFilter,
		selectedFileName,
		sourceLabel: computed(() => 'Rekordbox XML'),
		isParsing: ref(false),
		isApplying: ref(false),
		isReviewReadOnly,
		lastApplySummary,
		loadResumedReview,
		startAnotherSource,
		setReviewReadOnly: vi.fn((readOnly: boolean) => {
			isReviewReadOnly.value = readOnly
		})
	} as unknown as TrackEnrichmentWorkflow
	return { workflow, loadResumedReview }
}

function createSession(input: {
	databaseName: string
	label: string
	rows?: EnrichmentRow[]
	setInterval?: typeof globalThis.setInterval
	clearInterval?: typeof globalThis.clearInterval
}) {
	const runtime = createWorkbenchRuntime(
		{
			id: 'browser-workspace',
			repositoryId: 'browser-repository',
			location: 'browser',
			displayLabel: 'This browser',
			readOnly: false,
			repositoryRevision: 0,
			capabilities: {
				location: 'browser',
				canPersistSessions: true,
				canMutateLibrary: true,
				canManageCrates: true,
				canConnectDiscogs: true,
				canEnrichTracks: true,
				canManageAccount: false
			}
		},
		{ id: 'browser-repository' } as LibraryRepositoryBundle
	)
	const workflow = workflowHarness(input.rows)
	const repositoryDependencies: BrowserLibraryDependencies = {
		databaseName: input.databaseName,
		now: () => new Date(NOW)
	}
	const opened: BrowserDeviceDraftRepository[] = []
	const scope = effectScope()
	const session = scope.run(() =>
		useTrackEnrichmentDraftSession({
			runtime,
			workflow: workflow.workflow,
			records: { records: [] },
			tracks: { tracks: [track()] },
			openRepository: async ({ identity }) => {
				const repository = await openBrowserDeviceDraftRepository({
					identity,
					dependencies: repositoryDependencies
				})
				repositories.add(repository)
				opened.push(repository)
				return repository
			},
			now: () => new Date(NOW),
			randomUUID: () => `${input.label}-${crypto.randomUUID()}`,
			autosaveDelayMs: 60_000,
			setInterval: input.setInterval,
			clearInterval: input.clearInterval,
			leaseRenewIntervalMs: 120_000
		})
	)
	if (!session) throw new Error('Failed to create draft session.')
	scopes.add(scope)
	return { session, workflow, scope, opened }
}

afterEach(async () => {
	for (const scope of scopes) scope.stop()
	scopes.clear()
	await new Promise((resolve) => globalThis.setTimeout(resolve, 50))
	for (const repository of repositories) repository.close()
	repositories.clear()
	await Promise.all([...databases].map((name) => deleteDatabase(name)))
	databases.clear()
})

describe('track enrichment device-draft browser integration', () => {
	it('keeps an unchanged projected review owned without issuing a no-op write', async () => {
		const current = createSession({
			databaseName: databaseName('unchanged-projection'),
			label: 'writer',
			rows: reviewRows()
		})
		await current.session.initialize()
		await current.session.flushSave()
		const repository = current.opened[0]!
		const write = vi.spyOn(repository, 'writeDraft')
		const before = await repository.listDrafts()
		for (let attempt = 0; attempt < 2; attempt++) {
			current.workflow.workflow.rows.value =
				current.workflow.workflow.rows.value.map((row) => ({
					...row,
					error: null
				}))
			await current.session.flushSave()
		}
		expect(write).not.toHaveBeenCalled()
		expect(await repository.listDrafts()).toEqual(before)
		expect(current.session.isOwned.value).toBe(true)
		expect(current.session.saveState.value).toBe('saved')
		current.workflow.workflow.selectedFilter.value = 'staged'
		await current.session.flushSave()
		expect(write).toHaveBeenCalledOnce()
		expect(current.session.saveState.value).toBe('saved')
		expect((await repository.listDrafts()).value[0]?.draft).toMatchObject({
			status: 'ready',
			draft: { payload: { ui: { filter: 'staged' } } }
		})
	})

	it('reopens and resumes a persisted review after disposing the first session', async () => {
		const name = databaseName('reload-resume')
		const first = createSession({
			databaseName: name,
			label: 'first',
			rows: reviewRows()
		})
		await first.session.initialize()
		await first.session.flushSave()
		expect(first.session.hasDraft.value).toBe(true)
		expect(first.session.isOwned.value).toBe(true)

		const close = vi.spyOn(first.opened[0]!, 'close')
		first.scope.stop()
		scopes.delete(first.scope)
		await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())

		const reloaded = createSession({
			databaseName: name,
			label: 'reloaded'
		})
		await reloaded.session.initialize()
		expect(reloaded.session.hasDraft.value).toBe(true)
		expect(reloaded.workflow.workflow.rows.value).toEqual([])

		expect(await reloaded.session.resume()).toBe(true)
		expect(reloaded.session.isOwned.value).toBe(true)
		expect(reloaded.workflow.loadResumedReview).toHaveBeenCalledOnce()
		expect(reloaded.workflow.workflow.rows.value).toHaveLength(1)
		expect(reloaded.workflow.workflow.selectedFileName.value).toBe(
			'collection.xml'
		)
		expect(reloaded.workflow.workflow.stagedRowIds.value.size).toBe(1)
	})

	it('saves and acknowledges a completed review after takeover and old-owner teardown', async () => {
		const name = databaseName('takeover-complete')
		const first = createSession({
			databaseName: name,
			label: 'first',
			rows: reviewRows()
		})
		await first.session.initialize()
		await first.session.flushSave()
		const second = createSession({ databaseName: name, label: 'second' })
		await second.session.initialize()
		expect(await second.session.takeOver()).toBe(true)
		await vi.waitFor(() => expect(first.session.isOwned.value).toBe(false))
		first.scope.stop()
		await vi.waitFor(() => expect(second.session.isOwned.value).toBe(true))
		const row = second.workflow.workflow.rows.value[0]!
		const write = vi.spyOn(second.opened[0]!, 'writeDraft')
		// Applying clears row errors before the cloud command returns. Even an
		// unchanged row emits a new projection and must remain a safe no-op save.
		second.workflow.workflow.rows.value = [{ ...row, error: null }]
		await second.session.flushSave()
		expect(second.session.isOwned.value).toBe(true)
		expect(second.session.saveState.value).toBe('saved')
		expect(write).not.toHaveBeenCalled()
		await second.session.recordApplyAttempt({
			rows: [
				{
					row,
					intentKind: 'fill-empty-fields',
					requested: { bpm: true, keyMode: true }
				}
			],
			outcome: {
				cancelled: false,
				requiresReview: false,
				results: [
					{
						id: row.track!.id,
						status: 'updated',
						success: true,
						track: track({ bpm: 128, key: 9, mode: 0 }),
						issue: null,
						error: null,
						operation: null
					}
				]
			},
			attemptedAt: NOW
		})
		second.workflow.workflow.rows.value = [
			{ ...row, track: track({ bpm: 128, key: 9, mode: 0 }), applied: true }
		]
		second.workflow.workflow.stagedRowIds.value = new Set()
		second.workflow.workflow.lastApplySummary.value = {
			total: 1,
			succeeded: 1,
			failed: 0,
			remaining: 0,
			bpm: 1,
			keyMode: 1,
			evidence: 1,
			evidenceOnly: 0
		}
		await second.session.flushSave()
		expect(second.session.saveState.value).toBe('saved')
		expect(second.session.hasUnsavedChanges.value).toBe(false)
		expect(await second.session.acknowledgeCompleteAndDelete()).toBe(true)
		expect(second.workflow.workflow.rows.value).toEqual([])
		expect(await second.opened[0]!.listDrafts()).toMatchObject({ value: [] })
	})

	it('retries a confirmed completion when no draft could be stored before apply', async () => {
		const current = createSession({
			databaseName: databaseName('complete-quota'),
			label: 'quota',
			rows: reviewRows()
		})
		await current.session.initialize()
		const create = vi.spyOn(current.opened[0]!, 'createDraftAndClaim')
		create
			.mockRejectedValueOnce({ code: 'quota' })
			.mockRejectedValueOnce({ code: 'quota' })
			.mockRejectedValueOnce({ code: 'quota' })
		await current.session.flushSave()
		const row = current.workflow.workflow.rows.value[0]!
		await current.session.recordApplyAttempt({
			rows: [
				{
					row,
					intentKind: 'fill-empty-fields',
					requested: { bpm: true, keyMode: true }
				}
			],
			outcome: {
				cancelled: false,
				requiresReview: false,
				results: [
					{
						id: row.track!.id,
						status: 'updated',
						success: true,
						track: track({ bpm: 128, key: 9, mode: 0 }),
						issue: null,
						error: null,
						operation: null
					}
				]
			},
			attemptedAt: NOW
		})
		expect(current.session.saveState.value).toBe('failed')
		current.workflow.workflow.rows.value = [
			{ ...row, track: track({ bpm: 128, key: 9, mode: 0 }), applied: true }
		]
		current.workflow.workflow.stagedRowIds.value = new Set()
		await current.session.flushSave()
		expect(current.session.saveState.value).toBe('saved')
		expect(create).toHaveBeenCalledTimes(4)
		const stored = await current.opened[0]!.listDrafts()
		expect(stored.value[0]?.draft).toMatchObject({
			status: 'ready',
			draft: {
				payload: {
					decisions: [{ kind: 'fill-empty-fields', staged: false }],
					partialOutcomes: [
						{ status: 'succeeded', applied: { bpm: true, keyMode: true } }
					]
				}
			}
		})
	})

	it('does not fence its own writer when a renewal broadcast precedes its result', async () => {
		let renewTimer = () => {}
		const current = createSession({
			databaseName: databaseName('renew-broadcast'),
			label: 'renew',
			rows: reviewRows(),
			setInterval: ((callback) => {
				renewTimer = callback as () => void
				return 0
			}) as typeof globalThis.setInterval,
			clearInterval: () => {}
		})
		await current.session.initialize()
		await current.session.flushSave()
		const repository = current.opened[0]!
		const localChanges = vi.fn()
		const remoteChanges = vi.fn()
		repository.subscribe(localChanges)
		repository.subscribe(remoteChanges, { includeOwn: false })
		const original = repository.renewDraftLease.bind(repository)
		let release = () => {}
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		let committed = false
		vi.spyOn(repository, 'renewDraftLease').mockImplementationOnce(
			async (...args) => {
				const result = await original(...args)
				committed = true
				await gate
				return result
			}
		)
		renewTimer()
		let ownedDuringCommit: boolean
		try {
			await vi.waitFor(() => expect(committed).toBe(true))
			await new Promise((resolve) => globalThis.setTimeout(resolve, 20))
			ownedDuringCommit = current.session.isOwned.value
		} finally {
			release()
		}
		await vi.waitFor(() =>
			expect(current.session.activeEntry.value?.lease).toMatchObject({
				status: 'live',
				lease: { leaseRevision: 1 }
			})
		)
		expect(localChanges).toHaveBeenCalledOnce()
		expect(remoteChanges).not.toHaveBeenCalled()
		expect(ownedDuringCommit).toBe(true)
		expect(current.session.isOwned.value).toBe(true)
		expect(current.workflow.workflow.isReviewReadOnly.value).toBe(false)
		current.workflow.workflow.selectedFilter.value = 'staged'
		await current.session.flushSave()
		expect(current.session.saveState.value).toBe('saved')
	})

	it('broadcasts takeover and delete across sessions without resurrecting dirty work', async () => {
		const name = databaseName('takeover-delete')
		const first = createSession({
			databaseName: name,
			label: 'first',
			rows: reviewRows()
		})
		await first.session.initialize()
		await first.session.flushSave()

		const second = createSession({ databaseName: name, label: 'second' })
		await second.session.initialize()
		expect(await second.session.resume()).toBe(true)
		expect(second.session.isOwned.value).toBe(false)
		expect(second.workflow.workflow.isReviewReadOnly.value).toBe(true)

		first.workflow.workflow.selectedFilter.value = 'staged'
		expect(first.session.hasUnsavedChanges.value).toBe(true)
		expect(await second.session.takeOver()).toBe(true)
		await vi.waitFor(() => expect(first.session.isOwned.value).toBe(false))
		expect(first.workflow.workflow.isReviewReadOnly.value).toBe(true)

		expect(await second.session.deleteDraft()).toBe(true)
		await vi.waitFor(() =>
			expect(first.session.isDraftMissingConflict.value).toBe(true)
		)
		expect(first.workflow.workflow.rows.value).toHaveLength(1)
		expect(first.session.isReadOnly.value).toBe(true)
		await first.session.flushSave()

		const inspector = await openBrowserDeviceDraftRepository({
			identity: {
				workspaceId: 'browser-workspace',
				repositoryId: 'browser-repository'
			},
			dependencies: { databaseName: name, now: () => new Date(NOW) }
		})
		repositories.add(inspector)
		expect(await inspector.listDrafts()).toMatchObject({ value: [] })

		expect(await first.session.startFresh()).toBe(true)
		expect(first.session.isDraftMissingConflict.value).toBe(false)
		expect(first.workflow.workflow.rows.value).toEqual([])
		expect(await inspector.listDrafts()).toMatchObject({ value: [] })
	})
})
