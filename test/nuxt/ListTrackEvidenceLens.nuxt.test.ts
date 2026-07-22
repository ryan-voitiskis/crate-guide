import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import {
	currentTrackEvidenceV2Golden,
	legacyTrackAudioFeaturesV1Golden
} from 'test/fixtures/trackEvidence'
import { createMockLibraryRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, describe, expect, it } from 'vitest'
import ListTrackEvidenceLens from '~/components/library/ListTrackEvidenceLens.vue'
import { deriveTrackEvidenceLensRows } from '~/utils/trackEvidenceLens'
import type { LibraryRecord, LibraryTrack } from '~~/shared/types/library'

const wrappers = new Set<VueWrapper>()

function trackWithEvidence(
	id: string,
	evidence: unknown,
	overrides: Partial<LibraryTrack> = {}
): LibraryTrack {
	return {
		...createMockTrack({
			id,
			record_id: `record-${id}`,
			title: `Track ${id}`,
			bpm: 128,
			key: 5,
			mode: 0
		}),
		audio_features: evidence,
		...overrides
	} as LibraryTrack
}

function buildFixtureTracks(): LibraryTrack[] {
	const conflict = structuredClone(currentTrackEvidenceV2Golden)
	conflict.sources.embeddedTags!.data.bpm = 131
	const insufficient = structuredClone(currentTrackEvidenceV2Golden)
	insufficient.applied = { bpm: null, keyMode: null }
	delete insufficient.sources.embeddedTags
	delete insufficient.sources.essentiaBrowser

	return [
		trackWithEvidence('current', currentTrackEvidenceV2Golden),
		trackWithEvidence('changed-conflict', conflict, { bpm: 129 }),
		trackWithEvidence('insufficient', insufficient),
		trackWithEvidence('legacy', legacyTrackAudioFeaturesV1Golden),
		trackWithEvidence('none', null, { bpm: null, key: null, mode: null }),
		trackWithEvidence('malformed', {
			version: 2,
			sources: { rekordboxXml: { locationHint: '/private/audio.wav' } }
		})
	]
}

function buildRecords(tracks: readonly LibraryTrack[]): LibraryRecord[] {
	return tracks.map((track) =>
		createMockLibraryRecord({
			id: track.record_id,
			title: `Release ${track.id}`
		})
	)
}

async function mountLens(
	tracks: readonly LibraryTrack[],
	options: { compact?: boolean; records?: readonly LibraryRecord[] } = {}
) {
	const wrapper = await mountSuspended(ListTrackEvidenceLens, {
		attachTo: document.body,
		props: {
			compact: options.compact ?? false,
			density: 'compact',
			keyFormat: 'key',
			records: options.records ?? buildRecords(tracks),
			rows: deriveTrackEvidenceLensRows(tracks),
			selectedTrackId: null
		}
	})
	wrappers.add(wrapper)
	await nextTick()
	return wrapper
}

