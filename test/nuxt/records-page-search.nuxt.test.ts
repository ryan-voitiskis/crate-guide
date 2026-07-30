import { computed, nextTick, reactive } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RecordsPage from '~/pages/records.vue'

const pageMocks = vi.hoisted(() => ({
	records: null as unknown as Record<string, unknown>,
	recordDetails: {
		openRecord: vi.fn()
	}
}))

mockNuxtImport('useWorkbenchDiscogsStore', () => () => ({
	hasActiveTransfer: false,
	openCollectionImport: vi.fn(),
	openTransferMonitor: vi.fn()
}))
mockNuxtImport('useWorkbenchDiscogsAuthStore', () => () => ({
	isDiscogsConnecting: false,
	isOAuthed: true,
	initDiscogsOAuthFlow: vi.fn()
}))
mockNuxtImport('useWorkbenchManualRecordEntryStore', () => () => ({
	openDialog: vi.fn()
}))
mockNuxtImport('useWorkbenchRecordsStore', () => () => pageMocks.records)
mockNuxtImport('useWorkbenchTracksStore', () => () => ({
	tracks: [],
	isLoadingTracks: false
}))
mockNuxtImport('useWorkbenchCratesStore', () => () => ({
	isLoadingCrates: false
}))
mockNuxtImport(
	'useWorkbenchRecordDetailsStore',
	() => () => pageMocks.recordDetails
)
mockNuxtImport('useWorkbenchCapabilities', () => () => ({
	mode: 'app',
	canPersistSessions: true,
	canMutateLibrary: true,
	canManageCrates: true,
	canConnectDiscogs: true,
	canEnrichTracks: true,
	canManageAccount: true
}))
mockNuxtImport('useMediaQuery', () => () => computed(() => false))
mockNuxtImport('usePageActive', () => () => computed(() => false))

let wrapper: VueWrapper | null = null
let library: DatabaseRecord[]

function renderedRecordIds(): string[] {
	return (
		wrapper?.findAll('[data-record-id]').flatMap((row) => {
			const id = row.attributes('data-record-id')
			return id ? [id] : []
		}) ?? []
	)
}

describe('records page active search', () => {
	beforeEach(() => {
		library = reactive([
			createMockRecord({ id: 'matching-record', title: 'Deep House' }),
			createMockRecord({ id: 'ambient-record', title: 'Ambient Study' })
		])
		pageMocks.records = reactive({
			records: library,
			searchQuery: 'house',
			isLoadingRecords: false,
			get hasRecords() {
				return library.length > 0
			},
			get displayedRecords() {
				return library.filter((record) =>
					record.title.toLowerCase().includes('house')
				)
			},
			get hasSearchQuery() {
				return true
			},
			get hasSearchResults() {
				return library.some((record) =>
					record.title.toLowerCase().includes('house')
				)
			},
			getRecordById: (id: string) => library.find((record) => record.id === id)
		})
		document.body.innerHTML = '<div id="header-left"></div>'
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		document.body.innerHTML = ''
		vi.clearAllMocks()
	})

	it('renders create, update, and delete changes without another search input', async () => {
		wrapper = await mountSuspended(RecordsPage, {
			global: {
				stubs: {
					AlertConfirmRemoveRecord: true,
					Button: true,
					ButtonLibrarySort: true,
					ButtonLoading: true,
					CardRecordShort: true,
					ControlLibraryDensity: true,
					DetailResultsCount: true,
					DialogAddToCrate: true,
					ImageRecordCover: true,
					InputRecordsSearch: true,
					InspectorRecord: true,
					Sheet: true,
					SheetContent: true,
					SheetDescription: true,
					SheetHeader: true,
					SheetTitle: true,
					StateEmptyCollection: true,
					StateLoading: true,
					StateNoSearchResults: true
				}
			}
		})
		await nextTick()
		expect(renderedRecordIds()).toEqual(['matching-record'])

		library.push(createMockRecord({ id: 'created-match', title: 'House Tool' }))
		await nextTick()
		expect(renderedRecordIds()).toEqual(['matching-record', 'created-match'])

		library[0] = { ...library[0]!, title: 'Techno Revision' }
		await nextTick()
		expect(renderedRecordIds()).toEqual(['created-match'])

		library[2] = { ...library[2]!, title: 'House Tool Remastered' }
		await nextTick()
		expect(wrapper.text()).toContain('House Tool Remastered')

		library.splice(2, 1)
		await nextTick()
		expect(renderedRecordIds()).toEqual([])
	})
})
