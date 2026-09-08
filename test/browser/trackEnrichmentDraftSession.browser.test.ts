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
