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

const initialCrate: Crate = {
	id: 'crate-1',
	user_id: 'test-user-id',
	name: 'Initial v1',
	description: 'Initial description',
	color: null,
	records: [],
	created_at: '2026-07-19T04:00:00.000001Z',
	updated_at: '2026-07-19T04:00:00.000001Z'
}

const authoritativeCrate: Crate = {
	...initialCrate,
	name: 'Remote v3',
	description: 'Authoritative description',
	color: '#3B82F6',
	updated_at: '2026-07-19T04:00:00.000003Z'
}

function createDeferred<T>() {
	let resolvePromise!: (value: T) => void
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve
	})
	return { promise, resolve: resolvePromise }
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

async function mountDialog(updateResult: Promise<Crate | null>) {
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: true,
		initialState: {
			crates: { crates: [initialCrate] },
			records: { records: [] }
		}
	})
	const crates = useCratesStore(pinia as Pinia)
	const records = useRecordsStore(pinia as Pinia)
	vi.mocked(records.getRecordsByIds).mockReturnValue([])
	vi.mocked(crates.updateCrate).mockReturnValueOnce(updateResult)

	const wrapper = await mountSuspended(DialogCrateDetails, {
		props: { open: true, crate: initialCrate },
		global: { plugins: [pinia] }
	})
	wrappers.add(wrapper)
	await settleDialog()

	return { crates, wrapper }
}

describe('DialogCrateDetails', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('keeps a rejected edit and merges only deliberate changes after reviewing the latest version', async () => {
		const pending = createDeferred<Crate | null>()
		const { crates, wrapper } = await mountDialog(pending.promise)
		await getBody().get('[aria-label="Edit crate"]').trigger('click')
		await settleDialog()
		await getBody().get('input[name="name"]').setValue('My edited name')
		await getButton('Save').trigger('click')
		await vi.waitFor(() => expect(crates.updateCrate).toHaveBeenCalledOnce())
		expect(crates.updateCrate).toHaveBeenCalledWith(
			'crate-1',
			{ name: 'My edited name' },
			expect.objectContaining({ expectedUpdatedAt: initialCrate.updated_at })
		)
		await wrapper.setProps({ crate: authoritativeCrate })
		vi.mocked(crates.updateCrate).mock.calls[0]![2]!.onConflict!(
			authoritativeCrate
		)
		pending.resolve(null)
		await settleDialog()
		expect(getBody().text()).toContain(
			'This crate changed while you were editing.'
		)
		expect(getBody().get('input[name="name"]').element).toHaveProperty(
			'value',
			'My edited name'
		)
		expect(getButton('Save').attributes('disabled')).toBeDefined()
		await getButton('Keep my edits and review').trigger('click')
		await settleDialog()
		expect(
			getBody().get('textarea[name="description"]').element
		).toHaveProperty('value', authoritativeCrate.description)
		expect(getBody().get('[aria-label="Blue"]').classes()).toContain(
			'border-foreground'
		)
		vi.mocked(crates.updateCrate).mockResolvedValueOnce({
			...authoritativeCrate,
			name: 'My edited name'
		})
		await getButton('Save').trigger('click')
		await vi.waitFor(() => expect(crates.updateCrate).toHaveBeenCalledTimes(2))
		expect(crates.updateCrate).toHaveBeenLastCalledWith(
			'crate-1',
			{ name: 'My edited name' },
			expect.objectContaining({
				expectedUpdatedAt: authoritativeCrate.updated_at
			})
		)
		await settleDialog()
		expect(getBody().text()).not.toContain('Edit Crate')
	})

	it('retains unsaved values after a transport failure instead of resetting to changing props', async () => {
		const pending = createDeferred<Crate | null>()
		const { wrapper } = await mountDialog(pending.promise)
		await getBody().get('[aria-label="Edit crate"]').trigger('click')
		await settleDialog()
		await getBody().get('input[name="name"]').setValue('Keep this input')
		await getBody().get('[aria-label="Red"]').trigger('click')
		await getButton('Save').trigger('click')
		await wrapper.setProps({ crate: authoritativeCrate })
		pending.resolve(null)
		await settleDialog()
		expect(getBody().get('input[name="name"]').element).toHaveProperty(
			'value',
			'Keep this input'
		)
		expect(getBody().get('[aria-label="Red"]').classes()).toContain(
			'border-foreground'
		)
		expect(getBody().text()).toContain('Edit Crate')
	})

	it('does not let an older save close a newly opened editor', async () => {
		const pending = createDeferred<Crate | null>()
		const { crates, wrapper } = await mountDialog(pending.promise)
		await getBody().get('[aria-label="Edit crate"]').trigger('click')
		await settleDialog()
		await getBody().get('input[name="name"]').setValue('First editor')
		await getButton('Save').trigger('click')
		await vi.waitFor(() => expect(crates.updateCrate).toHaveBeenCalledOnce())
		await wrapper.setProps({ open: false })
		await wrapper.setProps({
			open: true,
			crate: { ...authoritativeCrate, id: 'crate-2' }
		})
		await settleDialog()
		await getBody().get('[aria-label="Edit crate"]').trigger('click')
		await settleDialog()
		await getBody().get('input[name="name"]').setValue('Second editor')
		pending.resolve({ ...initialCrate, name: 'First editor' })
		await settleDialog()
		expect(getBody().text()).toContain('Edit Crate')
		expect(getBody().get('input[name="name"]').element).toHaveProperty(
			'value',
			'Second editor'
		)
	})
})
