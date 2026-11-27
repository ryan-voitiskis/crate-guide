import { reactive, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InspectorTrack from '~/components/library/InspectorTrack.vue'
import PanelTrackTransitions from '~/components/library/PanelTrackTransitions.vue'
import type { LibrarySavedSet, LibraryTrack } from '~~/shared/types/library'

const factories = vi.hoisted(() => ({
	preferences: vi.fn(),
	runtime: vi.fn(),
	session: vi.fn(),
	tracks: vi.fn()
}))

mockNuxtImport('useWorkbenchRuntime', () => factories.runtime)
mockNuxtImport('useWorkbenchPreferencesStore', () => factories.preferences)
mockNuxtImport('useWorkbenchSessionStore', () => factories.session)
mockNuxtImport('useWorkbenchTracksStore', () => factories.tracks)

const libraryTracks = new Map<string, LibraryTrack>()
const session = reactive({
	savedSets: [] as LibrarySavedSet[],
	isLoadingSets: false,
	fetchSavedSets: vi.fn()
})

// A successful fetch publishes a new array (even when empty); a failed one
// leaves the array untouched, as in sessionSavedSets.
function fetchSucceeds(sets?: LibrarySavedSet[]) {
	session.fetchSavedSets.mockImplementation(() => {
		session.savedSets = sets ? [...sets] : [...session.savedSets]
		return Promise.resolve()
	})
}

function fetchFails() {
	session.fetchSavedSets.mockImplementation(() => Promise.resolve())
}

function createRuntime(
	options: {
		workspaceId?: string
		canPersistSessions?: boolean
		readOnly?: boolean
	} = {}
) {
	const descriptor = ref({
		id: options.workspaceId ?? 'cloud:user-a',
		repositoryId: 'cloud-supabase',
		readOnly: options.readOnly ?? false,
		capabilities: { canPersistSessions: options.canPersistSessions ?? true }
	})
	const context = () => ({
		workspaceId: descriptor.value.id,
		repositoryId: descriptor.value.repositoryId,
		activationGeneration: 1
	})
	return {
		descriptor,
		capture: () => ({ descriptor: descriptor.value, context: context() }),
		isCurrent: (candidate: { workspaceId: string }) =>
			candidate.workspaceId === descriptor.value.id
	}
}
const wrappers = new Set<VueWrapper>()

function addTrack(id: string, title: string, artist = `${title} Artist`) {
	libraryTracks.set(
		id,
		createMockTrack({
			id,
			title,
			artists: [{ discogs_id: 1, name: artist, role: null }]
		}) as LibraryTrack
	)
}

/** A saved set that plays `trackIds` in order; `ratings[i]` rates i-1 → i. */
function savedSet(
	trackIds: string[],
	ratings: (number | null)[] = []
): LibrarySavedSet {
	return {
		id: `set-${trackIds.join('-')}-${Math.random()}`,
		name: null,
		created_at: null,
		updated_at: null,
		played_tracks: trackIds.map((trackId, index) => ({
			track_id: trackId,
			time_added: index,
			adjusted_bpm: null,
			transition_rating: ratings[index] ?? null
		}))
	}
}

async function mountPanel(trackId = 'hub') {
	const wrapper = await mountSuspended(PanelTrackTransitions, {
		props: { trackId }
	})
	wrappers.add(wrapper)
	return wrapper
}

function rowTitles(wrapper: VueWrapper, direction: 'incoming' | 'outgoing') {
	return wrapper
		.findAll(`[data-testid="track-transitions-${direction}"] li`)
		.map((row) => row.find('p').text())
}

describe('PanelTrackTransitions', () => {
	beforeEach(() => {
		libraryTracks.clear()
		session.savedSets = []
		session.isLoadingSets = false
		factories.runtime.mockReturnValue(createRuntime())
		fetchSucceeds()
		factories.preferences.mockReturnValue({ currentKeyFormat: 'key' })
		factories.session.mockReturnValue(session)
		factories.tracks.mockReturnValue({
			getTrackById: (id: string) => libraryTracks.get(id)
		})
		for (const [id, title] of [
			['hub', 'Hub'],
			['warm', 'Warm Up'],
			['peak', 'Peak Time'],
			['ok', 'Okay Blend'],
			['bad', 'Clash'],
			['plain', 'Unrated Pick'],
			['next-1', 'Next Best'],
			['next-2', 'Next Worse']
		] as const) {
			addTrack(id, title)
		}
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
	})

	it('lists the best three transitions into and out of the track', async () => {
		session.savedSets = [
			savedSet(['bad', 'hub'], [null, 1]),
			savedSet(['plain', 'hub']),
			savedSet(['ok', 'hub'], [null, 3]),
			savedSet(['warm', 'hub'], [null, 4]),
			savedSet(['peak', 'hub'], [null, 5]),
			savedSet(['peak', 'hub'], [null, 4]),
			savedSet(['hub', 'next-2'], [null, 2]),
			savedSet(['hub', 'next-1', 'hub'], [null, 5, 1])
		]

		const wrapper = await mountPanel()

		expect(wrapper.text()).toContain('Transition history')
		expect(rowTitles(wrapper, 'incoming')).toEqual([
			'Peak Time',
			'Warm Up',
			'Okay Blend'
		])
		expect(rowTitles(wrapper, 'outgoing')).toEqual(['Next Best', 'Next Worse'])
		const peak = wrapper.get('[data-testid="track-transitions-incoming"] li')
		expect(peak.attributes('title')).toBe('Played before this 2×, avg 4.5★')
		expect(peak.text().replace(/\s+/g, ' ')).toContain('4.5★ · 2×')
		expect(peak.get('.sr-only').text()).toBe(
			'Played before this 2 times, average 4.5 stars'
		)
	})

	it('marks unrated pairs and skips tracks no longer in the library', async () => {
		session.savedSets = [
			savedSet(['deleted', 'hub'], [null, 5]),
			savedSet(['plain', 'hub'])
		]

		const wrapper = await mountPanel()

		expect(rowTitles(wrapper, 'incoming')).toEqual(['Unrated Pick'])
		expect(wrapper.text().replace(/\s+/g, ' ')).toContain('unrated · 1×')
		expect(
			wrapper.find('[data-testid="track-transitions-outgoing"]').exists()
		).toBe(false)
	})

	it('renders nothing without history', async () => {
		const wrapper = await mountPanel()

		expect(wrapper.find('[data-testid="track-transitions"]').exists()).toBe(
			false
		)
	})

	it('updates when saved sets arrive after mount', async () => {
		fetchFails()
		const wrapper = await mountPanel()
		session.savedSets = [savedSet(['hub', 'next-1'], [null, 5])]
		await wrapper.vm.$nextTick()

		expect(rowTitles(wrapper, 'outgoing')).toEqual(['Next Best'])
	})

	it('fetches once per workspace activation, even for an empty library', async () => {
		await mountPanel('hub')
		await mountPanel('warm')
		await mountPanel('peak')

		expect(session.fetchSavedSets).toHaveBeenCalledTimes(1)
	})

	it('retries on the next mount after a failed fetch', async () => {
		fetchFails()
		await mountPanel()
		await mountPanel()

		expect(session.fetchSavedSets).toHaveBeenCalledTimes(2)
	})

	it('replaces sets left over from another workspace', async () => {
		// Sets from account A are still in the store when account B's workbench
		// mounts (the reset ran while no workbench was mounted).
		session.savedSets = [savedSet(['warm', 'hub'], [null, 5])]
		const runtime = createRuntime({ workspaceId: 'cloud:user-a' })
		factories.runtime.mockReturnValue(runtime)
		await mountPanel()
		expect(session.fetchSavedSets).toHaveBeenCalledTimes(1)

		runtime.descriptor.value = {
			...runtime.descriptor.value,
			id: 'cloud:user-b'
		}
		fetchSucceeds([])
		const wrapper = await mountPanel()

		expect(session.fetchSavedSets).toHaveBeenCalledTimes(2)
		await wrapper.vm.$nextTick()
		expect(wrapper.find('[data-testid="track-transitions"]').exists()).toBe(
			false
		)
	})

	it('does not fetch in workspaces that do not keep sessions', async () => {
		factories.runtime.mockReturnValue(
			createRuntime({ canPersistSessions: false })
		)
		await mountPanel()
		factories.runtime.mockReturnValue(createRuntime({ readOnly: true }))
		await mountPanel()

		expect(session.fetchSavedSets).not.toHaveBeenCalled()
	})

	it('appears in the track inspector', async () => {
		session.savedSets = [savedSet(['warm', 'hub'], [null, 5])]

		const wrapper = await mountSuspended(InspectorTrack, {
			props: { track: libraryTracks.get('hub')!, record: null, readOnly: true }
		})
		wrappers.add(wrapper)

		await vi.waitFor(() =>
			expect(wrapper.text()).toContain('Transition history')
		)
		expect(wrapper.text()).toContain('Warm Up')
	})
})
