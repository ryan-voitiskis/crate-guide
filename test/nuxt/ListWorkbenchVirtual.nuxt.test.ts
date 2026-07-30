import { type Component, h, nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ListWorkbenchVirtual from '~/components/workbench/ListWorkbenchVirtual.vue'

type TestItem = {
	id: string
	label: string
}

const wrappers = new Set<VueWrapper>()

function createItems(count: number): TestItem[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `item-${index}`,
		label: `Item ${index}`
	}))
}

async function mountList(
	items: TestItem[],
	options: {
		initialViewportSize?: number
		itemSize?: number
		maxMountedItems?: number
		overscan?: number
		selectedKey?: string | null
	} = {}
) {
	const wrapper = await mountSuspended(ListWorkbenchVirtual as Component, {
		attachTo: document.body,
		props: {
			getItemKey: (item: TestItem) => item.id,
			initialViewportSize: options.initialViewportSize ?? 360,
			items,
			itemLabel: 'test items',
			itemSize: options.itemSize ?? 40,
			label: 'Virtualized test collection',
			maxMountedItems: options.maxMountedItems,
			overscan: options.overscan,
			selectedKey: options.selectedKey
		},
		slots: {
			default: ({ index, item }: { index: number; item: TestItem }) =>
				h(
					'button',
					{
						'data-item-id': item.id,
						'data-virtual-focus-target': '',
						type: 'button'
					},
					`${index}: ${item.label}`
				)
		}
	})
	wrappers.add(wrapper)
	await nextTick()
	return wrapper
}

async function setViewport(
	wrapper: VueWrapper,
	options: { height: number; scrollTop: number; width?: number }
) {
	const viewport = wrapper.get<HTMLElement>('[role="region"]')
	Object.defineProperties(viewport.element, {
		clientHeight: { configurable: true, value: options.height },
		clientWidth: { configurable: true, value: options.width ?? 800 }
	})
	viewport.element.scrollTop = options.scrollTop
	await viewport.trigger('scroll')
	await nextTick()
	return viewport
}

describe('ListWorkbenchVirtual', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		document.body.innerHTML = ''
	})

	it('handles empty, single-item, and exactly-one-viewport collections', async () => {
		const wrapper = await mountList([], {
			initialViewportSize: 360,
			itemSize: 40
		})
		expect(wrapper.findAll('[data-virtual-item]')).toHaveLength(0)
		expect(wrapper.text()).toContain('0 test items')

		await wrapper.setProps({ items: createItems(1) })
		await flushPromises()
		expect(wrapper.findAll('[data-virtual-item]')).toHaveLength(1)

		await wrapper.setProps({ items: createItems(9) })
		await flushPromises()
		expect(wrapper.findAll('[data-virtual-item]')).toHaveLength(9)
		expect(wrapper.text()).toContain('9 test items')
	})

	it('includes overscan inside the hard mounted-item cap', async () => {
		const wrapper = await mountList(createItems(10_000), {
			initialViewportSize: 10_000,
			itemSize: 36
		})

		expect(wrapper.findAll('[data-virtual-item]')).toHaveLength(48)
		expect(wrapper.get('[role="region"]').attributes()).toMatchObject({
			'aria-label': 'Virtualized test collection',
			'data-virtual-mounted-count': '48',
			'data-virtual-total-count': '10000'
		})
		expect(wrapper.text()).toContain('10000 test items')
	})

	it('renders a stable window at the requested scroll offset', async () => {
		const wrapper = await mountList(createItems(10_000), {
			itemSize: 36,
			overscan: 4
		})
		await setViewport(wrapper, { height: 360, scrollTop: 180_000 })

		const indexes = wrapper
			.findAll('[data-virtual-index]')
			.map((item) => Number(item.attributes('data-virtual-index')))
		expect(indexes.at(0)).toBe(4996)
		expect(indexes.at(-1)).toBe(5013)
		expect(
			wrapper
				.get('[role="region"]')
				.attributes('data-virtual-first-visible-index')
		).toBe('5000')
		expect(wrapper.emitted('range-change')?.at(-1)?.[0]).toMatchObject({
			firstVisible: 5000,
			mountedCount: 18
		})
		expect(wrapper.find('[data-item-id="item-0"]').exists()).toBe(false)
		expect(wrapper.find('[data-item-id="item-5000"]').exists()).toBe(true)
	})

	it('keeps the first visible stable key anchored across density and reorder changes', async () => {
		const items = createItems(100)
		const wrapper = await mountList(items, { itemSize: 40 })
		const viewport = await setViewport(wrapper, {
			height: 360,
			scrollTop: 1_000
		})

		await wrapper.setProps({ itemSize: 50 })
		await flushPromises()
		expect(viewport.element.scrollTop).toBe(1_250)
		const anchoredItem = wrapper.get<HTMLElement>('[data-item-id="item-25"]')
		anchoredItem.element.focus()

		await wrapper.setProps({ items: [...items].reverse() })
		await flushPromises()
		expect(viewport.element.scrollTop).toBe(3_700)
		expect(wrapper.find('[data-item-id="item-25"]').exists()).toBe(true)
		expect(document.activeElement?.getAttribute('data-item-id')).toBe('item-25')
	})

	it('scrolls selected items into view and supports row keyboard traversal', async () => {
		const wrapper = await mountList(createItems(100), {
			initialViewportSize: 120,
			itemSize: 40,
			overscan: 1
		})
		const viewport = await setViewport(wrapper, { height: 120, scrollTop: 0 })
		const first = wrapper.get<HTMLElement>('[data-item-id="item-0"]')
		first.element.focus()
		await first.trigger('keydown', { key: 'ArrowDown' })
		await nextTick()
		expect(document.activeElement?.getAttribute('data-item-id')).toBe('item-1')

		await wrapper.setProps({ selectedKey: 'item-90' })
		await flushPromises()
		expect(viewport.element.scrollTop).toBeGreaterThan(3_400)
		expect(wrapper.find('[data-item-id="item-90"]').exists()).toBe(true)

		await wrapper.setProps({
			items: createItems(100).filter((item) => item.id !== 'item-90'),
			selectedKey: null
		})
		await flushPromises()
		expect(wrapper.find('[data-item-id="item-90"]').exists()).toBe(false)
		expect(wrapper.findAll('[data-virtual-item]').length).toBeLessThanOrEqual(
			48
		)
	})
})
