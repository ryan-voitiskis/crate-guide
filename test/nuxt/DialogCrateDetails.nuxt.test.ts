import { nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DialogCrateDetails from '~/components/crates/DialogCrateDetails.vue'
import { useCratesStore } from '~/stores/cratesStore'
import { useRecordsStore } from '~/stores/recordsStore'
import type { Crate } from '~~/shared/types/supabase'

const mockToast = vi.hoisted(() =>
	Object.assign(vi.fn(), {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warning: vi.fn()
	})
)

vi.mock('vue-sonner', () => ({ toast: mockToast }))

const mockUser = vi.hoisted(() => ({
	supaUserId: 'test-user-id',
	resolveAuthenticatedUserId: vi.fn(async () => 'test-user-id')
}))

mockNuxtImport('useUserStore', () => () => mockUser)

const wrappers = new Set<VueWrapper>()

const crate: Crate = {
	id: 'crate-1',
	user_id: 'test-user-id',
	name: 'Remote v3',
	description: 'Authoritative description',
	color: null,
	records: [],
	created_at: '2026-07-19T04:00:00.000001Z',
	updated_at: '2026-07-19T04:00:00.000003Z'
}

function getBody() {
	return new DOMWrapper(document.body)
}

function getButton(label: string) {
	const button = getBody()
		.findAll('button')
		.find((candidate) => candidate.text().trim() === label)
	expect(button).toBeDefined()
	return button!
}

async function settleDialog() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

async function mountDialog() {
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: true,
		initialState: {
			crates: { crates: [crate] },
			records: { records: [] }
		}
	})
	const crates = useCratesStore(pinia as Pinia)
	const records = useRecordsStore(pinia as Pinia)
	vi.mocked(records.getRecordsByIds).mockReturnValue([])
	vi.mocked(crates.updateCrate).mockResolvedValue(null)

	const wrapper = await mountSuspended(DialogCrateDetails, {
		props: { open: true, crate },
		global: { plugins: [pinia] }
	})
	wrappers.add(wrapper)
	await settleDialog()

	return { crates }
}

describe('DialogCrateDetails', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('stays in edit mode when metadata reconciliation rejects the response', async () => {
		const { crates } = await mountDialog()

		await getBody().get('[aria-label="Edit crate"]').trigger('click')
		await settleDialog()
		expect(getBody().text()).toContain('Edit Crate')
		await getBody().get('input[name="name"]').setValue('Rejected local name')
		await getButton('Save').trigger('click')
		await vi.waitFor(() => {
			expect(crates.updateCrate).toHaveBeenCalledWith('crate-1', {
				name: 'Rejected local name',
				description: 'Authoritative description',
				color: null
			})
		})
		await settleDialog()

		expect(getBody().text()).toContain('Edit Crate')
		expect(getBody().find('[aria-label="Cancel edit"]').exists()).toBe(true)
		expect(getBody().find('input[name="name"]').exists()).toBe(true)
	})
})
