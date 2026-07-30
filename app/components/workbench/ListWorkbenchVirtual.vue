<script setup lang="ts" generic="T">
import type { CSSProperties } from 'vue'
import {
	WORKBENCH_MAX_MOUNTED_ITEMS,
	WORKBENCH_VIRTUAL_OVERSCAN,
	type WorkbenchVirtualKey,
	calculateWorkbenchVirtualRange,
	getWorkbenchScrollOffsetForIndex
} from '~/utils/workbenchVirtualList'

type VirtualItem = {
	index: number
	item: T
	key: WorkbenchVirtualKey
	style: CSSProperties
}

const props = withDefaults(
	defineProps<{
		getItemKey: (item: T, index: number) => WorkbenchVirtualKey
		headerSize?: number
		initialViewportSize?: number
		itemLabel?: string
		items: readonly T[]
		itemSize: number
		label: string
		maxMountedItems?: number
		overscan?: number
		selectedKey?: WorkbenchVirtualKey | null
	}>(),
	{
		headerSize: 0,
		initialViewportSize: 640,
		itemLabel: 'results',
		maxMountedItems: WORKBENCH_MAX_MOUNTED_ITEMS,
		overscan: WORKBENCH_VIRTUAL_OVERSCAN,
		selectedKey: null
	}
)

const emit = defineEmits<{
	'range-change': [
		range: {
			end: number
			firstVisible: number
			mountedCount: number
			start: number
			visibleKeys: WorkbenchVirtualKey[]
		}
	]
	'viewport-resize': [size: { height: number; width: number }]
}>()

defineSlots<{
	default(props: {
		index: number
		item: T
		itemKey: WorkbenchVirtualKey
		selected: boolean
	}): unknown
	header(): unknown
}>()

const viewport = ref<HTMLElement | null>(null)
const scrollOffset = ref(0)
const viewportHeight = ref(props.initialViewportSize)
const viewportWidth = ref(0)
const focusedKey = ref<WorkbenchVirtualKey | null>(null)
const countDescriptionId = `virtual-list-count-${useId()}`
let resizeObserver: ResizeObserver | null = null
let anchorKey: WorkbenchVirtualKey | null = null
let anchorOffset = 0

const keyIndex = computed(() => {
	const indexes = new Map<WorkbenchVirtualKey, number>()
	props.items.forEach((item, index) => {
		indexes.set(props.getItemKey(item, index), index)
	})
	return indexes
})

const range = computed(() =>
	calculateWorkbenchVirtualRange({
		itemCount: props.items.length,
		itemSize: props.itemSize,
		maxMountedItems: props.maxMountedItems,
		overscan: props.overscan,
		scrollOffset: scrollOffset.value,
		viewportSize: viewportHeight.value
	})
)

const virtualItems = computed<VirtualItem[]>(() => {
	const result: VirtualItem[] = []
	for (let index = range.value.start; index <= range.value.end; index += 1) {
		const item = props.items[index]
		if (item === undefined) continue
		result.push({
			index,
			item,
			key: props.getItemKey(item, index),
			style: {
				height: `${props.itemSize}px`,
				insetInline: '0',
				position: 'absolute',
				transform: `translateY(${index * props.itemSize}px)`
			}
		})
	}
	return result
})

const spacerStyle = computed<CSSProperties>(() => ({
	height: `${range.value.totalSize}px`,
	position: 'relative'
}))

function updateAnchor() {
	const index = range.value.firstVisible
	const item = props.items[index]
	if (item === undefined) {
		anchorKey = null
		anchorOffset = 0
		return
	}

	anchorKey = props.getItemKey(item, index)
	anchorOffset = Math.max(0, scrollOffset.value - index * props.itemSize)
}

function updateMeasurements() {
	const element = viewport.value
	if (!element) return
	const measuredHeight = element.clientHeight
	const measuredWidth = element.clientWidth
	if (measuredHeight > 0) viewportHeight.value = measuredHeight
	if (measuredWidth > 0) viewportWidth.value = measuredWidth
	scrollOffset.value = Math.max(0, element.scrollTop - props.headerSize)
	updateAnchor()
	emit('viewport-resize', {
		height: viewportHeight.value,
		width: viewportWidth.value
	})
}

function scrollToIndex(index: number) {
	const element = viewport.value
	if (!element) return
	const nextOffset = getWorkbenchScrollOffsetForIndex({
		currentOffset: scrollOffset.value,
		index,
		itemCount: props.items.length,
		itemSize: props.itemSize,
		viewportSize: viewportHeight.value
	})
	element.scrollTop = props.headerSize + nextOffset
	scrollOffset.value = nextOffset
	updateAnchor()
}

function scrollToIndexStart(index: number) {
	const element = viewport.value
	if (!element || props.items.length === 0) return
	const boundedIndex = Math.min(
		props.items.length - 1,
		Math.max(0, Math.floor(index))
	)
	const nextOffset = boundedIndex * props.itemSize
	element.scrollTop = props.headerSize + nextOffset
	scrollOffset.value = nextOffset
	updateAnchor()
}

