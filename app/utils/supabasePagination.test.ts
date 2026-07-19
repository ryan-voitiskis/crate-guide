import { describe, expect, it, vi } from 'vitest'
import { fetchAllSupabasePages } from './supabasePagination'

type Row = { id: string }

function descendingRows(count: number, highest = count): Row[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `row-${String(highest - index).padStart(5, '0')}`
	}))
}

function cursorPage(
	rows: readonly Row[],
	cursor: string | null,
	limit: number
) {
	return rows
		.filter((row) => cursor === null || row.id < cursor)
		.slice(0, limit)
}

describe('fetchAllSupabasePages', () => {
	it.each([
		{ count: 0, calls: 1 },
		{ count: 999, calls: 1 },
		{ count: 1000, calls: 2 },
		{ count: 1001, calls: 2 },
		{ count: 2000, calls: 3 }
	])(
		'returns all $count rows through $calls bounded cursor pages',
		async (test) => {
			const rows = descendingRows(test.count)
			const fetchPage = vi.fn((cursor: string | null, pageSize: number) =>
				Promise.resolve({
					data: cursorPage(rows, cursor, pageSize),
					error: null
				})
			)

			await expect(fetchAllSupabasePages(fetchPage)).resolves.toEqual(rows)
			expect(fetchPage).toHaveBeenCalledTimes(test.calls)
			expect(fetchPage.mock.calls[0]).toEqual([null, 1000])
			for (let index = 1; index < fetchPage.mock.calls.length; index += 1) {
				expect(fetchPage.mock.calls[index]).toEqual([
					rows[index * 1000 - 1]!.id,
					1000
				])
			}
		}
	)

	it('does not omit the original tail after a first-page deletion', async () => {
		const rows = descendingRows(1001)
		const originalIds = rows.map(({ id }) => id)
		let callCount = 0
		const fetchPage = vi.fn((cursor: string | null, pageSize: number) => {
			const data = cursorPage(rows, cursor, pageSize)
			callCount += 1
			if (callCount === 1) rows.shift()
			return Promise.resolve({ data, error: null })
		})

		const result = await fetchAllSupabasePages(fetchPage)

		expect(result.map(({ id }) => id)).toEqual(originalIds)
		expect(new Set(result.map(({ id }) => id)).size).toBe(1001)
	})

	it('includes later inserts below the cursor at most once and defers inserts above it', async () => {
		const rows: Row[] = [{ id: 'row-m' }, { id: 'row-l' }, { id: 'row-k' }]
		let callCount = 0
		const fetchPage = vi.fn((cursor: string | null, pageSize: number) => {
			const data = cursorPage(rows, cursor, pageSize)
			callCount += 1
			if (callCount === 1) {
				rows.push({ id: 'row-z' }, { id: 'row-j' })
				rows.sort((left, right) => (left.id > right.id ? -1 : 1))
			}
			return Promise.resolve({ data, error: null })
		})

		await expect(
			fetchAllSupabasePages(fetchPage, { pageSize: 2 })
		).resolves.toEqual([
			{ id: 'row-m' },
			{ id: 'row-l' },
			{ id: 'row-k' },
			{ id: 'row-j' }
		])
	})

	it.each([
		{ name: 'non-string', row: { id: 42 } },
		{ name: 'empty', row: { id: '' } },
		{ name: 'missing', row: {} },
		{ name: 'non-object', row: null }
	])('rejects a $name cursor ID', async ({ row }) => {
		const fetchPage = vi.fn().mockResolvedValue({ data: [row], error: null })

		await expect(fetchAllSupabasePages(fetchPage)).rejects.toThrow(
			'valid cursor ID'
		)
	})

	it('rejects an internally out-of-order terminal page', async () => {
		const fetchPage = vi.fn().mockResolvedValue({
			data: [{ id: 'row-b' }, { id: 'row-c' }],
			error: null
		})

		await expect(fetchAllSupabasePages(fetchPage)).rejects.toThrow(
			'not strictly ID-descending'
		)
	})

	it('rejects rows on the wrong side of the incoming cursor', async () => {
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({
				data: [{ id: 'row-d' }, { id: 'row-c' }],
				error: null
			})
			.mockResolvedValueOnce({ data: [{ id: 'row-e' }], error: null })

		await expect(
			fetchAllSupabasePages(fetchPage, { pageSize: 2 })
		).rejects.toThrow('outside the requested cursor')
	})

	it('rejects duplicate IDs globally', async () => {
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({
				data: [{ id: 'row-d' }, { id: 'row-c' }],
				error: null
			})
			.mockResolvedValueOnce({ data: [{ id: 'row-c' }], error: null })

		await expect(
			fetchAllSupabasePages(fetchPage, { pageSize: 2 })
		).rejects.toThrow('duplicate cursor ID')
	})

	it('rejects invalid and oversized pages', async () => {
		await expect(
			fetchAllSupabasePages(
				vi.fn().mockResolvedValue({ data: {} as Row[], error: null })
			)
		).rejects.toThrow('invalid page')
		await expect(
			fetchAllSupabasePages(
				vi.fn().mockResolvedValue({
					data: descendingRows(3),
					error: null
				}),
				{ pageSize: 2 }
			)
		).rejects.toThrow('more rows than the requested page')
	})

	it('throws callback errors unchanged', async () => {
		const pageError = new Error('page failed')
		const fetchPage = vi
			.fn()
			.mockResolvedValue({ data: null, error: pageError })

		await expect(fetchAllSupabasePages(fetchPage)).rejects.toBe(pageError)
	})

	it('fails closed on explicit row and page bounds', async () => {
		await expect(
			fetchAllSupabasePages(
				vi.fn().mockResolvedValue({ data: descendingRows(2), error: null }),
				{ pageSize: 2, maxRows: 1 }
			)
		).rejects.toThrow('row bound')

		const endlessPage = vi.fn((cursor: string | null) => {
			const nextId = cursor === null ? 'row-z' : `${cursor.slice(0, -1)}y`
			return Promise.resolve({ data: [{ id: nextId }], error: null })
		})
		await expect(
			fetchAllSupabasePages(endlessPage, {
				pageSize: 1,
				maxPages: 2,
				maxRows: 10
			})
		).rejects.toThrow('page bound')
	})

	it.each([
		{ pageSize: 0 },
		{ pageSize: 1001 },
		{ maxPages: 0 },
		{ maxRows: Number.POSITIVE_INFINITY }
	])('rejects invalid options before fetching: $pageSize', async (options) => {
		const fetchPage = vi.fn()

		await expect(fetchAllSupabasePages(fetchPage, options)).rejects.toThrow()
		expect(fetchPage).not.toHaveBeenCalled()
	})
})
