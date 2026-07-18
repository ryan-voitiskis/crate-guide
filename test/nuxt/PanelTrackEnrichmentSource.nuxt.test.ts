import { mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PanelTrackEnrichmentSource from '~/components/enrichment/PanelTrackEnrichmentSource.vue'

const wrappers = new Set<VueWrapper>()

async function mountSource(
	activeSource: 'rekordboxXml' | 'localAudio' = 'rekordboxXml',
	selectedFileName: string | null = null
) {
	const wrapper = await mountSuspended(PanelTrackEnrichmentSource, {
		props: {
			activeSource,
			isParsing: false,
			parseCompleted: 0,
			parseTotal: 0,
			parseProgress: 0,
			selectedFileName
		},
		global: {
			stubs: {
				PanelTrackEnrichmentLocalAudio: {
					template: '<div data-testid="local-audio-panel" />'
				}
			}
		}
	})
	wrappers.add(wrapper)
	await flushPromises()
	return wrapper
}

function getButton(wrapper: VueWrapper, label: string) {
	const button = wrapper
		.findAll('button')
		.find((candidate) => candidate.text().trim() === label)
	expect(button).toBeDefined()
	return button!
}

describe('PanelTrackEnrichmentSource', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
	})

	it('keeps the Rekordbox path compact while preserving file and drop actions', async () => {
		const wrapper = await mountSource('rekordboxXml', 'library.xml')

		expect(wrapper.text()).toContain('library.xml')
		expect(wrapper.text()).toContain('Export help')
		expect(wrapper.text()).toContain('Blank BPM + key only')
		expect(wrapper.text()).not.toContain(
			'Choose where the track data comes from'
		)
		expect(wrapper.text()).not.toContain('Export your collection')

		await getButton(wrapper, 'Replace XML').trigger('click')
		expect(wrapper.emitted('selectFile')).toHaveLength(1)

		const droppedFile = new File(['<DJ_PLAYLISTS />'], 'dropped.xml', {
			type: 'text/xml'
		})
		await wrapper.get('[aria-busy="false"]').trigger('drop', {
			dataTransfer: { files: [droppedFile] }
		})
		expect(wrapper.emitted('dropFile')?.[0]).toEqual([droppedFile])
	})

	it('switches source without adding another explanatory screen', async () => {
		const wrapper = await mountSource('localAudio')
		const sources = wrapper.findAll('[role="radio"]')

		expect(sources).toHaveLength(2)
		expect(sources[1]?.attributes('aria-checked')).toBe('true')
		expect(wrapper.find('[data-testid="local-audio-panel"]').exists()).toBe(
			true
		)

		await sources[0]?.trigger('click')
		expect(wrapper.emitted('selectSource')?.[0]).toEqual(['rekordboxXml'])
	})
})
