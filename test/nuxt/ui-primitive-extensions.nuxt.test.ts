import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import Button from '~/components/ui/button/Button.vue'
import Checkbox from '~/components/ui/checkbox/Checkbox.vue'

const wrappers = new Set<VueWrapper>()

describe('UI primitive extensions', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		document.body.innerHTML = ''
	})

	it('renders an enabled button with its slot content', async () => {
		const wrapper = await mountSuspended(Button, {
			slots: { default: 'Load record' }
		})
		wrappers.add(wrapper)

		const button = wrapper.get('[data-slot="button"]')
		expect(button.attributes('disabled')).toBeUndefined()
		expect(button.text()).toContain('Load record')
	})

	it('disables a loading button while preserving hidden slot content', async () => {
		const wrapper = await mountSuspended(Button, {
			props: { loading: true },
			slots: { default: 'Save changes' }
		})
		wrappers.add(wrapper)

		const button = wrapper.get('[data-slot="button"]')
		expect(button.attributes('disabled')).toBeDefined()
		expect(button.find('svg.animate-spin').exists()).toBe(true)
		const content = button.get('div.flex')
		expect(content.classes()).toContain('opacity-0')
		expect(content.text()).toContain('Save changes')
	})

	it('keeps the ordinary checkbox root compact', async () => {
		const wrapper = await mountSuspended(Checkbox)
		wrappers.add(wrapper)

		const checkbox = wrapper.get('[data-slot="checkbox"]')
		expect(checkbox.attributes('role')).toBe('checkbox')
		expect(checkbox.classes()).toContain('size-4')
		expect(checkbox.classes()).not.toContain('size-10')
	})

	it('adds a larger target without forwarding largeHitArea to the DOM', async () => {
		const wrapper = await mountSuspended(Checkbox, {
			props: { largeHitArea: true }
		})
		wrappers.add(wrapper)

		const checkbox = wrapper.get('[data-slot="checkbox"]')
		expect(checkbox.classes()).toContain('size-10')
		expect(checkbox.classes()).toContain('before:size-5')
		expect(checkbox.attributes()).not.toHaveProperty('largehitarea')
		expect(checkbox.attributes()).not.toHaveProperty('large-hit-area')
	})
})
