import { reactive } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StateEmptyCollection from '~/components/shared/StateEmptyCollection.vue'

const factories = vi.hoisted(() => ({
	discogs: vi.fn(),
	discogsAuth: vi.fn(),
	manualEntry: vi.fn()
}))

mockNuxtImport('useDiscogsStore', () => factories.discogs)
mockNuxtImport('useDiscogsAuthStore', () => factories.discogsAuth)
mockNuxtImport('useManualRecordEntryStore', () => factories.manualEntry)

const openCollectionImport = vi.hoisted(() => vi.fn())
const openTransferMonitor = vi.hoisted(() => vi.fn())
const openManualEntry = vi.hoisted(() => vi.fn())
const wrappers = new Set<VueWrapper>()

function mockDiscogs(overrides: Record<string, unknown> = {}) {
	factories.discogs.mockReturnValue(
		reactive({
			hasActiveTransfer: false,
			importPhase: null,
			importProgress: 0,
			releaseBeingImported: null,
			retryStatus: null,
			transferLabel: 'Discogs · Import complete',
			transferMode: null,
			openCollectionImport,
			openTransferMonitor,
			...overrides
		})
	)
}

describe('empty collection Discogs transfer state', () => {
	beforeEach(() => {
		mockDiscogs()
		factories.discogsAuth.mockReturnValue(
			reactive({
				isDiscogsConnecting: false,
				isOAuthed: true,
				initDiscogsOAuthFlow: vi.fn()
			})
		)
		factories.manualEntry.mockReturnValue({ openDialog: openManualEntry })
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('opens a new collection import from the normal empty state', async () => {
		const wrapper = await mountSuspended(StateEmptyCollection, {
			props: {
				title: 'Add records to start a session',
				description: 'Sessions use your record library.'
			}
		})
		wrappers.add(wrapper)

		expect(wrapper.text()).toContain('Import from Discogs')
		await wrapper.get('button').trigger('click')

		expect(openCollectionImport).toHaveBeenCalledOnce()
	})

	it('replaces competing empty-state actions with active transfer progress', async () => {
		mockDiscogs({
			hasActiveTransfer: true,
			importPhase: 'fetching',
			importProgress: 42,
			retryStatus: { label: 'Autechre – Draft 7.30' },
			transferLabel: 'Discogs · Fetching · 42%',
			transferMode: 'import'
		})
		const wrapper = await mountSuspended(StateEmptyCollection, {
			props: {
				title: 'Add records to start a session',
				description: 'Sessions use your record library.'
			}
		})
		wrappers.add(wrapper)

		expect(wrapper.text()).toContain('Discogs import in progress')
		expect(wrapper.text()).toContain('Fetching release metadata')
		expect(wrapper.text()).toContain('42%')
		expect(wrapper.text()).toContain('Autechre – Draft 7.30')
		expect(wrapper.text()).not.toContain('Import from Discogs')
		expect(wrapper.text()).not.toContain('Add manually')

		await wrapper
			.get('[data-testid="active-discogs-transfer"]')
			.trigger('click')
		expect(openTransferMonitor).toHaveBeenCalledOnce()
	})

	it('uses phase-specific copy while the library is being written', async () => {
		mockDiscogs({
			hasActiveTransfer: true,
			importPhase: 'saving',
			transferLabel: 'Discogs · Writing library',
			transferMode: 'import'
		})
		const wrapper = await mountSuspended(StateEmptyCollection, {
			props: {
				title: 'Start your record library',
				description: 'Import your records.'
			}
		})
		wrappers.add(wrapper)

		expect(wrapper.text()).toContain('Writing records to your library')
		expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
	})
})
