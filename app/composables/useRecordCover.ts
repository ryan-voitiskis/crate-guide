export function useRecordCover() {
	const supabase = useSupabaseClient<Database>()

	async function getCoverUrl(
		record: Pick<DatabaseRecord, 'cover' | 'cover_storage_path'>
	): Promise<string | null> {
		if (!record.cover_storage_path) return record.cover

		const { data, error } = await supabase.storage
			.from(RECORD_COVER_BUCKET)
			.createSignedUrl(record.cover_storage_path, 300)

		if (error) return record.cover
		return data.signedUrl
	}

	return { getCoverUrl }
}
