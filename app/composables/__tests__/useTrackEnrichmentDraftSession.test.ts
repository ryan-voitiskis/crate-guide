import { type EffectScope, computed, effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
	TrackEnrichmentApplyAttempt,
	TrackEnrichmentResumedReview,
	TrackEnrichmentWorkflow
} from '~/composables/useTrackEnrichmentWorkflow'
import type {
	BrowserClaimedDraft,
	BrowserDeviceDraftRepository,
	BrowserDraftLease,
	BrowserWorkflowDraft,
	BrowserWorkflowDraftEntry
} from '~/repositories/library/browser/browserLibraryTypes'
import type { LibraryRepositoryBundle } from '~/repositories/library/contracts'
import type { RekordboxXmlTrack } from '~/utils/rekordboxXml'
import { buildTrackEnrichmentRows } from '~/utils/trackEnrichment'
import { hydrateTrackEnrichmentDraft } from '~/utils/trackEnrichmentDraftHydration'
import { projectTrackEnrichmentDraft } from '~/utils/trackEnrichmentDraftProjection'
import { createTrackEnrichmentDraftWorkspaceIdentity } from '~/utils/trackEnrichmentDraftWorkspaceIdentity'
import type { EnrichmentRow } from '~/utils/trackEnrichmentTypes'
import {
	appWorkbenchCapabilities,
	createWorkbenchRuntime
} from '~/utils/workbenchPinia'
import type { LibraryTrack } from '~~/shared/types/library'

const NOW = '2026-07-23T04:00:00.000Z'
const activeScopes: EffectScope[] = []

const { useTrackEnrichmentDraftSession } =
	await import('../useTrackEnrichmentDraftSession')

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

function xmlSource(
	overrides: Partial<RekordboxXmlTrack> = {}
): RekordboxXmlTrack {
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
		comments: 'must not persist',
		playCount: 1,
		rating: 0,
		location: '/Users/alice/Music/Track One.wav',
		locationHint: 'Artist/Release/Track One.wav',
		remixer: null,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		label: null,
		warnings: [],
		...overrides
	}
}

function reviewRows(currentTrack = track()): EnrichmentRow[] {
	return buildTrackEnrichmentRows({
		sources: [xmlSource()],
		tracks: [currentTrack],
		records: []
	})
}

