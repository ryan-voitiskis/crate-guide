export type LibrarySortValue = string | number
export type LibrarySortDirection = 'asc' | 'desc'

const textCollator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: 'base'
})

/**
 * Numbers compare numerically (fractional BPM included); text uses a shared
 * natural-order collator so "A2" sorts before "A10".
 */
export function compareLibrarySortValues(
	a: LibrarySortValue,
	b: LibrarySortValue
): number {
	if (typeof a === 'number' && typeof b === 'number') return a - b
	return textCollator.compare(String(a), String(b))
}

/**
 * Stable sort that reads each item's key once instead of twice per
 * comparison.
 */
export function sortByLibraryKey<T>(
	items: readonly T[],
	getValue: (item: T) => LibrarySortValue,
	direction: LibrarySortDirection
): T[] {
	const sign = direction === 'asc' ? 1 : -1
	return items
		.map((item, index) => ({ item, index, value: getValue(item) }))
		.sort(
			(a, b) =>
				compareLibrarySortValues(a.value, b.value) * sign || a.index - b.index
		)
		.map(({ item }) => item)
}
