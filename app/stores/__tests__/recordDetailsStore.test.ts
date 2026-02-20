import { createPinia, setActivePinia } from 'pinia'
import {
	createMockRecord,
	resetRecordIdCounter
} from 'test/mocks/fixtures/records'
import {
	createMockTrack,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Import after mocking
import { useRecordDetailsStore } from '../recordDetailsStore'

// Mock dependencies
const mockRecords: ReturnType<typeof createMockRecord>[] = []
const mockTracks: ReturnType<typeof createMockTrack>[] = []

const mockRecordsStore = {
	getRecordById: vi.fn((id: string) => mockRecords.find((r) => r.id === id))
}

const mockTracksStore = {
	getTracksByRecordId: vi.fn((recordId: string) =>
		mockTracks.filter((t) => t.record_id === recordId)
	)
}

// Mock sortTracksByPosition utility
const mockSortTracksByPosition = vi.fn((tracks) => {
	// Simple mock sort by position
	return [...tracks].sort((a, b) => {
		const posA = a.position || ''
		const posB = b.position || ''
		return posA.localeCompare(posB)
	})
})

// Stub globals before importing the store
vi.stubGlobal('useRecordsStore', () => mockRecordsStore)
vi.stubGlobal('useTracksStore', () => mockTracksStore)
vi.stubGlobal('sortTracksByPosition', mockSortTracksByPosition)

describe('recordDetailsStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		resetRecordIdCounter()
		resetTrackIdCounter()
		setActivePinia(createPinia())

		// Reset mock data
		mockRecords.length = 0
		mockTracks.length = 0
	})

	describe('initial state', () => {
		it('starts with selectedRecordId as null', () => {
			const store = useRecordDetailsStore()
			expect(store.selectedRecordId).toBeNull()
		})

		it('starts with isEditMode as false', () => {
			const store = useRecordDetailsStore()
			expect(store.isEditMode).toBe(false)
		})

		it('starts with trackToConfirmDelete as null', () => {
			const store = useRecordDetailsStore()
			expect(store.trackToConfirmDelete).toBeNull()
		})

		it('starts with recordToRemove as null', () => {
			const store = useRecordDetailsStore()
			expect(store.recordToRemove).toBeNull()
		})

		it('starts with recordToAddToCrate as null', () => {
			const store = useRecordDetailsStore()
			expect(store.recordToAddToCrate).toBeNull()
		})
	})

	describe('selectedRecord computed', () => {
		it('returns null when selectedRecordId is null', () => {
			const store = useRecordDetailsStore()

			expect(store.selectedRecord).toBeNull()
		})

		it('returns record when selectedRecordId is set', () => {
			const record = createMockRecord({ id: 'record-1', title: 'Test Record' })
			mockRecords.push(record)

			const store = useRecordDetailsStore()
			store.selectedRecordId = 'record-1'

			expect(store.selectedRecord?.title).toBe('Test Record')
		})

		it('returns undefined when record not found', () => {
			const store = useRecordDetailsStore()
			store.selectedRecordId = 'non-existent'

			expect(store.selectedRecord).toBeUndefined()
		})

		it('calls getRecordById with correct id', () => {
			const store = useRecordDetailsStore()
			store.selectedRecordId = 'record-1'

			// Access computed to trigger getter
			store.selectedRecord

			expect(mockRecordsStore.getRecordById).toHaveBeenCalledWith('record-1')
		})
	})

	describe('recordTracks computed', () => {
		it('returns empty array when selectedRecordId is null', () => {
			const store = useRecordDetailsStore()

			expect(store.recordTracks).toEqual([])
		})

		it('returns tracks for selected record', () => {
			mockTracks.push(
				createMockTrack({
					id: 'track-1',
					record_id: 'record-1',
					position: 'A1'
				}),
				createMockTrack({
					id: 'track-2',
					record_id: 'record-1',
					position: 'A2'
				})
			)

			const store = useRecordDetailsStore()
			store.selectedRecordId = 'record-1'

			expect(store.recordTracks.length).toBe(2)
		})

		it('calls getTracksByRecordId with correct id', () => {
			const store = useRecordDetailsStore()
			store.selectedRecordId = 'record-1'

			// Access computed to trigger getter
			store.recordTracks

			expect(mockTracksStore.getTracksByRecordId).toHaveBeenCalledWith(
				'record-1'
			)
		})

		it('sorts tracks by position', () => {
			mockTracks.push(
				createMockTrack({
					id: 'track-2',
					record_id: 'record-1',
					position: 'B1'
				}),
				createMockTrack({
					id: 'track-1',
					record_id: 'record-1',
					position: 'A1'
				})
			)

			const store = useRecordDetailsStore()
			store.selectedRecordId = 'record-1'

			const tracks = store.recordTracks

			expect(mockSortTracksByPosition).toHaveBeenCalled()
			expect(tracks[0]!.position).toBe('A1')
			expect(tracks[1]!.position).toBe('B1')
		})
	})

	describe('openRecord', () => {
		it('sets selectedRecordId', () => {
			const store = useRecordDetailsStore()

			store.openRecord('record-1')

			expect(store.selectedRecordId).toBe('record-1')
		})

		it('defaults isEditMode to false', () => {
			const store = useRecordDetailsStore()
			store.isEditMode = true

			store.openRecord('record-1')

			expect(store.isEditMode).toBe(false)
		})

		it('sets isEditMode when editMode parameter is true', () => {
			const store = useRecordDetailsStore()

			store.openRecord('record-1', true)

			expect(store.isEditMode).toBe(true)
		})

		it('sets isEditMode to false when editMode parameter is false', () => {
			const store = useRecordDetailsStore()
			store.isEditMode = true

			store.openRecord('record-1', false)

			expect(store.isEditMode).toBe(false)
		})
	})

	describe('closeRecord', () => {
		it('sets selectedRecordId to null', () => {
			const store = useRecordDetailsStore()
			store.selectedRecordId = 'record-1'

			store.closeRecord()

			expect(store.selectedRecordId).toBeNull()
		})

		it('sets isEditMode to false', () => {
			const store = useRecordDetailsStore()
			store.isEditMode = true

			store.closeRecord()

			expect(store.isEditMode).toBe(false)
		})

		it('clears trackToConfirmDelete', () => {
			const store = useRecordDetailsStore()
			store.trackToConfirmDelete = createMockTrack()

			store.closeRecord()

			expect(store.trackToConfirmDelete).toBeNull()
		})

		it('clears recordToRemove', () => {
			const store = useRecordDetailsStore()
			store.recordToRemove = createMockRecord()

			store.closeRecord()

			expect(store.recordToRemove).toBeNull()
		})

		it('clears recordToAddToCrate', () => {
			const store = useRecordDetailsStore()
			store.recordToAddToCrate = createMockRecord()

			store.closeRecord()

			expect(store.recordToAddToCrate).toBeNull()
		})
	})

	describe('toggleEditMode', () => {
		it('toggles isEditMode from false to true', () => {
			const store = useRecordDetailsStore()
			store.isEditMode = false

			store.toggleEditMode()

			expect(store.isEditMode).toBe(true)
		})

		it('toggles isEditMode from true to false', () => {
			const store = useRecordDetailsStore()
			store.isEditMode = true

			store.toggleEditMode()

			expect(store.isEditMode).toBe(false)
		})

		it('can toggle multiple times', () => {
			const store = useRecordDetailsStore()

			store.toggleEditMode()
			expect(store.isEditMode).toBe(true)

			store.toggleEditMode()
			expect(store.isEditMode).toBe(false)

			store.toggleEditMode()
			expect(store.isEditMode).toBe(true)
		})
	})

	describe('dialog state management', () => {
		it('can set trackToConfirmDelete', () => {
			const store = useRecordDetailsStore()
			const track = createMockTrack({ id: 'track-1' })

			store.trackToConfirmDelete = track

			expect(store.trackToConfirmDelete?.id).toBe('track-1')
		})

		it('can set recordToRemove', () => {
			const store = useRecordDetailsStore()
			const record = createMockRecord({ id: 'record-1' })

			store.recordToRemove = record

			expect(store.recordToRemove?.id).toBe('record-1')
		})

		it('can set recordToAddToCrate', () => {
			const store = useRecordDetailsStore()
			const record = createMockRecord({ id: 'record-1' })

			store.recordToAddToCrate = record

			expect(store.recordToAddToCrate?.id).toBe('record-1')
		})
	})
})
