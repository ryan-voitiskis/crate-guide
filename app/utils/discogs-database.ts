import { transformRelease } from '~/utils/discogs-data'
import { validateImportResult } from '~/utils/discogs-validation'

// Helper to check for existing records by Discogs IDs
export async function getExistingDiscogsIds(
	fullReleases: DiscogsReleaseFull[]
): Promise<Set<number>> {
	const supabase = getSupabase()
	const discogsIds = fullReleases.map((r) => r.id)

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

// Import a single record with tracks using RPC
export async function importRecordWithTracks(
	release: DiscogsReleaseFull,
	userId: string
): Promise<ImportRecordResult> {
	const supabase = getSupabase()
	// Transform the release data
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
