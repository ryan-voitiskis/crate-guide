import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StatusWorkbench from '~/components/layout/StatusWorkbench.vue'
import type { WorkbenchCapabilities } from '~/repositories/library/contracts'

const factories = vi.hoisted(() => ({
	capabilities: vi.fn(),
	navigation: vi.fn(),
	online: vi.fn(),
	route: vi.fn()
}))

mockNuxtImport('useWorkbenchCapabilities', () => factories.capabilities)
mockNuxtImport('useNavigation', () => factories.navigation)
mockNuxtImport('useOnline', () => factories.online)
mockNuxtImport('useRoute', () => factories.route)

const wrappers = new Set<VueWrapper>()

function capabilities(
	location: WorkbenchCapabilities['location']
): WorkbenchCapabilities {
	return {
		location,
		canPersistSessions: location !== 'demo',
		canMutateLibrary: location !== 'demo',
		canManageCrates: location !== 'demo',
		canConnectDiscogs: location === 'cloud',
		canEnrichTracks: location !== 'demo',
		canManageAccount: location === 'cloud'
	}
}

async function mountStatus(location: WorkbenchCapabilities['location']) {
	factories.capabilities.mockReturnValue(capabilities(location))
	const wrapper = await mountSuspended(StatusWorkbench, {
		global: {
			stubs: { ControlTransferWorkbench: true }
		}
	})
	wrappers.add(wrapper)
	return wrapper
}

describe('workbench workspace status', () => {
	beforeEach(() => {
		factories.navigation.mockReturnValue({
			isDemo: false,
			isActive: () => true,
			visibleNavItems: ref([{ path: '/records', label: 'Records' }])
		})
		factories.online.mockReturnValue(ref(true))
		factories.route.mockReturnValue({ meta: { title: 'Records' } })
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
	})

	it('separates Cloud location, backup, and online connectivity', async () => {
		const wrapper = await mountStatus('cloud')

		expect(wrapper.text()).toContain('Online')
		expect(wrapper.text()).toContain('Cloud library')
		expect(wrapper.text()).toContain('Export recommended')
		expect(wrapper.text()).not.toContain('Local-first workspace')
	})

	it('does not imply that an offline Cloud library remains available', async () => {
		factories.online.mockReturnValue(ref(false))
		const wrapper = await mountStatus('cloud')

		expect(wrapper.text()).toContain('Offline — unavailable')
		expect(wrapper.text()).toContain('Cloud library')
		expect(wrapper.text()).toContain('Export recommended')
	})

	it('labels the Demo as read-only without calling it local-first', async () => {
		factories.navigation.mockReturnValue({
			isDemo: true,
			isActive: () => true,
			visibleNavItems: ref([{ path: '/demo/records', label: 'Records' }])
		})
		const wrapper = await mountStatus('demo')

		expect(wrapper.text()).toContain('Demo')
		expect(wrapper.text()).toContain('Read-only')
		expect(wrapper.text()).toContain('Online')
		expect(wrapper.text()).not.toContain('Local-first workspace')
	})

	it('states the browser library backup boundary when offline', async () => {
		factories.online.mockReturnValue(ref(false))
		const wrapper = await mountStatus('browser')

		expect(wrapper.text()).toContain('Offline')
		expect(wrapper.text()).toContain('This browser')
		expect(wrapper.text()).toContain('Not backed up')
	})
})
