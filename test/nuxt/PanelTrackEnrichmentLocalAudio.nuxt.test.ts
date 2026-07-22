import { ref, shallowRef } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PanelTrackEnrichmentLocalAudio from '~/components/enrichment/PanelTrackEnrichmentLocalAudio.vue'
import type { LocalAudioFileEntry } from '~/types/localAudio'
import { LOCAL_AUDIO_DECODE_SKIP_MESSAGES } from '~/utils/localAudioDecodePolicy'

const localAudioAnalysisFactory = vi.hoisted(() => vi.fn())
mockNuxtImport('useLocalAudioAnalysis', () => localAudioAnalysisFactory)

const wrappers = new Set<VueWrapper>()

function createTagsOnlyEntry(): LocalAudioFileEntry {
	return {
		id: 'oversized.wav:1:1',
		file: new File(['header'], 'oversized.wav', { type: 'audio/wav' }),
		relativePath: 'Archive/oversized.wav',
		status: 'tags-only',
		fromCache: false,
		source: null,
		analysisSkipReason: LOCAL_AUDIO_DECODE_SKIP_MESSAGES.budget,
		error: null
	}
}

function createPanelState(entry: LocalAudioFileEntry) {
	return {
		entries: shallowRef([entry]),
		readySources: ref([]),
		pendingCount: ref(0),
		processedCount: ref(1),
		errorCount: ref(0),
		cachedCount: ref(0),
		analysisSkippedCount: ref(1),
		analysisCandidateCount: ref(0),
		completeDataCount: ref(0),
		partialDataCount: ref(0),
		noDataCount: ref(1),
		visibleEntries: shallowRef([entry]),
		isPickingFolder: ref(false),
		isAnalyzing: ref(false),
		processingMode: ref(null),
		completedInBatch: ref(0),
		batchTotal: ref(0),
		statusMessage: ref('Analysis batch complete'),
		cacheWarning: ref(null),
		pickFolder: vi.fn(),
		setFiles: vi.fn(),
		scanMetadata: vi.fn(),
		analyzeNextBatch: vi.fn(),
		cancelProcessing: vi.fn()
	}
}

describe('PanelTrackEnrichmentLocalAudio', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
	})

	it('presents decode refusals as visible tags-only outcomes, not failures', async () => {
		const entry = createTagsOnlyEntry()
		localAudioAnalysisFactory.mockReturnValue(createPanelState(entry))

		const wrapper = await mountSuspended(PanelTrackEnrichmentLocalAudio)
		wrappers.add(wrapper)
		await flushPromises()

		expect(wrapper.text()).toContain('1 kept as tags only')
		expect(wrapper.text()).toContain('Tags only')
		expect(wrapper.text()).toContain(LOCAL_AUDIO_DECODE_SKIP_MESSAGES.budget)
		expect(wrapper.text()).toContain(
			'Full decode only within the safe memory budget'
		)
		expect(wrapper.text()).not.toContain('Analyze 10 missing')
		expect(wrapper.find('.text-amber-700').exists()).toBe(true)
		expect(wrapper.find('.text-destructive').exists()).toBe(false)
	})
})
