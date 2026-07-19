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
	vi.mocked(crates.updateCrate).mockResolvedValueOnce({
		...authoritativeCrate,
		name: 'Deliberate v4',
		updated_at: '2026-07-19T04:00:00.000004Z'
	})

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

	it('resets a rejected edit to the transitioned authoritative baseline before a subsequent edit', async () => {
		const updateResult = createDeferred<Crate | null>()
		const { crates, wrapper } = await mountDialog(updateResult.promise)

		await getBody().get('[aria-label="Edit crate"]').trigger('click')
		await settleDialog()
		expect(getBody().text()).toContain('Edit Crate')
		await getBody().get('input[name="name"]').setValue('Rejected local name')
		await getBody()
			.get('textarea[name="description"]')
			.setValue('Rejected local description')
		await getBody().get('[aria-label="Red"]').trigger('click')
		await getButton('Save').trigger('click')
		await vi.waitFor(() => {
			expect(crates.updateCrate).toHaveBeenCalledWith('crate-1', {
				name: 'Rejected local name',
				description: 'Rejected local description',
				color: '#EF4444'
			})
		})

		await wrapper.setProps({ crate: authoritativeCrate })
		await settleDialog()
		expect(
			(getBody().get('input[name="name"]').element as HTMLInputElement).value
		).toBe('Rejected local name')

		updateResult.resolve(null)
		await settleDialog()

		expect(getBody().text()).toContain('Edit Crate')
		expect(getBody().find('[aria-label="Cancel edit"]').exists()).toBe(true)
		expect(
			(getBody().get('input[name="name"]').element as HTMLInputElement).value
		).toBe('Remote v3')
		expect(
			(
				getBody().get('textarea[name="description"]')
					.element as HTMLTextAreaElement
			).value
		).toBe('Authoritative description')
		expect(getBody().get('[aria-label="Blue"]').classes()).toContain(
			'border-foreground'
		)
		expect(getBody().get('[aria-label="Red"]').classes()).not.toContain(
			'border-foreground'
		)

		await getBody().get('input[name="name"]').setValue('Deliberate v4')
		await getButton('Save').trigger('click')
		await vi.waitFor(() => {
			expect(crates.updateCrate).toHaveBeenLastCalledWith('crate-1', {
				name: 'Deliberate v4',
				description: 'Authoritative description',
				color: '#3B82F6'
			})
		})
		await settleDialog()
		expect(getBody().text()).not.toContain('Edit Crate')
	})
})
