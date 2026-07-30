import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EnrichmentPage from '~/components/enrichment/PageTrackEnrichment.vue'
import type {
	ApplySummary,
	TrackEnrichmentWorkflow
} from '~/composables/useTrackEnrichmentWorkflow'
import type { BrowserWorkflowDraftEntry } from '~/repositories/library/browser/browserLibraryTypes'
import type { LocalAudioReviewSelection } from '~/types/localAudio'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'

const workflowFactory = vi.hoisted(() => vi.fn())
const draftSessionFactory = vi.hoisted(() => vi.fn())
const storeFactories = vi.hoisted(() => ({
	records: vi.fn(),
	tracks: vi.fn(),
	user: vi.fn()
}))

mockNuxtImport('useTrackEnrichmentWorkflow', () => workflowFactory)
mockNuxtImport('useTrackEnrichmentDraftSession', () => draftSessionFactory)
mockNuxtImport('useRecordsStore', () => storeFactories.records)
mockNuxtImport('useTracksStore', () => storeFactories.tracks)
mockNuxtImport('useUserStore', () => storeFactories.user)

const sourceDropFile = new File(['<DJ_PLAYLISTS />'], 'dropped.xml', {
	type: 'text/xml'
})
const localSelection = {
	sources: [],
	totalFiles: 2,
	processedFiles: 2
} satisfies LocalAudioReviewSelection

const SourceStub = defineComponent({
	name: 'PanelTrackEnrichmentSource',
	emits: [
		'cancelParsing',
		'dropFile',
		'retryParsing',
		'reviewLocal',
		'selectFile',
		'selectSource'
	],
	setup(_props, { emit }) {
		return () =>
			h('div', { 'data-testid': 'source-panel' }, [
				h(
					'button',
					{
						'data-testid': 'cancel-parsing',
						onClick: () => emit('cancelParsing')
					},
					'Cancel parsing'
				),
				h(
					'button',
					{
						'data-testid': 'retry-parsing',
						onClick: () => emit('retryParsing')
					},
					'Retry parsing'
				),
				h(
					'button',
					{
						'data-testid': 'select-file',
						onClick: () => emit('selectFile')
					},
					'Select XML'
				),
				h(
					'button',
					{
						'data-testid': 'drop-file',
						onClick: () => emit('dropFile', sourceDropFile)
					},
					'Drop XML'
				),
				h(
					'button',
					{
						'data-testid': 'select-source',
						onClick: () => emit('selectSource', 'localAudio')
					},
					'Local audio'
				),
				h(
					'button',
					{
						'data-testid': 'review-local',
						onClick: () => emit('reviewLocal', localSelection)
					},
					'Review local'
				)
			])
	}
})

const ReviewStub = defineComponent({
	name: 'TableTrackEnrichmentReview',
	props: {
		rows: {
			type: Array as () => TrackEnrichmentRow[],
			required: true
		}
	},
	emits: ['stage-all', 'stage-row'],
	setup(props, { emit }) {
		return () =>
			h('div', { 'data-testid': 'review-table' }, [
				h(
					'button',
					{
						'data-testid': 'stage-all',
						onClick: () => emit('stage-all', true)
					},
					'Stage all'
				),
				h(
					'button',
					{
						'data-testid': 'stage-row',
						onClick: () => emit('stage-row', props.rows[0], false)
					},
					'Unstage row'
				)
			])
	}
})

const UnmatchedStub = defineComponent({
	name: 'TableTrackEnrichmentUnmatched',
	props: {
		rows: {
			type: Array as () => TrackEnrichmentRow[],
			required: true
		}
	},
	setup(props) {
		return () =>
			h(
				'div',
				{ 'data-testid': 'unmatched-table' },
				props.rows.map((row) => row.source.name).join(', ')
			)
	}
})

const SlotStub = defineComponent({
	setup(_props, { slots }) {
		return () => h('div', slots.default?.())
	}
})