function workflowHarness(rows: EnrichmentRow[] = []) {
	const workflowRows = ref(rows)
	const stagedRowIds = ref(
		new Set(rows.filter((row) => row.defaultStaged).map((row) => row.id))
	)
	const selectedFilter =
		ref<TrackEnrichmentWorkflow['selectedFilter']['value']>('ready')
	const selectedFileName = ref<string | null>(
		rows.length ? 'collection.xml' : null
	)
	const isReviewReadOnly = ref(false)
	const lastApplySummary =
		ref<TrackEnrichmentWorkflow['lastApplySummary']['value']>(null)
	const loadResumedReview = vi.fn((review: TrackEnrichmentResumedReview) => {
		workflowRows.value = review.rows
		stagedRowIds.value = new Set(review.stagedRowIds)
		selectedFilter.value = review.selectedFilter
		selectedFileName.value = review.fileLabel
	})
	const startAnotherSource = vi.fn(() => {
		workflowRows.value = []
		stagedRowIds.value = new Set()
		selectedFilter.value = 'ready'
		selectedFileName.value = null
		lastApplySummary.value = null
		isReviewReadOnly.value = false
	})
	const workflow = {
		rows: workflowRows,
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
	return { workflow, loadResumedReview, startAnotherSource }
}

function runtime(workspaceId = 'workspace-1', repositoryId = 'repository-1') {
	return createWorkbenchRuntime(
		{
			id: workspaceId,
			repositoryId,
			location: 'cloud',
			displayLabel: 'Library',
			readOnly: false,
			repositoryRevision: 7,
			capabilities: appWorkbenchCapabilities
		},
		{ id: repositoryId } as LibraryRepositoryBundle
	)
}

function lease(revision = 0): BrowserDraftLease {
	return {
		leaseRevision: revision,
		acquiredAt: NOW,
		renewedAt: NOW,
		expiresAt: '2026-07-23T04:01:00.000Z'
	}
}

function readyEntry(
	draft: BrowserWorkflowDraft,
	leaseState: BrowserWorkflowDraftEntry['lease'] = {
		status: 'unclaimed',
		leaseRevision: null
	}
): BrowserWorkflowDraftEntry {
	return {
		draft: {
			status: 'ready',
			metadata: {
				id: draft.id,
				kind: draft.kind,
				draftRevision: draft.draftRevision,
				updatedAt: draft.updatedAt
			},
			draft
		},
		lease: leaseState
	}
}

async function storedDraft(
	rows = reviewRows(),
	overrides: { workspaceId?: string; repositoryId?: string } = {}
): Promise<BrowserWorkflowDraft> {
	const payload = await projectTrackEnrichmentDraft({
		id: 'draft-1',
		workspace: {
			workspaceId: overrides.workspaceId ?? 'workspace-1',
			repositoryId: overrides.repositoryId ?? 'repository-1',
			repositoryRevision: 7
		},
		draftRevision: 0,
		createdAt: NOW,
		updatedAt: NOW,
		sourceLabel: 'collection.xml',
		rows: rows.map((row) => ({ row, staged: true, reviewedAt: NOW })),
		ui: {
			filter: 'staged',
			sortKey: null,
			sortDirection: 'asc',
			density: 'compact',
			anchorSourceIndex: null
		}
	})
	return {
		id: payload.id,
		kind: 'track-enrichment',
		draftRevision: payload.draftRevision,
		updatedAt: payload.updatedAt,
		payload
	}
}

function reviseStoredDraft(
	draft: BrowserWorkflowDraft,
	options: { revision: number; staged: boolean }
): BrowserWorkflowDraft {
	const updatedAt = '2026-07-23T04:00:01.000Z'
	const payload = {
		...draft.payload,
		draftRevision: options.revision,
		updatedAt,
		decisions: draft.payload.decisions.map((decision) =>
			decision.kind === 'fill-empty-fields'
				? { ...decision, staged: options.staged }
				: decision
		)
	}
	return {
		...draft,
		draftRevision: options.revision,
		updatedAt,
		payload
	}
}

function fakeRepository(
	initialEntry: BrowserWorkflowDraftEntry | null = null,
	identity = { workspaceId: 'workspace-1', repositoryId: 'repository-1' }
) {
	let entry = initialEntry
	let deviceRevision = initialEntry ? 1 : 0
	let currentLease =
		initialEntry?.lease.status === 'live' ? initialEntry.lease.lease : null
	let listener: ((change: never) => void) | null = null
	const createDraftAndClaim = vi.fn(
		async (
			draft: BrowserWorkflowDraft
		): Promise<{
			value: BrowserClaimedDraft
			deviceRevision: number
		}> => {
			currentLease = lease(0)
			entry = readyEntry(draft, { status: 'live', lease: currentLease })
			return {
				value: { draft, lease: currentLease },
				deviceRevision: ++deviceRevision
			}
		}
	)
	const claimDraft = vi.fn(async () => {
		if (!entry) throw new Error('missing draft')
		const priorLeaseRevision =
			currentLease?.leaseRevision ??
			(entry.lease.status === 'unclaimed'
				? (entry.lease.leaseRevision ?? -1)
				: entry.lease.lease.leaseRevision)
		currentLease = lease(priorLeaseRevision + 1)
		entry = { ...entry, lease: { status: 'live', lease: currentLease } }
		return {
			value: { draft: entry.draft, lease: currentLease },
			deviceRevision: ++deviceRevision
		}
	})
	const takeOverDraft = vi.fn(async () => {
		if (!entry) throw new Error('missing draft')
		currentLease = lease((currentLease?.leaseRevision ?? 0) + 1)
		entry = { ...entry, lease: { status: 'live', lease: currentLease } }
		return {
			value: { draft: entry.draft, lease: currentLease },
			deviceRevision: ++deviceRevision
		}
	})
	const writeDraft = vi.fn(async (draft: BrowserWorkflowDraft) => {
		if (!currentLease) throw new Error('missing lease')
		entry = readyEntry(draft, { status: 'live', lease: currentLease })
		return { value: draft, deviceRevision: ++deviceRevision }
	})
	const replaceDraftAndClaim = vi.fn(async (draft: BrowserWorkflowDraft) => {
		currentLease = lease((currentLease?.leaseRevision ?? 0) + 1)
		entry = readyEntry(draft, { status: 'live', lease: currentLease })
		return {
			value: { draft, lease: currentLease },
			deviceRevision: ++deviceRevision
		}
	})
	const deleteDraft = vi.fn(async () => {
		entry = null
		currentLease = null
		return { value: undefined, deviceRevision: ++deviceRevision }
	})
	const releaseDraftLease = vi.fn(async () => {
		if (entry) {
			entry = {
				...entry,
				lease: {
					status: 'unclaimed',
					leaseRevision: (currentLease?.leaseRevision ?? 0) + 1
				}
			}
		}
		currentLease = null
		return { value: undefined, deviceRevision: ++deviceRevision }
	})
	const readDraft = vi.fn(async () => ({ value: entry, deviceRevision }))
	const renewDraftLease = vi.fn(async () => {
		currentLease = lease((currentLease?.leaseRevision ?? 0) + 1)
		if (entry)
			entry = { ...entry, lease: { status: 'live', lease: currentLease } }
		return { value: currentLease, deviceRevision: ++deviceRevision }
	})
	const listDrafts = vi.fn(async () => ({
		value: entry ? [entry] : [],
		deviceRevision
	}))
	const repository = {
		identity,
		listDrafts,
		readDraft,
		createDraftAndClaim,
		claimDraft,
		takeOverDraft,
		renewDraftLease,
		releaseDraftLease,
		writeDraft,
		deleteDraft,
		replaceDraftAndClaim,
		subscribe: vi.fn((nextListener: (change: never) => void) => {
			listener = nextListener
			return () => {
				listener = null
			}
		}),
		close: vi.fn()
	} as unknown as BrowserDeviceDraftRepository
	return {
		repository,
		listDrafts,
		readDraft,
		createDraftAndClaim,
		claimDraft,
		takeOverDraft,
		renewDraftLease,
		writeDraft,
		replaceDraftAndClaim,
		deleteDraft,
		releaseDraftLease,
		entry: () => entry,
		listener: () => listener,
		setEntry(
			nextEntry: BrowserWorkflowDraftEntry | null,
			nextDeviceRevision?: number
		) {
			entry = nextEntry
			deviceRevision = nextDeviceRevision ?? deviceRevision + 1
			currentLease =
				nextEntry?.lease.status === 'live' ? nextEntry.lease.lease : null
		}
	}
}

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

function createSession(input: {
	repository: BrowserDeviceDraftRepository
	workflow?: ReturnType<typeof workflowHarness>
	runtime?: ReturnType<typeof runtime>
	tracks?: LibraryTrack[]
	hydrateDraft?: typeof hydrateTrackEnrichmentDraft
}) {
	const scope = effectScope()
	const workflow = input.workflow ?? workflowHarness()
	const activeRuntime = input.runtime ?? runtime()
	const session = scope.run(() =>
		useTrackEnrichmentDraftSession({
			runtime: activeRuntime,
			workflow: workflow.workflow,
			records: { records: [] },
			tracks: { tracks: input.tracks ?? [track()] },
			openRepository: vi.fn().mockResolvedValue(input.repository),
			now: () => new Date(NOW),
			randomUUID: vi
				.fn()
				.mockReturnValueOnce('owner-token-private')
				.mockReturnValue('draft-new'),
			autosaveDelayMs: 500,
			leaseRenewIntervalMs: 20_000,
			hydrateDraft: input.hydrateDraft
		})
	)
	if (!session) throw new Error('Failed to create draft session')
	activeScopes.push(scope)
	return { session, workflow, runtime: activeRuntime }
}

function createSwitchableSession(input: {
	first: BrowserDeviceDraftRepository
	second: BrowserDeviceDraftRepository
	workflow?: ReturnType<typeof workflowHarness>
	tracks?: LibraryTrack[]
	hydrateDraft?: typeof hydrateTrackEnrichmentDraft
}) {
	const scope = effectScope()
	const workflow = input.workflow ?? workflowHarness()
	const activeRuntime = runtime()
	const openRepository = vi
		.fn()
		.mockResolvedValueOnce(input.first)
		.mockResolvedValueOnce(input.second)
	const session = scope.run(() =>
		useTrackEnrichmentDraftSession({
			runtime: activeRuntime,
			workflow: workflow.workflow,
			records: { records: [] },
			tracks: { tracks: input.tracks ?? [track()] },
			openRepository,
			now: () => new Date(NOW),
			randomUUID: vi
				.fn()
				.mockReturnValueOnce('owner-token-private')
				.mockReturnValue('draft-new'),
			hydrateDraft: input.hydrateDraft
		})
	)
	if (!session) throw new Error('Failed to create switchable draft session')
	activeScopes.push(scope)
	return { activeRuntime, openRepository, session, workflow }
}

async function switchWorkspace(
	activeRuntime: ReturnType<typeof runtime>,
	openRepository: ReturnType<typeof vi.fn>
) {
	activeRuntime.replaceWorkspace(
		{
			...activeRuntime.descriptor.value,
			id: 'workspace-2',
			repositoryId: 'repository-2'
		},
		{ id: 'repository-2' } as LibraryRepositoryBundle
	)
	await nextTick()
	await vi.waitFor(() => expect(openRepository).toHaveBeenCalledTimes(2))
}

describe('useTrackEnrichmentDraftSession', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(async () => {
		for (const scope of activeScopes.splice(0)) scope.stop()
		await Promise.resolve()
		vi.useRealTimers()
	})

	it('autosaves only the strict sanitized projection and stops warning once saved', async () => {
		const fake = fakeRepository()
		const harness = workflowHarness()
		const { session } = createSession({
			repository: fake.repository,
			workflow: harness
		})
		await session.initialize()

		harness.workflow.selectedFileName.value = 'collection.xml'
		harness.workflow.rows.value = reviewRows()
		harness.workflow.stagedRowIds.value = new Set([
			harness.workflow.rows.value[0]!.id
		])
		await vi.advanceTimersByTimeAsync(500)
		await session.flushSave()

		expect(fake.createDraftAndClaim).toHaveBeenCalledOnce()
		const persisted = fake.createDraftAndClaim.mock.calls[0]![0]
		const serialized = JSON.stringify(persisted)
		expect(serialized).not.toContain('/Users/alice')
		expect(serialized).toContain('must not persist')
		expect(serialized).not.toContain('owner-token-private')
		expect(serialized).not.toContain('user_id')
		expect(session.saveStatusLabel.value).toMatch(/^Saved locally /)
		expect(session.shouldWarnBeforeUnload.value).toBe(false)
	})

	it('routes cloud drafts through an opaque alias without persisting the account ID', async () => {
		const rawWorkspaceId = 'cloud:account:auth-user-a'
		const draftIdentity = await createTrackEnrichmentDraftWorkspaceIdentity(
			{ workspaceId: rawWorkspaceId, repositoryId: 'cloud-supabase' },
			'cloud'
		)
		const fake = fakeRepository(null, draftIdentity)
		const harness = workflowHarness()
		const activeRuntime = runtime(rawWorkspaceId, 'cloud-supabase')
		const openRepository = vi.fn().mockResolvedValue(fake.repository)
		const scope = effectScope()
		const session = scope.run(() =>
			useTrackEnrichmentDraftSession({
				runtime: activeRuntime,
				workflow: harness.workflow,
				records: { records: [] },
				tracks: { tracks: [track()] },
				openRepository,
				now: () => new Date(NOW),
				randomUUID: vi
					.fn()
					.mockReturnValueOnce('owner-token-private')
					.mockReturnValue('draft-new')
			})
		)
		if (!session) throw new Error('Failed to create draft session')
		activeScopes.push(scope)

		await session.initialize()
		expect(openRepository).toHaveBeenCalledWith(
			expect.objectContaining({ identity: draftIdentity })
		)
		expect(
			JSON.stringify(openRepository.mock.calls[0]![0].identity)
		).not.toContain('auth-user-a')

		harness.workflow.selectedFileName.value = 'collection.xml'
		harness.workflow.rows.value = reviewRows()
		await vi.advanceTimersByTimeAsync(500)
		await session.flushSave()

		const persisted = fake.createDraftAndClaim.mock.calls[0]![0]
		expect(persisted.payload.workspace).toEqual({
			...draftIdentity,
			repositoryRevision: 7
		})
		expect(JSON.stringify(persisted)).not.toContain('auth-user-a')
	})

	it('retains dirty state and the exact save-error copy after quota failure', async () => {
		const fake = fakeRepository()
		fake.createDraftAndClaim.mockRejectedValueOnce({ code: 'quota' })
		const harness = workflowHarness(reviewRows())
		const { session } = createSession({
			repository: fake.repository,
			workflow: harness
		})
		await session.initialize()
		await vi.advanceTimersByTimeAsync(500)
		await vi.waitFor(() =>
			expect(fake.createDraftAndClaim).toHaveBeenCalledOnce()
		)
		await Promise.resolve()

		expect(session.saveState.value).toBe('failed')
		expect(session.saveErrorCode.value).toBe('quota')
		expect(session.saveStatusLabel.value).toBe(
			"Couldn't save—keep this tab open"
		)
		expect(session.hasUnsavedChanges.value).toBe(true)
		expect(session.shouldWarnBeforeUnload.value).toBe(true)
	})

	it('refuses Keep for later when an unsaved review still cannot persist', async () => {
		const fake = fakeRepository()
		fake.createDraftAndClaim.mockRejectedValue({ code: 'quota' })
		const harness = workflowHarness(reviewRows())
		const { session } = createSession({
			repository: fake.repository,
			workflow: harness
		})
		await session.initialize()
		await vi.advanceTimersByTimeAsync(500)
		await vi.waitFor(() =>
			expect(fake.createDraftAndClaim).toHaveBeenCalledOnce()
		)

		expect(await session.keepForLater()).toBe(false)
		expect(fake.createDraftAndClaim).toHaveBeenCalledTimes(2)
		expect(harness.startAnotherSource).not.toHaveBeenCalled()
		expect(harness.workflow.rows.value).toHaveLength(1)
		expect(session.hasDraft.value).toBe(false)
		expect(session.saveState.value).toBe('failed')
	})

	it('resumes a live draft read-only and requires explicit takeover to edit', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(
			readyEntry(draft, { status: 'live', lease: lease(4) })
		)
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()

		expect(await session.resume()).toBe(true)
		expect(fake.claimDraft).not.toHaveBeenCalled()
		expect(workflow.loadResumedReview).toHaveBeenCalledOnce()
		expect(workflow.workflow.isReviewReadOnly.value).toBe(true)
		expect(session.isReadOnly.value).toBe(true)

		expect(await session.takeOver()).toBe(true)
		expect(fake.takeOverDraft).toHaveBeenCalledOnce()
		expect(workflow.workflow.isReviewReadOnly.value).toBe(false)
		expect(session.isOwned.value).toBe(true)
	})

	it('hydrates the exact latest claimed revision before takeover becomes editable', async () => {
		const revisionZero = await storedDraft()
		const fake = fakeRepository(
			readyEntry(revisionZero, { status: 'live', lease: lease(4) })
		)
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()
		expect(workflow.workflow.stagedRowIds.value.size).toBe(1)
		expect(workflow.workflow.isReviewReadOnly.value).toBe(true)

		const revisionOne = reviseStoredDraft(revisionZero, {
			revision: 1,
			staged: false
		})
		fake.setEntry(readyEntry(revisionOne, { status: 'live', lease: lease(5) }))
		await session.refreshDiscovery()
		// Discovery observes r1, but the visible r0 projection stays locked until
		// takeover rematches the exact claimed payload.
		expect(session.activeEntry.value?.draft.metadata.draftRevision).toBe(1)
		expect(workflow.workflow.stagedRowIds.value.size).toBe(1)

		expect(await session.takeOver()).toBe(true)
		expect(workflow.loadResumedReview).toHaveBeenCalledTimes(2)
		expect(workflow.workflow.stagedRowIds.value.size).toBe(0)
		expect(workflow.workflow.isReviewReadOnly.value).toBe(false)

		workflow.workflow.selectedFilter.value = 'ready'
		await vi.advanceTimersByTimeAsync(500)
		await session.flushSave()
		expect(fake.writeDraft).toHaveBeenCalledOnce()
		const writeArguments = fake.writeDraft.mock.calls[0] as unknown as [
			BrowserWorkflowDraft,
			string,
			{ draftRevision: number }
		]
		expect(writeArguments[2].draftRevision).toBe(1)
		expect(writeArguments[0].payload.decisions).toEqual([
			expect.objectContaining({ staged: false })
		])
	})

	it('never unlocks a claimed review after a remote lease-only takeover', async () => {
		const draft = await storedDraft()
		const hydration = await hydrateTrackEnrichmentDraft({
			draft: draft.payload,
			tracks: [track()],
			records: []
		})
		const pendingHydration = deferred<typeof hydration>()
		const hydrateDraft = vi.fn().mockReturnValue(pendingHydration.promise)
		const fake = fakeRepository(readyEntry(draft))
		const { session, workflow } = createSession({
			repository: fake.repository,
			hydrateDraft
		})
		await session.initialize()
		const resuming = session.resume()
		await vi.waitFor(() => expect(hydrateDraft).toHaveBeenCalledOnce())

		fake.setEntry(readyEntry(draft, { status: 'live', lease: lease(99) }))
		await session.refreshDiscovery()
		pendingHydration.resolve(hydration)

		expect(await resuming).toBe(true)
		expect(session.isOwned.value).toBe(false)
		expect(workflow.workflow.isReviewReadOnly.value).toBe(true)
	})

	it('claims an idle draft and surfaces rematch summary without trusting rows', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()

		expect(await session.resume()).toBe(true)
		expect(fake.claimDraft).toHaveBeenCalledOnce()
		const resumed = workflow.loadResumedReview.mock.calls[0]![0]
		expect(resumed.resumeSummary).toMatchObject({
			total: 1,
			retained: 1,
			changed: 0,
			dropped: 0
		})
		expect(resumed.rows[0]).not.toBe(reviewRows()[0])
		expect(workflow.workflow.isReviewReadOnly.value).toBe(false)
	})

	it('atomically replaces the observed draft only after a fresh review exists', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()

		expect(await session.startFresh()).toBe(true)
		expect(workflow.startAnotherSource).toHaveBeenCalledOnce()
		expect(fake.deleteDraft).not.toHaveBeenCalled()
		expect(fake.replaceDraftAndClaim).not.toHaveBeenCalled()

		workflow.workflow.selectedFileName.value = 'replacement.xml'
		workflow.workflow.rows.value = reviewRows()
		workflow.workflow.stagedRowIds.value = new Set([
			workflow.workflow.rows.value[0]!.id
		])
		await vi.advanceTimersByTimeAsync(500)
		await session.flushSave()

		expect(fake.replaceDraftAndClaim).toHaveBeenCalledOnce()
		const replacement = fake.replaceDraftAndClaim.mock.calls[0]![0]
		expect(replacement.id).toBe('draft-new')
		expect(replacement.draftRevision).toBe(0)
	})

	it('saves pending edits before Start fresh and Resume cancels replacement mode', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()

		workflow.workflow.stagedRowIds.value = new Set()
		expect(session.hasUnsavedChanges.value).toBe(true)
		expect(await session.startFresh()).toBe(true)
		expect(fake.writeDraft).toHaveBeenCalledOnce()
		expect(fake.writeDraft.mock.calls[0]![0].payload.decisions).toEqual([
			expect.objectContaining({ staged: false })
		])
		expect(workflow.workflow.rows.value).toEqual([])
		expect(session.isSourceBlockedByDraft.value).toBe(false)

		expect(await session.resume()).toBe(true)
		expect(workflow.workflow.stagedRowIds.value.size).toBe(0)
		expect(session.isSourceBlockedByDraft.value).toBe(true)
		workflow.workflow.selectedFilter.value = 'ready'
		await vi.advanceTimersByTimeAsync(500)
		await session.flushSave()

		expect(fake.replaceDraftAndClaim).not.toHaveBeenCalled()
		expect(fake.writeDraft).toHaveBeenCalledTimes(2)
		const resumedWriteArguments = fake.writeDraft.mock.calls[1] as unknown as [
			BrowserWorkflowDraft,
			string,
			{ draftRevision: number }
		]
		expect(resumedWriteArguments[2].draftRevision).toBe(1)
		expect(resumedWriteArguments[0].draftRevision).toBe(2)
	})

	it('claims and revision-safely deletes an invalid isolated draft', async () => {
		const invalidEntry: BrowserWorkflowDraftEntry = {
			draft: {
				status: 'invalid',
				metadata: {
					id: 'invalid-draft',
					kind: 'track-enrichment',
					draftRevision: 6,
					updatedAt: NOW
				}
			},
			lease: { status: 'unclaimed', leaseRevision: 3 }
		}
		const fake = fakeRepository(invalidEntry)
		const { session } = createSession({ repository: fake.repository })
		await session.initialize()

		expect(await session.deleteDraft()).toBe(true)
		expect(fake.claimDraft).toHaveBeenCalledOnce()
		expect(fake.deleteDraft).toHaveBeenCalledOnce()
		const deleteArguments = fake.deleteDraft.mock.calls[0] as unknown as [
			string,
			string,
			Record<string, number>
		]
		expect(deleteArguments[2]).toMatchObject({
			draftRevision: 6,
			leaseRevision: 4
		})
		expect(session.hasDraft.value).toBe(false)
	})

	it('keeps confirmed outcomes in memory across a failed save and retries them', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()
		const row = workflow.workflow.rows.value[0]!
		const attemptedAt = '2026-07-23T04:05:00.000Z'
		fake.writeDraft.mockRejectedValueOnce({ code: 'quota' })
		const attempt: TrackEnrichmentApplyAttempt = {
			rows: [
				{
					row,
					intentKind: 'fill-empty-fields',
					requested: { bpm: true, keyMode: true }
				}
			],
			outcome: {
				cancelled: true,
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
			attemptedAt
		}

		await session.recordApplyAttempt(attempt)
		expect(session.saveState.value).toBe('failed')
		expect(session.shouldWarnBeforeUnload.value).toBe(true)

		await session.flushSave()
		expect(fake.writeDraft).toHaveBeenCalledTimes(2)
		const retried = fake.writeDraft.mock.calls[1]![0]
		expect(retried.payload.partialOutcomes).toEqual([
			expect.objectContaining({
				status: 'succeeded',
				attemptedAt,
				applied: { bpm: true, keyMode: true }
			})
		])
		expect(session.saveState.value).toBe('saved')
	})

	it('preserves a dirty local partial outcome across an equal-revision refresh', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const pendingRenewal = deferred<{
			value: BrowserDraftLease
			deviceRevision: number
		}>()
		const pendingRefresh = deferred<{
			value: BrowserWorkflowDraftEntry[]
			deviceRevision: number
		}>()
		fake.renewDraftLease.mockReturnValueOnce(pendingRenewal.promise)
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()
		const storedEntryBeforeAttempt = fake.entry()
		if (!storedEntryBeforeAttempt) throw new Error('Expected a stored draft')

		await vi.advanceTimersByTimeAsync(20_000)
		await vi.waitFor(() => expect(fake.renewDraftLease).toHaveBeenCalledOnce())
		fake.listDrafts.mockReturnValueOnce(pendingRefresh.promise)
		const refreshing = session.refreshDiscovery()
		await vi.waitFor(() => expect(fake.listDrafts).toHaveBeenCalledTimes(2))

		const row = workflow.workflow.rows.value[0]!
		const recording = session.recordApplyAttempt({
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
			attemptedAt: '2026-07-23T04:05:00.000Z'
		})
		await vi.waitFor(() => expect(session.hasUnsavedChanges.value).toBe(true))

		pendingRefresh.resolve({
			value: [storedEntryBeforeAttempt],
			deviceRevision: 2
		})
		await refreshing
		pendingRenewal.resolve({ value: lease(10), deviceRevision: 3 })
		await recording

		expect(fake.writeDraft).toHaveBeenCalledOnce()
		expect(fake.writeDraft.mock.calls[0]![0].payload.partialOutcomes).toEqual([
			expect.objectContaining({
				status: 'succeeded',
				attemptedAt: '2026-07-23T04:05:00.000Z'
			})
		])
	})

	it('persists an edit made while the previous save is still in flight', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const firstWrite = deferred<{
			value: BrowserWorkflowDraft
			deviceRevision: number
		}>()
		const secondWrite = deferred<{
			value: BrowserWorkflowDraft
			deviceRevision: number
		}>()
		fake.writeDraft
			.mockReturnValueOnce(firstWrite.promise)
			.mockReturnValueOnce(secondWrite.promise)
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()

		workflow.workflow.selectedFilter.value = 'ready'
		await vi.advanceTimersByTimeAsync(500)
		await vi.waitFor(() => expect(fake.writeDraft).toHaveBeenCalledOnce())
		const firstDraft = fake.writeDraft.mock.calls[0]![0]

		workflow.workflow.stagedRowIds.value = new Set()
		const joinedFlush = session.flushSave()
		firstWrite.resolve({ value: firstDraft, deviceRevision: 50 })
		await vi.waitFor(() => expect(fake.writeDraft).toHaveBeenCalledTimes(2))

		expect(session.hasUnsavedChanges.value).toBe(true)
		expect(session.saveStatusLabel.value).toBe('Saving…')
		const secondArguments = fake.writeDraft.mock.calls[1] as unknown as [
			BrowserWorkflowDraft,
			string,
			{ deviceRevision: number; draftRevision: number }
		]
		expect(secondArguments[2]).toMatchObject({
			deviceRevision: 50,
			draftRevision: firstDraft.draftRevision
		})
		expect(secondArguments[0].payload.decisions).toEqual([
			expect.objectContaining({ staged: false })
		])

		secondWrite.resolve({ value: secondArguments[0], deviceRevision: 51 })
		await joinedFlush
		expect(session.hasUnsavedChanges.value).toBe(false)
		expect(session.saveState.value).toBe('saved')
	})

	it('serializes lease renewal behind an in-flight save with fresh CAS', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const pendingWrite = deferred<{
			value: BrowserWorkflowDraft
			deviceRevision: number
		}>()
		fake.writeDraft.mockReturnValueOnce(pendingWrite.promise)
		fake.renewDraftLease.mockResolvedValueOnce({
			value: lease(10),
			deviceRevision: 51
		})
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()

		workflow.workflow.selectedFilter.value = 'ready'
		await vi.advanceTimersByTimeAsync(500)
		await vi.waitFor(() => expect(fake.writeDraft).toHaveBeenCalledOnce())
		await vi.advanceTimersByTimeAsync(19_500)
		expect(fake.renewDraftLease).not.toHaveBeenCalled()

		const savedDraft = fake.writeDraft.mock.calls[0]![0]
		pendingWrite.resolve({ value: savedDraft, deviceRevision: 50 })
		await vi.waitFor(() => expect(fake.renewDraftLease).toHaveBeenCalledOnce())
		const renewArguments = fake.renewDraftLease.mock.calls[0] as unknown as [
			string,
			string,
			{ deviceRevision: number; leaseRevision: number }
		]
		expect(renewArguments[2]).toMatchObject({
			deviceRevision: 50,
			leaseRevision: 0
		})
		await session.flushSave()
	})

	it('serializes overlapping renewals and derives the second CAS afterward', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const firstRenewal = deferred<{
			value: BrowserDraftLease
			deviceRevision: number
		}>()
		fake.renewDraftLease
			.mockReturnValueOnce(firstRenewal.promise)
			.mockResolvedValueOnce({ value: lease(11), deviceRevision: 51 })
		const { session } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()

		await vi.advanceTimersByTimeAsync(20_000)
		await vi.waitFor(() => expect(fake.renewDraftLease).toHaveBeenCalledOnce())
		await vi.advanceTimersByTimeAsync(20_000)
		expect(fake.renewDraftLease).toHaveBeenCalledOnce()

		firstRenewal.resolve({ value: lease(10), deviceRevision: 50 })
		await vi.waitFor(() =>
			expect(fake.renewDraftLease).toHaveBeenCalledTimes(2)
		)
		const secondArguments = fake.renewDraftLease.mock.calls[1] as unknown as [
			string,
			string,
			{ deviceRevision: number; leaseRevision: number }
		]
		expect(secondArguments[2]).toEqual({
			deviceRevision: 50,
			leaseRevision: 10
		})
	})

	it('discards a stale discovery result that resolves after a successful write', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const pendingRefresh = deferred<{
			value: BrowserWorkflowDraftEntry[]
			deviceRevision: number
		}>()
		fake.writeDraft.mockImplementationOnce(async (nextDraft) => ({
			value: nextDraft,
			deviceRevision: 50
		}))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()
		fake.listDrafts.mockReturnValueOnce(pendingRefresh.promise)
		const refreshing = session.refreshDiscovery()
		await vi.waitFor(() => expect(fake.listDrafts).toHaveBeenCalledTimes(2))

		workflow.workflow.selectedFilter.value = 'ready'
		await vi.advanceTimersByTimeAsync(500)
		await session.flushSave()
		expect(session.activeEntry.value?.draft.metadata.draftRevision).toBe(1)

		pendingRefresh.resolve({ value: [readyEntry(draft)], deviceRevision: 2 })
		await refreshing
		expect(session.activeEntry.value?.draft.metadata.draftRevision).toBe(1)
		expect(session.lastSavedAt.value).not.toBe(draft.updatedAt)
	})

	it('sequences pending saves before delete and never resurrects the draft', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const pendingWrite = deferred<{
			value: BrowserWorkflowDraft
			deviceRevision: number
		}>()
		fake.writeDraft
			.mockReturnValueOnce(pendingWrite.promise)
			.mockImplementationOnce(async (nextDraft) => ({
				value: nextDraft,
				deviceRevision: 51
			}))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()
		workflow.workflow.selectedFilter.value = 'ready'
		await vi.advanceTimersByTimeAsync(500)
		await vi.waitFor(() => expect(fake.writeDraft).toHaveBeenCalledOnce())

		workflow.workflow.stagedRowIds.value = new Set()
		const deleting = session.deleteDraft()
		const firstDraft = fake.writeDraft.mock.calls[0]![0]
		pendingWrite.resolve({ value: firstDraft, deviceRevision: 50 })

		expect(await deleting).toBe(true)
		await vi.advanceTimersByTimeAsync(1_000)
		expect(fake.deleteDraft).toHaveBeenCalledOnce()
		expect(fake.createDraftAndClaim).not.toHaveBeenCalled()
		expect(session.hasDraft.value).toBe(false)
		expect(session.hasUnsavedChanges.value).toBe(false)
		expect(workflow.workflow.rows.value).toEqual([])
		const finalWriteOrder = Math.max(
			...fake.writeDraft.mock.invocationCallOrder
		)
		expect(finalWriteOrder).toBeLessThan(
			fake.deleteDraft.mock.invocationCallOrder[0]!
		)
	})

	it('never recreates a dirty review deleted in another tab', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()
		workflow.workflow.stagedRowIds.value = new Set()
		expect(session.hasUnsavedChanges.value).toBe(true)

		fake.setEntry(null)
		await session.refreshDiscovery()
		await session.flushSave()

		expect(fake.createDraftAndClaim).not.toHaveBeenCalled()
		expect(session.hasDraft.value).toBe(false)
		expect(session.isDraftMissingConflict.value).toBe(true)
		expect(session.isSourceBlockedByDraft.value).toBe(true)
		expect(session.isReadOnly.value).toBe(true)
		expect(session.saveState.value).toBe('failed')
		expect(session.saveErrorCode.value).toBe('conflict')
		expect(session.recoveryMessage.value).toContain('deleted in another tab')
		expect(workflow.workflow.rows.value).toHaveLength(1)

		expect(await session.startFresh()).toBe(true)
		expect(session.isDraftMissingConflict.value).toBe(false)
		expect(session.isSourceBlockedByDraft.value).toBe(false)
		expect(session.hasUnsavedChanges.value).toBe(false)
		expect(session.saveState.value).toBe('idle')
		expect(workflow.workflow.rows.value).toEqual([])
		expect(fake.createDraftAndClaim).not.toHaveBeenCalled()
	})

	it('blocks overlapping actions until an explicit delete settles', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const pendingDelete = deferred<{
			value: undefined
			deviceRevision: number
		}>()
		fake.deleteDraft.mockReturnValueOnce(pendingDelete.promise)
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()
		const readsBeforeDelete = fake.readDraft.mock.calls.length

		const deleting = session.deleteDraft()
		await vi.waitFor(() => expect(fake.deleteDraft).toHaveBeenCalledOnce())
		expect(session.isTransitioning.value).toBe(true)
		expect(await session.resume()).toBe(false)
		expect(await session.startFresh()).toBe(false)
		expect(fake.readDraft).toHaveBeenCalledTimes(readsBeforeDelete)
		expect(workflow.workflow.rows.value).toHaveLength(1)

		pendingDelete.resolve({ value: undefined, deviceRevision: 99 })
		expect(await deleting).toBe(true)
		expect(session.isTransitioning.value).toBe(false)
		expect(session.hasDraft.value).toBe(false)
		expect(workflow.workflow.rows.value).toEqual([])
	})

	it('deletes a fully successful draft only after explicit acknowledgement', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()
		workflow.workflow.lastApplySummary.value = {
			total: 1,
			succeeded: 1,
			failed: 0,
			remaining: 0,
			bpm: 1,
			keyMode: 1,
			evidence: 1,
			evidenceOnly: 0
		}
		workflow.workflow.stagedRowIds.value = new Set()

		expect(fake.deleteDraft).not.toHaveBeenCalled()
		expect(await session.acknowledgeCompleteAndDelete()).toBe(true)

		expect(fake.deleteDraft).toHaveBeenCalledOnce()
		expect(session.hasDraft.value).toBe(false)
		expect(workflow.startAnotherSource).toHaveBeenCalledOnce()
		expect(workflow.workflow.lastApplySummary.value).toBeNull()
	})

	it('preserves a cancelled partial draft with unattempted staged work', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()
		workflow.workflow.lastApplySummary.value = {
			total: 2,
			succeeded: 1,
			failed: 0,
			remaining: 1,
			bpm: 1,
			keyMode: 0,
			evidence: 1,
			evidenceOnly: 0
		}

		expect(await session.acknowledgeCompleteAndDelete()).toBe(false)
		expect(fake.deleteDraft).not.toHaveBeenCalled()
		expect(session.hasDraft.value).toBe(true)
		expect(workflow.startAnotherSource).not.toHaveBeenCalled()
	})

	it('keeps the saved draft while releasing its lease for later', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()

		expect(await session.keepForLater()).toBe(true)

		expect(fake.releaseDraftLease).toHaveBeenCalledOnce()
		expect(fake.deleteDraft).not.toHaveBeenCalled()
		expect(fake.entry()?.draft.metadata.id).toBe(draft.id)
		expect(fake.entry()?.lease.status).toBe('unclaimed')
		expect(session.hasDraft.value).toBe(true)
		expect(session.isOwned.value).toBe(false)
		expect(workflow.startAnotherSource).toHaveBeenCalledOnce()
	})

	it('refuses Keep for later after dirty work loses its writer lease', async () => {
		const draft = await storedDraft()
		const fake = fakeRepository(readyEntry(draft))
		const { session, workflow } = createSession({ repository: fake.repository })
		await session.initialize()
		await session.resume()
		workflow.workflow.stagedRowIds.value = new Set()
		expect(session.hasUnsavedChanges.value).toBe(true)

		fake.setEntry(readyEntry(draft, { status: 'live', lease: lease(99) }))
		await session.refreshDiscovery()
		expect(session.isOwned.value).toBe(false)

		expect(await session.keepForLater()).toBe(false)
		expect(workflow.startAnotherSource).not.toHaveBeenCalled()
		expect(workflow.workflow.rows.value).toHaveLength(1)
		expect(session.hasUnsavedChanges.value).toBe(true)
		expect(session.saveState.value).toBe('saving')
	})

	it.each(['deleteDraft', 'startFresh', 'keepForLater'] as const)(
		'invalidates deferred resume hydration before %s completes',
		async (action) => {
			const draft = await storedDraft()
			const hydration = await hydrateTrackEnrichmentDraft({
				draft: draft.payload,
				tracks: [track()],
				records: []
			})
			const pendingHydration = deferred<typeof hydration>()
			const hydrateDraft = vi.fn().mockReturnValue(pendingHydration.promise)
			const fake = fakeRepository(readyEntry(draft))
			const { session, workflow } = createSession({
				repository: fake.repository,
				hydrateDraft
			})
			await session.initialize()
			const resuming = session.resume()
			await vi.waitFor(() => expect(hydrateDraft).toHaveBeenCalledOnce())

			expect(await session[action]()).toBe(true)
			pendingHydration.resolve(hydration)

			expect(await resuming).toBe(false)
			expect(workflow.loadResumedReview).not.toHaveBeenCalled()
			expect(workflow.workflow.rows.value).toEqual([])
			expect(session.isHydrating.value).toBe(false)
		}
	)

	it('lets takeover hydration supersede an older deferred read-only resume', async () => {
		const draft = await storedDraft()
		const hydration = await hydrateTrackEnrichmentDraft({
			draft: draft.payload,
			tracks: [track()],
			records: []
		})
		const pendingResumeHydration = deferred<typeof hydration>()
		const hydrateDraft = vi
			.fn()
			.mockReturnValueOnce(pendingResumeHydration.promise)
			.mockResolvedValueOnce(hydration)
		const fake = fakeRepository(
			readyEntry(draft, { status: 'live', lease: lease(4) })
		)
		const { session, workflow } = createSession({
			repository: fake.repository,
			hydrateDraft
		})
		await session.initialize()
		const resuming = session.resume()
		await vi.waitFor(() => expect(hydrateDraft).toHaveBeenCalledOnce())

		expect(await session.takeOver()).toBe(true)
		expect(hydrateDraft).toHaveBeenCalledTimes(2)
		expect(workflow.loadResumedReview).toHaveBeenCalledOnce()
		pendingResumeHydration.resolve(hydration)

		expect(await resuming).toBe(false)
		expect(workflow.loadResumedReview).toHaveBeenCalledOnce()
		expect(workflow.workflow.isReviewReadOnly.value).toBe(false)
	})

	it('ignores a resume completion after the active workspace changes', async () => {
		const draft = await storedDraft()
		const first = fakeRepository(readyEntry(draft))
		const second = fakeRepository(null, {
			workspaceId: 'workspace-2',
			repositoryId: 'repository-2'
		})
		const pending = deferred<{
			value: BrowserWorkflowDraftEntry | null
			deviceRevision: number
		}>()
		first.readDraft.mockReturnValueOnce(pending.promise)
		const { activeRuntime, openRepository, session, workflow } =
			createSwitchableSession({
				first: first.repository,
				second: second.repository
			})
		await session.initialize()
		const resuming = session.resume()
		await vi.waitFor(() => expect(first.readDraft).toHaveBeenCalledOnce())

		await switchWorkspace(activeRuntime, openRepository)
		pending.resolve({ value: readyEntry(draft), deviceRevision: 99 })

		expect(await resuming).toBe(false)
		expect(session.isHydrating.value).toBe(false)
		expect(session.hasDraft.value).toBe(false)
		expect(workflow.loadResumedReview).not.toHaveBeenCalled()
		expect(session.recoveryMessage.value).toBeNull()
	})

	it('ignores a takeover completion after the active workspace changes', async () => {
		const draft = await storedDraft()
		const liveEntry = readyEntry(draft, {
			status: 'live',
			lease: lease(4)
		})
		const first = fakeRepository(liveEntry)
		const second = fakeRepository(null, {
			workspaceId: 'workspace-2',
			repositoryId: 'repository-2'
		})
		const pending = deferred<{
			value: { draft: typeof liveEntry.draft; lease: BrowserDraftLease }
			deviceRevision: number
		}>()
		first.takeOverDraft.mockReturnValueOnce(pending.promise)
		const { activeRuntime, openRepository, session, workflow } =
			createSwitchableSession({
				first: first.repository,
				second: second.repository
			})
		await session.initialize()
		const takingOver = session.takeOver()
		await vi.waitFor(() => expect(first.takeOverDraft).toHaveBeenCalledOnce())

		activeRuntime.replaceWorkspace(
			{
				...activeRuntime.descriptor.value,
				id: 'workspace-2',
				repositoryId: 'repository-2'
			},
			{ id: 'repository-2' } as LibraryRepositoryBundle
		)
		await nextTick()
		expect(openRepository).toHaveBeenCalledOnce()
		pending.resolve({
			value: { draft: liveEntry.draft, lease: lease(90) },
			deviceRevision: 99
		})
		await vi.waitFor(() => expect(openRepository).toHaveBeenCalledTimes(2))

		expect(await takingOver).toBe(false)
		expect(session.isTakingOver.value).toBe(false)
		expect(session.isOwned.value).toBe(false)
		expect(workflow.workflow.isReviewReadOnly.value).toBe(false)
		expect(session.saveErrorCode.value).toBeNull()
	})

	it('ignores a delete completion after the active workspace changes', async () => {
		const draft = await storedDraft()
		const first = fakeRepository(readyEntry(draft))
		const second = fakeRepository(null, {
			workspaceId: 'workspace-2',
			repositoryId: 'repository-2'
		})
		const pending = deferred<{ value: undefined; deviceRevision: number }>()
		first.deleteDraft.mockReturnValueOnce(pending.promise)
		const { activeRuntime, openRepository, session } = createSwitchableSession({
			first: first.repository,
			second: second.repository
		})
		await session.initialize()
		const deleting = session.deleteDraft()
		await vi.waitFor(() => expect(first.deleteDraft).toHaveBeenCalledOnce())

		activeRuntime.replaceWorkspace(
			{
				...activeRuntime.descriptor.value,
				id: 'workspace-2',
				repositoryId: 'repository-2'
			},
			{ id: 'repository-2' } as LibraryRepositoryBundle
		)
		await nextTick()
		expect(openRepository).toHaveBeenCalledOnce()
		pending.resolve({ value: undefined, deviceRevision: 99 })
		await vi.waitFor(() => expect(openRepository).toHaveBeenCalledTimes(2))

		expect(await deleting).toBe(false)
		expect(session.hasDraft.value).toBe(false)
		expect(session.isOwned.value).toBe(false)
		expect(session.saveErrorCode.value).toBeNull()
	})

	it('does not carry failed dirty save state into a replacement workspace', async () => {
		const first = fakeRepository()
		first.createDraftAndClaim.mockRejectedValue({ code: 'quota' })
		const second = fakeRepository(null, {
			workspaceId: 'workspace-2',
			repositoryId: 'repository-2'
		})
		const workflow = workflowHarness(reviewRows())
		const { activeRuntime, openRepository, session } = createSwitchableSession({
			first: first.repository,
			second: second.repository,
			workflow
		})
		await session.initialize()
		await vi.advanceTimersByTimeAsync(500)
		await vi.waitFor(() => expect(session.saveState.value).toBe('failed'))
		expect(session.shouldWarnBeforeUnload.value).toBe(true)

		await switchWorkspace(activeRuntime, openRepository)

		expect(session.saveState.value).toBe('idle')
		expect(session.saveErrorCode.value).toBeNull()
		expect(session.hasUnsavedChanges.value).toBe(false)
		expect(session.shouldWarnBeforeUnload.value).toBe(false)
	})

	it('ignores an old discovery refresh after the active workspace changes', async () => {
		const draft = await storedDraft()
		const oldEntry = readyEntry(draft)
		const first = fakeRepository(oldEntry)
		const second = fakeRepository(null, {
			workspaceId: 'workspace-2',
			repositoryId: 'repository-2'
		})
		const pending = deferred<{
			value: BrowserWorkflowDraftEntry[]
			deviceRevision: number
		}>()
		const { activeRuntime, openRepository, session } = createSwitchableSession({
			first: first.repository,
			second: second.repository
		})
		await session.initialize()
		first.listDrafts.mockReturnValueOnce(pending.promise)
		const refreshing = session.refreshDiscovery()
		await vi.waitFor(() => expect(first.listDrafts).toHaveBeenCalledTimes(2))

		await switchWorkspace(activeRuntime, openRepository)
		pending.resolve({ value: [oldEntry], deviceRevision: 99 })
		await refreshing

		expect(session.hasDraft.value).toBe(false)
		expect(session.discoveryState.value).toBe('none')
		expect(session.saveErrorCode.value).toBeNull()
	})

	it('ignores an old lease renewal after the active workspace changes', async () => {
		const draft = await storedDraft()
		const first = fakeRepository(readyEntry(draft))
		const second = fakeRepository(null, {
			workspaceId: 'workspace-2',
			repositoryId: 'repository-2'
		})
		const pending = deferred<{
			value: BrowserDraftLease
			deviceRevision: number
		}>()
		first.renewDraftLease.mockReturnValueOnce(pending.promise)
		const { activeRuntime, openRepository, session } = createSwitchableSession({
			first: first.repository,
			second: second.repository
		})
		await session.initialize()
		await session.resume()
		await vi.advanceTimersByTimeAsync(20_000)
		await vi.waitFor(() => expect(first.renewDraftLease).toHaveBeenCalledOnce())

		const switching = switchWorkspace(activeRuntime, openRepository)
		await nextTick()
		expect(openRepository).toHaveBeenCalledOnce()
		first.setEntry(readyEntry(draft, { status: 'live', lease: lease(99) }), 99)
		pending.resolve({ value: lease(99), deviceRevision: 99 })
		await switching

		expect(session.hasDraft.value).toBe(false)
		expect(session.isOwned.value).toBe(false)
		expect(session.saveState.value).not.toBe('failed')
		expect(session.saveErrorCode.value).toBeNull()
		expect(first.releaseDraftLease).toHaveBeenCalledWith(
			draft.id,
			'owner-token-private',
			{ deviceRevision: 99, leaseRevision: 99 }
		)
		expect(first.entry()?.lease.status).toBe('unclaimed')
	})

	it('drops pending old-workspace autosave instead of writing it into a replacement', async () => {
		const first = fakeRepository()
		const second = fakeRepository(null, {
			workspaceId: 'workspace-2',
			repositoryId: 'repository-2'
		})
		const activeRuntime = runtime()
		const workflow = workflowHarness(reviewRows())
		const openRepository = vi
			.fn()
			.mockResolvedValueOnce(first.repository)
			.mockResolvedValueOnce(second.repository)
		const scope = effectScope()
		const session = scope.run(() =>
			useTrackEnrichmentDraftSession({
				runtime: activeRuntime,
				workflow: workflow.workflow,
				records: { records: [] },
				tracks: { tracks: [track()] },
				openRepository,
				now: () => new Date(NOW),
				randomUUID: vi
					.fn()
					.mockReturnValueOnce('owner-token-private')
					.mockReturnValue('draft-new')
			})
		)
		if (!session) throw new Error('Failed to create draft session')
		activeScopes.push(scope)
		await session.initialize()
		activeRuntime.replaceWorkspace(
			{
				...activeRuntime.descriptor.value,
				id: 'workspace-2',
				repositoryId: 'repository-2'
			},
			{ id: 'repository-2' } as LibraryRepositoryBundle
		)
		await nextTick()
		await Promise.resolve()
		await vi.advanceTimersByTimeAsync(500)

		expect(first.createDraftAndClaim).not.toHaveBeenCalled()
		expect(openRepository).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				identity: { workspaceId: 'workspace-2', repositoryId: 'repository-2' }
			})
		)
		expect(workflow.startAnotherSource).toHaveBeenCalledOnce()
	})

	it('ignores a completed old-workspace save before accepting the new device revision', async () => {
		const first = fakeRepository()
		const second = fakeRepository(null, {
			workspaceId: 'workspace-2',
			repositoryId: 'repository-2'
		})
		const pending = deferred<{
			value: BrowserClaimedDraft
			deviceRevision: number
		}>()
		first.createDraftAndClaim.mockReturnValueOnce(pending.promise)
		const activeRuntime = runtime()
		const workflow = workflowHarness()
		const openRepository = vi
			.fn()
			.mockResolvedValueOnce(first.repository)
			.mockResolvedValueOnce(second.repository)
			.mockResolvedValueOnce(first.repository)
		const scope = effectScope()
		const session = scope.run(() =>
			useTrackEnrichmentDraftSession({
				runtime: activeRuntime,
				workflow: workflow.workflow,
				records: { records: [] },
				tracks: { tracks: [track()] },
				openRepository,
				now: () => new Date(NOW),
				randomUUID: vi
					.fn()
					.mockReturnValueOnce('owner-token-private')
					.mockReturnValue('draft-new')
			})
		)
		if (!session) throw new Error('Failed to create draft session')
		activeScopes.push(scope)
		await session.initialize()
		workflow.workflow.selectedFileName.value = 'old.xml'
		workflow.workflow.rows.value = reviewRows()
		workflow.workflow.stagedRowIds.value = new Set([
			workflow.workflow.rows.value[0]!.id
		])
		await vi.advanceTimersByTimeAsync(500)
		await vi.waitFor(() =>
			expect(first.createDraftAndClaim).toHaveBeenCalledOnce()
		)
		const staleDraft = first.createDraftAndClaim.mock.calls[0]![0]

		activeRuntime.replaceWorkspace(
			{
				...activeRuntime.descriptor.value,
				id: 'workspace-2',
				repositoryId: 'repository-2'
			},
			{ id: 'repository-2' } as LibraryRepositoryBundle
		)
		await nextTick()
		expect(openRepository).toHaveBeenCalledOnce()
		first.setEntry(
			readyEntry(staleDraft, { status: 'live', lease: lease(90) }),
			99
		)
		pending.resolve({
			value: { draft: staleDraft, lease: lease(90) },
			deviceRevision: 99
		})
		await vi.waitFor(() => expect(openRepository).toHaveBeenCalledTimes(2))
		expect(first.releaseDraftLease).toHaveBeenCalledWith(
			staleDraft.id,
			'owner-token-private',
			{ deviceRevision: 99, leaseRevision: 90 }
		)
		expect(first.entry()?.lease.status).toBe('unclaimed')
		expect(session.lastSavedAt.value).toBeNull()

		workflow.workflow.selectedFileName.value = 'new.xml'
		workflow.workflow.rows.value = reviewRows()
		workflow.workflow.stagedRowIds.value = new Set([
			workflow.workflow.rows.value[0]!.id
		])
		await vi.advanceTimersByTimeAsync(500)
		await session.flushSave()

		expect(second.createDraftAndClaim).toHaveBeenCalledOnce()
		const createArguments = second.createDraftAndClaim.mock
			.calls[0] as unknown as [BrowserWorkflowDraft, string, unknown]
		expect(createArguments[2]).toEqual({
			deviceRevision: 0,
			draftRevision: null
		})

		activeRuntime.replaceWorkspace(
			{
				...activeRuntime.descriptor.value,
				id: 'workspace-1',
				repositoryId: 'repository-1'
			},
			{ id: 'repository-1' } as LibraryRepositoryBundle
		)
		await nextTick()
		await vi.waitFor(() => expect(openRepository).toHaveBeenCalledTimes(3))
		expect(session.activeEntry.value?.lease.status).toBe('unclaimed')
		expect(session.isOwned.value).toBe(false)
	})

	it('releases a deferred first-create lease during same-workspace reinitialization', async () => {
		const fake = fakeRepository()
		const pending = deferred<{
			value: BrowserClaimedDraft
			deviceRevision: number
		}>()
		fake.createDraftAndClaim.mockReturnValueOnce(pending.promise)
		const workflow = workflowHarness(reviewRows())
		const { session } = createSession({
			repository: fake.repository,
			workflow
		})
		await session.initialize()

		const saving = session.flushSave()
		const reinitializing = session.initialize()
		await vi.waitFor(() =>
			expect(fake.createDraftAndClaim).toHaveBeenCalledOnce()
		)
		const createdDraft = fake.createDraftAndClaim.mock.calls[0]![0]
		fake.setEntry(
			readyEntry(createdDraft, { status: 'live', lease: lease(0) }),
			50
		)
		pending.resolve({
			value: { draft: createdDraft, lease: lease(0) },
			deviceRevision: 50
		})

		await Promise.all([saving, reinitializing])
		expect(fake.releaseDraftLease).toHaveBeenCalledWith(
			createdDraft.id,
			'owner-token-private',
			{ deviceRevision: 50, leaseRevision: 0 }
		)
		expect(fake.entry()?.lease.status).toBe('unclaimed')
		expect(session.activeEntry.value?.lease.status).toBe('unclaimed')
		expect(session.isOwned.value).toBe(false)

		await vi.advanceTimersByTimeAsync(20_000)
		expect(fake.renewDraftLease).not.toHaveBeenCalled()
	})
})
