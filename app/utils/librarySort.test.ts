import { describe, expect, it } from 'vitest'
import { compareLibrarySortValues, sortByLibraryKey } from './librarySort'

describe('compareLibrarySortValues', () => {
	it('orders fractional numbers numerically', () => {
		const values = [120.25, 99.9, 120.5, 120]
		expect([...values].sort(compareLibrarySortValues)).toEqual([
			99.9, 120, 120.25, 120.5
		])
	})

	it('orders text naturally and case-insensitively', () => {
		expect(['b', 'A10', 'a2', 'B'].sort(compareLibrarySortValues)).toEqual([
			'a2',
			'A10',
			'b',
			'B'
		])
	})
})

describe('sortByLibraryKey', () => {
	const rows = [
		{ id: 'a', bpm: 120.5 },
		{ id: 'b', bpm: 120.25 },
		{ id: 'c', bpm: 120.5 },
		{ id: 'd', bpm: 99.9 }
	]

	it('sorts by key in either direction and keeps ties in input order', () => {
		expect(
			sortByLibraryKey(rows, (row) => row.bpm, 'asc').map(({ id }) => id)
		).toEqual(['d', 'b', 'a', 'c'])
		expect(
			sortByLibraryKey(rows, (row) => row.bpm, 'desc').map(({ id }) => id)
		).toEqual(['a', 'c', 'b', 'd'])
	})

	it('reads each key once and does not mutate the input', () => {
		let reads = 0
		const input = [...rows]
		sortByLibraryKey(
			input,
			(row) => {
				reads += 1
				return row.bpm
			},
			'asc'
		)
		expect(reads).toBe(rows.length)
		expect(input).toEqual(rows)
	})
})
