export type SupabasePageResult<T> = {
	data: T[] | null
	error: unknown | null
}

export type SupabasePaginationOptions = {
	pageSize?: number
	maxPages?: number
	maxRows?: number
}

export const SUPABASE_MAX_PAGE_SIZE = 1000
export const SUPABASE_DEFAULT_MAX_PAGES = 10_000
export const SUPABASE_DEFAULT_MAX_ROWS = 10_000_000

function requirePositiveSafeInteger(value: number, label: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new RangeError(`${label} must be a positive safe integer.`)
	}
}

function requireRowId(row: unknown): string {
	if (!row || typeof row !== 'object' || Array.isArray(row)) {
		throw new TypeError('Supabase returned a row without a valid cursor ID.')
	}
	const id = (row as { id?: unknown }).id
	if (typeof id !== 'string' || id.length === 0) {
		throw new TypeError('Supabase returned a row without a valid cursor ID.')
	}
	return id
}

export async function fetchAllSupabasePages<T extends { id: unknown }>(
	fetchPage: (
		cursor: string | null,
		pageSize: number
	) => Promise<SupabasePageResult<T>>,
	options: SupabasePaginationOptions = {}
): Promise<T[]> {
	const pageSize = options.pageSize ?? SUPABASE_MAX_PAGE_SIZE
	const maxPages = options.maxPages ?? SUPABASE_DEFAULT_MAX_PAGES
	const maxRows = options.maxRows ?? SUPABASE_DEFAULT_MAX_ROWS

	requirePositiveSafeInteger(pageSize, 'Supabase page size')
	if (pageSize > SUPABASE_MAX_PAGE_SIZE) {
		throw new RangeError(
			`Supabase page size cannot exceed ${SUPABASE_MAX_PAGE_SIZE}.`
		)
	}
	requirePositiveSafeInteger(maxPages, 'Supabase page bound')
	requirePositiveSafeInteger(maxRows, 'Supabase row bound')

	const rows: T[] = []
	const seenIds = new Set<string>()
	let cursor: string | null = null

	for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
		const { data, error } = await fetchPage(cursor, pageSize)
		if (error !== null) throw error
		if (data !== null && !Array.isArray(data)) {
			throw new TypeError('Supabase returned an invalid page.')
		}

		const page = data ?? []
		if (page.length > pageSize) {
			throw new RangeError(
				'Supabase returned more rows than the requested page.'
			)
		}
		if (rows.length + page.length > maxRows) {
			throw new RangeError('Supabase pagination exceeded its row bound.')
		}

		const pageIds: string[] = []
		let previousId: string | null = null
		for (const row of page) {
			const id = requireRowId(row)
			if (seenIds.has(id)) {
				throw new TypeError('Supabase returned a duplicate cursor ID.')
			}
			if (cursor !== null && !(id < cursor)) {
				throw new TypeError(
					'Supabase returned a row outside the requested cursor.'
				)
			}
			if (previousId !== null && !(id < previousId)) {
				throw new TypeError(
					'Supabase returned a page that was not strictly ID-descending.'
				)
			}
			pageIds.push(id)
			previousId = id
		}

		for (const id of pageIds) seenIds.add(id)
		rows.push(...page)
		if (page.length < pageSize) return rows
		cursor = pageIds.at(-1)!
	}

	throw new RangeError('Supabase pagination exceeded its page bound.')
}