const DialogStub = defineComponent({
	name: 'Dialog',
	props: { open: Boolean },
	emits: ['update:open'],
	setup(_props, { slots }) {
		return () => h('div', { 'data-testid': 'apply-dialog' }, slots.default?.())
	}
})

type WorkflowHarness = TrackEnrichmentWorkflow & {
	currentStep: ReturnType<typeof ref<1 | 2 | 3>>
}

function createRow(): TrackEnrichmentRow {
	return {
		id: 'row-1',
		source: {
			sourceType: 'rekordboxXml',
			index: 0,
			trackId: 'source-1',
			name: 'Synthetic Track',
			artist: 'Test Artist',
			album: 'Synthetic Album',
			genre: 'House',
			kind: 'WAV File',
			totalTimeSeconds: 180,
			year: 2024,
			averageBpm: 128,
			dateAdded: null,
			bitRate: 1411,
			sampleRate: 44100,
			comments: null,
			playCount: 0,
			rating: 0,
			location: null,
			locationHint: 'Synthetic Track.wav',
			remixer: null,
			tonality: '8A',
			parsedKey: 9,
			parsedMode: 0,
			label: null,
			warnings: []
		},
		track: null,
		record: null,
		confidence: 'high',
		score: 100,
		reasons: [],
		warnings: [],
		proposedBpm: 128,
		proposedKey: 9,
		proposedMode: 0,
		proposedBpmSource: 'rekordboxXml',
		proposedKeyModeSource: 'rekordboxXml',
		canFillBpm: false,
		canFillKeyMode: false,
		alreadyComplete: false,
		hasConflict: false,
		stagingBlockedReason: null,
		defaultStaged: false,
		error: null,
		applied: false
	}
}

function createWorkflow(): WorkflowHarness {
	const row = createRow()
	const currentStep = ref<1 | 2 | 3>(1)
	const rows = ref([row])
	const stagedRowIds = ref(new Set([row.id]))
	const lastApplySummary = ref<ApplySummary | null>(null)
	const selectedFileName = ref<string | null>(null)
	const selectedFilter = ref<
		'ready' | 'review' | 'staged' | 'matched' | 'unmatched' | 'done'
	>('ready')
	const loadPreparedReview = vi.fn(
		(fileLabel: string, nextRows: TrackEnrichmentRow[]) => {
			selectedFileName.value = fileLabel
			rows.value = nextRows
			selectedFilter.value = 'ready'
			currentStep.value = 2
		}
	)

	return {
		activeSource: ref('rekordboxXml'),
		selectedFileName,
		rows,
		stagedRowIds,
		selectedFilter,
		currentPage: ref(1),
		parseWarnings: ref([]),
		parseErrors: ref([]),
		parsePhase: ref('idle'),
		parseBytesCompleted: ref(0),
		parseBytesTotal: ref(0),
		isParsing: ref(false),
		parseCompleted: ref(0),
		parseTotal: ref(0),
		isApplying: ref(false),
		showApplyDialog: ref(false),
		applyCompleted: ref(0),
		applyTotal: ref(1),
		lastApplySummary,
		workflowView: ref('source'),
		changedRowIds: ref(new Set()),
		resumeSummary: ref(null),
		requiresSourceReconnect: ref(false),
		isReviewReadOnly: ref(false),
		currentStep,
		matchedRows: computed(() => rows.value),
		readyRows: computed(() => rows.value),
		reviewRows: computed(() => []),
		evidenceOnlyRows: computed(() => []),
		unmatchedRows: computed(() => []),
		doneRows: computed(() => []),
		stagedRows: computed(() => rows.value),
		blockedCount: computed(() => 0),
		rowErrorCount: computed(() => 0),
		errorCount: computed(() => 0),
		matchRate: computed(() => '100.0%'),
		applyProgress: computed(() => 0),
		parseProgress: computed(() => 0),
		visibleParseWarnings: computed(() => []),
		sourceLabel: computed(() => 'Rekordbox XML'),
		filterOptions: computed(() => [
			{ value: 'ready', label: 'Ready', count: rows.value.length }
		]),
		filteredRows: computed(() => rows.value),
		stagedBpmCount: computed(() => 1),
		stagedKeyModeCount: computed(() => 1),
		stagedEvidenceCount: computed(() => rows.value.length),
		stagedEvidenceOnlyCount: computed(() => 0),
		isStepComplete: vi.fn(() => false),
		canNavigateToStep: vi.fn((step: number) => step === 1),
		navigateToStep: vi.fn(),
		parseFile: vi.fn().mockResolvedValue(undefined),
		cancelParsing: vi.fn(),
		retryParsing: vi.fn().mockResolvedValue(undefined),
		canRetryParsing: computed(() => false),
		reviewLocalSources: vi.fn().mockResolvedValue(undefined),
		selectSource: vi.fn(),
		loadPreparedReview,
		loadResumedReview: vi.fn(),
		setReviewReadOnly: vi.fn(),
		returnToSource: vi.fn(),
		startAnotherSource: vi.fn(),
		setRowStaged: vi.fn(),
		setFilteredRowsStaged: vi.fn(),
		clearStagedRows: vi.fn(),
		openApplyReview: vi.fn(),
		applyStagedRows: vi.fn().mockResolvedValue(undefined),
		returnToReview: vi.fn()
	} as unknown as WorkflowHarness
}

