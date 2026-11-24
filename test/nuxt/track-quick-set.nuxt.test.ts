import { defineComponent, h, nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InspectorTrack from '~/components/library/InspectorTrack.vue'
import PanelTrackQuickSet from '~/components/tracks/PanelTrackQuickSet.vue'
import PanelTrackQuickSetLive from '~/components/tracks/PanelTrackQuickSetLive.vue'
import { useTrackQuickSet } from '~/composables/useTrackQuickSet'
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

const VERSION_0 = '2026-11-18T10:00:00.000Z'
const VERSION_1 = '2026-11-18T10:00:01.000Z'
const VERSION_2 = '2026-11-18T10:00:02.000Z'

type UpdateOptions = {
	silent?: boolean
	expectedUpdatedAt?: string | null
	onConflict?: (latest: LibraryTrack | null) => void
}
type UpdateTrack = (
	id: string,
	updates: Partial<LibraryTrack>,
	options: UpdateOptions
) => Promise<LibraryTrack | null>

async function settle() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

const clockQueue: number[] = []

function mockClock(...timestamps: number[]) {
	clockQueue.splice(0, clockQueue.length, ...timestamps)
}

const clockProvide = {
	[TAP_TEMPO_CLOCK as symbol]: () => clockQueue.shift() ?? 0
}

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
		attachTo: document.body,
		global: { provide: clockProvide }
	})
	wrappers.add(wrapper)
	await settle()
	return wrapper
}

// The quick-set store outlives each mount, so every test uses its own track.
let trackSequence = 0

function createLiveTrack(overrides: Partial<LibraryTrack> = {}): LibraryTrack {
	trackSequence += 1
	return createMockTrack({
		id: `track-live-${trackSequence}`,
		bpm: null,
		key: null,
		mode: null,
		updated_at: VERSION_0,
		...overrides
	}) as LibraryTrack
}

async function mountLive(track: LibraryTrack, { attach = false } = {}) {
	const wrapper = await mountSuspended(PanelTrackQuickSetLive, {
		props: { track, keyFormat: 'camelot' },
		...(attach ? { attachTo: document.body } : {}),
		global: { provide: clockProvide }
	})
	wrappers.add(wrapper)
	await settle()
	return wrapper
}

function useTracksMock(
	updateTrack: UpdateTrack,
	fetchAllTracks = vi.fn().mockResolvedValue(true)
) {
	const mock = {
		updateTrack: vi.fn(updateTrack),
		fetchAllTracks
	}
	factories.tracks.mockReturnValue(mock)
	return mock
}

function radio(wrapper: VueWrapper, composite: string) {
	return wrapper.get(`[data-composite="${composite}"]`)
}

function cleanup() {
	for (const wrapper of wrappers) wrapper.unmount()
	wrappers.clear()
	vi.restoreAllMocks()
	document.body.innerHTML = ''
}

