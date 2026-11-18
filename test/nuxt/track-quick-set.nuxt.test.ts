import { nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InspectorTrack from '~/components/library/InspectorTrack.vue'
import PanelTrackQuickSet from '~/components/tracks/PanelTrackQuickSet.vue'
import PanelTrackQuickSetLive from '~/components/tracks/PanelTrackQuickSetLive.vue'
import { QUICK_SET_CONFLICT_MESSAGE } from '~/composables/useTrackQuickSet'
import { createKeyComposite } from '~/utils/keyFunctions'
import { TAP_TEMPO_CLOCK } from '~/utils/tapTempo'
import type { LibraryTrack } from '~~/shared/types/library'

const factories = vi.hoisted(() => ({
	preferences: vi.fn(),
	tracks: vi.fn()
}))

mockNuxtImport('useWorkbenchPreferencesStore', () => factories.preferences)
mockNuxtImport('useWorkbenchTracksStore', () => factories.tracks)

const wrappers = new Set<VueWrapper>()

// Camelot 8A is A minor, 9A is E minor, 8B is C major.
const EIGHT_A = createKeyComposite(9, 0)
const NINE_A = createKeyComposite(4, 0)
const EIGHT_B = createKeyComposite(0, 1)

async function settle() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

const clockQueue: number[] = []

function mockClock(...timestamps: number[]) {
	clockQueue.splice(0, clockQueue.length, ...timestamps)
}

function queuedClock(): number {
	return clockQueue.shift() ?? 0
}

const clockProvide = { [TAP_TEMPO_CLOCK as symbol]: queuedClock }

async function tapTimes(wrapper: VueWrapper, count: number) {
	const button = wrapper.get('[data-testid="tap-tempo-tap"]')
	for (let index = 0; index < count; index++) {
		await button.trigger('click')
	}
	await settle()
}

async function mountPanel(
	props: Partial<InstanceType<typeof PanelTrackQuickSet>['$props']> = {}
) {
	const wrapper = await mountSuspended(PanelTrackQuickSet, {
		props: {
			bpm: null,
			keyComposite: 'none',
			keyFormat: 'camelot',
			...props
		},
		global: { provide: clockProvide }
	})
	wrappers.add(wrapper)
	await settle()
	return wrapper
}

function createLiveTrack(overrides: Partial<LibraryTrack> = {}): LibraryTrack {
	return createMockTrack({
		id: 'track-live',
		bpm: null,
		key: null,
		mode: null,
		updated_at: '2026-11-18T10:00:00.000Z',
		...overrides
	}) as LibraryTrack
}

async function mountLive(track: LibraryTrack) {
	const wrapper = await mountSuspended(PanelTrackQuickSetLive, {
		props: { track, keyFormat: 'camelot' },
		global: { provide: clockProvide }
	})
	wrappers.add(wrapper)
	await settle()
	return wrapper
}

describe('PanelTrackQuickSet', () => {
	beforeEach(() => {
		factories.preferences.mockReturnValue({ currentKeyFormat: 'camelot' })
		factories.tracks.mockReturnValue({ updateTrack: vi.fn() })
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.restoreAllMocks()
		document.body.innerHTML = ''
	})

	it('estimates 120 BPM from taps every 500 ms and only emits on Use', async () => {
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountPanel()

		await tapTimes(wrapper, 5)
		const readout = wrapper.get('[data-testid="tap-tempo-readout"]')
		expect(readout.text()).toContain('120.0')
		expect(readout.text()).toContain('steady')
		expect(wrapper.emitted('update:bpm')).toBeUndefined()

		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		expect(wrapper.emitted('update:bpm')).toEqual([[120]])
	})

	it('halves and doubles the estimate and uses the scaled value', async () => {
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountPanel()
		await tapTimes(wrapper, 5)

		await wrapper.get('[data-testid="tap-tempo-halve"]').trigger('click')
		expect(wrapper.get('[data-testid="tap-tempo-readout"]').text()).toContain(
			'60.0'
		)
		await wrapper.get('[data-testid="tap-tempo-double"]').trigger('click')
		await wrapper.get('[data-testid="tap-tempo-double"]').trigger('click')
		expect(wrapper.get('[data-testid="tap-tempo-readout"]').text()).toContain(
			'240.0'
		)
		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		expect(wrapper.emitted('update:bpm')).toEqual([[240]])
	})

	it('confirms Enter on the tap button as Use and resets with the reset button', async () => {
		mockClock(0, 500, 1000)
		const wrapper = await mountPanel()
		await tapTimes(wrapper, 3)

		await wrapper
			.get('[data-testid="tap-tempo-tap"]')
			.trigger('keydown', { key: 'Enter' })
		expect(wrapper.emitted('update:bpm')).toEqual([[120]])

		await wrapper.get('[data-testid="tap-tempo-reset"]').trigger('click')
		expect(wrapper.get('[data-testid="tap-tempo-readout"]').text()).toContain(
			'—'
		)
		expect(
			wrapper.get('[data-testid="tap-tempo-use"]').attributes('disabled')
		).toBeDefined()
	})

	it('shows the saved values beside each control', async () => {
		const wrapper = await mountPanel({ bpm: 127.5, keyComposite: EIGHT_A })
		expect(wrapper.text()).toContain('Saved 127.5')
		expect(wrapper.get('[data-testid="quick-set-saved-key"]').text()).toBe(
			'Saved 8A'
		)
		expect(
			wrapper.get('[data-testid="picker-key-wheel-selection"]').text()
		).toBe('8A')
	})

	it('emits a key change for a wheel click, nothing for the saved key, and none on clear', async () => {
		const wrapper = await mountPanel({ keyComposite: EIGHT_A })

		await wrapper.get(`[data-composite="${EIGHT_A}"]`).trigger('click')
		expect(wrapper.emitted('update:keyComposite')).toBeUndefined()

		await wrapper.get(`[data-composite="${NINE_A}"]`).trigger('click')
		expect(wrapper.emitted('update:keyComposite')).toEqual([[NINE_A]])

		await wrapper.get('[data-testid="picker-key-wheel-clear"]').trigger('click')
		expect(wrapper.emitted('update:keyComposite')).toEqual([[NINE_A], ['none']])
	})

	it('lays out all 24 keys with the saved key outlined and neighbours highlighted', async () => {
		const wrapper = await mountPanel({ keyComposite: EIGHT_A })
		const radios = wrapper.findAll('[role="radio"]')
		expect(radios).toHaveLength(24)
		expect(
			radios.filter((radio) => radio.attributes('aria-checked') === 'true')
		).toHaveLength(1)
		expect(
			wrapper.get(`[data-composite="${EIGHT_B}"]`).attributes('data-state')
		).toBe('neighbour')
		expect(
			wrapper.get(`[data-composite="${NINE_A}"]`).attributes('data-state')
		).toBe('neighbour')
		expect(
			wrapper
				.findAll('[role="radio"]')
				.filter((radio) => radio.attributes('tabindex') === '0')
		).toHaveLength(1)
	})

	it('moves the selection with arrow keys and confirms with Enter', async () => {
		const wrapper = await mountPanel({ keyComposite: EIGHT_A })
		const wheel = wrapper.get('[role="radiogroup"]')

		await wheel.trigger('keydown', { key: 'ArrowRight' })
		expect(
			wrapper.get(`[data-composite="${NINE_A}"]`).attributes('aria-checked')
		).toBe('true')
		expect(wrapper.emitted('update:keyComposite')).toBeUndefined()

		await wheel.trigger('keydown', { key: 'ArrowLeft' })
		await wheel.trigger('keydown', { key: 'ArrowUp' })
		expect(
			wrapper.get(`[data-composite="${EIGHT_B}"]`).attributes('aria-checked')
		).toBe('true')

		await wheel.trigger('keydown', { key: 'Enter' })
		expect(wrapper.emitted('update:keyComposite')).toEqual([[EIGHT_B]])

		await wheel.trigger('keydown', { key: 'Delete' })
		expect(wrapper.emitted('update:keyComposite')).toEqual([
			[EIGHT_B],
			['none']
		])
	})

	it('labels the wheel in musical notation when requested', async () => {
		const wrapper = await mountPanel({
			keyComposite: EIGHT_A,
			keyFormat: 'key'
		})
		expect(
			wrapper.get(`[data-composite="${EIGHT_A}"]`).attributes('aria-label')
		).toBe('A Min')
		expect(wrapper.get('[data-testid="quick-set-saved-key"]').text()).toBe(
			'Saved A Min'
		)
	})

	it('renders every control inert when read-only', async () => {
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountPanel({ readOnly: true, keyComposite: EIGHT_A })

		expect(
			wrapper.get('[data-testid="tap-tempo-tap"]').attributes('disabled')
		).toBeDefined()
		await tapTimes(wrapper, 5)
		expect(wrapper.get('[data-testid="tap-tempo-readout"]').text()).toContain(
			'—'
		)
		await wrapper.get(`[data-composite="${NINE_A}"]`).trigger('click')
		await wrapper
			.get('[role="radiogroup"]')
			.trigger('keydown', { key: 'ArrowRight' })
		expect(wrapper.emitted('update:keyComposite')).toBeUndefined()
		expect(
			wrapper.get(`[data-composite="${EIGHT_A}"]`).attributes('aria-checked')
		).toBe('true')
		expect(wrapper.get('[role="radiogroup"]').attributes('aria-disabled')).toBe(
			'true'
		)
	})

	it('shows a conflict notice when the parent reports one', async () => {
		const wrapper = await mountPanel({ conflict: 'Changed elsewhere' })
		expect(wrapper.get('[data-testid="quick-set-conflict"]').text()).toBe(
			'Changed elsewhere'
		)
	})
})

describe('PanelTrackQuickSetLive', () => {
	beforeEach(() => {
		factories.preferences.mockReturnValue({ currentKeyFormat: 'camelot' })
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.restoreAllMocks()
		document.body.innerHTML = ''
	})

	it('writes a tapped BPM once through updateTrack with the version precondition', async () => {
		const track = createLiveTrack()
		const updateTrack = vi.fn().mockResolvedValue({ ...track, bpm: 120 })
		factories.tracks.mockReturnValue({ updateTrack })
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountLive(track)

		await tapTimes(wrapper, 5)
		expect(updateTrack).not.toHaveBeenCalled()
		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		await settle()

		expect(updateTrack).toHaveBeenCalledTimes(1)
		expect(updateTrack).toHaveBeenCalledWith(
			'track-live',
			{ bpm: 120 },
			expect.objectContaining({
				silent: true,
				expectedUpdatedAt: '2026-11-18T10:00:00.000Z',
				onConflict: expect.any(Function)
			})
		)
	})

	it('writes key and mode together and clears both', async () => {
		const track = createLiveTrack({ key: 9, mode: 0 })
		const updateTrack = vi.fn().mockResolvedValue(track)
		factories.tracks.mockReturnValue({ updateTrack })
		const wrapper = await mountLive(track)

		await wrapper.get(`[data-composite="${EIGHT_B}"]`).trigger('click')
		await settle()
		expect(updateTrack).toHaveBeenLastCalledWith(
			'track-live',
			{ key: 0, mode: 1 },
			expect.objectContaining({ expectedUpdatedAt: track.updated_at })
		)

		await wrapper.get('[data-testid="picker-key-wheel-clear"]').trigger('click')
		await settle()
		expect(updateTrack).toHaveBeenLastCalledWith(
			'track-live',
			{ key: null, mode: null },
			expect.anything()
		)
		expect(updateTrack).toHaveBeenCalledTimes(2)
	})

	it('shows the conflict notice and never retries on its own', async () => {
		const track = createLiveTrack()
		const updateTrack = vi.fn(
			async (
				_id: string,
				_updates: unknown,
				options: { onConflict?: (current: LibraryTrack | null) => void }
			) => {
				options.onConflict?.(null)
				return null
			}
		)
		factories.tracks.mockReturnValue({ updateTrack })
		const wrapper = await mountLive(track)

		await wrapper.get(`[data-composite="${EIGHT_B}"]`).trigger('click')
		await settle()

		expect(updateTrack).toHaveBeenCalledTimes(1)
		expect(wrapper.get('[data-testid="quick-set-conflict"]').text()).toBe(
			QUICK_SET_CONFLICT_MESSAGE
		)
		expect(
			wrapper.get('[role="radiogroup"]').attributes('aria-disabled')
		).toBeUndefined()
	})

	it('disables only the field with a write in flight', async () => {
		const track = createLiveTrack()
		let resolveWrite!: (value: LibraryTrack | null) => void
		const updateTrack = vi.fn(
			() =>
				new Promise<LibraryTrack | null>((resolve) => {
					resolveWrite = resolve
				})
		)
		factories.tracks.mockReturnValue({ updateTrack })
		const wrapper = await mountLive(track)

		await wrapper.get(`[data-composite="${EIGHT_B}"]`).trigger('click')
		await settle()
		expect(wrapper.get('[role="radiogroup"]').attributes('aria-disabled')).toBe(
			'true'
		)
		expect(wrapper.get('[data-testid="quick-set-saved-key"]').text()).toBe(
			'Saving…'
		)
		expect(
			wrapper.get('[data-testid="tap-tempo-tap"]').attributes('disabled')
		).toBeUndefined()

		resolveWrite({ ...track, key: 0, mode: 1 })
		await settle()
		expect(
			wrapper.get('[role="radiogroup"]').attributes('aria-disabled')
		).toBeUndefined()
	})
})

describe('InspectorTrack quick set', () => {
	beforeEach(() => {
		factories.preferences.mockReturnValue({ currentKeyFormat: 'camelot' })
		factories.tracks.mockReturnValue({ updateTrack: vi.fn() })
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.restoreAllMocks()
		document.body.innerHTML = ''
	})

	it('embeds the live quick-set panel for an editable track', async () => {
		const wrapper = await mountSuspended(InspectorTrack, {
			props: { track: createLiveTrack(), record: null }
		})
		wrappers.add(wrapper)
		await settle()

		expect(wrapper.find('[data-testid="panel-track-quick-set"]').exists()).toBe(
			true
		)
		expect(wrapper.find('[data-testid="tap-tempo-tap"]').exists()).toBe(true)
		expect(wrapper.text()).toContain('Edit track')
	})

	it('hides the panel when the inspector is read-only', async () => {
		const wrapper = await mountSuspended(InspectorTrack, {
			props: { track: createLiveTrack(), record: null, readOnly: true }
		})
		wrappers.add(wrapper)
		await settle()

		expect(wrapper.find('[data-testid="panel-track-quick-set"]').exists()).toBe(
			false
		)
	})
})
