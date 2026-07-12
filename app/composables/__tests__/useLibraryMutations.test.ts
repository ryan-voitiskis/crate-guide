import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibraryMutations } from '../useLibraryMutations'

const records = {
	removeRecordFromCollection: vi.fn(),
	clearRecords: vi.fn()
}
const tracks = {
	removeTracksByRecordId: vi.fn(),
	clearTracks: vi.fn()
}
const crates = {
	removeRecordFromAllCrates: vi.fn(),
	clearAllCrateRecords: vi.fn()
}
const session = {
	clearSavedSetTracks: vi.fn(),
	clearSession: vi.fn()
}
const user = {
	deleteAllUserData: vi.fn()
}

vi.stubGlobal('useRecordsStore', () => records)
vi.stubGlobal('useTracksStore', () => tracks)
vi.stubGlobal('useCratesStore', () => crates)
vi.stubGlobal('useSessionStore', () => session)
vi.stubGlobal('useUserStore', () => user)

describe('useLibraryMutations', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('cleans track and crate state in order after record removal succeeds', async () => {
		records.removeRecordFromCollection.mockResolvedValue(true)
		const mutations = useLibraryMutations()

		const result = await mutations.removeRecordFromCollection('record-1')

		expect(result).toBe(true)
		expect(records.removeRecordFromCollection).toHaveBeenCalledOnce()
		expect(records.removeRecordFromCollection).toHaveBeenCalledWith('record-1')
		expect(tracks.removeTracksByRecordId).toHaveBeenCalledOnce()
		expect(tracks.removeTracksByRecordId).toHaveBeenCalledWith('record-1')
		expect(crates.removeRecordFromAllCrates).toHaveBeenCalledOnce()
		expect(crates.removeRecordFromAllCrates).toHaveBeenCalledWith('record-1')
		expect(
			records.removeRecordFromCollection.mock.invocationCallOrder[0]
		).toBeLessThan(tracks.removeTracksByRecordId.mock.invocationCallOrder[0]!)
		expect(
			tracks.removeTracksByRecordId.mock.invocationCallOrder[0]
		).toBeLessThan(
			crates.removeRecordFromAllCrates.mock.invocationCallOrder[0]!
		)
	})

	it('does not clean dependent state when record removal fails', async () => {
		records.removeRecordFromCollection.mockResolvedValue(false)
		const mutations = useLibraryMutations()

		const result = await mutations.removeRecordFromCollection('record-1')

		expect(result).toBe(false)
		expect(tracks.removeTracksByRecordId).not.toHaveBeenCalled()
		expect(crates.removeRecordFromAllCrates).not.toHaveBeenCalled()
	})

	it('cleans each owning store in order after delete-all succeeds', async () => {
		user.deleteAllUserData.mockResolvedValue(true)
		const mutations = useLibraryMutations()

		const result = await mutations.deleteAllUserData()

		expect(result).toBe(true)
		expect(user.deleteAllUserData).toHaveBeenCalledOnce()
		expect(records.clearRecords).toHaveBeenCalledOnce()
		expect(tracks.clearTracks).toHaveBeenCalledOnce()
		expect(crates.clearAllCrateRecords).toHaveBeenCalledOnce()
		expect(session.clearSavedSetTracks).toHaveBeenCalledOnce()
		expect(session.clearSession).toHaveBeenCalledOnce()
		const callOrder = [
			user.deleteAllUserData,
			records.clearRecords,
			tracks.clearTracks,
			crates.clearAllCrateRecords,
			session.clearSavedSetTracks,
			session.clearSession
		].map((method) => method.mock.invocationCallOrder[0])
		expect(callOrder).toEqual([...callOrder].sort((a, b) => a! - b!))
	})

	it('does not clean dependent state when delete-all fails', async () => {
		user.deleteAllUserData.mockResolvedValue(false)
		const mutations = useLibraryMutations()

		const result = await mutations.deleteAllUserData()

		expect(result).toBe(false)
		expect(records.clearRecords).not.toHaveBeenCalled()
		expect(tracks.clearTracks).not.toHaveBeenCalled()
		expect(crates.clearAllCrateRecords).not.toHaveBeenCalled()
		expect(session.clearSavedSetTracks).not.toHaveBeenCalled()
		expect(session.clearSession).not.toHaveBeenCalled()
	})
})
