export async function getExistingDiscogsIds(
	releases: Array<{ id: number }>
): Promise<Set<number>> {
	const discogsIds = [...new Set(releases.map((release) => release.id))]

	if (discogsIds.length === 0) return new Set()
	const supabase = getSupabase()
	const existingDiscogsIds = new Set<number>()

	for (let index = 0; index < discogsIds.length; index += 100) {
		const chunk = discogsIds.slice(index, index + 100)
		const { data: existingRecords, error } = await supabase
			.from('records')
			.select('discogs_id')
			.in('discogs_id', chunk)

		if (error) throw error
		for (const record of existingRecords ?? []) {
			if (record.discogs_id !== null) existingDiscogsIds.add(record.discogs_id)
		}
	}

	return existingDiscogsIds
}

export async function importRecordWithTracks(
	release: DiscogsReleaseFull,
	userId: string
): Promise<ImportRecordResult> {
	const supabase = getSupabase()

	const { tracks, ...record } = transformRelease(release, userId)

	// Insert record and tracks in a single transaction using RPC
	const { data: result, error: rpcError } = await supabase.rpc(
		'import_record_with_tracks',
		{ record, tracks }
	)

	if (rpcError) throw rpcError
	return validateImportResult(result)
}
