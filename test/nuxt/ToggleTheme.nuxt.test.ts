import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import ToggleTheme from '~/components/auth/ToggleTheme.vue'
import type { ThemeOptions } from '~~/shared/types/options'

const themeStore = vi.hoisted(() => ({
	deviceTheme: 'light' as ThemeOptions,
	setLocalTheme: vi.fn(),
	updateTheme: vi.fn()
}))

mockNuxtImport('useUserStore', () => () => themeStore)

describe('public theme toggle', () => {
	it('updates only the device fallback even when an account exists elsewhere', async () => {
		const wrapper = await mountSuspended(ToggleTheme)

		await wrapper.get('button').trigger('click')

		expect(themeStore.setLocalTheme).toHaveBeenCalledWith('dark')
		expect(themeStore.updateTheme).not.toHaveBeenCalled()
	})
})
