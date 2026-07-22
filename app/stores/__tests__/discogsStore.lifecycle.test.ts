import { createPinia, setActivePinia } from 'pinia'
import {
	createMockDiscogsRelease,
	resetReleaseIdCounter
} from 'test/mocks/fixtures/discogs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiscogsStore } from '../discogsStore'
import {
	createDiscogsStoreHarness,
	createFailure,
	createMockFolder
} from './harness/discogsStoreHarness'

const mockToast = vi.hoisted(() => ({
	error: vi.fn(),
	info: vi.fn(),
	success: vi.fn(),
	warning: vi.fn()
}))

vi.mock('vue-sonner', () => ({ toast: mockToast }))

const harness = createDiscogsStoreHarness()

describe('discogsStore lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetReleaseIdCounter()
		setActivePinia(createPinia())

		harness.reset()
	})

	describe('initial state', () => {
		it('starts with empty folders array', () => {
			const store = useDiscogsStore()
			expect(store.folders).toEqual([])
			expect(store.folderError).toBeNull()
		})

		it('starts with no selected folder', () => {
			const store = useDiscogsStore()
			expect(store.selectedFolder).toBeUndefined()
		})

		it('starts with empty releases to import', () => {
			const store = useDiscogsStore()
			expect(store.releasesToImport).toEqual([])
		})

		it('starts with all loading states as false', () => {
			const store = useDiscogsStore()
			expect(store.isLoadingFolders).toBe(false)
			expect(store.isLoadingSelectedFolder).toBe(false)
			expect(store.isDisconnecting).toBe(false)
			expect(store.isImporting).toBe(false)
		})

		it('starts with all dialogs closed', () => {
			const store = useDiscogsStore()
			expect(store.showFilterDialog).toBe(false)
			expect(store.showImportProgressDialog).toBe(false)
			expect(store.showGetFoldersDialog).toBe(false)
		})

		it('starts with import progress at 0', () => {
			const store = useDiscogsStore()
			expect(store.importProgress).toBe(0)
		})

		it('starts with null import phase', () => {
			const store = useDiscogsStore()
			expect(store.importPhase).toBeNull()
		})

		it('starts with empty import results', () => {
			const store = useDiscogsStore()
			expect(store.importResults).toEqual({
				successful: 0,
				skipped: [],
				failed: []
			})
		})

		it('starts without transfer activity', () => {
			const store = useDiscogsStore()
			expect(store.transferStatus).toBe('idle')
			expect(store.hasTransferActivity).toBe(false)
		})
	})

	describe('resetAccountState', () => {
		it('restores every account-owned field to its initial state', () => {
			const store = useDiscogsStore()
			const release = { ...createMockDiscogsRelease(), selected: true }
			store.folders = [createMockFolder()]
			store.folderError = { message: 'Old folder error' }
			store.selectedFolder = 'House'
			store.releasesToImport = [release]
			store.releaseBeingImported = release
			store.isLoadingFolders = true
			store.isLoadingSelectedFolder = true
			store.isDisconnecting = true
			store.showFilterDialog = true
			store.showImportProgressDialog = true
			store.showGetFoldersDialog = true
			store.importProgress = 65
			store.isImporting = true
			store.importPhase = 'saving'
			store.transferStatus = 'completed'
			store.importResults = {
				successful: 2,
				skipped: [{ label: 'Skipped' }],
				failed: [createFailure({ label: 'Failed', error: 'Old account error' })]
			}

			store.resetAccountState()

			expect(store.folders).toEqual([])
			expect(store.folderError).toBeNull()
			expect(store.selectedFolder).toBeUndefined()
			expect(store.releasesToImport).toEqual([])
			expect(store.releaseBeingImported).toBeNull()
			expect(store.isLoadingFolders).toBe(false)
			expect(store.isLoadingSelectedFolder).toBe(false)
			expect(store.isDisconnecting).toBe(false)
			expect(store.showFilterDialog).toBe(false)
			expect(store.showImportProgressDialog).toBe(false)
			expect(store.showGetFoldersDialog).toBe(false)
			expect(store.importProgress).toBe(0)
			expect(store.isImporting).toBe(false)
			expect(store.importPhase).toBeNull()
			expect(store.transferStatus).toBe('idle')
			expect(store.hasTransferActivity).toBe(false)
			expect(store.importResults).toEqual({
				successful: 0,
				skipped: [],
				failed: []
			})
		})
	})

	describe('transfer monitor', () => {
		it('opens the collection chooser when no transfer is active', () => {
			const store = useDiscogsStore()

			store.openCollectionImport()

			expect(store.showGetFoldersDialog).toBe(true)
			expect(store.showImportProgressDialog).toBe(false)
		})

		it('reopens an active transfer instead of the collection chooser', () => {
			const store = useDiscogsStore()
			store.transferStatus = 'running'
			store.isImporting = true
			store.showFilterDialog = true

			store.openCollectionImport()

			expect(store.showGetFoldersDialog).toBe(false)
			expect(store.showFilterDialog).toBe(false)
			expect(store.showImportProgressDialog).toBe(true)
		})

		it('minimizes and reopens an active transfer without clearing it', () => {
			const store = useDiscogsStore()
			store.transferStatus = 'running'
			store.isImporting = true
			store.importPhase = 'fetching'
			store.importProgress = 42
			store.showImportProgressDialog = true

			store.minimizeTransferMonitor()

			expect(store.showImportProgressDialog).toBe(false)
			expect(store.isImporting).toBe(true)
			expect(store.hasTransferActivity).toBe(true)
			expect(store.transferLabel).toBe('Discogs · Fetching · 42%')

			store.openTransferMonitor()

			expect(store.showImportProgressDialog).toBe(true)
		})

		it('keeps active transfer status when dismissal is attempted', () => {
			const store = useDiscogsStore()
			store.transferStatus = 'running'
			store.isImporting = true
			store.showImportProgressDialog = true

			store.dismissTransferMonitor()

			expect(store.showImportProgressDialog).toBe(false)
			expect(store.transferStatus).toBe('running')
			expect(store.hasTransferActivity).toBe(true)
		})

		it('dismisses a finished transfer from the workspace', () => {
			const store = useDiscogsStore()
			store.transferStatus = 'completed'
			store.importResults = { successful: 7, skipped: [], failed: [] }

			expect(store.transferTone).toBe('success')
			expect(store.transferLabel).toBe('Discogs · 7 imported')

			store.dismissTransferMonitor()

			expect(store.transferStatus).toBe('idle')
			expect(store.hasTransferActivity).toBe(false)
		})
	})
})
