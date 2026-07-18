import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import Button from '~/components/ui/button/Button.vue'
import Checkbox from '~/components/ui/checkbox/Checkbox.vue'
import SheetContent from '~/components/ui/sheet/SheetContent.vue'

const wrappers = new Set<VueWrapper>()

describe('standard UI primitives', () => {
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

	it('keeps the ordinary checkbox root compact', async () => {
		const wrapper = await mountSuspended(Checkbox)
		wrappers.add(wrapper)

		const checkbox = wrapper.get('[data-slot="checkbox"]')
		expect(checkbox.attributes('role')).toBe('checkbox')
		expect(checkbox.classes()).toContain('size-4')
		expect(checkbox.classes()).not.toContain('size-10')
	})

	it('gives the shared sheet close control an accessible name', async () => {
		const wrapper = await mountSuspended(SheetContent, {
			global: {
				stubs: {
					DialogClose: { template: '<button><slot /></button>' },
					DialogContent: { template: '<section><slot /></section>' },
					DialogOverlay: true,
					DialogPortal: { template: '<div><slot /></div>' }
				}
			}
		})
		wrappers.add(wrapper)

		expect(wrapper.get('button').text()).toBe('Close')
	})
})
