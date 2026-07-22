import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import {
	currentTrackEvidenceV2Golden,
	legacyTrackAudioFeaturesV1Golden
} from 'test/fixtures/trackEvidence'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InspectorTrack from '~/components/library/InspectorTrack.vue'
import PanelTrackEvidence from '~/components/library/PanelTrackEvidence.vue'
import type { LibraryTrack } from '~~/shared/types/library'

const factories = vi.hoisted(() => ({ preferences: vi.fn() }))

mockNuxtImport('useWorkbenchPreferencesStore', () => factories.preferences)

const wrappers = new Set<VueWrapper>()

async function mountEvidence(
	evidence: unknown,
	current: {
		bpm?: number | null
		key?: number | null
		mode?: number | null
	} = {}
) {
	const wrapper = await mountSuspended(PanelTrackEvidence, {
		props: {
			evidence,
			currentBpm: current.bpm === undefined ? 128 : current.bpm,
			currentKey: current.key === undefined ? 5 : current.key,
			currentMode: current.mode === undefined ? 0 : current.mode,
			keyFormat: 'key'
		}
	})
	wrappers.add(wrapper)
	return wrapper
}

function expectAccessibleHeading(wrapper: VueWrapper) {
	const section = wrapper.get('section')
	const headingId = section.attributes('aria-labelledby')
	expect(headingId).toBeTruthy()
	expect(wrapper.get(`[id="${headingId}"]`).text()).toBe('Enrichment Evidence')
}

