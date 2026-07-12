import { nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AlertConfirmRemoveRecord from '~/components/records/AlertConfirmRemoveRecord.vue'
import DialogClearAllData from '~/components/settings/DialogClearAllData.vue'
import { useCratesStore } from '~/stores/cratesStore'
import { useRecordDetailsStore } from '~/stores/recordDetailsStore'
import { useRecordsStore } from '~/stores/recordsStore'
import { useTracksStore } from '~/stores/tracksStore'

const mutationMocks = vi.hoisted(() => ({
	removeRecordFromCollection: vi.fn(),
	deleteAllUserData: vi.fn()
}))

mockNuxtImport('useLibraryMutations', () => {
	return () => mutationMocks
})

const wrappers = new Set<VueWrapper>()

function getBody() {
	return new DOMWrapper(document.body)
}

async function settleDialog() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

function findButton(label: string) {
	const button = getBody()
		.findAll('button')
		.find((candidate) => candidate.text().trim() === label)
	expect(button).toBeDefined()
	return button!
}

async function mountRemoveRecordDialog() {
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: true
	})
	const record = createMockRecord({ id: 'record-1', title: 'Record One' })
	const recordDetails = useRecordDetailsStore(pinia as Pinia)
	const crates = useCratesStore(pinia as Pinia)
	recordDetails.recordToRemove = record
	recordDetails.selectedRecordId = record.id
	vi.mocked(crates.getCratesContainingRecord).mockReturnValue([])

	const wrapper = await mountSuspended(AlertConfirmRemoveRecord, {
		global: { plugins: [pinia] }
	})
	wrappers.add(wrapper)
	await settleDialog()

	return { recordDetails }
}

async function mountClearAllDataDialog() {
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: true
	})
	const records = useRecordsStore(pinia as Pinia)
	const tracks = useTracksStore(pinia as Pinia)
	records.records = [
		createMockRecord({ id: 'record-1' }),
		createMockRecord({ id: 'record-2' })
	]
	tracks.tracks = [createMockTrack({ id: 'track-1' })]

	const wrapper = await mountSuspended(DialogClearAllData, {
		global: { plugins: [pinia] }
	})
	wrappers.add(wrapper)
	await wrapper.get('button').trigger('click')
	await settleDialog()

	return { wrapper }
}

describe('library mutation dialogs', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it.each([true, false])(
		'clears the pending record after remove resolves with %s',
		async (result) => {
			mutationMocks.removeRecordFromCollection.mockResolvedValue(result)
			const { recordDetails } = await mountRemoveRecordDialog()

			await findButton('Remove').trigger('click')
			await settleDialog()

			expect(mutationMocks.removeRecordFromCollection).toHaveBeenCalledOnce()
			expect(mutationMocks.removeRecordFromCollection).toHaveBeenCalledWith(
				'record-1'
			)
			expect(recordDetails.recordToRemove).toBeNull()
			if (result) {
				expect(recordDetails.closeRecord).toHaveBeenCalledOnce()
			} else {
				expect(recordDetails.closeRecord).not.toHaveBeenCalled()
			}
		}
	)

	it('closes clear-all after the coordinator succeeds', async () => {
		mutationMocks.deleteAllUserData.mockResolvedValue(true)
		await mountClearAllDataDialog()
		await getBody().get('#confirmation').setValue('2')
		await findButton('Delete All Data').trigger('click')
		await settleDialog()

		expect(mutationMocks.deleteAllUserData).toHaveBeenCalledOnce()
		expect(getBody().text()).not.toContain('This action cannot be undone.')
	})

	it('keeps clear-all open after the coordinator fails', async () => {
		mutationMocks.deleteAllUserData.mockResolvedValue(false)
		await mountClearAllDataDialog()
		await getBody().get('#confirmation').setValue('2')
		await findButton('Delete All Data').trigger('click')
		await settleDialog()

		expect(mutationMocks.deleteAllUserData).toHaveBeenCalledOnce()
		expect(getBody().text()).toContain('This action cannot be undone.')
	})
})
