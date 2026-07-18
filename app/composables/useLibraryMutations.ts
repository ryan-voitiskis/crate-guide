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
		const coverPaths = records.records.map(
			(record) => record.cover_storage_path
		)
		const success = await user.deleteAllUserData()
		if (!success) return false
		await records.removeCoverObjects(coverPaths)

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
