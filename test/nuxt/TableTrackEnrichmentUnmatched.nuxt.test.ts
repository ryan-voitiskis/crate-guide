import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TableTrackEnrichmentUnmatched from '~/components/enrichment/TableTrackEnrichmentUnmatched.vue'
import { createLocalAudioTrackSource } from '~/utils/localAudio'
import type { TrackEnrichmentRow } from '~/utils/trackEnrichment'

const wrappers = new Set<VueWrapper>()

function createUnmatchedRow(): TrackEnrichmentRow {
	return {
		id: 'unmatched-row',
		source: createLocalAudioTrackSource({
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
		}),
		track: null,
		record: null,
		confidence: 'manual',
		score: 0,
		reasons: [],
		warnings: ['No matching Crate Guide track found'],
		proposedBpm: 130,
		proposedKey: 0,
		proposedMode: 1,
		proposedBpmSource: 'embeddedTags',
		proposedKeyModeSource: 'embeddedTags',
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

describe('TableTrackEnrichmentUnmatched', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		document.body.innerHTML = ''
	})

	it('reduces unmatched rows to source track facts', async () => {
		const wrapper = await mountSuspended(TableTrackEnrichmentUnmatched, {
			props: {
				rows: [createUnmatchedRow()],
				keyFormat: 'key',
				sourceLabel: 'Local audio',
				density: 'compact',
				sortKey: null,
				sortDirection: 'asc'
			}
		})
		wrappers.add(wrapper)
		const desktopTable = wrapper.get(
			'[data-testid="enrichment-unmatched-desktop-table"]'
		)

		expect(desktopTable.findAll('thead th')).toHaveLength(4)
		expect(desktopTable.text()).toContain('Local audio track')
		expect(desktopTable.text()).toContain('Source Track')
		expect(desktopTable.text()).toContain('3:00')
		expect(desktopTable.text()).toContain('130.0')
		expect(
			wrapper.findAll('[data-testid="enrichment-unmatched-mobile-row"]')
		).toHaveLength(1)
		expect(wrapper.text()).not.toContain('Unavailable')
		expect(wrapper.text()).not.toContain('No collection match')
		expect(wrapper.text()).not.toContain('Match quality')
		expect(wrapper.text()).not.toContain('Score 0')
		expect(wrapper.text()).not.toContain('No matching Crate Guide track found')
	})

	it('emits source-oriented sorting', async () => {
		const wrapper = await mountSuspended(TableTrackEnrichmentUnmatched, {
			props: {
				rows: [createUnmatchedRow()],
				keyFormat: 'key',
				sourceLabel: 'Local audio',
				density: 'compact',
				sortKey: null,
				sortDirection: 'asc'
			}
		})
		wrappers.add(wrapper)

		await wrapper
			.findAll('button')
			.find((button) => button.text().trim() === 'BPM')
			?.trigger('click')

		expect(wrapper.emitted('sort')).toEqual([['bpm']])
	})
})