function createDraftSession() {
	return {
		activeEntry: ref<BrowserWorkflowDraftEntry | null>(null),
		discoveryState: ref('none'),
		hasDraft: ref(false),
		draftDetails: ref<{
			id: string
			sourceLabel: string
			sourceKind: 'rekordboxXml' | 'localAudio'
			observationCount: number
			reviewedCount: number
			stagedCount: number
			doneCount: number
			retryCount: number
			updatedAt: string
			requiresReconnect: boolean
		} | null>(null),
		isHydrating: ref(false),
		isTakingOver: ref(false),
		isTransitioning: ref(false),
		isDraftMissingConflict: ref(false),
		isOwned: ref(false),
		isSourceBlockedByDraft: ref(false),
		saveStatusLabel: ref<string | null>(null),
		savedAtAccessibleLabel: ref<string | null>(null),
		shouldWarnBeforeUnload: ref(false),
		recoveryMessage: ref<string | null>(null),
		initialize: vi.fn().mockResolvedValue(undefined),
		resume: vi.fn().mockResolvedValue(true),
		takeOver: vi.fn().mockResolvedValue(true),
		startFresh: vi.fn().mockResolvedValue(true),
		deleteDraft: vi.fn().mockResolvedValue(true),
		acknowledgeCompleteAndDelete: vi.fn().mockResolvedValue(true),
		keepForLater: vi.fn().mockResolvedValue(true),
		recordApplyAttempt: vi.fn().mockResolvedValue(undefined)
	}
}

const wrappers = new Set<VueWrapper>()

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