describe('ListTrackEvidenceLens', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		document.body.innerHTML = ''
	})

	it('exposes conservative policy, counts, and text labels without write or raw-Evidence affordances', async () => {
		const tracks = buildFixtureTracks()
		const wrapper = await mountLens(tracks)

		expect(wrapper.text()).toContain(
			'Aggregate Agreement requires both BPM and key Agreement'
		)
		expect(wrapper.text()).toContain('track-evidence-agreement-v1')
		expect(
			wrapper.get('[aria-label="Retained Evidence: 4 tracks"]')
		).toBeTruthy()
		expect(
			wrapper.get('[aria-label="No retained Evidence: 1 tracks"]')
		).toBeTruthy()
		expect(
			wrapper.get('[aria-label="Unavailable Evidence: 1 tracks"]')
		).toBeTruthy()
		expect(
			wrapper.get('[aria-label="Rekordbox Evidence retained: 4 tracks"]')
		).toBeTruthy()
		expect(wrapper.get('[aria-label="Conflict: 1 tracks"]')).toBeTruthy()
		expect(
			wrapper.get('[aria-label="Changed since application: 1 tracks"]')
		).toBeTruthy()
		expect(
			wrapper.get('[aria-label="Legacy v1 Evidence: 1 tracks"]')
		).toBeTruthy()
		expect(
			wrapper.get(
				'[data-evidence-track-id="changed-conflict"][aria-label*="overall Conflict"]'
			)
		).toBeTruthy()
		expect(
			wrapper.get(
				'[data-evidence-track-id="insufficient"][aria-label*="overall Insufficient evidence"]'
			)
		).toBeTruthy()
		expect(wrapper.get('[aria-label="Rekordbox: retained"]')).toBeTruthy()
		expect(wrapper.get('[data-evidence-track-id="none"]').text()).toContain(
			'Not set'
		)
		expect(wrapper.get('[data-evidence-track-id="none"]').text()).not.toContain(
			'— BPM'
		)

		const copy = wrapper.text().toLowerCase()
		expect(copy).not.toContain('/private/audio.wav')
		expect(copy).not.toContain('collection.xml')
		expect(copy).not.toMatch(/\bapply\b|\bedit\b|\boverwrite\b/)
		expect(copy).not.toContain('ground truth')
		expect(copy).not.toContain('correctness')
		expect(copy).not.toContain('history')
	})

	it('combines filters over the complete rows and supports selection and keyboard traversal', async () => {
		const tracks = buildFixtureTracks()
		const wrapper = await mountLens(tracks)
		const first = wrapper.get<HTMLElement>('[data-evidence-track-id="current"]')
		first.element.focus()
		await first.trigger('keydown', { key: 'ArrowDown' })
		await nextTick()
		expect(document.activeElement?.getAttribute('data-evidence-track-id')).toBe(
			'changed-conflict'
		)

		await wrapper.get('[aria-label="Conflict: 1 tracks"]').trigger('click')
		await flushPromises()
		const list = wrapper.get('[data-testid="evidence-track-rows"]')
		expect(list.attributes('data-virtual-total-count')).toBe('1')
		expect(wrapper.find('[data-evidence-track-id="current"]').exists()).toBe(
			false
		)
		const conflictRow = wrapper.get(
			'[data-evidence-track-id="changed-conflict"]'
		)
		await conflictRow.trigger('click')
		expect(wrapper.emitted('select')).toEqual([['changed-conflict']])
		expect(
			wrapper
				.get('[aria-label="Conflict: 1 tracks"]')
				.attributes('aria-pressed')
		).toBe('true')

		await wrapper
			.get('[aria-label="Changed since application: 1 tracks"]')
			.trigger('click')
		await flushPromises()
		expect(list.attributes('data-virtual-total-count')).toBe('1')
		const clearFilters = wrapper
			.findAll('button')
			.find((button) => button.text().trim() === 'Clear Evidence filters')
		expect(clearFilters).toBeTruthy()
		await clearFilters!.trigger('click')
		await flushPromises()
		expect(list.attributes('data-virtual-total-count')).toBe('6')
	})

	it('keeps ten thousand rows filterable while bounding the mounted DOM', async () => {
		const tracks = Array.from({ length: 10_000 }, (_, index) =>
			trackWithEvidence(
				`track-${String(index).padStart(5, '0')}`,
				index === 9_999 ? { version: 2 } : null
			)
		)
		const wrapper = await mountLens(tracks, { records: [] })
		const list = wrapper.get('[data-testid="evidence-track-rows"]')

		expect(list.attributes('data-virtual-total-count')).toBe('10000')
		expect(wrapper.findAll('[data-virtual-item]').length).toBeLessThanOrEqual(
			48
		)
		expect(
			wrapper.find('[data-evidence-track-id="track-09999"]').exists()
		).toBe(false)

		await wrapper
			.get('[aria-label="Unavailable Evidence: 1 tracks"]')
			.trigger('click')
		await flushPromises()
		expect(list.attributes('data-virtual-total-count')).toBe('1')
		expect(wrapper.get('[data-evidence-track-id="track-09999"]')).toBeTruthy()
	})

	it('keeps the compact row readable without exposing desktop-only columns', async () => {
		const wrapper = await mountLens(
			[trackWithEvidence('compact', currentTrackEvidenceV2Golden)],
			{ compact: true }
		)

		expect(wrapper.find('[data-evidence-track-id="compact"]').exists()).toBe(
			true
		)
		expect(wrapper.text()).toContain('Sources 3/3')
		expect(wrapper.text()).toContain('Agreement')
		expect(wrapper.text()).toContain('BPM Applied · Key Applied · Current v2')
		expect(wrapper.text()).not.toContain('Source coverage')
	})
})
