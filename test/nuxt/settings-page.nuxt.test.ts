import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from '~/pages/settings.vue'

const user = vi.hoisted(() => ({
	supaUser: {
		email: 'listener@example.com',
		user_metadata: { full_name: 'Test Listener' }
	},
	signOut: vi.fn()
}))

mockNuxtImport('useUserStore', () => () => user)

let wrapper: VueWrapper | null = null

describe('settings page', () => {
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		vi.clearAllMocks()
	})

	it('owns a bounded scroll container and exposes project links', async () => {
		wrapper = await mountSuspended(SettingsPage, {
			global: {
				stubs: {
					DetailsDiscogsAuth: true,
					DialogClearAllData: true,
					DialogDeleteAccount: true,
					SelectPitchRange: true,
					SelectorKeyFormat: true,
					SelectorTheme: true,
					SelectorTurntableColor: true
				}
			}
		})

		const scrollContainer = wrapper.get('[data-settings-scroll-container]')
		expect(scrollContainer.classes()).toEqual(
			expect.arrayContaining([
				'h-full',
				'min-h-0',
				'overflow-y-auto',
				'overscroll-contain'
			])
		)

		expect(wrapper.get('#about').text()).toContain('About Crate Guide')
		const projectLinks = wrapper.get('nav[aria-label="Project links"]')
		const sourceLink = projectLinks
			.findAll('a')
			.find((link) =>
				link.attributes('href')?.startsWith('https://github.com/')
			)
		expect(projectLinks.get('a[href="/privacy"]').text()).toBe('Privacy')
		expect(projectLinks.get('a[href="/terms"]').text()).toBe('Terms')
		expect(sourceLink?.attributes('href')).toBe(
			'https://github.com/ryan-voitiskis/crate-guide'
		)
		expect(sourceLink?.text()).toBe('Source')
	})
})
