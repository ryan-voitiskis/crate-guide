export function useLibraryMutations() {
	const records = useWorkbenchRecordsStore()
	const tracks = useWorkbenchTracksStore()
	const crates = useWorkbenchCratesStore()
	const session = useWorkbenchSessionStore()
	const user = useWorkbenchUserStore()

	async function removeRecordFromCollection(recordId: string) {
		const context = await records.captureAccountContext()
		if (!context) return false
		const affectedCrateIds = crates.getCrateIdsAffectedByRecordRemoval(recordId)
		const success = await records.removeRecordFromCollection(recordId, context)
		if (!success || !records.isCurrentAccountContext(context)) return false

		tracks.removeTracksByRecordId(recordId)
		crates.removeRecordFromCrates(recordId, affectedCrateIds)
		return true
	}

	async function deleteAllUserData() {
		const expectedUserId = user.supaUserId
		if (!expectedUserId) return false
		const context = await records.captureAccountContext()
		if (!context) return false
		const success = await user.deleteAllUserData(expectedUserId)
		if (!success || !records.isCurrentAccountContext(context)) return false
		try {
			await records.drainCoverCleanup({ fresh: true, context })
		} catch {
			// Cleanup jobs are durable; clearing local data must not undo a successful
			// database deletion when a best-effort drain cannot run.
		}
		if (!records.isCurrentAccountContext(context)) return false

		records.clearRecords()
		tracks.clearTracks()
		crates.clearAllCrateRecords()
		session.clearSavedSetTracks()
		session.clearSession()
		return true
	}

	return {
		removeRecordFromCollection,
		deleteAllUserData
	}
}
