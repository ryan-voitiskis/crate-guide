export function useLibraryMutations() {
	const records = useRecordsStore()
	const tracks = useTracksStore()
	const crates = useCratesStore()
	const session = useSessionStore()
	const user = useUserStore()

	async function removeRecordFromCollection(recordId: string) {
		const success = await records.removeRecordFromCollection(recordId)
		if (!success) return false

		tracks.removeTracksByRecordId(recordId)
		crates.removeRecordFromAllCrates(recordId)
		return true
	}

	async function deleteAllUserData() {
		const success = await user.deleteAllUserData()
		if (!success) return false
		try {
			await records.drainCoverCleanup({ fresh: true })
		} catch {
			// Cleanup jobs are durable; clearing local data must not undo a successful
			// database deletion when a best-effort drain cannot run.
		}

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