async function mountPage(
	loadResults: [boolean, boolean],
	initialReview: {
		fileName: string
		rows: TrackEnrichmentRow[]
		selectedFilter?:
			| 'ready'
			| 'review'
			| 'staged'
			| 'matched'
			| 'unmatched'
			| 'done'
	} | null = null,
	options: { initialize?: Promise<void> } = {}
) {
	const workflow = createWorkflow()
	workflowFactory.mockReturnValue(workflow)
	const draftSession = createDraftSession()
	if (options.initialize) {
		draftSession.initialize.mockReturnValueOnce(options.initialize)
	}
	draftSessionFactory.mockReturnValue(draftSession)
	const records = {
		fetchAllRecords: vi.fn().mockResolvedValue(loadResults[0])
	}
	const tracks = {
		fetchAllTracks: vi.fn().mockResolvedValue(loadResults[1])
	}
	storeFactories.records.mockReturnValue(records)
	storeFactories.tracks.mockReturnValue(tracks)
	storeFactories.user.mockReturnValue({ currentKeyFormat: 'key' })
	const headerTarget = document.createElement('div')
	headerTarget.id = 'header-left'
	document.body.appendChild(headerTarget)

	const wrapper = await mountSuspended(EnrichmentPage, {
		props: { initialReview },
		global: {
			stubs: {
				Dialog: DialogStub,
				DialogContent: SlotStub,
				DialogDescription: SlotStub,
				DialogFooter: SlotStub,
				DialogHeader: SlotStub,
				DialogTitle: SlotStub,
				LazyPanelTrackEnrichmentSource: SourceStub,
				LazyTableTrackEnrichmentReview: ReviewStub,
				LazyTableTrackEnrichmentUnmatched: UnmatchedStub,
				PanelTrackEnrichmentSource: SourceStub,
				TableTrackEnrichmentReview: ReviewStub,
				TableTrackEnrichmentUnmatched: UnmatchedStub,
				ToggleGroup: SlotStub,
				ToggleGroupItem: SlotStub
			}
		}
	})
	wrappers.add(wrapper)
	await flushPromises()
	await nextTick()

	return { draftSession, records, tracks, workflow, wrapper }
}

function getButton(wrapper: VueWrapper, text: string) {
	const buttons = wrapper.findAll('button')
	const button =
		buttons.find((candidate) => candidate.text().trim() === text) ??
		buttons.find((candidate) => candidate.text().trim().startsWith(text))
	expect(button).toBeDefined()
	return button!
}

