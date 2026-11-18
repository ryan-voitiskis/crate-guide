import { effect } from 'vue'
import { describe, expect, it } from 'vitest'
import { createEntityList, sortedInsertionIndex } from './entityList'

type Row = { id: string; value: number }

function observe(list: ReturnType<typeof createEntityList<Row>>) {
	let runs = 0
	effect(() => {
		void list.items.value
		runs += 1
	})
	return () => runs - 1
}

describe('createEntityList', () => {
	it('publishes a new array for each write and never mutates the previous one', () => {
		const list = createEntityList<Row>()
		const initial = [
			{ id: 'a', value: 1 },
			{ id: 'b', value: 2 }
		]
		list.setAll(initial)
		const published = list.items.value
		list.replaceAt(1, { id: 'b', value: 3 })
		expect(list.items.value).not.toBe(published)
		expect(published[1]!.value).toBe(2)
		expect(list.get('b')!.value).toBe(3)
	})

	it('coalesces every write inside a batch into one publish', () => {
		const list = createEntityList<Row>()
		list.setAll([
			{ id: 'a', value: 1 },
			{ id: 'b', value: 2 },
			{ id: 'c', value: 3 }
		])
		const publishes = observe(list)
		list.batch(() => {
			list.replaceAt(list.indexOf('a'), { id: 'a', value: 10 })
			list.removeAt(list.indexOf('b'))
			list.insertAt(0, { id: 'd', value: 4 })
			expect(list.indexOf('c')).toBe(2)
			expect(list.items.value.map(({ id }) => id)).toEqual(['a', 'b', 'c'])
		})
		expect(publishes()).toBe(1)
		expect(list.items.value.map(({ id, value }) => [id, value])).toEqual([
			['d', 4],
			['a', 10],
			['c', 3]
		])
	})

	it('does not publish a batch without writes and keeps lookups valid', () => {
		const list = createEntityList<Row>()
		list.setAll([{ id: 'a', value: 1 }])
		const published = list.items.value
		const publishes = observe(list)
		list.batch(() => list.indexOf('a'))
		expect(publishes()).toBe(0)
		expect(list.items.value).toBe(published)
		expect(list.indexOf('a')).toBe(0)
	})

	it('reindexes after external replacement of the published array', () => {
		const list = createEntityList<Row>()
		list.setAll([{ id: 'a', value: 1 }])
		expect(list.indexOf('a')).toBe(0)
		list.items.value = [
			{ id: 'b', value: 2 },
			{ id: 'a', value: 1 }
		]
		expect(list.indexOf('a')).toBe(1)
		expect(list.indexOf('missing')).toBe(-1)
	})
})

describe('sortedInsertionIndex', () => {
	it('inserts after equal values to keep insertion stable', () => {
		const compare = (left: number, right: number) => left - right
		expect(sortedInsertionIndex([1, 2, 2, 4], 2, compare)).toBe(3)
		expect(sortedInsertionIndex([1, 2, 4], 0, compare)).toBe(0)
		expect(sortedInsertionIndex([1, 2, 4], 9, compare)).toBe(3)
	})
})
