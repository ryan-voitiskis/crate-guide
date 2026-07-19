import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibraryMutations } from '../useLibraryMutations'

const records = {
	removeRecordFromCollection: vi.fn(),
	captureAccountContext: vi.fn(),
	isCurrentAccountContext: vi.fn(),
	drainCoverCleanup: vi.fn(),
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

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

const accountContext = { generation: 1, userId: 'account-a' }

describe('useLibraryMutations', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		records.captureAccountContext.mockResolvedValue(accountContext)
		records.isCurrentAccountContext.mockReturnValue(true)
		records.drainCoverCleanup.mockResolvedValue(true)
	})

	it('cleans track and crate state in order after record removal succeeds', async () => {
		records.removeRecordFromCollection.mockResolvedValue(true)
		const mutations = useLibraryMutations()

		const result = await mutations.removeRecordFromCollection('record-1')

		expect(result).toBe(true)
		expect(records.captureAccountContext).toHaveBeenCalledOnce()
		expect(records.removeRecordFromCollection).toHaveBeenCalledOnce()
		expect(records.removeRecordFromCollection).toHaveBeenCalledWith(
			'record-1',
			accountContext
		)
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

	it('does not clean replacement-account state after stale record removal', async () => {
		const removalCommit = createDeferred<boolean>()
		records.removeRecordFromCollection.mockReturnValueOnce(
			removalCommit.promise
		)
		const mutations = useLibraryMutations()
		const removal = mutations.removeRecordFromCollection('shared-record-id')
		await vi.waitFor(() => {
			expect(records.removeRecordFromCollection).toHaveBeenCalledWith(
				'shared-record-id',
				accountContext
			)
		})

		records.isCurrentAccountContext.mockReturnValue(false)
		removalCommit.resolve(true)

		await expect(removal).resolves.toBe(false)
		expect(tracks.removeTracksByRecordId).not.toHaveBeenCalled()
		expect(crates.removeRecordFromAllCrates).not.toHaveBeenCalled()
	})

	it('cleans each owning store in order after delete-all succeeds', async () => {
		user.deleteAllUserData.mockResolvedValue(true)
		const mutations = useLibraryMutations()

		const result = await mutations.deleteAllUserData()

		expect(result).toBe(true)
		expect(user.deleteAllUserData).toHaveBeenCalledWith(accountContext.userId)
		expect(records.drainCoverCleanup).toHaveBeenCalledWith({
			fresh: true,
			context: accountContext
		})
		expect(records.clearRecords).toHaveBeenCalledOnce()
		expect(tracks.clearTracks).toHaveBeenCalledOnce()
		expect(crates.clearAllCrateRecords).toHaveBeenCalledOnce()
		expect(session.clearSavedSetTracks).toHaveBeenCalledOnce()
		expect(session.clearSession).toHaveBeenCalledOnce()
		const callOrder = [
			user.deleteAllUserData,
			records.drainCoverCleanup,
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
		expect(records.drainCoverCleanup).not.toHaveBeenCalled()
	})

	it('clears local state when the best-effort drain rejects', async () => {
		user.deleteAllUserData.mockResolvedValue(true)
		records.drainCoverCleanup.mockRejectedValue(
			new Error('cleanup function unavailable')
		)
		const mutations = useLibraryMutations()

		await expect(mutations.deleteAllUserData()).resolves.toBe(true)

		expect(records.clearRecords).toHaveBeenCalledOnce()
		expect(tracks.clearTracks).toHaveBeenCalledOnce()
		expect(crates.clearAllCrateRecords).toHaveBeenCalledOnce()
		expect(session.clearSavedSetTracks).toHaveBeenCalledOnce()
		expect(session.clearSession).toHaveBeenCalledOnce()
	})

	it('commits deletion before requesting fresh cleanup and clearing state', async () => {
		const deletionCommit = createDeferred<boolean>()
		user.deleteAllUserData.mockReturnValueOnce(deletionCommit.promise)
		const drainResult = createDeferred<boolean>()
		records.drainCoverCleanup.mockReturnValueOnce(drainResult.promise)
		const mutations = useLibraryMutations()

		const deletion = mutations.deleteAllUserData()
		await Promise.resolve()
		expect(records.drainCoverCleanup).not.toHaveBeenCalled()
		expect(records.clearRecords).not.toHaveBeenCalled()

		deletionCommit.resolve(true)
		await vi.waitFor(() => {
			expect(records.drainCoverCleanup).toHaveBeenCalledWith({
				fresh: true,
				context: accountContext
			})
		})
		expect(records.clearRecords).not.toHaveBeenCalled()
		expect(tracks.clearTracks).not.toHaveBeenCalled()

		drainResult.resolve(false)
		await expect(deletion).resolves.toBe(true)
		expect(records.clearRecords).toHaveBeenCalledOnce()
		expect(tracks.clearTracks).toHaveBeenCalledOnce()
	})

	it('does not drain or clear replacement state after stale deletion success', async () => {
		const deletionCommit = createDeferred<boolean>()
		user.deleteAllUserData.mockReturnValueOnce(deletionCommit.promise)
		const mutations = useLibraryMutations()
		const deletion = mutations.deleteAllUserData()
		await vi.waitFor(() => {
			expect(user.deleteAllUserData).toHaveBeenCalledWith(accountContext.userId)
		})

		records.isCurrentAccountContext.mockReturnValue(false)
		deletionCommit.resolve(true)

		await expect(deletion).resolves.toBe(false)
		expect(records.drainCoverCleanup).not.toHaveBeenCalled()
		expect(records.clearRecords).not.toHaveBeenCalled()
		expect(tracks.clearTracks).not.toHaveBeenCalled()
		expect(crates.clearAllCrateRecords).not.toHaveBeenCalled()
		expect(session.clearSession).not.toHaveBeenCalled()
	})
})
