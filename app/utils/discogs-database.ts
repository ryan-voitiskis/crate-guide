import { transformRelease } from '~/utils/discogs-data'
import { validateImportResult } from '~/utils/discogs-validation'

export async function getExistingDiscogsIds(
	selectedReleases: DiscogsReleaseToFilter[]
): Promise<Set<number>> {
	const supabase = getSupabase()
	const discogsIds = selectedReleases.map((r) => r.id)

	const { data: existingRecords } = await supabase
		.from('records')
		.select('discogs_id')
		.in('discogs_id', discogsIds)

	return new Set(
		existingRecords
			?.map((r: { discogs_id: number | null }) => r.discogs_id)
			.filter((id): id is number => id !== null) || []
	)
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

	// Validate the import result
	const validatedResult = validateImportResult(result)

	return validatedResult
}
