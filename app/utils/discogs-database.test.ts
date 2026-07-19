import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getExistingDiscogsIds } from './discogs-database'

const mockQueryBuilder = {
	select: vi.fn().mockReturnThis(),
	in: vi.fn()
}

const mockSupabase = {
	from: vi.fn(() => mockQueryBuilder)
}

const mockGetSupabase = vi.fn(() => mockSupabase)

vi.stubGlobal('getSupabase', mockGetSupabase)

function createReleases(count: number, offset = 1) {
	return Array.from({ length: count }, (_, index) => ({ id: offset + index }))
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

describe('getExistingDiscogsIds', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockQueryBuilder.select.mockReturnThis()
		mockSupabase.from.mockReturnValue(mockQueryBuilder)
		mockGetSupabase.mockReturnValue(mockSupabase)
	})

	it('returns early for empty input without creating a client', async () => {
		await expect(getExistingDiscogsIds([])).resolves.toEqual(new Set())
		expect(mockGetSupabase).not.toHaveBeenCalled()
	})

	it('deduplicates release IDs before querying', async () => {
		mockQueryBuilder.in.mockResolvedValue({ data: [], error: null })

		await getExistingDiscogsIds([{ id: 1 }, { id: 1 }, { id: 2 }])

		expect(mockQueryBuilder.in).toHaveBeenCalledOnce()
		expect(mockQueryBuilder.in).toHaveBeenCalledWith('discogs_id', [1, 2])
	})

	it('uses one chunk for exactly 100 unique IDs', async () => {
		mockQueryBuilder.in.mockResolvedValue({ data: [], error: null })

		await getExistingDiscogsIds(createReleases(100))

		expect(mockQueryBuilder.in).toHaveBeenCalledOnce()
		expect(mockQueryBuilder.in.mock.calls[0]![1]).toHaveLength(100)
	})

	it('queries 101 unique IDs sequentially in chunks no larger than 100', async () => {
		const firstChunk = createDeferred<{
			data: Array<{ discogs_id: number | null }>
			error: null
		}>()
		mockQueryBuilder.in
			.mockReturnValueOnce(firstChunk.promise)
			.mockResolvedValueOnce({ data: [{ discogs_id: 101 }], error: null })

		const resultPromise = getExistingDiscogsIds(createReleases(101))
		expect(mockQueryBuilder.in).toHaveBeenCalledOnce()
		expect(mockQueryBuilder.in.mock.calls[0]![1]).toHaveLength(100)

		firstChunk.resolve({ data: [{ discogs_id: 1 }], error: null })
		await expect(resultPromise).resolves.toEqual(new Set([1, 101]))

		expect(mockQueryBuilder.in).toHaveBeenCalledTimes(2)
		expect(mockQueryBuilder.in.mock.calls[1]![1]).toEqual([101])
	})

	it('unions chunk results and ignores null IDs', async () => {
		mockQueryBuilder.in
			.mockResolvedValueOnce({
				data: [{ discogs_id: 1 }, { discogs_id: null }],
				error: null
			})
			.mockResolvedValueOnce({
				data: [{ discogs_id: 101 }, { discogs_id: 1 }],
				error: null
			})

		await expect(getExistingDiscogsIds(createReleases(101))).resolves.toEqual(
			new Set([1, 101])
		)
	})

	it('throws the first chunk error unchanged and aborts remaining chunks', async () => {
		const chunkError = new Error('Chunk failed')
		mockQueryBuilder.in.mockResolvedValue({ data: null, error: chunkError })

		await expect(getExistingDiscogsIds(createReleases(101))).rejects.toBe(
			chunkError
		)
		expect(mockQueryBuilder.in).toHaveBeenCalledOnce()
	})
})
