export type SupabasePageResult<T> = {
	data: T[] | null
	error: unknown | null
}

export async function fetchAllSupabasePages<T>(
	fetchPage: (from: number, to: number) => Promise<SupabasePageResult<T>>,
	pageSize = 1000
): Promise<T[]> {
	if (!Number.isInteger(pageSize) || pageSize <= 0) {
		throw new RangeError('Supabase page size must be a positive integer.')
	}

	const rows: T[] = []
	let from = 0

	while (true) {
		const to = from + pageSize - 1
		const { data, error } = await fetchPage(from, to)
		if (error !== null) throw error

		const page = data ?? []
		if (page.length > pageSize) {
			throw new RangeError(
				'Supabase returned more rows than the requested page.'
			)
		}

		rows.push(...page)
		if (page.length < pageSize) return rows

		from += pageSize
	}
}
