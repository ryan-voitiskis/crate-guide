import renderingBudget from '../../shared/config/workbenchRenderingBudget.json'

export type WorkbenchVirtualKey = number | string

export type WorkbenchVirtualRange = {
	end: number
	firstVisible: number
	lastVisible: number
	mountedCount: number
	start: number
	totalSize: number
}

type CalculateWorkbenchVirtualRangeOptions = {
	itemCount: number
	itemSize: number
	maxMountedItems?: number
	overscan?: number
	scrollOffset: number
	viewportSize: number
}

type ScrollToIndexOptions = {
	currentOffset: number
	index: number
	itemCount: number
	itemSize: number
	viewportSize: number
}

export const WORKBENCH_MAX_MOUNTED_ITEMS =
	renderingBudget.structural.maxMountedItems
export const WORKBENCH_VIRTUAL_OVERSCAN = 4

function normalizeInteger(value: number, minimum: number): number {
	if (!Number.isFinite(value)) return minimum
	return Math.max(minimum, Math.floor(value))
}

function normalizeSize(value: number, minimum: number): number {
	if (!Number.isFinite(value)) return minimum
	return Math.max(minimum, value)
}

export function calculateWorkbenchVirtualRange({
	itemCount,
	itemSize,
	maxMountedItems = WORKBENCH_MAX_MOUNTED_ITEMS,
	overscan = WORKBENCH_VIRTUAL_OVERSCAN,
	scrollOffset,
	viewportSize
}: CalculateWorkbenchVirtualRangeOptions): WorkbenchVirtualRange {
	const count = normalizeInteger(itemCount, 0)
	const size = normalizeSize(itemSize, 1)
	const viewport = normalizeSize(viewportSize, 0)
	const offset = Math.max(0, Number.isFinite(scrollOffset) ? scrollOffset : 0)
	const maximum = normalizeInteger(maxMountedItems, 1)
	const buffer = normalizeInteger(overscan, 0)
	const totalSize = count * size

	if (count === 0) {
		return {
			end: -1,
			firstVisible: 0,
			lastVisible: -1,
			mountedCount: 0,
			start: 0,
			totalSize
		}
	}

	const firstVisible = Math.min(count - 1, Math.floor(offset / size))
	const lastVisible = Math.min(
		count - 1,
		Math.max(firstVisible, Math.ceil((offset + viewport) / size) - 1)
	)
	let start = Math.max(0, firstVisible - buffer)
	let end = Math.min(count - 1, lastVisible + buffer)

	if (end - start + 1 > maximum) {
		const visibleEndWithinCap = Math.min(
			lastVisible,
			firstVisible + maximum - 1
		)
		start = Math.max(0, firstVisible - Math.min(buffer, maximum - 1))
		end = Math.min(count - 1, start + maximum - 1)
		if (end < visibleEndWithinCap) {
			end = visibleEndWithinCap
			start = Math.max(0, end - maximum + 1)
		}
	}

	return {
		end,
		firstVisible,
		lastVisible,
		mountedCount: end - start + 1,
		start,
		totalSize
	}
}

export function getWorkbenchScrollOffsetForIndex({
	currentOffset,
	index,
	itemCount,
	itemSize,
	viewportSize
}: ScrollToIndexOptions): number {
	const count = normalizeInteger(itemCount, 0)
	if (count === 0) return 0

	const size = normalizeSize(itemSize, 1)
	const viewport = normalizeSize(viewportSize, 0)
	const boundedIndex = Math.min(count - 1, Math.max(0, Math.floor(index)))
	const current = Math.max(0, currentOffset)
	const itemStart = boundedIndex * size
	const itemEnd = itemStart + size

	if (itemStart < current) return itemStart
	if (itemEnd > current + viewport) return Math.max(0, itemEnd - viewport)
	return current
}
