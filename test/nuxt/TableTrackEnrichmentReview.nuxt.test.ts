import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, describe, expect, it } from 'vitest'
import TableTrackEnrichmentReview from '~/components/enrichment/TableTrackEnrichmentReview.vue'
import Checkbox from '~/components/ui/checkbox/Checkbox.vue'
import { createLocalAudioTrackSource } from '~/utils/localAudio'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'

const wrappers = new Set<VueWrapper>()

function createRow(
	overrides: Partial<TrackEnrichmentRow> = {}
): TrackEnrichmentRow {
	const track = createMockTrack({ id: 'track-1', record_id: 'record-1' })
	const record = createMockRecord({ id: 'record-1' })
	const source = createLocalAudioTrackSource({
		index: 0,
		fileName: 'source-track.mp3',
		relativePath: 'Album/source-track.mp3',
		fileSize: 1024,
		lastModified: 1,
		tags: {
			title: 'Source Track',
			artist: 'Source Artist',
			album: 'Source Album',
			genres: ['House'],
			durationSeconds: 180,
			bpm: 130,
			key: 'C major'
		},
		analysis: null
	})

	return {
		id: 'row-1',
		source,
		track,
		record,
		confidence: 'high',
		score: 100,
		reasons: ['Exact title match'],
		warnings: [],
		proposedBpm: 130,
		proposedKey: 0,
		proposedMode: 1,
		proposedBpmSource: 'embeddedTags',
		proposedKeyModeSource: 'embeddedTags',
		canFillBpm: true,
		canFillKeyMode: true,
		alreadyComplete: false,
		hasConflict: false,
		stagingBlockedReason: null,
		defaultStaged: true,
		error: null,
		applied: false,
		...overrides
	}
}

async function mountTable(
	rows: TrackEnrichmentRow[],
	overrides: Partial<{
		stagedRowIds: Set<string>
		filteredSelectionState: boolean | 'indeterminate'
		stageableRowCount: number
		isApplying: boolean
	}> = {}
) {
	const wrapper = await mountSuspended(TableTrackEnrichmentReview, {
		props: {
			rows,
			stagedRowIds: new Set<string>(),
			filteredSelectionState: false,
			stageableRowCount: rows.length,
			isApplying: false,
			keyFormat: 'key',
			sourceLabel: 'Local audio',
			density: 'compact',
			sortKey: null,
			sortDirection: 'asc',
			...overrides
		}
	})
	wrappers.add(wrapper)
	return wrapper
}

describe('TableTrackEnrichmentReview', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		document.body.innerHTML = ''
	})

	it('emits row and bulk staging payloads', async () => {
		const row = createRow()
		const wrapper = await mountTable([row])

		await wrapper.get('[aria-label="Stage Source Track"]').trigger('click')
		await wrapper
			.get('[aria-label="Stage all eligible tracks in this view"]')
			.trigger('click')

		expect(wrapper.emitted('stage-row')).toEqual([[row, true]])
		expect(wrapper.emitted('stage-all')).toEqual([[true]])
	})

	it('does not stage blocked rows or rows while applying', async () => {
		const blocked = createRow({
			id: 'blocked-row',
			stagingBlockedReason: 'Ambiguous match'
		})
		const stageable = createRow({ id: 'stageable-row' })
		const wrapper = await mountTable([blocked, stageable])
		const rowCheckboxes = wrapper.findAll(
			'[aria-label^="Stage "]:not([aria-label^="Stage all"])'
		)

		expect(rowCheckboxes[0]?.attributes('disabled')).toBeDefined()
		expect(rowCheckboxes[1]?.attributes('disabled')).toBeUndefined()
		await rowCheckboxes[0]?.trigger('click')
		expect(wrapper.emitted('stage-row')).toBeUndefined()

		await wrapper.setProps({ isApplying: true })
		expect(rowCheckboxes[1]?.attributes('disabled')).toBeDefined()
		await rowCheckboxes[1]?.trigger('click')
		expect(wrapper.emitted('stage-row')).toBeUndefined()
	})

	it('renders key zero as a value instead of an absent marker', async () => {
		const row = createRow({
			track: createMockTrack({ key: null, mode: null }),
			proposedKey: 0,
			proposedMode: 1
		})
		const wrapper = await mountTable([row])
		const keyCell = wrapper.get('tbody tr').findAll('td')[5]
		const proposedValue = keyCell?.findAll('span')[1]

		expect(keyCell).toBeDefined()
		expect(proposedValue).toBeDefined()
		expect(proposedValue?.text()).toBe('C Maj')
	})

	it('forwards indeterminate selection to the bulk checkbox', async () => {
		const wrapper = await mountTable([createRow()], {
			filteredSelectionState: 'indeterminate'
		})
		const bulkCheckbox = wrapper.findAllComponents(Checkbox)[0]

		expect(bulkCheckbox).toBeDefined()
		expect(bulkCheckbox?.props('modelValue')).toBe('indeterminate')
		expect(
			wrapper
				.get('[aria-label="Stage all eligible tracks in this view"]')
				.attributes('aria-checked')
		).toBe('mixed')
	})

	it('emits sortable workbench column selections', async () => {
		const wrapper = await mountTable([createRow()])
		const bpmSort = wrapper
			.findAll('button')
			.find((button) => button.text().trim() === 'BPM')

		expect(bpmSort).toBeDefined()
		await bpmSort?.trigger('click')
		expect(wrapper.emitted('sort')).toEqual([['bpm']])
	})
})
