import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import AuthLayout from '~/layouts/auth.vue'
import DefaultLayout from '~/layouts/default.vue'

const wrappers = new Set<VueWrapper>()
const layoutStubs = {
	HeaderApp: {
		template: '<header><div id="header-left" /></header>'
	},
	NavMain: { template: '<nav />' },
	StatusWorkbench: { template: '<footer />' }
}

async function mountLayout() {
	const wrapper = await mountSuspended(DefaultLayout, {
		global: { stubs: layoutStubs },
		slots: { default: '<div data-testid="page">Page content</div>' }
	})
	wrappers.add(wrapper)
	return wrapper
}

async function mountAuthLayout() {
	const wrapper = await mountSuspended(AuthLayout, {
		slots: { default: '<div data-testid="page">Page content</div>' }
	})
	wrappers.add(wrapper)
	return wrapper
}

describe('authenticated workbench layout shell', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		document.body.innerHTML = ''
	})

	it('keeps the header teleport target mounted on protected routes', async () => {
		const wrapper = await mountLayout()

		expect(wrapper.find('#header-left').exists()).toBe(true)
		expect(wrapper.find('[data-workbench-density]').exists()).toBe(true)
	})

	it('uses the ordinary scrolling shell on public auth routes', async () => {
		const wrapper = await mountAuthLayout()

		expect(wrapper.find('#header-left').exists()).toBe(false)
		expect(wrapper.find('[data-workbench-density]').exists()).toBe(false)
		expect(wrapper.find('[data-auth-page-scroll-container]').exists()).toBe(
			true
		)
		expect(wrapper.text()).toContain('Page content')
	})

	it('lets public pages own their chrome without duplicating global links', async () => {
		const wrapper = await mountAuthLayout()

		expect(wrapper.find('nav[aria-label="Project links"]').exists()).toBe(false)
		expect(wrapper.text()).toContain('Page content')
	})

	it('keeps the workbench shell independent from auth route state', async () => {
		const wrapper = await mountLayout()

		expect(wrapper.find('#header-left').exists()).toBe(true)
		expect(wrapper.find('[data-workbench-density]').exists()).toBe(true)
		expect(wrapper.find('[data-auth-page-scroll-container]').exists()).toBe(
			false
		)
	})
})
