import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
	ApplySummary,
	TrackEnrichmentWorkflow
} from '~/composables/useTrackEnrichmentWorkflow'
import EnrichmentPage from '~/pages/enrichment.vue'
import type { LocalAudioReviewSelection } from '~/types/localAudio'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'

const workflowFactory = vi.hoisted(() => vi.fn())
const storeFactories = vi.hoisted(() => ({
	records: vi.fn(),
	tracks: vi.fn(),
	user: vi.fn()
}))

mockNuxtImport('useTrackEnrichmentWorkflow', () => workflowFactory)
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
	emits: ['dropFile', 'reviewLocal', 'selectFile', 'selectSource'],
	setup(_props, { emit }) {
		return () =>
			h('div', { 'data-testid': 'source-panel' }, [
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

	return {
		activeSource: ref('rekordboxXml'),
		selectedFileName: ref<string | null>(null),
		rows,
		stagedRowIds,
		selectedFilter: ref('ready'),
		currentPage: ref(1),
		parseWarnings: ref([]),
		parseErrors: ref([]),
		isParsing: ref(false),
		parseCompleted: ref(0),
		parseTotal: ref(0),
		isApplying: ref(false),
		showApplyDialog: ref(false),
		applyCompleted: ref(0),
		applyTotal: ref(1),
		lastApplySummary,
		workflowView: ref('source'),
		currentStep,
		matchedRows: computed(() => rows.value),
		readyRows: computed(() => rows.value),
		reviewRows: computed(() => []),
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
		stageableFilteredRows: computed(() => rows.value),
		stagedFilteredCount: computed(() => 1),
		filteredSelectionState: computed(() => true),
		pageCount: computed(() => 1),
		pagedRows: computed(() => rows.value),
		shownStart: computed(() => 1),
		shownEnd: computed(() => rows.value.length),
		stagedBpmCount: computed(() => 1),
		stagedKeyModeCount: computed(() => 1),
		isStepComplete: vi.fn(() => false),
		canNavigateToStep: vi.fn((step: number) => step === 1),
		navigateToStep: vi.fn(),
		parseFile: vi.fn().mockResolvedValue(undefined),
		reviewLocalSources: vi.fn().mockResolvedValue(undefined),
		selectSource: vi.fn(),
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

const wrappers = new Set<VueWrapper>()

async function mountPage(loadResults: [boolean, boolean]) {
	const workflow = createWorkflow()
	workflowFactory.mockReturnValue(workflow)
	const records = {
		fetchAllRecords: vi.fn().mockResolvedValue(loadResults[0])
	}
	const tracks = {
		fetchAllTracks: vi.fn().mockResolvedValue(loadResults[1])
	}
	storeFactories.records.mockReturnValue(records)
	storeFactories.tracks.mockReturnValue(tracks)
	storeFactories.user.mockReturnValue({ currentKeyFormat: 'key' })

	const wrapper = await mountSuspended(EnrichmentPage, {
		global: {
			stubs: {
				Dialog: DialogStub,
				DialogContent: SlotStub,
				DialogDescription: SlotStub,
				DialogFooter: SlotStub,
				DialogHeader: SlotStub,
				DialogTitle: SlotStub,
				PanelTrackEnrichmentSource: SourceStub,
				TableTrackEnrichmentReview: ReviewStub,
				ToggleGroup: SlotStub,
				ToggleGroupItem: SlotStub
			}
		}
	})
	wrappers.add(wrapper)
	await flushPromises()
	await nextTick()

	return { records, tracks, workflow, wrapper }
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
		document.body.innerHTML = ''
	})

	it('adapts source, file, review, dialog, and summary UI events to the workflow contract', async () => {
		const { workflow, wrapper } = await mountPage([true, true])

		expect(wrapper.find('[data-testid="source-panel"]').exists()).toBe(true)
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
		expect(wrapper.find('[data-testid="review-table"]').exists()).toBe(true)
		await wrapper.get('[data-testid="stage-all"]').trigger('click')
		expect(workflow.setFilteredRowsStaged).toHaveBeenCalledWith(true)
		await wrapper.get('[data-testid="stage-row"]').trigger('click')
		expect(workflow.setRowStaged).toHaveBeenCalledWith(
			workflow.rows.value[0],
			false
		)
		await getButton(wrapper, 'Review staged updates').trigger('click')
		expect(workflow.openApplyReview).toHaveBeenCalledOnce()
		await getButton(wrapper, 'Apply updates').trigger('click')
		expect(workflow.applyStagedRows).toHaveBeenCalledOnce()
		workflow.showApplyDialog.value = true
		await getButton(wrapper, 'Back to review').trigger('click')
		expect(workflow.showApplyDialog.value).toBe(false)

		workflow.currentStep.value = 3
		workflow.lastApplySummary.value = {
			total: 1,
			succeeded: 1,
			failed: 0,
			bpm: 1,
			keyMode: 1
		}
		await nextTick()
		await getButton(wrapper, 'Review results').trigger('click')
		await getButton(wrapper, 'Use another source').trigger('click')
		expect(workflow.returnToReview).toHaveBeenCalledOnce()
		expect(workflow.startAnotherSource).toHaveBeenCalledOnce()
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
			for (const step of wrapper.findAll('button').slice(0, 3)) {
				expect(step.attributes('disabled')).toBeDefined()
			}
		}
	)

	it('filters the active review queue without mutating workflow rows', async () => {
		const { workflow, wrapper } = await mountPage([true, true])
		workflow.currentStep.value = 2
		await nextTick()

		const search = wrapper.get('input[aria-label="Filter enrichment matches"]')
		await search.setValue('synthetic')
		expect(wrapper.find('[data-testid="review-table"]').exists()).toBe(true)

		await search.setValue('not in this collection')
		expect(wrapper.find('[data-testid="review-table"]').exists()).toBe(false)
		expect(wrapper.text()).toContain('No matches for this filter')
		expect(workflow.rows.value).toHaveLength(1)
	})
})