function scrollToKey(key: WorkbenchVirtualKey) {
	const index = keyIndex.value.get(key)
	if (index === undefined) return
	scrollToIndex(index)
}

function findFocusTarget(index: number): HTMLElement | null {
	const element = viewport.value
	if (!element) return null
	return element.querySelector<HTMLElement>(
		`[data-virtual-index="${index}"] [data-virtual-focus-target]`
	)
}

async function focusKey(key: WorkbenchVirtualKey) {
	const index = keyIndex.value.get(key)
	if (index === undefined) return
	scrollToIndex(index)
	await nextTick()
	findFocusTarget(index)?.focus()
}

function handleFocusIn(event: FocusEvent) {
	const target = event.target
	if (!(target instanceof Element)) return
	const item = target.closest<HTMLElement>('[data-virtual-index]')
	if (!item) return
	const index = Number(item.dataset.virtualIndex)
	const entry = props.items[index]
	if (entry !== undefined) focusedKey.value = props.getItemKey(entry, index)
}

async function handleKeydown(event: KeyboardEvent) {
	if (!['ArrowDown', 'ArrowUp', 'End', 'Home'].includes(event.key)) return
	const target = event.target
	if (!(target instanceof Element)) return
	const focusTarget = target.closest('[data-virtual-focus-target]')
	const item = focusTarget?.closest<HTMLElement>('[data-virtual-index]')
	if (!item) return

	const currentIndex = Number(item.dataset.virtualIndex)
	let nextIndex = currentIndex
	if (event.key === 'ArrowDown') nextIndex += 1
	else if (event.key === 'ArrowUp') nextIndex -= 1
	else if (event.key === 'Home') nextIndex = 0
	else nextIndex = props.items.length - 1
	if (nextIndex < 0 || nextIndex >= props.items.length) return

	event.preventDefault()
	const entry = props.items[nextIndex]
	if (entry === undefined) return
	await focusKey(props.getItemKey(entry, nextIndex))
}

watch(
	() => props.selectedKey,
	(selectedKey) => {
		if (selectedKey !== null && selectedKey !== undefined)
			scrollToKey(selectedKey)
	},
	{ flush: 'post' }
)

watch(
	() => [props.items, props.itemSize, props.headerSize] as const,
	async () => {
		const element = viewport.value
		if (!element) return
		const restoreFocusedKey = element.contains(document.activeElement)
			? focusedKey.value
			: null
		const savedAnchorKey = anchorKey
		const savedAnchorOffset = anchorOffset
		await nextTick()

		if (savedAnchorKey !== null) {
			const index = keyIndex.value.get(savedAnchorKey)
			if (index !== undefined) {
				const offset = Math.min(
					savedAnchorOffset,
					Math.max(0, props.itemSize - 1)
				)
				element.scrollTop = props.headerSize + index * props.itemSize + offset
			}
		}
		updateMeasurements()
		if (restoreFocusedKey !== null) await focusKey(restoreFocusedKey)
	},
	{ flush: 'pre' }
)

watch(
	virtualItems,
	(items) => {
		emit('range-change', {
			end: range.value.end,
			firstVisible: range.value.firstVisible,
			mountedCount: range.value.mountedCount,
			start: range.value.start,
			visibleKeys: items.map((item) => item.key)
		})
	},
	{ immediate: true }
)

onMounted(() => {
	updateMeasurements()
	if (typeof ResizeObserver === 'undefined') {
		window.addEventListener('resize', updateMeasurements)
		return
	}

	resizeObserver = new ResizeObserver(updateMeasurements)
	if (viewport.value) resizeObserver.observe(viewport.value)
})

onBeforeUnmount(() => {
	resizeObserver?.disconnect()
	window.removeEventListener('resize', updateMeasurements)
})

defineExpose({ focusKey, scrollToIndex, scrollToIndexStart, scrollToKey })
</script>

<template>
	<div
		ref="viewport"
		role="region"
		tabindex="-1"
		:aria-label="label"
		:aria-describedby="countDescriptionId"
		:data-virtual-mounted-count="range.mountedCount"
		:data-virtual-first-visible-index="range.firstVisible"
		:data-virtual-total-count="items.length"
		class="relative overflow-auto"
		@focusin="handleFocusIn"
		@keydown="handleKeydown"
		@scroll="updateMeasurements"
	>
		<slot name="header" />
		<div
			role="list"
			:aria-setsize="items.length"
			:style="spacerStyle"
			data-virtual-spacer
		>
			<div
				v-for="virtualItem in virtualItems"
				:key="virtualItem.key"
				role="listitem"
				:aria-posinset="virtualItem.index + 1"
				:aria-setsize="items.length"
				:data-virtual-index="virtualItem.index"
				:data-virtual-key="virtualItem.key"
				:style="virtualItem.style"
				data-virtual-item
			>
				<slot
					:item="virtualItem.item"
					:index="virtualItem.index"
					:item-key="virtualItem.key"
					:selected="selectedKey === virtualItem.key"
				/>
			</div>
		</div>
		<p :id="countDescriptionId" class="sr-only" aria-live="polite">
			{{ items.length }} {{ itemLabel }}
		</p>
	</div>
</template>
