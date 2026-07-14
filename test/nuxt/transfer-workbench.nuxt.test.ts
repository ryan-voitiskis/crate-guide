import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ControlTransferWorkbench from '~/components/workbench/ControlTransferWorkbench.vue'

const factories = vi.hoisted(() => ({
	discogs: vi.fn(),
	route: vi.fn(),
	user: vi.fn()
}))

mockNuxtImport('useDiscogsStore', () => factories.discogs)
mockNuxtImport('useRoute', () => factories.route)
mockNuxtImport('useSupabaseUser', () => factories.user)

const openTransferMonitor = vi.hoisted(() => vi.fn())
const dismissTransferMonitor = vi.hoisted(() => vi.fn())
const wrappers = new Set<VueWrapper>()

function mockTransfer(
	overrides: Partial<{
		hasTransferActivity: boolean
		importPhase: 'fetching' | 'saving' | null
		importProgress: number
		isImporting: boolean
		transferLabel: string
		transferTone: 'active' | 'success' | 'warning'
	}> = {}
) {
	factories.discogs.mockReturnValue({
		hasTransferActivity: true,
		importPhase: 'fetching',
		importProgress: 37,
		isImporting: true,
		transferLabel: 'Discogs · Fetching · 37%',
		transferTone: 'active',
		openTransferMonitor,
		dismissTransferMonitor,
		...overrides
	})
}

describe('transfer workbench control', () => {
	beforeEach(() => {
		factories.route.mockReturnValue({ path: '/records' })
		factories.user.mockReturnValue(ref({ id: 'user-id' }))
		mockTransfer()
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('shows dense active transfer status and reopens the monitor', async () => {
		const wrapper = await mountSuspended(ControlTransferWorkbench)
		wrappers.add(wrapper)

		expect(wrapper.text()).toContain('Transfers')
		expect(wrapper.text()).toContain('Discogs · Fetching · 37%')
		const button = wrapper.get('button')
		expect(button.attributes('aria-label')).toContain(
			'Discogs · Fetching · 37%'
		)
		expect(wrapper.find('svg.animate-spin').exists()).toBe(true)
		expect(
			wrapper.find('[aria-label="Dismiss transfer status"]').exists()
		).toBe(false)

		await button.trigger('click')
		expect(openTransferMonitor).toHaveBeenCalledOnce()
	})

	it('gives mobile transfers a full touch target and compact progress', async () => {
		const wrapper = await mountSuspended(ControlTransferWorkbench, {
			props: { variant: 'mobile' }
		})
		wrappers.add(wrapper)

		const button = wrapper.get('button')
		expect(button.classes()).toContain('h-11')
		expect(button.classes()).toContain('min-w-11')
		expect(button.text()).toBe('37%')
		expect(wrapper.text()).not.toContain('Transfers')
	})

	it('keeps finished results visible until they are dismissed', async () => {
		mockTransfer({
			importPhase: null,
			isImporting: false,
			transferLabel: 'Discogs · 12 imported · 1 skipped',
			transferTone: 'success'
		})
		const wrapper = await mountSuspended(ControlTransferWorkbench)
		wrappers.add(wrapper)

		expect(wrapper.text()).toContain('12 imported · 1 skipped')
		const dismiss = wrapper.get('[aria-label="Dismiss transfer status"]')
		await dismiss.trigger('click')

		expect(dismissTransferMonitor).toHaveBeenCalledOnce()
	})

	it('does not expose account transfer state in demos or signed-out shells', async () => {
		factories.route.mockReturnValue({ path: '/demo/records' })
		const demoWrapper = await mountSuspended(ControlTransferWorkbench)
		wrappers.add(demoWrapper)
		expect(demoWrapper.find('button').exists()).toBe(false)

		factories.route.mockReturnValue({ path: '/records' })
		factories.user.mockReturnValue(ref(null))
		const signedOutWrapper = await mountSuspended(ControlTransferWorkbench)
		wrappers.add(signedOutWrapper)
		expect(signedOutWrapper.find('button').exists()).toBe(false)
	})
})
