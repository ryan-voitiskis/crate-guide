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
import DialogDeleteAccount from '~/components/settings/DialogDeleteAccount.vue'
import { useCratesStore } from '~/stores/cratesStore'
import { useRecordDetailsStore } from '~/stores/recordDetailsStore'
import { useRecordsStore } from '~/stores/recordsStore'
import { useTracksStore } from '~/stores/tracksStore'

const mutationMocks = vi.hoisted(() => ({
	removeRecordFromCollection: vi.fn(),
	deleteAllUserData: vi.fn()
}))

const userMock = vi.hoisted(() => ({
	supaUser: { email: 'listener@example.com' },
	deleteAccount: vi.fn(),
	signOutForReauthentication: vi.fn().mockResolvedValue(true)
}))

const accountReauthenticationMocks = vi.hoisted(() => ({
	navigate: vi.fn().mockResolvedValue(undefined),
	route: { query: {} as Record<string, string> }
}))

mockNuxtImport('useLibraryMutations', () => {
	return () => mutationMocks
})

mockNuxtImport('useUserStore', () => {
	return () => userMock
})

mockNuxtImport('useRoute', () => {
	return () => accountReauthenticationMocks.route
})

mockNuxtImport('navigateTo', () => accountReauthenticationMocks.navigate)

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

function findLastButton(label: string) {
	const buttons = getBody()
		.findAll('button')
		.filter((candidate) => candidate.text().trim() === label)
	const button = buttons.at(-1)
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

async function mountDeleteAccountDialog(
	options: { openOnMount?: boolean } = {}
) {
	const wrapper = await mountSuspended(DialogDeleteAccount, {
		props: { openOnMount: options.openOnMount ?? false }
	})
	wrappers.add(wrapper)
	if (!options.openOnMount) await wrapper.get('button').trigger('click')
	await settleDialog()
	return { wrapper }
}

describe('library mutation dialogs', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		accountReauthenticationMocks.route.query = {}
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

	it('requires the signed-in email before deleting an account', async () => {
		await mountDeleteAccountDialog()

		const deleteButton = findLastButton('Delete Account')
		expect(deleteButton.attributes('disabled')).toBeDefined()
		await getBody()
			.get('#account-deletion-confirmation')
			.setValue('listener@example.com')

		expect(
			findLastButton('Delete Account').attributes('disabled')
		).toBeUndefined()
	})

	it('keeps account deletion open when the server preserves the account', async () => {
		userMock.deleteAccount.mockResolvedValue({ status: 'failed' })
		await mountDeleteAccountDialog()
		await getBody()
			.get('#account-deletion-confirmation')
			.setValue('listener@example.com')
		await findLastButton('Delete Account').trigger('click')
		await settleDialog()

		expect(userMock.deleteAccount).toHaveBeenCalledWith('listener@example.com')
		expect(getBody().text()).toContain('This action cannot be undone.')
	})

	it('closes account deletion after the server deletes the account', async () => {
		userMock.deleteAccount.mockResolvedValue({
			status: 'deleted',
			coverCleanupComplete: true
		})
		await mountDeleteAccountDialog()
		await getBody()
			.get('#account-deletion-confirmation')
			.setValue('listener@example.com')
		await findLastButton('Delete Account').trigger('click')
		await settleDialog()

		expect(userMock.deleteAccount).toHaveBeenCalledWith('listener@example.com')
		expect(getBody().text()).not.toContain('This action cannot be undone.')
	})

	it('shows a fresh-login action without preserving typed confirmation', async () => {
		userMock.deleteAccount.mockResolvedValue({
			status: 'recent-auth-required'
		})
		await mountDeleteAccountDialog()
		await getBody()
			.get('#account-deletion-confirmation')
			.setValue('listener@example.com')
		await findLastButton('Delete Account').trigger('click')
		await settleDialog()

		expect(getBody().text()).toContain('Sign in again to continue')
		expect(getBody().find('#account-deletion-confirmation').exists()).toBe(
			false
		)
		expect(userMock.signOutForReauthentication).not.toHaveBeenCalled()
	})

	it('cancels from the fresh-login state without signing out', async () => {
		userMock.deleteAccount.mockResolvedValue({
			status: 'recent-auth-required'
		})
		await mountDeleteAccountDialog()
		await getBody()
			.get('#account-deletion-confirmation')
			.setValue('listener@example.com')
		await findLastButton('Delete Account').trigger('click')
		await settleDialog()
		await findButton('Cancel').trigger('click')
		await settleDialog()

		expect(getBody().text()).not.toContain('Sign in again to continue')
		expect(userMock.signOutForReauthentication).not.toHaveBeenCalled()
	})

	it('locally signs out and opens the sanitized Settings return path', async () => {
		userMock.deleteAccount.mockResolvedValue({
			status: 'recent-auth-required'
		})
		await mountDeleteAccountDialog()
		await getBody()
			.get('#account-deletion-confirmation')
			.setValue('listener@example.com')
		await findLastButton('Delete Account').trigger('click')
		await settleDialog()
		await findButton('Sign in again').trigger('click')
		await settleDialog()

		expect(userMock.signOutForReauthentication).toHaveBeenCalledOnce()
		expect(accountReauthenticationMocks.navigate).toHaveBeenCalledWith(
			'/login?redirect=%2Fsettings%3Faction%3Ddelete-account',
			{ replace: true }
		)
	})

	it('reopens from Settings once, removes the action query and starts empty', async () => {
		accountReauthenticationMocks.route.query = {
			action: 'delete-account',
			view: 'compact'
		}
		await mountDeleteAccountDialog({ openOnMount: true })

		expect(getBody().text()).toContain('This action cannot be undone.')
		expect(
			(
				getBody().get('#account-deletion-confirmation')
					.element as HTMLInputElement
			).value
		).toBe('')
		expect(accountReauthenticationMocks.navigate).toHaveBeenCalledWith(
			{ query: { view: 'compact' } },
			{ replace: true }
		)
	})

	it('can delete through the freshly reopened confirmation flow', async () => {
		accountReauthenticationMocks.route.query = { action: 'delete-account' }
		userMock.deleteAccount.mockResolvedValue({
			status: 'deleted',
			coverCleanupComplete: true
		})
		await mountDeleteAccountDialog({ openOnMount: true })
		await getBody()
			.get('#account-deletion-confirmation')
			.setValue('listener@example.com')
		await findLastButton('Delete Account').trigger('click')
		await settleDialog()

		expect(userMock.deleteAccount).toHaveBeenCalledWith('listener@example.com')
		expect(getBody().text()).not.toContain('This action cannot be undone.')
	})
})
