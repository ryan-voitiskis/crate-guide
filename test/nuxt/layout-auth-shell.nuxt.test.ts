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

	it('lets public pages own their chrome without duplicating global links', async () => {
		route.path = '/auth/confirm'
		const wrapper = await mountLayout()

		expect(wrapper.find('nav[aria-label="Project links"]').exists()).toBe(false)
		expect(wrapper.text()).toContain('Page content')
	})

	it('uses a single stable root across shell changes', async () => {
		route.path = '/login'
		const wrapper = await mountLayout()

		expect(wrapper.element.classList.contains('contents')).toBe(true)
		expect(wrapper.find('[data-public-page-scroll-container]').exists()).toBe(
			true
		)
		expect(wrapper.find('[data-workbench-density]').exists()).toBe(false)

		route.path = '/'
		await nextTick()

		expect(wrapper.find('[data-public-page-scroll-container]').exists()).toBe(
			false
		)
		expect(wrapper.find('[data-workbench-density]').exists()).toBe(true)
		expect(wrapper.find('#header-left').exists()).toBe(true)
	})

	it('retains the workbench target for public demo routes', async () => {
		route.path = '/demo/records'
		const wrapper = await mountLayout()

		expect(wrapper.find('#header-left').exists()).toBe(true)
	})
})
