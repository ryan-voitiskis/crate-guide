import { nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DialogAddToCrate from '~/components/shared/DialogAddToCrate.vue'
import { useCratesStore } from '~/stores/cratesStore'
import { useRecordDetailsStore } from '~/stores/recordDetailsStore'
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

function createCrate(id: string, recordIds: string[] = []): Crate {
	return {
		id,
		user_id: 'test-user-id',
		name: id,
		description: null,
		color: null,
		records: recordIds,
		created_at: '2026-07-19T04:00:00.000001Z',
		updated_at: '2026-07-19T04:00:00.000001Z'
	}
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

function getCrateRow(crateName: string) {
	const row = getBody()
		.findAll('.cursor-pointer')
		.find((candidate) => candidate.text().trim() === crateName)
	expect(row).toBeDefined()
	return row!
}

async function settleDialog() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

async function mountDialog() {
	const record = createMockRecord({ id: 'record-1', title: 'Test Record' })
	const addSuccess = createCrate('add-success')
	const addFailure = createCrate('add-failure')
	const removeSuccess = createCrate('remove-success', [record.id])
	const removeFailure = createCrate('remove-failure', [record.id])
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: true,
		initialState: {
			crates: {
				crates: [addSuccess, addFailure, removeSuccess, removeFailure]
			},
			recordDetails: { recordToAddToCrate: record }
		}
	})
	const crates = useCratesStore(pinia as Pinia)
	vi.mocked(crates.getCratesContainingRecord).mockReturnValue([
		removeSuccess,
		removeFailure
	])
	const recordDetails = useRecordDetailsStore(pinia as Pinia)
	recordDetails.recordToAddToCrate = record

	const wrapper = await mountSuspended(DialogAddToCrate, {
		global: { plugins: [pinia] }
	})
	wrappers.add(wrapper)
	await settleDialog()

	return { crates, recordDetails }
}

async function selectAllChanges() {
	await getCrateRow('add-success').trigger('click')
	await getCrateRow('add-failure').trigger('click')
	await getCrateRow('remove-success').trigger('click')
	await getCrateRow('remove-failure').trigger('click')
}

describe('DialogAddToCrate', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('summarizes only reconciled add and remove successes', async () => {
		const { crates, recordDetails } = await mountDialog()
		vi.mocked(crates.addRecordToCrate).mockImplementation(
			async (crateId) => crateId === 'add-success'
		)
		vi.mocked(crates.removeRecordFromCrate).mockImplementation(
			async (crateId) => crateId === 'remove-success'
		)
		await selectAllChanges()

		await getButton('Save').trigger('click')
		await settleDialog()

		expect(vi.mocked(crates.addRecordToCrate).mock.calls).toEqual([
			['add-success', 'record-1', { silent: true }],
			['add-failure', 'record-1', { silent: true }]
		])
		expect(vi.mocked(crates.removeRecordFromCrate).mock.calls).toEqual([
			['remove-success', 'record-1'],
			['remove-failure', 'record-1']
		])
		expect(mockToast.success).toHaveBeenCalledOnce()
		expect(mockToast.success).toHaveBeenCalledWith(
			'Added to 1 crate, Removed from 1 crate'
		)
		expect(recordDetails.recordToAddToCrate).toBeNull()
	})

	it('emits no success summary when every reconciled mutation is false', async () => {
		const { crates, recordDetails } = await mountDialog()
		vi.mocked(crates.addRecordToCrate).mockResolvedValue(false)
		vi.mocked(crates.removeRecordFromCrate).mockResolvedValue(false)
		await selectAllChanges()

		await getButton('Save').trigger('click')
		await settleDialog()

		expect(crates.addRecordToCrate).toHaveBeenCalledTimes(2)
		expect(crates.removeRecordFromCrate).toHaveBeenCalledTimes(2)
		expect(mockToast.success).not.toHaveBeenCalled()
		expect(recordDetails.recordToAddToCrate).toBeNull()
	})
})
