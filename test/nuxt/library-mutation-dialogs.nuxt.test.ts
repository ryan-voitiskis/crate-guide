import { nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { createMockLibraryRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AlertConfirmRemoveRecord from '~/components/records/AlertConfirmRemoveRecord.vue'
import DialogRecordCreateManual from '~/components/records/DialogRecordCreateManual.vue'
import DialogClearAllData from '~/components/settings/DialogClearAllData.vue'
import DialogDeleteAccount from '~/components/settings/DialogDeleteAccount.vue'
import { useCratesStore } from '~/stores/cratesStore'
import { useManualRecordEntryStore } from '~/stores/manualRecordEntryStore'
import { useRecordDetailsStore } from '~/stores/recordDetailsStore'
import { useRecordsStore } from '~/stores/recordsStore'
import { useTracksStore } from '~/stores/tracksStore'

const mutationMocks = vi.hoisted(() => ({
	removeRecordFromCollection: vi.fn(),
	deleteAllUserData: vi.fn()
}))

const userMock = vi.hoisted(() => ({
	supaUser: { email: 'listener@example.com' },
	supaUserId: 'listener-user-id',
	currentKeyFormat: 'camelot' as const,
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

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

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
	const record = createMockLibraryRecord({
		id: 'record-1',
		title: 'Record One'
	})
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
		createMockLibraryRecord({ id: 'record-1' }),
		createMockLibraryRecord({ id: 'record-2' })
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

async function mountManualRecordDialog() {
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: (_actionName, store) =>
			!['manualRecordEntry', 'recordDetails'].includes(store.$id)
	})
	const manualEntry = useManualRecordEntryStore(pinia as Pinia)
	const recordDetails = useRecordDetailsStore(pinia as Pinia)
	const records = useRecordsStore(pinia as Pinia)
	manualEntry.openDialog()

	const wrapper = await mountSuspended(DialogRecordCreateManual, {
		global: { plugins: [pinia] }
	})
	wrappers.add(wrapper)
	await settleDialog()
	return { manualEntry, recordDetails, records, wrapper }
}

async function startManualRecordCreation(title: string) {
	await getBody().get('#manual-record-title').setValue(title)
	await findButton('Next').trigger('click')
	await settleDialog()
	await findButton('Create record').trigger('click')
}

describe('library mutation dialogs', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		userMock.deleteAccount.mockReset()
		userMock.supaUser = { email: 'listener@example.com' }
		userMock.supaUserId = 'listener-user-id'
		userMock.signOutForReauthentication.mockReset().mockResolvedValue(true)
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

	it.each([
		{ status: 'deleted', coverCleanupComplete: true } as const,
		{ status: 'recent-auth-required' } as const,
		{ status: 'failed' } as const
	])(
		'ignores stale $status completion after reopening for another account',
		async (staleResult) => {
			const firstDeletion = createDeferred<typeof staleResult>()
			const secondDeletion = createDeferred<{ status: 'failed' }>()
			userMock.deleteAccount
				.mockReturnValueOnce(firstDeletion.promise)
				.mockReturnValueOnce(secondDeletion.promise)
			const { wrapper } = await mountDeleteAccountDialog()
			await getBody()
				.get('#account-deletion-confirmation')
				.setValue('listener@example.com')
			await findLastButton('Delete Account').trigger('click')
			await nextTick()

			await findButton('Cancel').trigger('click')
			await settleDialog()
			userMock.supaUser = { email: 'replacement@example.com' }
			userMock.supaUserId = 'replacement-user-id'
			await wrapper.get('button').trigger('click')
			await settleDialog()
			await getBody()
				.get('#account-deletion-confirmation')
				.setValue('replacement@example.com')
			await findLastButton('Delete Account').trigger('click')
			await nextTick()

			expect(userMock.deleteAccount).toHaveBeenNthCalledWith(
				1,
				'listener@example.com'
			)
			expect(userMock.deleteAccount).toHaveBeenNthCalledWith(
				2,
				'replacement@example.com'
			)

			firstDeletion.resolve(staleResult)
			await settleDialog()

			expect(getBody().text()).toContain('This action cannot be undone.')
			expect(getBody().text()).not.toContain('Sign in again to continue')
			expect(
				(
					getBody().get('#account-deletion-confirmation')
						.element as HTMLInputElement
				).value
			).toBe('replacement@example.com')
			expect(
				findLastButton('Delete Account').attributes('disabled')
			).toBeDefined()

			secondDeletion.resolve({ status: 'failed' })
			await settleDialog()
			expect(getBody().text()).toContain('This action cannot be undone.')
		}
	)

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

	it.each(['success', 'failure'] as const)(
		'keeps a reopened manual record form when an older creation settles with %s',
		async (outcome) => {
			const dialog = await mountManualRecordDialog()
			const firstCreation = createDeferred<ReturnType<
				typeof createMockLibraryRecord
			> | null>()
			const secondCreation = createDeferred<ReturnType<
				typeof createMockLibraryRecord
			> | null>()
			vi.mocked(dialog.records.createRecordWithTracks)
				.mockReturnValueOnce(firstCreation.promise)
				.mockReturnValueOnce(secondCreation.promise)

			await startManualRecordCreation('First Manual Record')
			await vi.waitFor(() => {
				expect(dialog.records.createRecordWithTracks).toHaveBeenCalledOnce()
			})
			await findButton('Close').trigger('click')
			await settleDialog()
			dialog.manualEntry.openDialog()
			await settleDialog()
			await startManualRecordCreation('Replacement Manual Record')
			await vi.waitFor(() => {
				expect(dialog.records.createRecordWithTracks).toHaveBeenCalledTimes(2)
			})
			expect(findButton('Create record').attributes('aria-busy')).toBe('true')

			firstCreation.resolve(
				outcome === 'success'
					? createMockLibraryRecord({ id: 'first-created-record' })
					: null
			)
			await settleDialog()

			expect(dialog.manualEntry.isDialogOpen).toBe(true)
			expect(dialog.recordDetails.selectedRecordId).toBeNull()
			expect(getBody().text()).toContain('Add Record Manually')
			await findButton('Back').trigger('click')
			await settleDialog()
			expect(
				(getBody().get('#manual-record-title').element as HTMLInputElement)
					.value
			).toBe('Replacement Manual Record')
			await findButton('Next').trigger('click')
			await settleDialog()
			expect(findButton('Create record').attributes('aria-busy')).toBe('true')

			secondCreation.resolve(null)
			await settleDialog()
		}
	)
})