describe('PanelTrackEvidence', () => {
	beforeEach(() => {
		factories.preferences.mockReturnValue({ currentKeyFormat: 'key' })
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('shows current v2 attribution, fixed sources, and separate confidence axes', async () => {
		const wrapper = await mountEvidence(currentTrackEvidenceV2Golden)

		expectAccessibleHeading(wrapper)
		expect(wrapper.get('[aria-label="Current track values"]').text()).toContain(
			'128.0 BPM'
		)
		expect(wrapper.get('[aria-label="Current track values"]').text()).toContain(
			'F Min'
		)
		expect(
			wrapper.text().match(/Applied value is still current/g)
		).toHaveLength(2)
		expect(wrapper.text()).toContain('Evidence v2')
		expect(
			wrapper.get(
				'[aria-label="Evidence source coverage: 3 of 3 source slots retained"]'
			)
		).toBeTruthy()
		expect(
			wrapper.findAll('[data-testid^="track-evidence-source-"]')
		).toHaveLength(3)

		const rekordbox = wrapper.get(
			'[data-testid="track-evidence-source-rekordboxXml"]'
		)
		expect(rekordbox.text()).toContain('128.0 BPM')
		expect(rekordbox.text()).toContain('F Min')
		expect(rekordbox.text()).toContain('high identity match')
		expect(
			rekordbox.get('time[datetime="2026-07-21T11:58:00.000Z"]')
		).toBeTruthy()

		const essentia = wrapper.get(
			'[data-testid="track-evidence-source-essentiaBrowser"]'
		)
		expect(essentia.text()).toContain('medium identity match')
		const analyzerMetrics = essentia.get(
			'[aria-label="Essentia analyzer metrics, separate from identity matching"]'
		)
		expect(analyzerMetrics.text()).toContain('Essentia BPM analyzer confidence')
		expect(analyzerMetrics.text()).toContain('0.87')
		expect(analyzerMetrics.text()).toContain('Essentia key strength')
		expect(analyzerMetrics.text()).toContain('0.73')
		expect(analyzerMetrics.text()).not.toContain('identity match')

		expect(
			wrapper.get('[aria-label="BPM source comparison: Agreement"]')
		).toBeTruthy()
		expect(
			wrapper.get('[aria-label="Key source comparison: Agreement"]')
		).toBeTruthy()
		expect(wrapper.text()).toContain('track-evidence-agreement-v1')
		expect(wrapper.find('button').exists()).toBe(false)
		expect(wrapper.text()).not.toContain('collection.xml')
		expect(wrapper.text()).not.toContain('Asterism.wav')
	})

	it('keeps migrated v1 attribution and global matching explicitly unattributed', async () => {
		const wrapper = await mountEvidence(legacyTrackAudioFeaturesV1Golden)

		expect(wrapper.text()).toContain('Evidence v1 · compatibility view')
		expect(
			wrapper.text().match(/No safe application attribution is available/g)
		).toHaveLength(2)
		expect(wrapper.text()).toContain(
			'Legacy v1 marker names Rekordbox XML; its applied value and observation identity are unavailable.'
		)
		expect(wrapper.text()).toContain(
			'Legacy v1 marker names Embedded tags; its applied value and observation identity are unavailable.'
		)
		expect(wrapper.text()).toContain('Legacy global identity match')
		expect(wrapper.text()).toContain('not attributable to a source')
		expect(
			wrapper.text().match(/source-specific identity match unavailable/g)
		).toHaveLength(3)
		expect(wrapper.text()).toContain('Essentia BPM analyzer confidence')
		expect(
			wrapper.get('[aria-label="BPM source comparison: Agreement"]')
		).toBeTruthy()
	})

	it('fails closed for malformed Evidence while retaining clearly labelled current values', async () => {
		const wrapper = await mountEvidence(
			{ version: 2, sources: { rekordboxXml: { path: '/private/audio.wav' } } },
			{ bpm: 130, key: 0, mode: 1 }
		)

		expectAccessibleHeading(wrapper)
		expect(wrapper.get('[aria-label="Current track values"]').text()).toContain(
			'130.0 BPM'
		)
		expect(wrapper.get('[aria-label="Current track values"]').text()).toContain(
			'C Maj'
		)
		expect(
			wrapper
				.get('[role="status"][aria-label="Enrichment Evidence unavailable"]')
				.text()
		).toContain('Stored enrichment Evidence could not be read')
		expect(wrapper.text()).not.toContain('/private/audio.wav')
		expect(wrapper.text()).not.toContain('invalid-shape')
		expect(wrapper.text()).not.toContain('Source coverage')
		expect(wrapper.text()).not.toContain('Agreement')
		expect(wrapper.text()).not.toContain('Conflict')
		expect(wrapper.text()).not.toContain('Applied value')
		expect(
			wrapper.find('[data-testid^="track-evidence-source-"]').exists()
		).toBe(false)
	})

	it('labels multi-source BPM and key divergence as policy conflict', async () => {
		const evidence = structuredClone(currentTrackEvidenceV2Golden)
		evidence.sources.embeddedTags!.data.bpm = 130
		evidence.sources.embeddedTags!.data.key = 'C major'
		const wrapper = await mountEvidence(evidence)

		expect(
			wrapper.get('[aria-label="BPM source comparison: Conflict"]')
		).toBeTruthy()
		expect(
			wrapper.get('[aria-label="Key source comparison: Conflict"]')
		).toBeTruthy()
		expect(wrapper.text()).toContain('at least one does not meet this policy')
		const copy = wrapper.text().toLowerCase()
		expect(copy).not.toMatch(/\bcorrect(?:ness)?\b/)
		expect(copy).not.toContain('ground truth')
		expect(copy).not.toContain('history')
	})

	it('makes current values and changed-since-application snapshots distinct', async () => {
		const wrapper = await mountEvidence(currentTrackEvidenceV2Golden, {
			bpm: 129,
			key: 7,
			mode: 1
		})

		expect(wrapper.text().match(/Changed since application/g)).toHaveLength(2)
		expect(wrapper.text()).toContain('Rekordbox XML · applied value 128.0 BPM')
		expect(wrapper.text()).toContain('Embedded tags · applied value F Min')
		expect(wrapper.get('[aria-label="Current track values"]').text()).toContain(
			'129.0 BPM'
		)
		expect(wrapper.get('[aria-label="Current track values"]').text()).toContain(
			'G Maj'
		)
		expect(
			wrapper.findAll('time[datetime="2026-07-21T12:01:00.000Z"]')
		).toHaveLength(2)
	})

	it('shows fixed missing-source cards and insufficient evidence without absence claims', async () => {
		const evidence = structuredClone(currentTrackEvidenceV2Golden)
		evidence.applied = { bpm: null, keyMode: null }
		delete evidence.sources.embeddedTags
		delete evidence.sources.essentiaBrowser
		const wrapper = await mountEvidence(evidence)

		expect(
			wrapper.get(
				'[aria-label="Evidence source coverage: 1 of 3 source slots retained"]'
			)
		).toBeTruthy()
		expect(
			wrapper.findAll('[data-testid^="track-evidence-source-"]')
		).toHaveLength(3)
		expect(
			wrapper.get('[data-testid="track-evidence-source-embeddedTags"]').text()
		).toContain('Not retained')
		expect(
			wrapper.get('[data-testid="track-evidence-source-embeddedTags"]').text()
		).toContain('No retained observation')
		expect(
			wrapper.get('[aria-label="BPM source comparison: Insufficient evidence"]')
		).toBeTruthy()
		expect(
			wrapper.get('[aria-label="Key source comparison: Insufficient evidence"]')
		).toBeTruthy()
		expect(wrapper.text().toLowerCase()).not.toContain('never analyzed')
	})

	it('integrates the read-only panel into the selected-track inspector', async () => {
		const track = createMockTrack({
			bpm: 128,
			key: 5,
			mode: 0,
			audio_features:
				legacyTrackAudioFeaturesV1Golden as LibraryTrack['audio_features']
		}) as LibraryTrack
		const wrapper = await mountSuspended(InspectorTrack, {
			props: { track, record: null }
		})
		wrappers.add(wrapper)

		expect(wrapper.text()).toContain('Track inspector')
		expect(wrapper.text()).toContain('Enrichment Evidence')
		expect(wrapper.text()).toContain('Evidence v1 · compatibility view')
		expect(wrapper.get('[aria-label="Current track values"]').text()).toContain(
			'128.0 BPM'
		)
		expect(wrapper.findAll('button')).toHaveLength(1)
		expect(wrapper.get('button').text()).toContain('Edit track')
	})
})
