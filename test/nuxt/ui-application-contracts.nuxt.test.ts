import { defineComponent, h, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AlertDialogActionLoading from '~/components/shared/AlertDialogActionLoading.vue'
import ButtonLoading from '~/components/shared/ButtonLoading.vue'
import CheckboxLargeHitArea from '~/components/shared/CheckboxLargeHitArea.vue'
import SeparatorLabelled from '~/components/shared/SeparatorLabelled.vue'
import AlertDialog from '~/components/ui/alert-dialog/AlertDialog.vue'

const wrappers = new Set<VueWrapper>()

describe('application UI contracts', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		document.body.innerHTML = ''
	})

	it('forwards button attributes and events without leaking loading', async () => {
		const onClick = vi.fn()
		const wrapper = await mountSuspended(ButtonLoading, {
			attrs: {
				id: 'save-button',
				onClick
			},
			slots: { default: 'Save changes' }
		})
		wrappers.add(wrapper)

		const button = wrapper.get('button')
		expect(button.attributes('id')).toBe('save-button')
		expect(button.attributes('disabled')).toBeUndefined()
		expect(button.attributes('aria-busy')).toBeUndefined()
		expect(button.attributes()).not.toHaveProperty('loading')
		await button.trigger('click')
		expect(onClick).toHaveBeenCalledOnce()
	})

	it('disables a loading button while preserving hidden slot width', async () => {
		const onClick = vi.fn()
		const wrapper = await mountSuspended(ButtonLoading, {
			props: { loading: true },
			attrs: {
				as: 'a',
				'as-child': true,
				onClick
			},
			slots: { default: 'Save changes' }
		})
		wrappers.add(wrapper)

		const button = wrapper.get('button')
		expect(button.attributes('disabled')).toBeDefined()
		expect(button.attributes('aria-busy')).toBe('true')
		expect(button.attributes()).not.toHaveProperty('loading')
		expect(button.attributes()).not.toHaveProperty('as')
		expect(button.attributes()).not.toHaveProperty('as-child')
		expect(button.find('svg.animate-spin').exists()).toBe(true)
		const content = button.get('div.flex')
		expect(content.classes()).toContain('opacity-0')
		expect(content.text()).toContain('Save changes')
		await button.trigger('click')
		expect(onClick).not.toHaveBeenCalled()
	})

	it('keeps an explicitly disabled non-loading button disabled', async () => {
		const wrapper = await mountSuspended(ButtonLoading, {
			props: { disabled: true },
			slots: { default: 'Save changes' }
		})
		wrappers.add(wrapper)

		expect(wrapper.get('button').attributes('disabled')).toBeDefined()
	})

	it('forwards checkbox state and updates through a 40px target', async () => {
		const wrapper = await mountSuspended(CheckboxLargeHitArea, {
			props: { modelValue: false },
			attrs: {
				'aria-label': 'Stage track',
				'large-hit-area': true
			}
		})
		wrappers.add(wrapper)

		const checkbox = wrapper.get('[role="checkbox"]')
		expect(checkbox.classes()).toContain('size-10')
		expect(checkbox.classes()).toContain('before:size-5')
		expect(checkbox.attributes('aria-label')).toBe('Stage track')
		expect(checkbox.attributes()).not.toHaveProperty('largehitarea')
		expect(checkbox.attributes()).not.toHaveProperty('large-hit-area')
		expect(wrapper.html()).not.toContain('large-hit-area')
		await checkbox.trigger('click')
		expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
	})

	it('preserves the standard checked indicator without a custom slot', async () => {
		const wrapper = await mountSuspended(CheckboxLargeHitArea, {
			props: { modelValue: true }
		})
		wrappers.add(wrapper)

		const checkbox = wrapper.get('[role="checkbox"]')
		expect(checkbox.attributes('aria-checked')).toBe('true')
		expect(checkbox.find('svg').exists()).toBe(true)
	})

	it('renders one visible and accessible labelled separator', async () => {
		const wrapper = await mountSuspended(SeparatorLabelled, {
			props: {
				label: 'OR',
				class: 'root-marker',
				labelClass: 'label-marker'
			},
			attrs: { 'span-class': 'legacy-marker' }
		})
		wrappers.add(wrapper)

		const separator = wrapper.get('[role="separator"]')
		expect(separator.attributes('aria-label')).toBe('OR')
		expect(separator.classes()).toContain('root-marker')
		expect(separator.classes()).not.toContain('label-marker')
		expect(separator.text()).toBe('OR')
		expect(separator.findAll('[role="separator"]')).toHaveLength(0)
		const label = separator.get('span')
		expect(label.classes()).toContain('label-marker')
		expect(label.classes()).toContain('bg-card')
		expect(separator.attributes()).not.toHaveProperty('label')
		expect(separator.attributes()).not.toHaveProperty('label-class')
		expect(separator.attributes()).not.toHaveProperty('span-class')
		expect(label.classes()).not.toContain('legacy-marker')
		expect(wrapper.html()).not.toContain('span-class')
	})

	it('keeps alert actions open and inert while loading', async () => {
		const open = ref(true)
		const onClick = vi.fn()
		const Harness = defineComponent({
			setup() {
				return () =>
					h(
						AlertDialog,
						{
							open: open.value,
							'onUpdate:open': (value: boolean) => {
								open.value = value
							}
						},
						{
							default: () =>
								h(
									AlertDialogActionLoading,
									{
										as: 'a',
										asChild: true,
										loading: true,
										onClick
									} as Record<string, unknown>,
									() => 'Delete'
								)
						}
					)
			}
		})
		const wrapper = await mountSuspended(Harness)
		wrappers.add(wrapper)

		const action = wrapper.get('button')
		expect(action.attributes('disabled')).toBeDefined()
		expect(action.attributes('aria-busy')).toBe('true')
		expect(action.attributes()).not.toHaveProperty('loading')
		expect(action.attributes()).not.toHaveProperty('as')
		expect(action.attributes()).not.toHaveProperty('aschild')
		expect(action.attributes()).not.toHaveProperty('as-child')
		expect(action.find('svg.animate-spin').exists()).toBe(true)
		expect(action.get('div.flex').classes()).toContain('opacity-0')
		await action.trigger('click')
		expect(onClick).not.toHaveBeenCalled()
		expect(open.value).toBe(true)
	})

	it('preserves the standard alert action close contract', async () => {
		const open = ref(true)
		const onClick = vi.fn()
		const Harness = defineComponent({
			setup() {
				return () =>
					h(
						AlertDialog,
						{
							open: open.value,
							'onUpdate:open': (value: boolean) => {
								open.value = value
							}
						},
						{
							default: () =>
								h(AlertDialogActionLoading, { onClick }, () => 'Delete')
						}
					)
			}
		})
		const wrapper = await mountSuspended(Harness)
		wrappers.add(wrapper)

		await wrapper.get('button').trigger('click')
		expect(onClick).toHaveBeenCalledOnce()
		expect(open.value).toBe(false)
	})
})
