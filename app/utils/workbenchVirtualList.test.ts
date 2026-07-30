import { describe, expect, it } from 'vitest'
import renderingBudget from '../../shared/config/workbenchRenderingBudget.json'
import {
	WORKBENCH_MAX_MOUNTED_ITEMS,
	calculateWorkbenchVirtualRange,
	getWorkbenchScrollOffsetForIndex
} from './workbenchVirtualList'

describe('workbench virtual list math', () => {
	it('keeps the application cap aligned with the source-controlled budget', () => {
		expect(WORKBENCH_MAX_MOUNTED_ITEMS).toBe(
			renderingBudget.structural.maxMountedItems
		)
	})

	it('bounds a ten-thousand-item collection including overscan', () => {
		const range = calculateWorkbenchVirtualRange({
			itemCount: 10_000,
			itemSize: 36,
			scrollOffset: 180_000,
			viewportSize: 900
		})

		expect(range).toMatchObject({
			firstVisible: 5000,
			lastVisible: 5024,
			mountedCount: 33,
			start: 4996,
			end: 5028,
			totalSize: 360_000
		})
	})

	it('never exceeds a caller cap when overscan would be larger', () => {
		const range = calculateWorkbenchVirtualRange({
			itemCount: 1_000,
			itemSize: 100,
			maxMountedItems: 8,
			overscan: 4,
			scrollOffset: 20_000,
			viewportSize: 300
		})

		expect(range.mountedCount).toBe(8)
		expect(range.start).toBeLessThanOrEqual(range.firstVisible)
		expect(range.end).toBeGreaterThanOrEqual(range.lastVisible)
	})

	it('handles empty and invalid measurements without leaking items', () => {
		expect(
			calculateWorkbenchVirtualRange({
				itemCount: 0,
				itemSize: 0,
				scrollOffset: Number.NaN,
				viewportSize: -1
			})
		).toEqual({
			end: -1,
			firstVisible: 0,
			lastVisible: -1,
			mountedCount: 0,
			start: 0,
			totalSize: 0
		})
	})

	it('scrolls only enough to reveal an indexed item', () => {
		expect(
			getWorkbenchScrollOffsetForIndex({
				currentOffset: 200,
				index: 6,
				itemCount: 100,
				itemSize: 50,
				viewportSize: 200
			})
		).toBe(200)
		expect(
			getWorkbenchScrollOffsetForIndex({
				currentOffset: 200,
				index: 2,
				itemCount: 100,
				itemSize: 50,
				viewportSize: 200
			})
		).toBe(100)
		expect(
			getWorkbenchScrollOffsetForIndex({
				currentOffset: 200,
				index: 12,
				itemCount: 100,
				itemSize: 50,
				viewportSize: 200
			})
		).toBe(450)
	})
})
