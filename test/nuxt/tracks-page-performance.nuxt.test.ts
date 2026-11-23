import { computed, defineComponent, h, nextTick, shallowReactive } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TracksPage from '~/pages/tracks.vue'
import { useTrackQuickSetStore } from '~/stores/trackQuickSetStore'
import type { TrackEvidenceLensRow } from '~/utils/trackEvidenceLens'

const pageMocks = vi.hoisted(() => ({
	isCompact: false,
	isActive: false,
	records: {
		records: [] as DatabaseRecord[],
		isLoadingRecords: false,
		hasRecords: true,
		getRecordById: vi.fn()
	},
	tracks: {
		tracks: [] as Track[],
		isLoadingTracks: false,
		hasTracks: true,
		tracksCount: 0,
		getTrackById: vi.fn()
	},
	trackFilters: {
		filteredTracks: [] as Track[],
		searchQuery: '',
		hasActiveFilters: false,
		setTrackSource: vi.fn(),
		resetAllFilters: vi.fn()
	},
	user: { currentKeyFormat: 'key' as const }
}))

mockNuxtImport('useWorkbenchRecordsStore', () => () => pageMocks.records)
mockNuxtImport('useWorkbenchTracksStore', () => () => pageMocks.tracks)
mockNuxtImport(
	'useWorkbenchTrackFiltersStore',
	() => () => pageMocks.trackFilters
)
mockNuxtImport('useWorkbenchUserStore', () => () => pageMocks.user)
mockNuxtImport('useWorkbenchPreferencesStore', () => () => pageMocks.user)
mockNuxtImport('useWorkbenchCapabilities', () => () => ({
	mode: 'app',
	canPersistSessions: true,
	canMutateLibrary: true,
	canManageCrates: true,
	canConnectDiscogs: true,
	canEnrichTracks: true,
	canManageAccount: true
}))
mockNuxtImport(
	'useMediaQuery',
	() => (query: string) =>
		computed(() =>
			query === '(max-width: 767px)' || query === '(max-width: 1279px)'
				? pageMocks.isCompact
				: false
		)
)
mockNuxtImport('usePageActive', () => () => computed(() => pageMocks.isActive))
mockNuxtImport('useNavigation', () => () => ({
	getHref: (path: string) => path
}))

const ImageRecordCoverStub = defineComponent({
	name: 'ImageRecordCover',
	props: { record: { type: Object, required: true } },
	setup() {
		return () => h('div', { 'data-testid': 'record-cover' })
	}
})

const ButtonLibrarySortStub = defineComponent({
	name: 'ButtonLibrarySort',
	props: { label: { type: String, required: true } },
	emits: ['click'],
	setup(props, { emit }) {
		return () =>
			h(
				'button',
				{
					type: 'button',
					'data-sort-label': props.label,
					onClick: () => emit('click')
				},
				props.label
			)
	}
})

let wrapper: VueWrapper | null = null

function getRenderedTrackIds(): string[] {
	return (
		wrapper?.findAll('[data-track-id]').flatMap((row) => {
			const trackId = row.attributes('data-track-id')
			return trackId ? [trackId] : []
		}) ?? []
	)
}

async function mountTracksPage() {
	document.body.innerHTML = '<div id="header-left"></div>'
	wrapper = await mountSuspended(TracksPage, {
		global: {
			stubs: {
				AlertConfirmDeleteTrack: true,
				Badge: true,
				Button: true,
				ButtonLibrarySort: ButtonLibrarySortStub,
				ControlLibraryDensity: true,
				DialogTrackDetails: true,
				DialogTrackFilters: true,
				ImageRecordCover: ImageRecordCoverStub,
				Input: true,
				InspectorTrack: true,
				Sheet: true,
				SheetContent: true,
				SheetDescription: true,
				SheetHeader: true,
				SheetTitle: true,
				StateEmptyCollection: true,
				StateLoading: true
			}
		}
	})
	await nextTick()
}

