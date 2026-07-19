import { describe, expect, it, vi } from 'vitest'
import { fetchAllSupabasePages } from './supabasePagination'

function createRows(count: number, offset = 0) {
	return Array.from({ length: count }, (_, index) => offset + index)
}

describe('fetchAllSupabasePages', () => {
	it('returns an empty result from the first inclusive range', async () => {
		const fetchPage = vi.fn().mockResolvedValue({ data: [], error: null })

		await expect(fetchAllSupabasePages(fetchPage)).resolves.toEqual([])
		expect(fetchPage).toHaveBeenCalledOnce()
		expect(fetchPage).toHaveBeenCalledWith(0, 999)
	})

	it('stops after a 999-row partial page', async () => {
		const rows = createRows(999)
		const fetchPage = vi.fn().mockResolvedValue({ data: rows, error: null })

		await expect(fetchAllSupabasePages(fetchPage)).resolves.toEqual(rows)
		expect(fetchPage).toHaveBeenCalledOnce()
		expect(fetchPage).toHaveBeenCalledWith(0, 999)
	})

	it('requests an empty trailing page after exactly 1000 rows', async () => {
		const rows = createRows(1000)
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({ data: rows, error: null })
			.mockResolvedValueOnce({ data: [], error: null })

		await expect(fetchAllSupabasePages(fetchPage)).resolves.toEqual(rows)
		expect(fetchPage.mock.calls).toEqual([
			[0, 999],
			[1000, 1999]
		])
	})

	it('appends 1001 rows in page order', async () => {
		const firstPage = createRows(1000)
		const secondPage = createRows(1, 1000)
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({ data: firstPage, error: null })
			.mockResolvedValueOnce({ data: secondPage, error: null })

		await expect(fetchAllSupabasePages(fetchPage)).resolves.toEqual([
			...firstPage,
			...secondPage
		])
		expect(fetchPage.mock.calls).toEqual([
			[0, 999],
			[1000, 1999]
		])
	})

	it('requests a trailing page after exactly 2000 rows', async () => {
		const firstPage = createRows(1000)
		const secondPage = createRows(1000, 1000)
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({ data: firstPage, error: null })
			.mockResolvedValueOnce({ data: secondPage, error: null })
			.mockResolvedValueOnce({ data: null, error: null })

		await expect(fetchAllSupabasePages(fetchPage)).resolves.toEqual([
			...firstPage,
			...secondPage
		])
		expect(fetchPage.mock.calls).toEqual([
			[0, 999],
			[1000, 1999],
			[2000, 2999]
		])
	})

	it('throws a page error unchanged and stops fetching', async () => {
		const pageError = new Error('page failed')
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({ data: createRows(2), error: null })
			.mockResolvedValueOnce({ data: null, error: pageError })

		await expect(fetchAllSupabasePages(fetchPage, 2)).rejects.toBe(pageError)
		expect(fetchPage.mock.calls).toEqual([
			[0, 1],
			[2, 3]
		])
	})

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
		'rejects invalid page size %s before fetching',
		async (pageSize) => {
			const fetchPage = vi.fn()

			await expect(fetchAllSupabasePages(fetchPage, pageSize)).rejects.toThrow(
				'Supabase page size must be a positive integer.'
			)
			expect(fetchPage).not.toHaveBeenCalled()
		}
	)

	it('rejects a response larger than the requested page', async () => {
		const fetchPage = vi.fn().mockResolvedValue({
			data: createRows(3),
			error: null
		})

		await expect(fetchAllSupabasePages(fetchPage, 2)).rejects.toThrow(
			'Supabase returned more rows than the requested page.'
		)
		expect(fetchPage).toHaveBeenCalledOnce()
	})
})
