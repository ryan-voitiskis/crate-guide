import { defineComponent, h, nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SectionRecordTracks from '~/components/records/SectionRecordTracks.vue'
import { useRecordDetailsStore } from '~/stores/recordDetailsStore'
import { useTracksStore } from '~/stores/tracksStore'
import { createKeyComposite } from '~/utils/keyFunctions'
import { TAP_TEMPO_CLOCK } from '~/utils/tapTempo'
import type { LibraryTrack } from '~~/shared/types/library'

const factories = vi.hoisted(() => ({
	capabilities: vi.fn(),
	preferences: vi.fn(),
	tracks: vi.fn()
}))

mockNuxtImport('useWorkbenchCapabilities', () => factories.capabilities)
mockNuxtImport('useWorkbenchPreferencesStore', () => factories.preferences)
mockNuxtImport('useWorkbenchTracksStore', () => factories.tracks)

const wrappers = new Set<VueWrapper>()
const clockQueue: number[] = []

// Camelot 8B is C major.
const EIGHT_B = createKeyComposite(0, 1)

/** Where key presses originate unless a test names another element. */
let keyTarget: Element = document.body

async function settle() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

function createRecordTracks(): LibraryTrack[] {
	return [
		createMockTrack({
			id: 'track-b1',
			record_id: 'record-1',
			title: 'Side B Opener',
			position: 'B1',
			bpm: 124,
			key: 9,
			mode: 0
		}),
		createMockTrack({
			id: 'track-a2',
			record_id: 'record-1',
			title: 'Second Cut',
			position: 'A2',
			bpm: null,
			key: null,
			mode: null
		}),
		createMockTrack({
			id: 'track-a1',
			record_id: 'record-1',
			title: 'Opener',
			position: 'A1',
			bpm: 127.9,
			key: null,
			mode: null
		}),
		createMockTrack({
			id: 'track-untitled',
			record_id: 'record-1',
			title: 'Hidden Track',
			position: null,
			bpm: null,
			key: null,
			mode: null
		})
	] as LibraryTrack[]
}

async function mountSection(options: {
	tracks?: LibraryTrack[]
	canMutateLibrary?: boolean
	updateTrack?: ReturnType<typeof vi.fn>
	keyFormat?: 'camelot' | 'key'
	/** Mount inside an element with role="dialog", like Record Details. */
	inDialog?: boolean
}) {
	const tracks = options.tracks ?? createRecordTracks()
	const updateTrack = options.updateTrack ?? vi.fn().mockResolvedValue(null)
	factories.capabilities.mockReturnValue({
		canMutateLibrary: options.canMutateLibrary ?? true
	})
	factories.preferences.mockReturnValue({
		currentKeyFormat: options.keyFormat ?? 'camelot'
	})
	factories.tracks.mockReturnValue({
		updateTrack,
		fetchAllTracks: vi.fn().mockResolvedValue(true)
	})

	const pinia = createTestingPinia({
		createSpy: vi.fn,
		// The quick-set store must run for real: it owns write state.
		stubActions: (_action, store) => store.$id !== 'trackQuickSet',
		initialState: {
			tracks: { tracks },
			recordDetails: { selectedRecordId: 'record-1' }
		}
	})
	const tracksStore = useTracksStore(pinia as Pinia)
	vi.mocked(tracksStore.getTracksByRecordId).mockImplementation((recordId) =>
		recordId === 'record-1' ? tracks : []
	)
	const recordDetails = useRecordDetailsStore(pinia as Pinia)
	recordDetails.selectedRecordId = 'record-1'

	const component = options.inDialog
		? defineComponent({
				setup: () => () =>
					h('div', { role: 'dialog', 'data-testid': 'dialog-scope' }, [
						h(SectionRecordTracks)
					])
			})
		: SectionRecordTracks
	const wrapper = await mountSuspended(component, {
		attachTo: document.body,
		global: {
			plugins: [pinia],
			provide: { [TAP_TEMPO_CLOCK as symbol]: () => clockQueue.shift() ?? 0 }
		}
	})
	wrappers.add(wrapper)
	await settle()
	keyTarget = wrapper.get('[data-testid="section-record-tracks"]').element
	return { wrapper, recordDetails, updateTrack, tracks }
}

function rowOrder(wrapper: VueWrapper) {
	return wrapper
		.findAll('[data-testid^="record-track-row-"]')
		.map((row) =>
			row.attributes('data-testid')!.replace('record-track-row-', '')
		)
}

function focusedRow(wrapper: VueWrapper) {
	const rows = wrapper.findAll('[data-focused="true"]')
	expect(rows).toHaveLength(1)
	return rows[0]!
}

function focusedId(wrapper: VueWrapper) {
	return focusedRow(wrapper)
		.attributes('data-testid')!
		.replace('record-track-row-', '')
}

async function pressKey(key: string, target: Element = keyTarget) {
	const event = new KeyboardEvent('keydown', {
		key,
		bubbles: true,
		cancelable: true
	})
	target.dispatchEvent(event)
	await settle()
	return event
}

function tapButton(wrapper: VueWrapper) {
	return focusedRow(wrapper).get('[data-testid="tap-tempo-tap"]').element
}

async function enterAnnotation(wrapper: VueWrapper) {
	await wrapper.get('[data-testid="record-tracks-annotate"]').trigger('click')
	await settle()
}

describe('SectionRecordTracks annotation mode', () => {
	beforeEach(() => {
		clockQueue.length = 0
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.restoreAllMocks()
		document.body.innerHTML = ''
	})

	it('lists tracks in position order with formatted BPM and key', async () => {
		const { wrapper } = await mountSection({})

		expect(rowOrder(wrapper)).toEqual([
			'track-a1',
			'track-a2',
			'track-b1',
			'track-untitled'
		])
		expect(
			wrapper.get('[data-testid="record-track-key-track-b1"]').text()
		).toBe('8A')
		expect(
			wrapper.get('[data-testid="record-track-key-track-a1"]').text()
		).toBe('–')
		expect(
			wrapper.get('[data-testid="record-track-bpm-track-a1"]').text()
		).toBe('127.9')
		expect(wrapper.get('[data-testid="record-tracks-progress"]').text()).toBe(
			'1 of 4 tracks have BPM and key'
		)
		expect(wrapper.find('[data-testid="panel-track-quick-set"]').exists()).toBe(
			false
		)
	})

	it('hides the annotate toggle in a read-only workspace', async () => {
		const { wrapper } = await mountSection({ canMutateLibrary: false })
		expect(
			wrapper.find('[data-testid="record-tracks-annotate"]').exists()
		).toBe(false)
		expect(wrapper.text()).toContain('Add Track')
	})

	it('enters annotation on the first track and walks with J, K and arrows, wrapping', async () => {
		const { wrapper } = await mountSection({})
		await enterAnnotation(wrapper)

		expect(focusedId(wrapper)).toBe('track-a1')
		expect(
			wrapper.find('[data-testid="record-tracks-shortcuts"]').exists()
		).toBe(true)
		expect(
			wrapper.findAll('[data-testid="panel-track-quick-set"]')
		).toHaveLength(1)
		expect(wrapper.find('[aria-label="Edit track"]').exists()).toBe(false)

		await pressKey('j')
		expect(focusedId(wrapper)).toBe('track-a2')
		await pressKey('ArrowDown')
		expect(focusedId(wrapper)).toBe('track-b1')
		await pressKey('J')
		expect(focusedId(wrapper)).toBe('track-untitled')
		await pressKey('j')
		expect(focusedId(wrapper)).toBe('track-a1')
		await pressKey('k')
		expect(focusedId(wrapper)).toBe('track-untitled')
		await pressKey('ArrowUp')
		expect(focusedId(wrapper)).toBe('track-b1')
	})

	it('focuses a clicked row and leaves annotation with Escape or Done', async () => {
		const { wrapper } = await mountSection({})
		await enterAnnotation(wrapper)

		await wrapper
			.get('[data-testid="record-track-row-track-b1"]')
			.trigger('click')
		await settle()
		expect(focusedId(wrapper)).toBe('track-b1')

		await pressKey('Escape')
		expect(wrapper.findAll('[data-focused="true"]')).toHaveLength(0)
		expect(wrapper.find('[data-testid="panel-track-quick-set"]').exists()).toBe(
			false
		)
		expect(wrapper.find('[aria-label="Edit track"]').exists()).toBe(true)

		await enterAnnotation(wrapper)
		expect(wrapper.get('[data-testid="record-tracks-annotate"]').text()).toBe(
			'Done'
		)
		await enterAnnotation(wrapper)
		expect(wrapper.get('[data-testid="record-tracks-annotate"]').text()).toBe(
			'Annotate'
		)
	})

	it('forwards Space and Enter to the focused track and writes once', async () => {
		const updateTrack = vi.fn().mockResolvedValue(null)
		const { wrapper } = await mountSection({ updateTrack })
		await enterAnnotation(wrapper)
		clockQueue.push(0, 500, 1000, 1500, 2000)

		for (let index = 0; index < 5; index++) await pressKey(' ')
		expect(
			focusedRow(wrapper).get('[data-testid="tap-tempo-readout"]').text()
		).toContain('120.0')
		expect(updateTrack).not.toHaveBeenCalled()

		await pressKey('Enter')
		expect(updateTrack).toHaveBeenCalledTimes(1)
		expect(updateTrack).toHaveBeenCalledWith(
			'track-a1',
			{ bpm: 120 },
			expect.objectContaining({ silent: true })
		)
	})

	it('does not tap while a text input has focus', async () => {
		const { wrapper, updateTrack } = await mountSection({})
		await enterAnnotation(wrapper)
		const input = document.createElement('input')
		keyTarget.append(input)
		clockQueue.push(0, 500, 1000)

		await pressKey(' ', input)
		await pressKey(' ', input)
		await pressKey('Enter', input)
		expect(
			focusedRow(wrapper).get('[data-testid="tap-tempo-readout"]').text()
		).toContain('—')
		expect(updateTrack).not.toHaveBeenCalled()
		await pressKey('j', input)
		expect(focusedId(wrapper)).toBe('track-a1')
	})

	it('lets arrow keys inside the wheel move the key, not the track', async () => {
		const { wrapper, updateTrack } = await mountSection({})
		await enterAnnotation(wrapper)
		const wheel = focusedRow(wrapper).get('[role="radiogroup"]')

		await pressKey('ArrowDown', wheel.element)
		expect(focusedId(wrapper)).toBe('track-a1')

		await wheel.get(`[data-composite="${EIGHT_B}"]`).trigger('click')
		await settle()
		expect(updateTrack).toHaveBeenCalledWith(
			'track-a1',
			{ key: 0, mode: 1 },
			expect.anything()
		)
	})

	it('resets a tap sequence when the focused track changes', async () => {
		const { wrapper } = await mountSection({})
		await enterAnnotation(wrapper)
		clockQueue.push(0, 500, 1000)
		for (let index = 0; index < 3; index++) await pressKey(' ')
		expect(
			focusedRow(wrapper).get('[data-testid="tap-tempo-readout"]').text()
		).toContain('120.0')

		await pressKey('j')
		expect(
			focusedRow(wrapper).get('[data-testid="tap-tempo-readout"]').text()
		).toContain('—')
	})

	it('ends annotation when the dialog generation changes', async () => {
		const { wrapper, recordDetails } = await mountSection({})
		await enterAnnotation(wrapper)
		expect(wrapper.findAll('[data-focused="true"]')).toHaveLength(1)

		recordDetails.dialogGeneration += 1
		await settle()
		expect(wrapper.findAll('[data-focused="true"]')).toHaveLength(0)
		expect(wrapper.get('[data-testid="record-tracks-annotate"]').text()).toBe(
			'Annotate'
		)
	})

	it('shows singular progress copy and hides the toggle without tracks', async () => {
		const single = await mountSection({
			tracks: [createRecordTracks()[2]!]
		})
		expect(
			single.wrapper.get('[data-testid="record-tracks-progress"]').text()
		).toBe('0 of 1 track has BPM and key')

		const empty = await mountSection({ tracks: [] })
		expect(
			empty.wrapper.find('[data-testid="record-tracks-annotate"]').exists()
		).toBe(false)
		expect(empty.wrapper.text()).toContain('No tracks found')
	})
	it.each([
		{ name: 'J then K', keys: ['j', 'k'], expected: 'track-a1' },
		{
			name: 'K wrapping to the last row',
			keys: ['k'],
			expected: 'track-untitled'
		},
		{
			name: 'J wrapping to the first row',
			keys: ['k', 'j'],
			expected: 'track-a1'
		}
	])(
		'keeps focus and tap shortcuts on the row reached by $name',
		async ({ keys, expected }) => {
			const { wrapper } = await mountSection({})
			await enterAnnotation(wrapper)

			for (const key of keys) await pressKey(key)
			expect(focusedId(wrapper)).toBe(expected)
			expect(document.activeElement).toBe(tapButton(wrapper))

			clockQueue.push(0, 500)
			await pressKey(' ')
			await pressKey(' ')
			expect(
				focusedRow(wrapper).get('[data-testid="tap-tempo-readout"]').text()
			).toContain('120.0')
		}
	)

	it('ignores keys from a dialog portalled outside the record dialog', async () => {
		const { wrapper } = await mountSection({ inDialog: true })
		await enterAnnotation(wrapper)
		const nested = document.createElement('div')
		nested.setAttribute('role', 'dialog')
		const nestedButton = document.createElement('button')
		nested.append(nestedButton)
		document.body.append(nested)

		await pressKey('j', nestedButton)
		await pressKey(' ', nestedButton)
		const escape = await pressKey('Escape', nestedButton)

		expect(focusedId(wrapper)).toBe('track-a1')
		expect(
			focusedRow(wrapper).get('[data-testid="tap-tempo-readout"]').text()
		).toContain('—')
		expect(escape.defaultPrevented).toBe(false)
		expect(wrapper.get('[data-testid="record-tracks-annotate"]').text()).toBe(
			'Done'
		)
	})

	it('handles keys anywhere in its own dialog and claims Escape there', async () => {
		const { wrapper } = await mountSection({ inDialog: true })
		await enterAnnotation(wrapper)
		const dialog = wrapper.get('[data-testid="dialog-scope"]').element

		await pressKey('j', dialog)
		expect(focusedId(wrapper)).toBe('track-a2')

		const escape = await pressKey('Escape', dialog)
		// reka-ui leaves the dialog open when Escape is already prevented.
		expect(escape.defaultPrevented).toBe(true)
		expect(wrapper.findAll('[data-focused="true"]')).toHaveLength(0)
	})

	it('flags a save rejected after moving on and leads back to it', async () => {
		let finishWrite!: () => void
		const updateTrack = vi.fn(
			(
				_id: string,
				_updates: unknown,
				options: { onConflict?: (latest: LibraryTrack | null) => void }
			) =>
				new Promise<LibraryTrack | null>((resolve) => {
					finishWrite = () => {
						options.onConflict?.(createRecordTracks()[2]!)
						resolve(null)
					}
				})
		)
		const { wrapper } = await mountSection({ updateTrack })
		await enterAnnotation(wrapper)

		await focusedRow(wrapper)
			.get(`[data-composite="${EIGHT_B}"]`)
			.trigger('click')
		await settle()
		expect(
			wrapper.get('[data-testid="record-track-status-track-a1"]').text()
		).toBe('Saving…')

		await pressKey('j')
		expect(focusedId(wrapper)).toBe('track-a2')
		finishWrite()
		await settle()

		expect(
			wrapper.get('[data-testid="record-track-status-track-a1"]').text()
		).toBe('Not saved')
		expect(
			wrapper.get('[data-testid="record-tracks-unsaved"]').text()
		).toContain('1 change was not saved.')

		await wrapper
			.get('[data-testid="record-tracks-review-unsaved"]')
			.trigger('click')
		await settle()
		expect(focusedId(wrapper)).toBe('track-a1')
		expect(
			focusedRow(wrapper).get('[data-testid="quick-set-issue"]').text()
		).toContain('your key 8B was not saved')
	})

	it('draws the key in the foreground colour with a colour swatch', async () => {
		const { wrapper } = await mountSection({})
		const label = wrapper.get('[data-testid="record-track-key-track-b1"]')
		expect(label.text()).toBe('8A')
		expect(label.attributes('style')).toBeUndefined()
		expect(label.element.parentElement!.className).toContain('text-foreground')
		const swatch = wrapper.get(
			'[data-testid="record-track-key-swatch-track-b1"]'
		)
		expect(swatch.attributes('style')).toContain('background-color')
		expect(
			wrapper.find('[data-testid="record-track-key-swatch-track-a1"]').exists()
		).toBe(false)
	})

	it('treats partial or out-of-range stored keys as missing', async () => {
		const tracks = [
			createMockTrack({
				id: 'track-partial',
				record_id: 'record-1',
				position: 'A1',
				bpm: 120,
				key: 11,
				mode: null
			}),
			createMockTrack({
				id: 'track-invalid',
				record_id: 'record-1',
				position: 'A2',
				bpm: 121,
				key: -1,
				mode: 1
			})
		] as LibraryTrack[]
		const { wrapper } = await mountSection({ tracks, keyFormat: 'key' })

		expect(wrapper.get('[data-testid="record-tracks-progress"]').text()).toBe(
			'0 of 2 tracks have BPM and key'
		)
		expect(
			wrapper.get('[data-testid="record-track-key-track-partial"]').text()
		).toBe('–')
		expect(
			wrapper.get('[data-testid="record-track-key-track-invalid"]').text()
		).toBe('–')

		// The tracks remain available for correction.
		await enterAnnotation(wrapper)
		expect(focusedId(wrapper)).toBe('track-partial')
		expect(
			focusedRow(wrapper).get('[data-testid="quick-set-saved-key"]').text()
		).toBe('No key saved')
	})
})
