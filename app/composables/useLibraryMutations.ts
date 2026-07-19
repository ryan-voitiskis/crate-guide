export function useLibraryMutations() {
	const records = useRecordsStore()
	const tracks = useTracksStore()
	const crates = useCratesStore()
	const session = useSessionStore()
	const user = useUserStore()

	async function removeRecordFromCollection(recordId: string) {
		const context = await records.captureAccountContext()
		if (!context) return false
		const success = await records.removeRecordFromCollection(recordId, context)
		if (!success || !records.isCurrentAccountContext(context)) return false

		tracks.removeTracksByRecordId(recordId)
		crates.removeRecordFromAllCrates(recordId)
		return true
	}

	async function deleteAllUserData() {
		const context = await records.captureAccountContext()
		if (!context) return false
		const success = await user.deleteAllUserData(context.userId)
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