describe('enrichment page wiring', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		workflowFactory.mockReset()
		draftSessionFactory.mockReset()
		document.body.innerHTML = ''
	})

	it('adapts source, file, review, dialog, and summary UI events to the workflow contract', async () => {
		const { draftSession, workflow, wrapper } = await mountPage([true, true])

		await vi.waitFor(() =>
			expect(wrapper.find('[data-testid="source-panel"]').exists()).toBe(true)
		)
		const sourcePanel = wrapper.get('[data-testid="source-panel"]').element
		expect(document.querySelector('#header-left')?.textContent).toContain(
			'BPM & Key'
		)
		expect(wrapper.text()).not.toContain(
			'Collection data could not be loaded. Refresh to try again.'
		)
		const input = wrapper.get('input[type="file"]')
		const clickInput = vi.spyOn(input.element as HTMLInputElement, 'click')
		await wrapper.get('[data-testid="select-file"]').trigger('click')
		expect(clickInput).toHaveBeenCalledOnce()

		await wrapper.get('[data-testid="select-source"]').trigger('click')
		expect(workflow.selectSource).toHaveBeenCalledWith('localAudio')
		await wrapper.get('[data-testid="review-local"]').trigger('click')
		expect(workflow.reviewLocalSources).toHaveBeenCalledWith(localSelection)
		await wrapper.get('[data-testid="drop-file"]').trigger('click')
		expect(workflow.parseFile).toHaveBeenCalledWith(sourceDropFile)
		await wrapper.get('[data-testid="cancel-parsing"]').trigger('click')
		expect(workflow.cancelParsing).toHaveBeenCalledOnce()
		await wrapper.get('[data-testid="retry-parsing"]').trigger('click')
		expect(workflow.retryParsing).toHaveBeenCalledOnce()

		const selectedFile = new File(['<DJ_PLAYLISTS />'], 'selected.xml', {
			type: 'text/xml'
		})
		Object.defineProperty(input.element, 'files', {
			configurable: true,
			value: [selectedFile]
		})
		await input.trigger('change')
		expect(workflow.parseFile).toHaveBeenCalledWith(selectedFile)
		expect((input.element as HTMLInputElement).value).toBe('')

		workflow.currentStep.value = 2
		await nextTick()
		await vi.waitFor(() =>
			expect(wrapper.find('[data-testid="review-table"]').exists()).toBe(true)
		)
		expect(wrapper.get('[data-testid="source-panel"]').element).toBe(
			sourcePanel
		)
		expect(
			wrapper.get('[data-testid="enrichment-scroll-region"]').classes()
		).toContain('md:overflow-hidden')
		expect(
			wrapper.get('[data-testid="enrichment-review-workspace"]').classes()
		).toContain('md:min-h-0')
		expect(wrapper.get('[data-testid="review-table"]').classes()).toContain(
			'shrink-0'
		)
		expect(wrapper.get('[data-testid="review-table"]').classes()).toContain(
			'md:flex-1'
		)
		await wrapper.get('[data-testid="stage-all"]').trigger('click')
		expect(workflow.setFilteredRowsStaged).toHaveBeenCalledWith(true)
		await wrapper.get('[data-testid="stage-row"]').trigger('click')
		expect(workflow.setRowStaged).toHaveBeenCalledWith(
			workflow.rows.value[0],
			false
		)
		workflow.selectedFilter.value = 'unmatched'
		await nextTick()
		expect(wrapper.find('[data-testid="review-table"]').exists()).toBe(false)
		await vi.waitFor(() =>
			expect(wrapper.find('[data-testid="unmatched-table"]').exists()).toBe(
				true
			)
		)
		expect(wrapper.text()).not.toContain('Stage eligible (')
		await getButton(wrapper, 'Review staged changes').trigger('click')
		expect(workflow.openApplyReview).toHaveBeenCalledOnce()
		await getButton(wrapper, 'Save changes').trigger('click')
		expect(workflow.applyStagedRows).toHaveBeenCalledOnce()
		workflow.showApplyDialog.value = true
		await getButton(wrapper, 'Back to review').trigger('click')
		expect(workflow.showApplyDialog.value).toBe(false)

		workflow.currentStep.value = 1
		await nextTick()
		expect(wrapper.get('[data-testid="source-panel"]').element).toBe(
			sourcePanel
		)

		workflow.currentStep.value = 3
		workflow.stagedRowIds.value = new Set()
		workflow.lastApplySummary.value = {
			total: 1,
			succeeded: 1,
			failed: 0,
			remaining: 0,
			bpm: 1,
			keyMode: 1,
			evidence: 1,
			evidenceOnly: 0
		}
		await nextTick()
		await getButton(wrapper, 'Review results').trigger('click')
		await getButton(wrapper, 'Use another source').trigger('click')
		expect(workflow.returnToReview).toHaveBeenCalledOnce()
		expect(draftSession.acknowledgeCompleteAndDelete).toHaveBeenCalledOnce()
		expect(workflow.startAnotherSource).not.toHaveBeenCalled()
	})

	it('keeps source controls unavailable until draft discovery settles', async () => {
		const initializing = deferred<undefined>()
		const { wrapper } = await mountPage([true, true], null, {
			initialize: initializing.promise
		})

		expect(wrapper.text()).toContain('Loading collection...')
		expect(wrapper.find('[data-testid="source-panel"]').exists()).toBe(false)

		initializing.resolve(undefined)
		await flushPromises()
		await nextTick()
		await vi.waitFor(() =>
			expect(wrapper.find('[data-testid="source-panel"]').exists()).toBe(true)
		)
	})

	it('shows cancelled work as retryable and never discards an unsaved review', async () => {
		const { draftSession, workflow, wrapper } = await mountPage([true, true])
		draftSession.keepForLater.mockResolvedValueOnce(false)
		workflow.currentStep.value = 3
		workflow.lastApplySummary.value = {
			total: 2,
			succeeded: 1,
			failed: 0,
			remaining: 1,
			bpm: 1,
			keyMode: 1,
			evidence: 1,
			evidenceOnly: 0
		}
		await nextTick()

		expect(wrapper.text()).toContain('Enrichment needs attention')
		expect(wrapper.text()).toContain(
			'1 staged update was not attempted and remains ready to retry.'
		)
		expect(wrapper.text()).not.toContain('Enrichment complete')
		expect(wrapper.text()).not.toContain('Use another source')

		await getButton(wrapper, 'Keep for later').trigger('click')
		expect(draftSession.keepForLater).toHaveBeenCalledOnce()
		expect(workflow.startAnotherSource).not.toHaveBeenCalled()
		expect(workflow.rows.value).toHaveLength(1)
	})

	it.each([
		[false, true],
		[true, false]
	] as const)(
		'renders only the exact failure notice when collection loads resolve [%s, %s]',
		async (recordsLoaded, tracksLoaded) => {
			const { wrapper } = await mountPage([recordsLoaded, tracksLoaded])

			expect(wrapper.text()).toContain(
				'Collection data could not be loaded. Refresh to try again.'
			)
			expect(wrapper.find('[data-testid="source-panel"]').exists()).toBe(false)
			expect(wrapper.find('[data-testid="review-table"]').exists()).toBe(false)
			expect(wrapper.find('[data-testid="apply-dialog"]').exists()).toBe(false)
			const steps = document.querySelectorAll(
				'[data-testid="enrichment-workflow-step"]'
			)
			expect(steps).toHaveLength(3)
			for (const step of steps) expect(step.hasAttribute('disabled')).toBe(true)
		}
	)

	it('filters the active review queue without mutating workflow rows', async () => {
		const { workflow, wrapper } = await mountPage([true, true])
		workflow.currentStep.value = 2
		await nextTick()
		await vi.waitFor(() =>
			expect(wrapper.find('[data-testid="review-table"]').exists()).toBe(true)
		)

		const search = wrapper.get('input[aria-label="Filter enrichment matches"]')
		await search.setValue('synthetic')
		expect(wrapper.find('[data-testid="review-table"]').exists()).toBe(true)

		await search.setValue('not in this collection')
		expect(wrapper.find('[data-testid="review-table"]').exists()).toBe(false)
		expect(wrapper.text()).toContain('No matches for this filter')
		expect(workflow.rows.value).toHaveLength(1)
	})

	it('loads deterministic review rows supplied by the demo route', async () => {
		const row = createRow()
		const { workflow, wrapper } = await mountPage([true, true], {
			fileName: 'demo-review.xml',
			rows: [row],
			selectedFilter: 'unmatched'
		})

		expect(workflow.loadPreparedReview).toHaveBeenCalledWith(
			'demo-review.xml',
			[row]
		)
		expect(workflow.selectedFilter.value).toBe('unmatched')
		await vi.waitFor(() =>
			expect(wrapper.find('[data-testid="unmatched-table"]').exists()).toBe(
				true
			)
		)
	})

	it('presents device-local recovery actions without implying remote backup', async () => {
		vi.stubGlobal(
			'confirm',
			vi.fn(() => true)
		)
		const { draftSession, workflow, wrapper } = await mountPage([true, true])
		draftSession.hasDraft.value = true
		draftSession.discoveryState.value = 'ready'
		draftSession.saveStatusLabel.value = 'Saved locally 14:32'
		draftSession.draftDetails.value = {
			id: 'draft-1',
			sourceLabel: 'collection.xml',
			sourceKind: 'rekordboxXml',
			observationCount: 120,
			reviewedCount: 18,
			stagedCount: 12,
			doneCount: 3,
			retryCount: 2,
			updatedAt: '2026-07-23T04:00:00.000Z',
			requiresReconnect: false
		}
		draftSession.activeEntry.value = {
			draft: {
				status: 'invalid',
				metadata: {
					id: 'draft-1',
					kind: 'track-enrichment',
					draftRevision: 1,
					updatedAt: '2026-07-23T04:00:00.000Z'
				}
			},
			lease: {
				status: 'live',
				lease: {
					leaseRevision: 2,
					acquiredAt: '2026-07-23T04:00:00.000Z',
					renewedAt: '2026-07-23T04:00:00.000Z',
					expiresAt: '2026-07-23T04:01:00.000Z'
				}
			}
		}
		await nextTick()

		expect(
			wrapper.get('[data-testid="enrichment-draft-strip"]').text()
		).toContain('not backed up to Crate Guide')
		expect(wrapper.text()).toContain('120 tracks')
		expect(wrapper.text()).toContain('Saved locally 14:32')
		await getButton(wrapper, 'Resume').trigger('click')
		expect(draftSession.resume).toHaveBeenCalledOnce()
		await getButton(wrapper, 'Take over').trigger('click')
		expect(draftSession.takeOver).toHaveBeenCalledOnce()

		draftSession.isOwned.value = true
		await nextTick()
		await getButton(wrapper, 'Start fresh').trigger('click')
		expect(draftSession.startFresh).toHaveBeenCalledOnce()
		await getButton(wrapper, 'Delete').trigger('click')
		expect(draftSession.deleteDraft).toHaveBeenCalledOnce()
		expect(workflow.startAnotherSource).toHaveBeenCalledOnce()
	})

	it('shows rematch, reconnect, read-only, and failed-save state in review', async () => {
		const { draftSession, workflow, wrapper } = await mountPage([true, true])
		workflow.currentStep.value = 2
		workflow.isReviewReadOnly.value = true
		workflow.resumeSummary.value = {
			total: 9,
			retained: 4,
			unchangedUnstaged: 1,
			changed: 3,
			dropped: 1
		}
		workflow.requiresSourceReconnect.value = true
		draftSession.saveStatusLabel.value = "Couldn't save—keep this tab open"
		await nextTick()

		expect(
			wrapper.get('[data-testid="enrichment-draft-read-only"]').text()
		).toContain('another tab owns')
		expect(
			wrapper.get('[data-testid="enrichment-resume-summary"]').text()
		).toContain('4 retained')
		expect(
			wrapper.get('[data-testid="enrichment-resume-summary"]').text()
		).toContain('3 changed')
		expect(
			wrapper.get('[data-testid="enrichment-reconnect-required"]').text()
		).toContain('file access is not retained')
		expect(wrapper.text()).toContain("Couldn't save—keep this tab open")
	})

	it('fences a review deleted in another tab until the user starts fresh', async () => {
		const confirm = vi.fn(() => true)
		vi.stubGlobal('confirm', confirm)
		const { draftSession, workflow, wrapper } = await mountPage([true, true])
		draftSession.isDraftMissingConflict.value = true
		draftSession.isSourceBlockedByDraft.value = true
		await nextTick()

		expect(
			wrapper.get('[data-testid="enrichment-draft-missing-conflict"]').text()
		).toContain('was not recreated')
		await wrapper.get('[data-testid="select-source"]').trigger('click')
		expect(workflow.selectSource).not.toHaveBeenCalled()
		await getButton(wrapper, 'Start fresh').trigger('click')
		expect(confirm).toHaveBeenCalledWith(
			'Discard this in-memory review and start fresh? The saved review was already deleted in another tab.'
		)
		expect(draftSession.startFresh).toHaveBeenCalledOnce()

		workflow.currentStep.value = 2
		workflow.isReviewReadOnly.value = true
		await nextTick()
		expect(
			wrapper.get('[data-testid="enrichment-draft-read-only"]').text()
		).toContain('deleted in another tab')
		expect(
			wrapper.get('[data-testid="enrichment-draft-read-only"]').text()
		).not.toContain('Take over')
	})

	it('warns only for unsaved, failed, or in-flight work, not a saved review', async () => {
		const { draftSession, workflow } = await mountPage([true, true])
		const sourceEvent = new Event('beforeunload', { cancelable: true })

		window.dispatchEvent(sourceEvent)
		expect(sourceEvent.defaultPrevented).toBe(false)

		workflow.currentStep.value = 2
		await nextTick()
		const savedReviewEvent = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(savedReviewEvent)
		expect(savedReviewEvent.defaultPrevented).toBe(false)

		draftSession.shouldWarnBeforeUnload.value = true
		const dirtyReviewEvent = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(dirtyReviewEvent)

		expect(dirtyReviewEvent.defaultPrevented).toBe(true)
	})
})
