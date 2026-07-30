import { nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DialogSetManager from '~/components/session/DialogSetManager.vue'

const workbenchMocks = vi.hoisted(() => ({
	session: {
		showSetManager: true,
		selectedSetId: 'set-1' as string | null,
		savedSets: [] as SavedSet[],
		isLoadingSets: false,
		fetchSavedSets: vi.fn(),
		deleteSet: vi.fn()
	},
	tracks: {
		getTrackById: vi.fn()
	}
}))

mockNuxtImport('useWorkbenchSessionStore', () => () => workbenchMocks.session)
mockNuxtImport('useWorkbenchTracksStore', () => () => workbenchMocks.tracks)

const wrappers = new Set<VueWrapper>()

function createSavedSet(entries: PlayedTrackEntry[]): SavedSet {
	return {
		id: 'set-1',
		user_id: 'user-1',
		name: 'Historical set',
		played_tracks: entries,
		created_at: '2026-07-22T00:00:00.000Z',
		updated_at: '2026-07-22T00:00:00.000Z'
	}
}

async function mountManager() {
	const wrapper = await mountSuspended(DialogSetManager)
	wrappers.add(wrapper)
	await nextTick()
	await flushPromises()
	await nextTick()
	return new DOMWrapper(document.body)
}

describe('saved set history presentation', () => {
	beforeEach(() => {
		workbenchMocks.session.showSetManager = true
		workbenchMocks.session.selectedSetId = 'set-1'
		workbenchMocks.session.isLoadingSets = false
		workbenchMocks.tracks.getTrackById.mockReset()
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('prefers immutable snapshots and keeps deleted tracks readable', async () => {
		workbenchMocks.session.savedSets = [
			createSavedSet([
				{
					track_id: 'edited-live-track',
					time_added: 1,
					adjusted_bpm: 128,
					transition_rating: null,
					track_title: 'Original title',
					artist_display: 'Original artist'
				},
				{
					track_id: 'deleted-track',
					time_added: 2,
					adjusted_bpm: 129,
					transition_rating: 4,
					track_title: 'Deleted title',
					artist_display: 'Deleted artist'
				}
			])
		]
		workbenchMocks.tracks.getTrackById.mockImplementation((trackId: string) =>
			trackId === 'edited-live-track'
				? createMockTrack({
						id: trackId,
						title: 'Edited live title',
						artists: [{ discogs_id: 9, name: 'Edited live artist', role: null }]
					})
				: undefined
		)

		const body = await mountManager()

		expect(body.text()).toContain('Original title')
		expect(body.text()).toContain('Original artist')
		expect(body.text()).not.toContain('Edited live title')
		expect(body.text()).not.toContain('Edited live artist')
		expect(body.text()).toContain('Deleted title')
		expect(body.text()).toContain('Deleted artist')
		expect(body.text()).toContain('No longer in library')
	})

	it('enriches legacy entries from live data and labels unavailable tracks', async () => {
		workbenchMocks.session.savedSets = [
			createSavedSet([
				{
					track_id: 'legacy-live-track',
					time_added: 1,
					adjusted_bpm: null,
					transition_rating: null
				},
				{
					track_id: 'legacy-missing-track',
					time_added: 2,
					adjusted_bpm: null,
					transition_rating: null
				}
			])
		]
		workbenchMocks.tracks.getTrackById.mockImplementation((trackId: string) =>
			trackId === 'legacy-live-track'
				? createMockTrack({
						id: trackId,
						title: 'Legacy live title',
						artists: [{ discogs_id: 7, name: 'Legacy live artist', role: null }]
					})
				: undefined
		)

		const body = await mountManager()

		expect(body.text()).toContain('Legacy live title')
		expect(body.text()).toContain('Legacy live artist')
		expect(body.text()).toContain('Unknown track')
		expect(body.text()).toContain('Artist unavailable')
		expect(body.text()).toContain('No longer in library')
	})
})
