import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DialogAddRecords from '~/components/crates/DialogAddRecords.vue'
import { useRecordsStore } from '~/stores/recordsStore'
import type { Crate } from '~~/shared/types/supabase'

const coverMocks = vi.hoisted(() => ({ getCoverUrl: vi.fn() }))

mockNuxtImport('useRecordCover', () => () => ({
	getCoverUrl: coverMocks.getCoverUrl
}))

const wrappers = new Set<VueWrapper>()
const dialogStubs = {
	Dialog: { template: '<div><slot /></div>' },
	DialogContent: { template: '<section><slot /></section>' },
	DialogDescription: { template: '<p><slot /></p>' },
	DialogFooter: { template: '<footer><slot /></footer>' },
	DialogHeader: { template: '<header><slot /></header>' },
	DialogTitle: { template: '<h2><slot /></h2>' }
}

function createCrate(): Crate {
	return {
		color: null,
		created_at: '2026-07-22T00:00:00.000Z',
		description: null,
		id: 'crate-large',
		name: 'Large crate',
		records: [],
		updated_at: '2026-07-22T00:00:00.000Z',
		user_id: 'test-user-id'
	}
}

describe('workbench candidate virtualization', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		coverMocks.getCoverUrl.mockReset()
		document.body.innerHTML = ''
	})

	it('filters the complete crate candidate set while resolving only mounted covers', async () => {
		coverMocks.getCoverUrl.mockImplementation(
			async (record: DatabaseRecord) => record.cover
		)
		const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
		const records = useRecordsStore(pinia as Pinia)
		records.records = Array.from({ length: 1_000 }, (_, index) =>
			createMockRecord({
				cover: `https://covers.example/${index}.jpg`,
				cover_storage_path: `test-user-id/record-${index}/cover.webp`,
				id: `record-${String(index).padStart(4, '0')}`,
				title: `Candidate Record ${String(index).padStart(4, '0')}`
			})
		)

		const wrapper = await mountSuspended(DialogAddRecords, {
			props: { crate: createCrate(), open: true },
			global: { plugins: [pinia], stubs: dialogStubs }
		})
		wrappers.add(wrapper)
		await flushPromises()

		const list = wrapper.get('[data-testid="crate-record-candidates"]')
		expect(list.attributes('data-virtual-total-count')).toBe('1000')
		expect(
			wrapper.findAll('[data-candidate-record-id]').length
		).toBeLessThanOrEqual(48)
		expect(coverMocks.getCoverUrl.mock.calls.length).toBeLessThanOrEqual(48)
		expect(
			coverMocks.getCoverUrl.mock.calls.some(
				([record]) => (record as DatabaseRecord).id === 'record-0999'
			)
		).toBe(false)

		await wrapper
			.get('input[placeholder="Search records..."]')
			.setValue('Candidate Record 0999')
		await flushPromises()

		expect(list.attributes('data-virtual-total-count')).toBe('1')
		expect(
			wrapper.get('[data-candidate-record-id]').attributes()
		).toMatchObject({
			'data-candidate-record-id': 'record-0999'
		})
	})
})