describe('tracks page render work', () => {
	beforeEach(() => {
		pageMocks.isCompact = false
		const records = [
			createMockRecord({ id: 'record-zulu', title: 'Zulu Release' }),
			createMockRecord({ id: 'record-alpha', title: 'Alpha Release' }),
			createMockRecord({ id: 'record-beta', title: 'Beta Release' })
		]
		const tracks = [
			createMockTrack({
				id: 'track-zebra',
				record_id: 'record-zulu',
				title: 'Zebra Track',
				artists: [{ name: 'Bravo Artist', role: null }]
			}),
			createMockTrack({
				id: 'track-middle',
				record_id: 'record-alpha',
				title: 'Middle Track',
				artists: [{ name: 'Alpha Artist', role: null }]
			}),
			createMockTrack({
				id: 'track-alpha',
				record_id: 'record-beta',
				title: 'Alpha Track',
				artists: [{ name: 'Charlie Artist', role: null }]
			})
		]
		pageMocks.records.records = records
		pageMocks.records.getRecordById.mockImplementation((id: string) =>
			records.find((record) => record.id === id)
		)
		pageMocks.tracks.tracks = tracks
		pageMocks.tracks.tracksCount = tracks.length
		pageMocks.tracks.getTrackById.mockImplementation((id: string) =>
			tracks.find((track) => track.id === id)
		)
		pageMocks.trackFilters.filteredTracks = tracks
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		document.body.innerHTML = ''
		vi.clearAllMocks()
	})

	it.each([
		{ compact: false, visible: 'desktop', hidden: 'compact' },
		{ compact: true, visible: 'compact', hidden: 'desktop' }
	])(
		'mounts only the $visible row tree with one cover per track',
		async ({ compact, visible, hidden }) => {
			pageMocks.isCompact = compact
			await mountTracksPage()

			expect(
				wrapper?.find(`[data-testid="${visible}-track-rows"]`).exists()
			).toBe(true)
			expect(
				wrapper?.find(`[data-testid="${hidden}-track-rows"]`).exists()
			).toBe(false)
			expect(wrapper?.findAllComponents(ImageRecordCoverStub)).toHaveLength(3)
			expect(getRenderedTrackIds()).toEqual([
				'track-middle',
				'track-zebra',
				'track-alpha'
			])
			expect(pageMocks.records.getRecordById).toHaveBeenCalledTimes(3)
		}
	)

	it('preserves record and track sorting while resolving each row once', async () => {
		await mountTracksPage()

		await wrapper?.get('[data-sort-label="Release"]').trigger('click')
		await nextTick()
		expect(getRenderedTrackIds()).toEqual([
			'track-middle',
			'track-alpha',
			'track-zebra'
		])
		expect(pageMocks.records.getRecordById).toHaveBeenCalledTimes(3)

		await wrapper?.get('[data-sort-label="Title"]').trigger('click')
		await nextTick()
		expect(getRenderedTrackIds()).toEqual([
			'track-alpha',
			'track-middle',
			'track-zebra'
		])
		expect(pageMocks.records.getRecordById).toHaveBeenCalledTimes(3)
	})

	it('switches to a read-only virtualized Evidence lens without losing the complete filtered set', async () => {
		await mountTracksPage()

		expect(
			wrapper
				?.get('[data-testid="track-view-tracks"]')
				.attributes('aria-pressed')
		).toBe('true')
		await wrapper?.get('[data-testid="track-view-evidence"]').trigger('click')
		await flushPromises()
		await vi.waitFor(() => {
			expect(
				wrapper?.find('[data-testid="evidence-track-rows"]').exists()
			).toBe(true)
		})

		const evidenceRows = wrapper?.get('[data-testid="evidence-track-rows"]')
		expect(evidenceRows?.attributes('data-virtual-total-count')).toBe('3')
		expect(wrapper?.find('[data-testid="desktop-track-rows"]').exists()).toBe(
			false
		)
		expect(
			wrapper
				?.get('[data-testid="track-view-evidence"]')
				.attributes('aria-pressed')
		).toBe('true')

		await wrapper
			?.get('[data-evidence-track-id="track-middle"]')
			.trigger('click')
		await flushPromises()
		const inspectors =
			wrapper?.findAllComponents({ name: 'InspectorTrack' }) ?? []
		expect(inspectors).toHaveLength(1)
		for (const inspector of inspectors) {
			expect(inspector.props('showEditAction')).toBe(false)
			expect(inspector.props('readOnly')).toBe(true)
		}
	})

	it('keeps the selected track inspector mounted through a background refresh', async () => {
		const originalTracks = pageMocks.tracks
		const originalRecords = pageMocks.records
		// A rejected quick-set write refreshes the collection while tracks exist.
		const trackState = shallowReactive({ ...originalTracks })
		const recordState = shallowReactive({ ...originalRecords })
		pageMocks.tracks = trackState
		pageMocks.records = recordState
		try {
			await mountTracksPage()
			await wrapper?.get('[data-track-id="track-middle"]').trigger('click')
			await flushPromises()
			const inspector = wrapper?.findComponent({ name: 'InspectorTrack' })
			expect(inspector?.exists()).toBe(true)
			expect(inspector?.props('track')).toMatchObject({ id: 'track-middle' })

			trackState.isLoadingTracks = true
			recordState.isLoadingRecords = true
			await nextTick()

			expect(wrapper?.findComponent({ name: 'StateLoading' }).exists()).toBe(
				false
			)
			expect(
				wrapper?.find('[data-testid="tracks-background-refresh"]').text()
			).toContain('Refreshing tracks')
			expect(wrapper?.find('section[aria-busy="true"]').exists()).toBe(true)
			const during = wrapper?.findComponent({ name: 'InspectorTrack' })
			expect(during?.exists()).toBe(true)
			// The same instance survives, so its tap sequence and feedback do too.
			expect(during?.vm).toBe(inspector?.vm)

			trackState.isLoadingTracks = false
			recordState.isLoadingRecords = false
			await nextTick()
			expect(wrapper?.findComponent({ name: 'InspectorTrack' }).vm).toBe(
				inspector?.vm
			)
		} finally {
			pageMocks.tracks = originalTracks
			pageMocks.records = originalRecords
		}
	})

	it('keeps a filtered-out track selected while its quick-set write is pending or rejected', async () => {
		const originalFilters = pageMocks.trackFilters
		const filterState = shallowReactive({
			...originalFilters,
			filteredTracks: [...pageMocks.tracks.tracks]
		})
		pageMocks.trackFilters = filterState
		// The selection watcher only runs while the page is active.
		pageMocks.isActive = true
		try {
			await mountTracksPage()
			const quickSet = useTrackQuickSetStore()
			await wrapper?.get('[data-track-id="track-middle"]').trigger('click')
			await flushPromises()

			// The optimistic BPM moves the track outside a BPM filter.
			quickSet.beginWrite('track-middle', 'bpm')
			filterState.filteredTracks = pageMocks.tracks.tracks.filter(
				(track) => track.id !== 'track-middle'
			)
			await nextTick()
			expect(
				wrapper?.findComponent({ name: 'InspectorTrack' }).props('track')
			).toMatchObject({ id: 'track-middle' })

			// The write is rejected: the selection and its notice stay.
			quickSet.finishWrite('track-middle', 'bpm', {
				kind: 'conflict',
				proposal: { field: 'bpm', bpm: 118.9 }
			})
			await nextTick()
			expect(wrapper?.findComponent({ name: 'InspectorTrack' }).exists()).toBe(
				true
			)

			// Once dismissed with the track still filtered out, it is deselected.
			quickSet.dismissIssue('track-middle', 'bpm')
			await nextTick()
			expect(wrapper?.findComponent({ name: 'InspectorTrack' }).exists()).toBe(
				false
			)
		} finally {
			pageMocks.trackFilters = originalFilters
			pageMocks.isActive = false
		}
	})

	it('still shows the loading state for the first load', async () => {
		const originalTracks = pageMocks.tracks
		pageMocks.tracks = {
			...originalTracks,
			tracks: [],
			hasTracks: false,
			isLoadingTracks: true
		}
		try {
			await mountTracksPage()
			expect(wrapper?.findComponent({ name: 'StateLoading' }).exists()).toBe(
				true
			)
		} finally {
			pageMocks.tracks = originalTracks
		}
	})

	it('re-derives only an edited track in the Evidence lens after a store update', async () => {
		const originalTracks = pageMocks.tracks
		const originalFilters = pageMocks.trackFilters
		// The tracks store publishes a new immutable array for every write.
		const trackState = shallowReactive({
			...originalTracks,
			tracks: [...originalTracks.tracks]
		})
		pageMocks.tracks = trackState
		pageMocks.trackFilters = {
			...originalFilters,
			get filteredTracks() {
				return trackState.tracks
			}
		}
		try {
			await mountTracksPage()
			await wrapper?.get('[data-testid="track-view-evidence"]').trigger('click')
			await flushPromises()
			await vi.waitFor(() => {
				expect(
					wrapper?.findComponent({ name: 'ListTrackEvidenceLens' }).exists()
				).toBe(true)
			})
			const rowFor = (id: string) =>
				(
					wrapper
						?.findComponent({ name: 'ListTrackEvidenceLens' })
						.props('rows') as TrackEvidenceLensRow[]
				).find((row) => row.id === id)
			const untouched = rowFor('track-zebra')
			expect(untouched).toBeDefined()
			expect(rowFor('track-middle')?.current.bpm).not.toBe(126.5)

			const next = [...trackState.tracks]
			const index = next.findIndex(({ id }) => id === 'track-middle')
			next[index] = { ...next[index]!, bpm: 126.5 }
			trackState.tracks = next
			await nextTick()

			expect(rowFor('track-middle')?.current.bpm).toBe(126.5)
			expect(rowFor('track-zebra')).toBe(untouched)
		} finally {
			pageMocks.tracks = originalTracks
			pageMocks.trackFilters = originalFilters
		}
	})
})