describe('PanelTrackQuickSet tap tempo', () => {
	beforeEach(() => {
		factories.preferences.mockReturnValue({ currentKeyFormat: 'camelot' })
		factories.tracks.mockReturnValue({ updateTrack: vi.fn() })
	})

	afterEach(cleanup)

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

	it('offers nothing to use after a skipped beat', async () => {
		// Two taps 500 ms apart, then one 1,000 ms later: the review's repro.
		mockClock(0, 500, 1500)
		const wrapper = await mountPanel({ bpm: 126.5 })

		await tapTimes(wrapper, 3)
		const readout = wrapper.get('[data-testid="tap-tempo-readout"]')
		expect(readout.text()).toContain('—')
		expect(readout.text()).toContain('Uneven taps')
		expect(readout.text()).not.toContain('NaN')
		const use = wrapper.get('[data-testid="tap-tempo-use"]')
		expect(use.attributes('disabled')).toBeDefined()

		await use.trigger('click')
		await wrapper
			.get('[data-testid="tap-tempo-tap"]')
			.trigger('keydown', { key: 'Enter' })
		expect(wrapper.emitted('update:bpm')).toBeUndefined()
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

	it('treats Enter on the tap button as Use and resets with the reset button', async () => {
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
})

describe('PanelTrackQuickSet captions', () => {
	beforeEach(() => {
		factories.preferences.mockReturnValue({ currentKeyFormat: 'camelot' })
	})

	afterEach(cleanup)

	it('labels committed track values as saved', async () => {
		const wrapper = await mountPanel({ bpm: 127.5, keyComposite: EIGHT_A })
		expect(wrapper.get('[data-testid="tap-tempo-current"]').text()).toBe(
			'Saved 127.5'
		)
		expect(wrapper.get('[data-testid="quick-set-saved-key"]').text()).toBe(
			'Saved 8A'
		)
		expect(
			wrapper.get('[data-testid="picker-key-wheel-selection"]').text()
		).toBe('8A')
	})

	it('reads naturally when nothing is saved yet', async () => {
		const wrapper = await mountPanel()
		expect(wrapper.get('[data-testid="tap-tempo-current"]').text()).toBe(
			'No BPM saved'
		)
		expect(wrapper.get('[data-testid="quick-set-saved-key"]').text()).toBe(
			'No key saved'
		)
	})

	it('never calls an unsaved form value saved', async () => {
		const wrapper = await mountPanel({
			bpm: 127.5,
			keyComposite: EIGHT_A,
			valueSource: 'form'
		})
		expect(wrapper.get('[data-testid="tap-tempo-current"]').text()).toBe(
			'In this form: 127.5'
		)
		expect(wrapper.get('[data-testid="quick-set-saved-key"]').text()).toBe(
			'In this form: 8A'
		)
		expect(wrapper.text()).not.toContain('Saved')

		await wrapper.setProps({ bpm: null, keyComposite: 'none' })
		expect(wrapper.get('[data-testid="tap-tempo-current"]').text()).toBe(
			'No BPM in this form'
		)
		expect(wrapper.get('[data-testid="quick-set-saved-key"]').text()).toBe(
			'No key in this form'
		)
	})
})

describe('PickerKeyWheel through PanelTrackQuickSet', () => {
	beforeEach(() => {
		factories.preferences.mockReturnValue({ currentKeyFormat: 'camelot' })
	})

	afterEach(cleanup)

	it('emits a key change for a wheel click, nothing for the saved key, and none on clear', async () => {
		const wrapper = await mountPanel({ keyComposite: EIGHT_A })

		await radio(wrapper, EIGHT_A).trigger('click')
		expect(wrapper.emitted('update:keyComposite')).toBeUndefined()

		await radio(wrapper, NINE_A).trigger('click')
		expect(wrapper.emitted('update:keyComposite')).toEqual([[NINE_A]])

		await wrapper.get('[data-testid="picker-key-wheel-clear"]').trigger('click')
		expect(wrapper.emitted('update:keyComposite')).toEqual([[NINE_A], ['none']])
	})

	it('lays out all 24 keys with the saved key checked and neighbours highlighted', async () => {
		const wrapper = await mountPanel({ keyComposite: EIGHT_A })
		const radios = wrapper.findAll('[role="radio"]')
		expect(radios).toHaveLength(24)
		expect(
			radios.filter((item) => item.attributes('aria-checked') === 'true')
		).toHaveLength(1)
		expect(radio(wrapper, EIGHT_B).attributes('data-state')).toBe('neighbour')
		expect(radio(wrapper, NINE_A).attributes('data-state')).toBe('neighbour')
		expect(
			radios.filter((item) => item.attributes('tabindex') === '0')
		).toHaveLength(1)
	})

	it('moves the selection with arrow keys and confirms with Enter', async () => {
		const wrapper = await mountPanel({ keyComposite: EIGHT_A })
		const wheel = wrapper.get('[role="radiogroup"]')

		await wheel.trigger('keydown', { key: 'ArrowRight' })
		expect(radio(wrapper, NINE_A).attributes('aria-checked')).toBe('true')
		expect(wrapper.emitted('update:keyComposite')).toBeUndefined()

		await wheel.trigger('keydown', { key: 'ArrowLeft' })
		await wheel.trigger('keydown', { key: 'ArrowUp' })
		expect(radio(wrapper, EIGHT_B).attributes('aria-checked')).toBe('true')

		await wheel.trigger('keydown', { key: 'Enter' })
		expect(wrapper.emitted('update:keyComposite')).toEqual([[EIGHT_B]])

		await wheel.trigger('keydown', { key: 'Delete' })
		expect(wrapper.emitted('update:keyComposite')).toEqual([
			[EIGHT_B],
			['none']
		])
	})

	it('confirms the initially focused key and shows a focus ring', async () => {
		const wrapper = await mountPanel()
		const tabStop = wrapper
			.findAll('[role="radio"]')
			.find((item) => item.attributes('tabindex') === '0')!
		expect(tabStop.attributes('data-composite')).toBe(EIGHT_A)
		expect(
			wrapper.find('[data-testid="picker-key-wheel-focus-ring"]').exists()
		).toBe(false)

		await tabStop.trigger('focus')
		expect(
			wrapper.find('[data-testid="picker-key-wheel-focus-ring"]').exists()
		).toBe(true)

		await wrapper
			.get('[role="radiogroup"]')
			.trigger('keydown', { key: 'Enter' })
		expect(wrapper.emitted('update:keyComposite')).toEqual([[EIGHT_A]])
	})

	it('moves from the focused key rather than the empty selection', async () => {
		const wrapper = await mountPanel()
		await radio(wrapper, EIGHT_A).trigger('focus')
		await wrapper
			.get('[role="radiogroup"]')
			.trigger('keydown', { key: 'ArrowRight' })
		expect(radio(wrapper, NINE_A).attributes('aria-checked')).toBe('true')
	})

	it('keeps the SVG out of the tab order and hands its focus to the roving radio', async () => {
		const wrapper = await mountPanel()
		const svg = wrapper.get('[role="radiogroup"]')
		expect(svg.attributes('tabindex')).toBe('-1')
		const tabStops = wrapper
			.findAll('[tabindex="0"]')
			.filter((element) => element.element.closest('svg'))
		expect(tabStops).toHaveLength(1)
		const target = radio(wrapper, EIGHT_A).element as HTMLElement & {
			focus: () => void
		}
		const focusSpy = vi.fn()
		Object.defineProperty(target, 'focus', {
			value: focusSpy,
			configurable: true
		})

		await svg.trigger('focus')
		await settle()
		expect(focusSpy).toHaveBeenCalledTimes(1)
	})

	it('hides the focus ring when the wheel is used with a pointer', async () => {
		const wrapper = await mountPanel({ keyComposite: EIGHT_A })
		await wrapper.get('[role="radiogroup"]').trigger('pointerdown')
		await radio(wrapper, NINE_A).trigger('focus')
		expect(
			wrapper.find('[data-testid="picker-key-wheel-focus-ring"]').exists()
		).toBe(false)
	})

	it('cancels a preview on Escape without letting the keypress reach a dialog', async () => {
		const outside = vi.fn()
		document.addEventListener('keydown', outside)
		try {
			const wrapper = await mountPanel({ keyComposite: EIGHT_A })
			await radio(wrapper, EIGHT_A).trigger('focus')
			await wrapper
				.get('[role="radiogroup"]')
				.trigger('keydown', { key: 'ArrowRight' })
			expect(radio(wrapper, NINE_A).attributes('aria-checked')).toBe('true')

			// Earlier arrow keys are meant to bubble; only Escape is consumed.
			outside.mockClear()
			const escape = new KeyboardEvent('keydown', {
				key: 'Escape',
				bubbles: true,
				cancelable: true
			})
			radio(wrapper, NINE_A).element.dispatchEvent(escape)
			await settle()

			expect(escape.defaultPrevented).toBe(true)
			expect(outside).not.toHaveBeenCalled()
			expect(radio(wrapper, EIGHT_A).attributes('aria-checked')).toBe('true')
			expect(wrapper.emitted('update:keyComposite')).toBeUndefined()
			expect(document.activeElement).toBe(
				wrapper.get('[data-testid="picker-key-wheel-container"]').element
			)
		} finally {
			document.removeEventListener('keydown', outside)
		}
	})

	it('draws compact standard labels with full accessible names', async () => {
		const wrapper = await mountPanel({
			keyComposite: EIGHT_A,
			keyFormat: 'key'
		})
		const aMinor = radio(wrapper, EIGHT_A)
		expect(aMinor.attributes('aria-label')).toBe('A Minor, 8A')
		expect(aMinor.get('text').text()).toBe('Am')
		const cSharpMinor = radio(wrapper, createKeyComposite(1, 0))
		expect(cSharpMinor.get('text').text()).toBe('C♯m')
		expect(cSharpMinor.attributes('aria-label')).toContain('Minor')
		expect(wrapper.get('[data-testid="quick-set-saved-key"]').text()).toBe(
			'Saved A Min'
		)
	})

	it('names segments in Camelot notation first when that is the preference', async () => {
		const wrapper = await mountPanel({ keyComposite: EIGHT_A })
		expect(radio(wrapper, EIGHT_A).attributes('aria-label')).toBe('8A, A Minor')
		expect(radio(wrapper, EIGHT_A).get('text').text()).toBe('8A')
	})

	it('keeps idle segments opaque enough for legible labels', async () => {
		const wrapper = await mountPanel()
		for (const segment of wrapper.findAll('[role="radio"]')) {
			const classes = segment.get('path').classes()
			expect(classes).toContain('opacity-80')
			expect(classes.some((name) => /^opacity-[1-7]\d$/.test(name))).toBe(false)
			expect(
				segment
					.get('text')
					.classes()
					.some((name) => name.startsWith('opacity-'))
			).toBe(false)
		}
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
		await radio(wrapper, NINE_A).trigger('click')
		await wrapper
			.get('[role="radiogroup"]')
			.trigger('keydown', { key: 'ArrowRight' })
		expect(wrapper.emitted('update:keyComposite')).toBeUndefined()
		expect(radio(wrapper, EIGHT_A).attributes('aria-checked')).toBe('true')
		expect(wrapper.get('[role="radiogroup"]').attributes('aria-disabled')).toBe(
			'true'
		)
	})

	it('renders one issue per field and forwards actions with that field', async () => {
		const wrapper = await mountPanel({
			issues: [
				{
					field: 'bpm',
					kind: 'conflict',
					message: 'BPM changed elsewhere',
					canRetry: true,
					canDismiss: true
				},
				{
					field: 'key',
					kind: 'failed',
					message: 'Key failed',
					canRetry: true,
					canDismiss: true
				}
			]
		})
		const issues = wrapper.findAll('[data-testid="quick-set-issue"]')
		expect(issues.map((issue) => issue.attributes('data-issue-field'))).toEqual(
			['bpm', 'key']
		)
		expect(
			wrapper.find('[data-testid="quick-set-issue-refresh"]').exists()
		).toBe(false)
		await issues[1]!
			.get('[data-testid="quick-set-issue-retry"]')
			.trigger('click')
		await issues[0]!
			.get('[data-testid="quick-set-issue-dismiss"]')
			.trigger('click')
		expect(wrapper.emitted('retry')).toEqual([['key']])
		expect(wrapper.emitted('dismiss')).toEqual([['bpm']])
	})

	it('offers a single Refresh and no per-field actions while a refresh is needed', async () => {
		const wrapper = await mountPanel({
			needsRefresh: true,
			issues: [
				{
					field: 'bpm',
					kind: 'conflict-unrefreshed',
					message: 'Could not be loaded',
					canRetry: false,
					canDismiss: false
				}
			]
		})
		expect(
			wrapper.findAll('[data-testid="quick-set-issue-refresh"]')
		).toHaveLength(1)
		expect(wrapper.find('[data-testid="quick-set-issue-retry"]').exists()).toBe(
			false
		)
		expect(
			wrapper.find('[data-testid="quick-set-issue-dismiss"]').exists()
		).toBe(false)
		await wrapper
			.get('[data-testid="quick-set-issue-refresh"]')
			.trigger('click')
		expect(wrapper.emitted('refresh')).toHaveLength(1)
	})

	it('keeps Tap focusable while a BPM save is pending and says it is saving', async () => {
		mockClock(0, 500, 1000)
		const wrapper = await mountPanel({ bpm: 133.7 })
		await tapTimes(wrapper, 3)
		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		expect(document.activeElement).toBe(
			wrapper.get('[data-testid="tap-tempo-tap"]').element
		)

		await wrapper.setProps({ pendingBpm: true, bpm: 120 })
		const tap = wrapper.get('[data-testid="tap-tempo-tap"]')
		expect(tap.attributes('disabled')).toBeUndefined()
		expect(tap.attributes('aria-disabled')).toBe('true')
		expect(wrapper.get('[data-testid="tap-tempo-current"]').text()).toBe(
			'Saving…'
		)
		await tap.trigger('click')
		expect(wrapper.get('[data-testid="tap-tempo-readout"]').text()).toContain(
			'3 taps'
		)
	})
})

describe('PanelTrackQuickSetLive', () => {
	beforeEach(() => {
		factories.preferences.mockReturnValue({ currentKeyFormat: 'camelot' })
	})

	afterEach(cleanup)

	it('writes a tapped BPM once through updateTrack with the version precondition', async () => {
		const track = createLiveTrack()
		const tracks = useTracksMock(async () => ({ ...track, bpm: 120 }))
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountLive(track)

		await tapTimes(wrapper, 5)
		expect(tracks.updateTrack).not.toHaveBeenCalled()
		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		await settle()

		expect(tracks.updateTrack).toHaveBeenCalledTimes(1)
		expect(tracks.updateTrack).toHaveBeenCalledWith(
			track.id,
			{ bpm: 120 },
			expect.objectContaining({
				silent: true,
				expectedUpdatedAt: VERSION_0,
				onConflict: expect.any(Function)
			})
		)
	})

	it('writes key and mode together and clears both', async () => {
		const track = createLiveTrack({ key: 9, mode: 0 })
		const tracks = useTracksMock(async () => track)
		const wrapper = await mountLive(track)

		await radio(wrapper, EIGHT_B).trigger('click')
		await settle()
		expect(tracks.updateTrack).toHaveBeenLastCalledWith(
			track.id,
			{ key: 0, mode: 1 },
			expect.objectContaining({ expectedUpdatedAt: VERSION_0 })
		)

		await wrapper.get('[data-testid="picker-key-wheel-clear"]').trigger('click')
		await settle()
		expect(tracks.updateTrack).toHaveBeenLastCalledWith(
			track.id,
			{ key: null, mode: null },
			expect.anything()
		)
		expect(tracks.updateTrack).toHaveBeenCalledTimes(2)
	})

	it('keeps a rejected value after a refreshed conflict and retries only on request', async () => {
		const track = createLiveTrack({ key: 7, mode: 1 })
		const latest = { ...track, key: 2, mode: 1, updated_at: VERSION_1 }
		const tracks = useTracksMock(async (_id, _updates, options) => {
			if (options.expectedUpdatedAt === VERSION_0) {
				options.onConflict?.(latest)
				return null
			}
			return { ...latest, key: 0, mode: 1, updated_at: VERSION_2 }
		})
		const wrapper = await mountLive(track)

		await radio(wrapper, EIGHT_B).trigger('click')
		await settle()
		// The store has refreshed the track; the panel now shows its latest value.
		await wrapper.setProps({ track: latest })
		await settle()

		expect(tracks.updateTrack).toHaveBeenCalledTimes(1)
		const issue = wrapper.get('[data-testid="quick-set-issue"]')
		expect(issue.attributes('data-issue-kind')).toBe('conflict')
		expect(issue.text()).toContain('your key 8B was not saved')
		expect(issue.text()).toContain('The latest saved values are shown')

		await wrapper.get('[data-testid="quick-set-issue-retry"]').trigger('click')
		await settle()
		expect(tracks.updateTrack).toHaveBeenCalledTimes(2)
		expect(tracks.updateTrack).toHaveBeenLastCalledWith(
			track.id,
			{ key: 0, mode: 1 },
			expect.objectContaining({ expectedUpdatedAt: VERSION_1 })
		)
		expect(wrapper.find('[data-testid="quick-set-issue"]').exists()).toBe(false)
	})

	it('admits when the latest version could not be loaded and blocks writes until refreshed', async () => {
		const track = createLiveTrack({ key: 2, mode: 1 })
		const fetchAllTracks = vi
			.fn()
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true)
		const tracks = useTracksMock(async (_id, _updates, options) => {
			options.onConflict?.(null)
			return null
		}, fetchAllTracks)
		const wrapper = await mountLive(track)

		await radio(wrapper, EIGHT_B).trigger('click')
		await settle()

		const issue = wrapper.get('[data-testid="quick-set-issue"]')
		expect(issue.attributes('data-issue-kind')).toBe('conflict-unrefreshed')
		expect(issue.text()).toContain('could not be loaded')
		expect(wrapper.text()).toContain(
			'Refresh this track before changing it again.'
		)
		expect(issue.text()).not.toContain('latest saved values are shown')
		expect(wrapper.find('[data-testid="quick-set-issue-retry"]').exists()).toBe(
			false
		)
		expect(wrapper.get('[role="radiogroup"]').attributes('aria-disabled')).toBe(
			'true'
		)
		expect(
			wrapper.get('[data-testid="tap-tempo-tap"]').attributes('disabled')
		).toBeDefined()

		await radio(wrapper, NINE_A).trigger('click')
		await settle()
		expect(tracks.updateTrack).toHaveBeenCalledTimes(1)

		await wrapper
			.get('[data-testid="quick-set-issue-refresh"]')
			.trigger('click')
		await settle()
		expect(fetchAllTracks).toHaveBeenCalledWith({ fresh: true })
		expect(
			wrapper
				.get('[data-testid="quick-set-issue"]')
				.attributes('data-issue-kind')
		).toBe('conflict-unrefreshed')

		await wrapper
			.get('[data-testid="quick-set-issue-refresh"]')
			.trigger('click')
		await settle()
		expect(
			wrapper
				.get('[data-testid="quick-set-issue"]')
				.attributes('data-issue-kind')
		).toBe('conflict')
		expect(
			wrapper.get('[role="radiogroup"]').attributes('aria-disabled')
		).toBeUndefined()
	})

	it('reports a failed save with its value', async () => {
		const track = createLiveTrack()
		useTracksMock(async () => null)
		const wrapper = await mountLive(track)

		await radio(wrapper, EIGHT_B).trigger('click')
		await settle()
		const issue = wrapper.get('[data-testid="quick-set-issue"]')
		expect(issue.attributes('data-issue-kind')).toBe('failed')
		expect(issue.get('[data-testid="quick-set-issue-message"]').text()).toBe(
			'Your key 8B could not be saved.'
		)

		await wrapper
			.get('[data-testid="quick-set-issue-dismiss"]')
			.trigger('click')
		expect(wrapper.find('[data-testid="quick-set-issue"]').exists()).toBe(false)
	})

	it('shows a rejection that arrives after the panel unmounted when the track is shown again', async () => {
		const track = createLiveTrack({ key: 2, mode: 1 })
		const write = createDeferred<undefined>()
		useTracksMock(async (_id, _updates, options) => {
			await write.promise
			options.onConflict?.({ ...track, key: 7, updated_at: VERSION_1 })
			return null
		})
		const first = await mountLive(track)
		await radio(first, EIGHT_B).trigger('click')
		await settle()
		first.unmount()
		wrappers.delete(first)

		write.resolve(undefined)
		await settle()

		const second = await mountLive({ ...track, key: 7, updated_at: VERSION_1 })
		const issue = second.get('[data-testid="quick-set-issue"]')
		expect(issue.attributes('data-issue-kind')).toBe('conflict')
		expect(issue.text()).toContain('your key 8B was not saved')
	})

	it('queues a key chosen during a pending BPM save on the version that save produced', async () => {
		const track = createLiveTrack({ key: 7, mode: 1 })
		const bpmWrite = createDeferred<undefined>()
		const tracks = useTracksMock(async (_id, updates, options) => {
			if ('bpm' in updates) {
				await bpmWrite.promise
				return { ...track, bpm: 120, updated_at: VERSION_1 }
			}
			return options.expectedUpdatedAt === VERSION_1
				? { ...track, bpm: 120, key: 0, mode: 1, updated_at: VERSION_2 }
				: (options.onConflict?.(null), null)
		})
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountLive(track)

		await tapTimes(wrapper, 5)
		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		await settle()
		await radio(wrapper, EIGHT_B).trigger('click')
		await settle()
		expect(tracks.updateTrack).toHaveBeenCalledTimes(1)

		bpmWrite.resolve(undefined)
		await settle()

		expect(tracks.updateTrack).toHaveBeenCalledTimes(2)
		expect(tracks.updateTrack).toHaveBeenNthCalledWith(
			2,
			track.id,
			{ key: 0, mode: 1 },
			expect.objectContaining({ expectedUpdatedAt: VERSION_1 })
		)
		expect(wrapper.find('[data-testid="quick-set-issue"]').exists()).toBe(false)
	})

	it('holds back a queued write after an unloadable conflict and recovers both fields', async () => {
		const track = createLiveTrack({ key: 7, mode: 1 })
		const bpmWrite = createDeferred<undefined>()
		const fetchAllTracks = vi
			.fn()
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true)
		const tracks = useTracksMock(async (_id, updates, options) => {
			if ('bpm' in updates) await bpmWrite.promise
			options.onConflict?.(null)
			return null
		}, fetchAllTracks)
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountLive(track)

		await tapTimes(wrapper, 5)
		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		await settle()
		await radio(wrapper, EIGHT_B).trigger('click')
		await settle()
		bpmWrite.resolve(undefined)
		await settle()

		// Only the BPM write reached the server; the key was held back.
		expect(tracks.updateTrack).toHaveBeenCalledTimes(1)
		const kinds = () =>
			Object.fromEntries(
				wrapper
					.findAll('[data-testid="quick-set-issue"]')
					.map((issue) => [
						issue.attributes('data-issue-field'),
						issue.attributes('data-issue-kind')
					])
			)
		expect(kinds()).toEqual({ bpm: 'conflict-unrefreshed', key: 'not-sent' })
		expect(wrapper.text()).toContain('BPM 120.0 was not saved')
		expect(wrapper.text()).toContain('key 8B was not sent')
		expect(
			wrapper.findAll('[data-testid="quick-set-issue-refresh"]')
		).toHaveLength(1)
		expect(wrapper.find('[data-testid="quick-set-issue-retry"]').exists()).toBe(
			false
		)
		expect(
			wrapper.find('[data-testid="quick-set-issue-dismiss"]').exists()
		).toBe(false)

		await wrapper
			.get('[data-testid="quick-set-issue-refresh"]')
			.trigger('click')
		await settle()
		expect(kinds()).toEqual({ bpm: 'conflict-unrefreshed', key: 'not-sent' })

		await wrapper
			.get('[data-testid="quick-set-issue-refresh"]')
			.trigger('click')
		await settle()
		expect(kinds()).toEqual({ bpm: 'conflict', key: 'conflict' })
		expect(
			wrapper.findAll('[data-testid="quick-set-issue-retry"]')
		).toHaveLength(2)
		expect(
			wrapper.find('[data-testid="quick-set-issue-refresh"]').exists()
		).toBe(false)
	})

	it('shows the saved key on the wheel once a held-back key is dismissed', async () => {
		const track = createLiveTrack()
		const bpmWrite = createDeferred<undefined>()
		useTracksMock(async (_id, _updates, options) => {
			await bpmWrite.promise
			options.onConflict?.(null)
			return null
		}, vi.fn().mockResolvedValue(true))
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountLive(track)

		await tapTimes(wrapper, 5)
		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		await settle()
		await radio(wrapper, EIGHT_B).trigger('click')
		await settle()
		bpmWrite.resolve(undefined)
		await settle()

		// Held back: the saved key is still none, and the wheel says so.
		expect(radio(wrapper, EIGHT_B).attributes('aria-checked')).toBe('false')

		await wrapper
			.get('[data-testid="quick-set-issue-refresh"]')
			.trigger('click')
		await settle()
		const keyIssue = wrapper
			.findAll('[data-testid="quick-set-issue"]')
			.find((issue) => issue.attributes('data-issue-field') === 'key')!
		await keyIssue
			.get('[data-testid="quick-set-issue-dismiss"]')
			.trigger('click')
		await settle()

		expect(radio(wrapper, EIGHT_B).attributes('aria-checked')).toBe('false')
		expect(wrapper.get('[data-testid="quick-set-saved-key"]').text()).toBe(
			'No key saved'
		)
	})

	it('stops claiming the latest values are shown once a later refresh fails', async () => {
		const track = createLiveTrack({ key: 5, mode: 1 })
		const latest = { ...track, key: 7, updated_at: VERSION_1 }
		const fetchAllTracks = vi.fn().mockResolvedValue(true)
		useTracksMock(async (_id, updates, options) => {
			options.onConflict?.('key' in updates ? latest : null)
			return null
		}, fetchAllTracks)
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountLive(track)

		await radio(wrapper, EIGHT_B).trigger('click')
		await settle()
		await wrapper.setProps({ track: latest })
		await tapTimes(wrapper, 5)
		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		await settle()

		const issues = () =>
			Object.fromEntries(
				wrapper
					.findAll('[data-testid="quick-set-issue"]')
					.map((issue) => [issue.attributes('data-issue-field'), issue])
			)
		expect(issues().key!.attributes('data-issue-kind')).toBe(
			'conflict-unrefreshed'
		)
		expect(wrapper.text()).not.toContain('latest saved values are shown')

		await wrapper
			.get('[data-testid="quick-set-issue-refresh"]')
			.trigger('click')
		await settle()
		expect(issues().key!.attributes('data-issue-kind')).toBe('conflict')
		expect(issues().bpm!.attributes('data-issue-kind')).toBe('conflict')
	})

	it('keeps focus inside the panel while it locks for a refresh and unlocks again', async () => {
		const track = createLiveTrack()
		const refresh = createDeferred<boolean>()
		useTracksMock(
			async (_id, _updates, options) => {
				options.onConflict?.(null)
				return null
			},
			vi.fn(() => refresh.promise)
		)
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountLive(track, { attach: true })
		const panel = () => wrapper.get('[data-testid="panel-track-quick-set"]')

		await tapTimes(wrapper, 5)
		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		await settle()

		// Tap is now natively disabled; focus moves to the only way out.
		expect(document.activeElement).toBe(
			wrapper.get('[data-testid="quick-set-issue-refresh"]').element
		)

		await wrapper
			.get('[data-testid="quick-set-issue-refresh"]')
			.trigger('click')
		await settle()
		// Refresh is disabled while it loads; the panel holds focus meanwhile.
		expect(document.activeElement).toBe(panel().element)

		refresh.resolve(true)
		await settle()
		expect(document.activeElement).toBe(
			wrapper.get('[data-testid="quick-set-issue-retry"]').element
		)
	})

	it('keeps a rejected key while a later BPM save succeeds', async () => {
		const track = createLiveTrack({ key: 7, mode: 1 })
		const latest = { ...track, key: 5, updated_at: VERSION_1 }
		const tracks = useTracksMock(async (_id, updates, options) => {
			if ('key' in updates) {
				options.onConflict?.(latest)
				return null
			}
			return { ...latest, bpm: 120, updated_at: VERSION_2 }
		})
		mockClock(0, 500, 1000, 1500, 2000)
		const wrapper = await mountLive(track)

		await radio(wrapper, EIGHT_B).trigger('click')
		await settle()
		await wrapper.setProps({ track: latest })
		await tapTimes(wrapper, 5)
		await wrapper.get('[data-testid="tap-tempo-use"]').trigger('click')
		await settle()

		expect(tracks.updateTrack).toHaveBeenCalledTimes(2)
		const issues = wrapper.findAll('[data-testid="quick-set-issue"]')
		expect(issues).toHaveLength(1)
		expect(issues[0]!.attributes('data-issue-field')).toBe('key')
		expect(issues[0]!.text()).toContain('your key 8B was not saved')
	})

	it('disables only the field with a write in flight', async () => {
		const track = createLiveTrack()
		const write = createDeferred<undefined>()
		useTracksMock(async () => {
			await write.promise
			return { ...track, key: 0, mode: 1, updated_at: VERSION_1 }
		})
		const wrapper = await mountLive(track)

		await radio(wrapper, EIGHT_B).trigger('click')
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

		write.resolve(undefined)
		await settle()
		expect(
			wrapper.get('[role="radiogroup"]').attributes('aria-disabled')
		).toBeUndefined()
	})

	it('never sends a non-finite or out-of-range BPM', async () => {
		const track = createLiveTrack()
		const tracks = useTracksMock(async () => track)
		let api!: ReturnType<typeof useTrackQuickSet>
		const Harness = defineComponent({
			setup() {
				api = useTrackQuickSet(() => track)
				return () => h('div')
			}
		})
		const wrapper = await mountSuspended(Harness)
		wrappers.add(wrapper)

		expect(await api.setBpm(Number.NaN)).toBeNull()
		expect(await api.setBpm(Number.POSITIVE_INFINITY)).toBeNull()
		expect(await api.setBpm(12)).toBeNull()
		expect(await api.setKey('not-a-key')).toBeNull()
		expect(tracks.updateTrack).not.toHaveBeenCalled()
	})
})

describe('InspectorTrack quick set', () => {
	beforeEach(() => {
		factories.preferences.mockReturnValue({ currentKeyFormat: 'camelot' })
		factories.tracks.mockReturnValue({ updateTrack: vi.fn() })
	})

	afterEach(cleanup)

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
