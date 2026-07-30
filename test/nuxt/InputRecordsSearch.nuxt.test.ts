import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InputRecordsSearch from '~/components/shared/InputRecordsSearch.vue'

const searchMocks = vi.hoisted(() => ({
	performSearch: vi.fn(),
	searchQuery: ''
}))

mockNuxtImport('useWorkbenchRecordsStore', () => () => searchMocks)

describe('InputRecordsSearch', () => {
	afterEach(() => {
		searchMocks.performSearch.mockReset()
		searchMocks.searchQuery = ''
	})

	it('forwards the generated input model value to the record search store', async () => {
		const wrapper = await mountSuspended(InputRecordsSearch)

		await wrapper.get('input').setValue('Needle-7')

		expect(searchMocks.performSearch).toHaveBeenCalledWith('Needle-7')
	})
})
