import { type ShallowRef, shallowRef } from 'vue'

type Entity = { id: string }

export type EntityList<T extends Entity> = {
	/** Published, immutable array. Writers replace it; never mutate it. */
	readonly items: ShallowRef<T[]>
	/** Current view, including writes inside an open `batch`. */
	current(): readonly T[]
	indexOf(id: string): number
	get(id: string): T | undefined
	/** Coalesces every write inside `run` into one published array. */
	batch<R>(run: () => R): R
	replaceAt(index: number, item: T): void
	insertAt(index: number, item: T): void
	removeAt(index: number): T | undefined
	setAll(items: T[]): void
}

/**
 * A shallowly reactive entity array with an id index. Large library arrays are
 * published as whole immutable arrays so Vue tracks one dependency instead of
 * every field of every row, and lookups by id avoid linear scans.
 */
export function createEntityList<T extends Entity>(): EntityList<T> {
	const items = shallowRef<T[]>([])
	let draft: T[] | null = null
	let dirty = false
	let indexedList: readonly T[] | null = null
	let indexById = new Map<string, number>()

	function current(): readonly T[] {
		return draft ?? items.value
	}

	function indexOf(id: string): number {
		const list = current()
		if (indexedList !== list) {
			indexById = new Map(list.map((item, index) => [item.id, index]))
			indexedList = list
		}
		return indexById.get(id) ?? -1
	}

	function batch<R>(run: () => R): R {
		if (draft) return run()
		const published = items.value
		const working = published.slice()
		// Same order, so an index built for the published array still applies.
		if (indexedList === published) indexedList = working
		draft = working
		dirty = false
		try {
			return run()
		} finally {
			const next = draft
			draft = null
			if (dirty) items.value = next
			else if (indexedList === next) indexedList = published
		}
	}

	function replaceAt(index: number, item: T): void {
		batch(() => {
			const list = draft!
			if (index < 0 || index >= list.length)
				throw new RangeError('Entity index out of range.')
			if (list[index]!.id !== item.id) indexedList = null
			list[index] = item
			dirty = true
		})
	}

	function insertAt(index: number, item: T): void {
		batch(() => {
			draft!.splice(index, 0, item)
			indexedList = null
			dirty = true
		})
	}

	function removeAt(index: number): T | undefined {
		return batch(() => {
			const [removed] = draft!.splice(index, 1)
			if (removed) {
				indexedList = null
				dirty = true
			}
			return removed
		})
	}

	function setAll(next: T[]): void {
		if (draft) {
			draft = next.slice()
			dirty = true
		} else items.value = next
		indexedList = null
	}

	return {
		items,
		current,
		indexOf,
		get: (id) => {
			const index = indexOf(id)
			return index === -1 ? undefined : current()[index]
		},
		batch,
		replaceAt,
		insertAt,
		removeAt,
		setAll
	}
}

/** First index in `list` whose item sorts after `item` (stable insertion). */
export function sortedInsertionIndex<T>(
	list: readonly T[],
	item: T,
	compare: (left: T, right: T) => number
): number {
	let low = 0
	let high = list.length
	while (low < high) {
		const middle = (low + high) >>> 1
		if (compare(list[middle]!, item) <= 0) low = middle + 1
		else high = middle
	}
	return low
}
