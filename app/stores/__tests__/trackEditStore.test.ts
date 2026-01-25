import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Import after mocking (no dependencies to mock for this simple store)
import { useTrackEditStore } from '../trackEditStore'

describe('trackEditStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setActivePinia(createPinia())
	})

	describe('initial state', () => {
		it('starts with isDialogOpen as false', () => {
			const store = useTrackEditStore()
			expect(store.isDialogOpen).toBe(false)
		})

		it('starts with isEditing as false', () => {
			const store = useTrackEditStore()
			expect(store.isEditing).toBe(false)
		})

		it('starts with editingTrackId as null', () => {
			const store = useTrackEditStore()
			expect(store.editingTrackId).toBeNull()
		})
	})

	describe('isDialogOpen computed', () => {
		it('returns true when isAddingTrack is true', () => {
			const store = useTrackEditStore()

			store.openAddTrackDialog()

			expect(store.isDialogOpen).toBe(true)
		})

		it('returns true when editingTrackId is set', () => {
			const store = useTrackEditStore()

			store.openEditTrackDialog('track-1')

			expect(store.isDialogOpen).toBe(true)
		})

		it('returns false when both are not set', () => {
			const store = useTrackEditStore()

			expect(store.isDialogOpen).toBe(false)
		})
	})

	describe('isEditing computed', () => {
		it('returns false when editingTrackId is null', () => {
			const store = useTrackEditStore()

			expect(store.isEditing).toBe(false)
		})

		it('returns true when editingTrackId is set', () => {
			const store = useTrackEditStore()

			store.openEditTrackDialog('track-1')

			expect(store.isEditing).toBe(true)
		})

		it('returns false when adding (not editing)', () => {
			const store = useTrackEditStore()

			store.openAddTrackDialog()

			expect(store.isEditing).toBe(false)
		})
	})

	describe('openAddTrackDialog', () => {
		it('sets dialog to open for adding', () => {
			const store = useTrackEditStore()

			store.openAddTrackDialog()

			expect(store.isDialogOpen).toBe(true)
		})

		it('sets editingTrackId to null', () => {
			const store = useTrackEditStore()
			store.openEditTrackDialog('track-1')

			store.openAddTrackDialog()

			expect(store.editingTrackId).toBeNull()
		})

		it('sets isEditing to false', () => {
			const store = useTrackEditStore()
			store.openEditTrackDialog('track-1')

			store.openAddTrackDialog()

			expect(store.isEditing).toBe(false)
		})
	})

	describe('openEditTrackDialog', () => {
		it('sets editingTrackId to the provided id', () => {
			const store = useTrackEditStore()

			store.openEditTrackDialog('track-123')

			expect(store.editingTrackId).toBe('track-123')
		})

		it('sets dialog to open', () => {
			const store = useTrackEditStore()

			store.openEditTrackDialog('track-1')

			expect(store.isDialogOpen).toBe(true)
		})

		it('sets isEditing to true', () => {
			const store = useTrackEditStore()

			store.openEditTrackDialog('track-1')

			expect(store.isEditing).toBe(true)
		})

		it('clears adding state when switching to edit', () => {
			const store = useTrackEditStore()
			store.openAddTrackDialog()

			store.openEditTrackDialog('track-1')

			// isAddingTrack should be false (internal state)
			// We verify by checking isEditing is true
			expect(store.isEditing).toBe(true)
			expect(store.editingTrackId).toBe('track-1')
		})
	})

	describe('closeTrackDialog', () => {
		it('closes dialog when in add mode', () => {
			const store = useTrackEditStore()
			store.openAddTrackDialog()

			store.closeTrackDialog()

			expect(store.isDialogOpen).toBe(false)
		})

		it('closes dialog when in edit mode', () => {
			const store = useTrackEditStore()
			store.openEditTrackDialog('track-1')

			store.closeTrackDialog()

			expect(store.isDialogOpen).toBe(false)
		})

		it('clears editingTrackId', () => {
			const store = useTrackEditStore()
			store.openEditTrackDialog('track-1')

			store.closeTrackDialog()

			expect(store.editingTrackId).toBeNull()
		})

		it('sets isEditing to false', () => {
			const store = useTrackEditStore()
			store.openEditTrackDialog('track-1')

			store.closeTrackDialog()

			expect(store.isEditing).toBe(false)
		})

		it('can be called when dialog is already closed', () => {
			const store = useTrackEditStore()

			// Should not throw
			store.closeTrackDialog()

			expect(store.isDialogOpen).toBe(false)
		})
	})

	describe('workflow scenarios', () => {
		it('supports add -> close flow', () => {
			const store = useTrackEditStore()

			store.openAddTrackDialog()
			expect(store.isDialogOpen).toBe(true)
			expect(store.isEditing).toBe(false)

			store.closeTrackDialog()
			expect(store.isDialogOpen).toBe(false)
		})

		it('supports edit -> close flow', () => {
			const store = useTrackEditStore()

			store.openEditTrackDialog('track-1')
			expect(store.isDialogOpen).toBe(true)
			expect(store.isEditing).toBe(true)
			expect(store.editingTrackId).toBe('track-1')

			store.closeTrackDialog()
			expect(store.isDialogOpen).toBe(false)
			expect(store.isEditing).toBe(false)
			expect(store.editingTrackId).toBeNull()
		})

		it('supports switching from add to edit', () => {
			const store = useTrackEditStore()

			store.openAddTrackDialog()
			expect(store.isEditing).toBe(false)

			store.openEditTrackDialog('track-1')
			expect(store.isEditing).toBe(true)
			expect(store.editingTrackId).toBe('track-1')
		})

		it('supports switching from edit to add', () => {
			const store = useTrackEditStore()

			store.openEditTrackDialog('track-1')
			expect(store.isEditing).toBe(true)

			store.openAddTrackDialog()
			expect(store.isEditing).toBe(false)
			expect(store.editingTrackId).toBeNull()
		})

		it('supports editing different tracks', () => {
			const store = useTrackEditStore()

			store.openEditTrackDialog('track-1')
			expect(store.editingTrackId).toBe('track-1')

			store.openEditTrackDialog('track-2')
			expect(store.editingTrackId).toBe('track-2')
		})
	})
})
