import { nextTick, reactive, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import DefaultLayout from '~/layouts/default.vue'

const route = reactive({ path: '/tracks' })
mockNuxtImport('useRoute', () => () => route)
mockNuxtImport('useSupabaseUser', () => () => ref(null))

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

describe('authenticated workbench layout shell', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		document.body.innerHTML = ''
	})

	it('keeps the header teleport target mounted on protected routes', async () => {
		route.path = '/tracks'
		const wrapper = await mountLayout()

		expect(wrapper.find('#header-left').exists()).toBe(true)
		expect(wrapper.find('[data-workbench-density]').exists()).toBe(true)
	})

	it('uses the ordinary scrolling shell on public auth routes', async () => {
		route.path = '/login'
		const wrapper = await mountLayout()

		expect(wrapper.find('#header-left').exists()).toBe(false)
		expect(wrapper.find('[data-workbench-density]').exists()).toBe(false)
		expect(wrapper.text()).toContain('Page content')
	})

	it('returns legal document navigation to the top of the public shell', async () => {
		route.path = '/privacy'
		const wrapper = await mountLayout()
		const scrollShell = wrapper.get('[data-public-page-scroll-container]')
		scrollShell.element.scrollTop = 480
		scrollShell.element.scrollLeft = 24

		route.path = '/terms'
		await nextTick()
		await nextTick()

		expect(scrollShell.element.scrollTop).toBe(0)
		expect(scrollShell.element.scrollLeft).toBe(0)
	})

	it('retains the workbench target for public demo routes', async () => {
		route.path = '/demo/records'
		const wrapper = await mountLayout()

		expect(wrapper.find('#header-left').exists()).toBe(true)
	})
})
