import { reactive } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CardDiscogsRelease from '~/components/import/CardDiscogsRelease.vue'
import DialogCollectionImport from '~/components/import/DialogCollectionImport.vue'
import DialogReleaseImportFilter from '~/components/import/DialogReleaseImportFilter.vue'
import type { DiscogsReleaseToFilter } from '~~/shared/types/discogs'
import { createMockDiscogsRelease } from '../../test/mocks/fixtures/discogs'

const factories = vi.hoisted(() => ({ discogs: vi.fn() }))
mockNuxtImport('useDiscogsStore', () => factories.discogs)

const wrappers = new Set<VueWrapper>()
const dialogStubs = {
	Dialog: { template: '<div><slot /></div>' },
	DialogContent: { template: '<section><slot /></section>' },
	DialogDescription: { template: '<p><slot /></p>' },
	DialogFooter: { template: '<footer><slot /></footer>' },
	DialogHeader: { template: '<header><slot /></header>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	ScrollArea: { template: '<div><slot /></div>' }
}

function release(
	id: number,
	overrides: Partial<DiscogsReleaseToFilter> = {}
): DiscogsReleaseToFilter {
	return {
		...createMockDiscogsRelease({
			id,
			basic_information: {
				...createMockDiscogsRelease({ id }).basic_information,
				artists: [
					{
						...createMockDiscogsRelease({ id }).basic_information.artists[0]!,
						name: 'Test Artist'
					}
				],
				title: 'Test Release ' + id
			}
		}),
		selected: true,
		...overrides
	}
}

describe('Discogs source and manifest UI', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('keeps a folder failure visible with its request id and retry action', async () => {
		const getFolders = vi.fn()
		factories.discogs.mockReturnValue(
			reactive({
				folderError: {
					message: 'Discogs is temporarily unavailable.',
					requestId: '00000000-0000-4000-8000-000000000001'
				},
				folders: [],
				getFolders,
				isLoadingFolders: false,
				isLoadingSelectedFolder: false,
				selectedFolder: undefined,
				showGetFoldersDialog: true
			})
		)
		const wrapper = await mountSuspended(DialogCollectionImport, {
			global: { stubs: dialogStubs }
		})
		wrappers.add(wrapper)

		expect(wrapper.get('[role="alert"]').text()).toContain(
			'Discogs is temporarily unavailable.'
		)
		expect(wrapper.text()).toContain(
			'Request 00000000-0000-4000-8000-000000000001'
		)
		expect(wrapper.text()).not.toContain('No folders found')

		await wrapper.get('[role="alert"] button').trigger('click')
		expect(getFolders).toHaveBeenCalledOnce()
	})

	it('names and preselects every importable release checkbox', async () => {
		const wrapper = await mountSuspended(CardDiscogsRelease, {
			props: { release: release(42), showCheckbox: true }
		})
		wrappers.add(wrapper)

		const checkbox = wrapper.get('[role="checkbox"]')
		expect(checkbox.attributes('aria-label')).toBe(
			'Select Test Release 42 by Test Artist for import'
		)
		expect(checkbox.attributes('data-state')).toBe('checked')

		await checkbox.trigger('click')
		expect(wrapper.emitted('update:selected')).toEqual([[false]])
	})

	it('marks existing releases without exposing a misleading checkbox', async () => {
		const wrapper = await mountSuspended(CardDiscogsRelease, {
			props: {
				release: release(42, { alreadyImported: true, selected: false }),
				showCheckbox: true
			}
		})
		wrappers.add(wrapper)

		expect(wrapper.text()).toContain('In library')
		expect(wrapper.find('[role="checkbox"]').exists()).toBe(false)
	})

	it('summarises selected and existing releases before import', async () => {
		const importSelectedReleases = vi.fn()
		factories.discogs.mockReturnValue(
			reactive({
				importSelectedReleases,
				releasesToImport: [
					release(1),
					release(2, { alreadyImported: true, selected: false })
				],
				showFilterDialog: true
			})
		)
		const wrapper = await mountSuspended(DialogReleaseImportFilter, {
			global: { stubs: dialogStubs }
		})
		wrappers.add(wrapper)

		expect(wrapper.text()).toContain('1 selected · 1 in library')
		expect(wrapper.text()).toContain('Import 1')
		expect(wrapper.text()).toContain('In library')
	})
})
