import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DialogCrateForm from '~/components/crates/DialogCrateForm.vue'
import { useCratesStore } from '~/stores/cratesStore'
import type { Crate } from '~~/shared/types/supabase'

const wrappers = new Set<VueWrapper>()

const createdCrate: Crate = {
	id: 'crate-1',
	user_id: 'test-user',
	name: 'Deep House',
	description: 'Late-night records',
	color: '#3B82F6',
	records: [],
	created_at: null,
	updated_at: null
}

function getBody() {
	return new DOMWrapper(document.body)
}

function getCreateButton() {
	const buttons = getBody().findAll('[data-slot="button"]')
	const createButton = buttons.find(
		(button) => button.text().trim() === 'Create'
	)
	expect(createButton).toBeDefined()
	return createButton!
}

async function settleDialog() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

async function mountDialog() {
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: true
	})
	const wrapper = await mountSuspended(DialogCrateForm, {
		props: { open: true },
		global: { plugins: [pinia] }
	})
	wrappers.add(wrapper)
	await settleDialog()

	return {
		wrapper,
		crates: useCratesStore(pinia as Pinia)
	}
}

describe('DialogCrateForm', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.restoreAllMocks()
		document.body.innerHTML = ''
	})

	it('creates a crate, emits it, and closes the dialog', async () => {
		const { wrapper, crates } = await mountDialog()
		vi.mocked(crates.createCrate).mockResolvedValue(createdCrate)
		const body = getBody()

		await body.get('#name').setValue('  Deep House  ')
		await body.get('#description').setValue('  Late-night records  ')
		await body.get('[aria-label="Blue"]').trigger('click')
		await nextTick()
		await getCreateButton().trigger('click')

		await vi.waitFor(() => {
			expect(crates.createCrate).toHaveBeenCalledWith({
				name: 'Deep House',
				description: 'Late-night records',
				color: '#3B82F6',
				records: []
			})
		})
		await settleDialog()

		expect(crates.updateCrate).not.toHaveBeenCalled()
		expect(wrapper.emitted('saved')).toEqual([[createdCrate]])
		expect(wrapper.emitted('update:open')).toContainEqual([false])
	})

	it('does not call the store when validation fails', async () => {
		const { crates } = await mountDialog()
		const body = getBody()

		await getCreateButton().trigger('click')
		await vi.waitFor(() => {
			expect(body.text()).toContain('Name is required')
		})

		expect(crates.createCrate).not.toHaveBeenCalled()
		expect(crates.updateCrate).not.toHaveBeenCalled()
	})
})
