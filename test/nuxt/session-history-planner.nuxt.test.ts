import { computed, nextTick, reactive, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PanelSessionHistory from '~/components/session/PanelSessionHistory.vue'
import { createSessionPlayback } from '~/stores/sessionPlayback'
import type {
	LibraryCrate,
	LibraryPlayedTrackEntry,
	LibraryTrack
} from '~~/shared/types/library'

const mocks = vi.hoisted(() => ({
	session: null as unknown,
	tracks: null as unknown,
	crates: null as unknown,
	capabilities: { canManageCrates: true } as { canManageCrates: boolean },
	readOnly: false,
	toast: Object.assign(vi.fn(), {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warning: vi.fn()
	})
}))

vi.mock('vue-sonner', () => ({ toast: mocks.toast }))

mockNuxtImport('useWorkbenchSessionStore', () => () => mocks.session)
mockNuxtImport('useWorkbenchTracksStore', () => () => mocks.tracks)
mockNuxtImport('useWorkbenchCratesStore', () => () => mocks.crates)
mockNuxtImport('useWorkbenchPreferencesStore', () => () => ({
	currentKeyFormat: 'camelot'
}))
mockNuxtImport('useWorkbenchCapabilities', () => () => mocks.capabilities)
mockNuxtImport('useWorkbenchRuntime', () => () => ({
	descriptor: computed(() => ({ readOnly: mocks.readOnly }))
}))

const wrappers = new Set<VueWrapper>()

function createTracks(): LibraryTrack[] {
	return [
		createMockTrack({ id: 'A', record_id: 'rec-1', title: 'Alpha', bpm: 120 }),
		createMockTrack({ id: 'B', record_id: 'rec-2', title: 'Bravo', bpm: 124 }),
		createMockTrack({
			id: 'C',
			record_id: 'rec-1',
			title: 'Charlie',
			bpm: 126
		}),
		createMockTrack({ id: 'D', record_id: 'rec-3', title: 'Delta', bpm: 128 })
	]
}

function entry(
	track: LibraryTrack,
	rating: number | null
): LibraryPlayedTrackEntry {
	return {
		track_id: track.id,
		time_added: track.id.charCodeAt(0),
		adjusted_bpm: null,
		transition_rating: rating,
		track_title: track.title,
		artist_display: 'Artist'
	}
}

/**
 * A session store stand-in built on the real playback module, so moves,
 * removals, ratings and undo run the production code.
 */
function setUpStores(library: LibraryTrack[]) {
	const byId = new Map(library.map((track) => [track.id, track]))
	const playback = createSessionPlayback({
		pitchRange: ref(8),
		getTrackById: (id) => byId.get(id),
		getPlayableTracks: () => library
	})
	playback.currentSession.value = [
		entry(library[0]!, null),
		entry(library[1]!, 4),
		entry(library[2]!, 5),
		entry(library[3]!, 3)
	]
	mocks.session = reactive({
		...playback,
		showHistory: true,
		activeSetId: null,
		savedSets: [],
		clearSession: playback.clearPlaybackSession
	})
	mocks.tracks = { getTrackById: (id: string) => byId.get(id) }

	const crateList = ref<LibraryCrate[]>([
		{
			id: 'crate-1',
			name: 'Existing',
			description: null,
			color: null,
			records: ['rec-2'],
			created_at: null,
			updated_at: null
		}
	])
	const crates = reactive({
		crates: crateList,
		getCrateById: (id: string) =>
			crateList.value.find((item) => item.id === id),
		createCrate: vi.fn(async (input: Pick<LibraryCrate, 'name'>) => {
			const created: LibraryCrate = {
				id: 'crate-new',
				description: null,
				color: null,
				records: [],
				created_at: null,
				updated_at: null,
				...input
			}
			crateList.value = [...crateList.value, created]
			return created
		}),
		addRecordToCrate: vi.fn(async (crateId: string, recordId: string) => {
			crateList.value = crateList.value.map((item) =>
				item.id === crateId
					? { ...item, records: [...item.records, recordId] }
					: item
			)
			return true
		})
	})
	mocks.crates = crates
	return { playback, crates }
}

async function mountPanel() {
	const wrapper = await mountSuspended(PanelSessionHistory, {
		attachTo: document.body
	})
	wrappers.add(wrapper)
	await flushPromises()
	return wrapper
}

function titles(wrapper: VueWrapper) {
	return wrapper.findAll('li').map((item) => item.find('.font-medium').text())
}

function ratingRows(wrapper: VueWrapper) {
	return wrapper
		.findAll('li')
		.map((item) => item.text().includes('Transition:'))
}

describe('session history planner', () => {
	beforeEach(() => {
		mocks.capabilities.canManageCrates = true
		mocks.readOnly = false
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('moves an entry up with its button, keeps focus on it and clears broken ratings', async () => {
		const { playback } = setUpStores(createTracks())
		const wrapper = await mountPanel()

		await wrapper
			.findAll('[data-history-action="move-up"]')[3]!
			.trigger('click')
		await flushPromises()

		expect(titles(wrapper)).toEqual(['Alpha', 'Bravo', 'Delta', 'Charlie'])
		expect(
			playback.currentSession.value.map((item) => item.transition_rating)
		).toEqual([null, 4, null, null])
		expect(document.activeElement?.getAttribute('data-history-action')).toBe(
			'move-up'
		)
		expect(
			document.activeElement?.closest('li')?.getAttribute('data-history-index')
		).toBe('2')
		expect(wrapper.find('[data-testid="history-announcement"]').text()).toBe(
			'Delta moved to position 3 of 4. 2 transition ratings cleared.'
		)
		expect(mocks.toast).toHaveBeenCalledWith(
			'Moved. 2 transition ratings cleared.',
			expect.objectContaining({
				action: expect.objectContaining({ label: 'Undo' })
			})
		)
	})

	it('undoes the move from the toast action', async () => {
		const { playback } = setUpStores(createTracks())
		const wrapper = await mountPanel()
		await wrapper
			.findAll('[data-history-action="move-up"]')[3]!
			.trigger('click')

		const options = mocks.toast.mock.calls[0]![1] as {
			action: { onClick: () => void }
		}
		options.action.onClick()
		await flushPromises()

		expect(titles(wrapper)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])
		expect(
			playback.currentSession.value.map((item) => item.transition_rating)
		).toEqual([null, 4, 5, 3])
	})

	it('moves with Alt+Arrow keys and shows no rating on the new first entry', async () => {
		setUpStores(createTracks())
		const wrapper = await mountPanel()

		await wrapper.findAll('li')[1]!.trigger('keydown', {
			key: 'ArrowUp',
			altKey: true
		})
		await flushPromises()

		expect(titles(wrapper)).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta'])
		expect(ratingRows(wrapper)).toEqual([false, true, true, true])
		expect(document.activeElement?.getAttribute('data-history-index')).toBe('0')

		// Plain arrows scroll the list instead of moving entries.
		await wrapper.findAll('li')[0]!.trigger('keydown', { key: 'ArrowDown' })
		expect(titles(wrapper)[0]).toBe('Bravo')
	})

	it('disables moving past either end', async () => {
		setUpStores(createTracks())
		const wrapper = await mountPanel()
		const up = wrapper.findAll('[data-history-action="move-up"]')
		const down = wrapper.findAll('[data-history-action="move-down"]')

		expect(up[0]!.attributes('disabled')).toBeDefined()
		expect(down[3]!.attributes('disabled')).toBeDefined()
		expect(up[0]!.attributes('aria-label')).toBe('Move track 1 up')
	})

	it('removes an entry, focuses the next one and offers undo', async () => {
		const { playback } = setUpStores(createTracks())
		const wrapper = await mountPanel()

		await wrapper.findAll('[data-history-action="remove"]')[1]!.trigger('click')
		await flushPromises()

		expect(titles(wrapper)).toEqual(['Alpha', 'Charlie', 'Delta'])
		expect(
			playback.currentSession.value.map((item) => item.transition_rating)
		).toEqual([null, null, 3])
		expect(document.activeElement?.getAttribute('data-history-index')).toBe('1')
		expect(mocks.toast).toHaveBeenCalledWith(
			'Bravo removed from the set. 1 transition rating cleared.',
			expect.anything()
		)
	})

	it('keeps focus in the panel after removing the only entry', async () => {
		const { playback } = setUpStores(createTracks())
		playback.currentSession.value = playback.currentSession.value.slice(0, 1)
		const wrapper = await mountPanel()

		await wrapper.find('[data-history-action="remove"]').trigger('click')
		await flushPromises()

		expect(wrapper.findAll('li')).toHaveLength(0)
		expect(document.activeElement?.getAttribute('aria-label')).toBe(
			'Session history'
		)
	})

	it('labels the transition rating stars for assistive technology', async () => {
		setUpStores(createTracks())
		const wrapper = await mountPanel()

		const stars = wrapper.findAll('li')[1]!.findAll('[role="group"] button')
		expect(stars.map((star) => star.attributes('aria-label'))).toEqual([
			'1 of 5 stars',
			'2 of 5 stars',
			'3 of 5 stars',
			'4 of 5 stars',
			'5 of 5 stars'
		])
		expect(stars[3]!.attributes('aria-pressed')).toBe('true')
	})

	it('reorders by drag and drop as well', async () => {
		setUpStores(createTracks())
		const wrapper = await mountPanel()
		const items = wrapper.findAll('li')

		await items[0]!.trigger('dragstart')
		await items[2]!.trigger('dragover')
		await items[2]!.trigger('drop')
		await flushPromises()

		expect(titles(wrapper)).toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta'])
	})

	it('draws a BPM arc with one point per track that has a BPM', async () => {
		setUpStores(createTracks())
		const wrapper = await mountPanel()

		const arc = wrapper.find('[data-testid="session-bpm-arc"]')
		expect(arc.find('polyline').attributes('points')!.split(' ')).toHaveLength(
			4
		)
		expect(arc.find('svg').attributes('aria-label')).toBe(
			'BPM arc across 4 tracks: starts at 120, ranges 120 to 128, ends at 128.'
		)
	})

	it('packs the set into a new crate through the crate store', async () => {
		const { crates } = setUpStores(createTracks())
		const wrapper = await mountPanel()

		const packButton = wrapper
			.findAll('button')
			.find((button) => button.text().includes('Pack this set'))!
		await packButton.trigger('click')
		await flushPromises()

		const dialog = document.body
		expect(dialog.textContent).toContain('Put the 3 records from this set')
		const nameInput = dialog.querySelector<HTMLInputElement>(
			'#pack-set-crate-name'
		)!
		expect(nameInput.value).toMatch(/^Set \d{4}-\d{2}-\d{2}$/)
		dialog.querySelector('form')!.dispatchEvent(new Event('submit'))
		await flushPromises()

		expect(crates.createCrate).toHaveBeenCalledOnce()
		expect(crates.addRecordToCrate.mock.calls.map((call) => call[1])).toEqual([
			'rec-1',
			'rec-2',
			'rec-3'
		])
		expect(mocks.toast.success).toHaveBeenCalledWith(
			expect.stringContaining('3 records added.')
		)
	})

	it('disables packing where crates cannot change', async () => {
		mocks.capabilities.canManageCrates = false
		setUpStores(createTracks())
		const wrapper = await mountPanel()

		const packButton = wrapper
			.findAll('button')
			.find((button) => button.text().includes('Pack this set'))!
		expect(packButton.attributes('disabled')).toBeDefined()
		expect(document.querySelector('#pack-set-crate-name')).toBeNull()
	})

	it('treats a read-only workbench like missing crate capability', async () => {
		mocks.readOnly = true
		setUpStores(createTracks())
		const wrapper = await mountPanel()

		const packButton = wrapper
			.findAll('button')
			.find((button) => button.text().includes('Pack this set'))!
		expect(packButton.attributes('disabled')).toBeDefined()
	})

	it('hides the planner tools for an empty history', async () => {
		const { playback } = setUpStores(createTracks())
		playback.currentSession.value = []
		const wrapper = await mountPanel()

		expect(wrapper.find('[data-testid="session-planner-tools"]').exists()).toBe(
			false
		)
		expect(wrapper.text()).toContain('No tracks played yet')
	})
})

describe('session history export', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		vi.unstubAllGlobals()
		document.body.innerHTML = ''
	})

	it('copies CSV with the key format through the export menu', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
		setUpStores(createTracks())
		const wrapper = await mountPanel()

		const trigger = wrapper
			.findAll('button')
			.find((button) => button.text().includes('Export'))!
		await trigger.trigger('pointerdown', { button: 0, pointerType: 'mouse' })
		await trigger.trigger('keydown', { key: 'Enter' })
		await flushPromises()
		await nextTick()

		const csvItem = [
			...document.querySelectorAll<HTMLElement>('[role="menuitem"]')
		].find((item) => item.textContent?.trim() === 'CSV')
		expect(csvItem).toBeDefined()
		csvItem!.click()
		await flushPromises()

		expect(writeText).toHaveBeenCalledOnce()
		const csv = writeText.mock.calls[0]![0] as string
		expect(csv.split('\r\n').slice(0, 2)).toEqual([
			'Position,Artist,Title,BPM,Key',
			'1,Artist,Alpha,120.0,5A'
		])
		expect(mocks.toast.success).toHaveBeenCalledWith('Set list copied as CSV.')
	})
})
