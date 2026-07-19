import { nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CheckInboxPage from '~/pages/auth/check-inbox.vue'

const factories = vi.hoisted(() => ({
	route: vi.fn(),
	user: vi.fn()
}))

const actions = vi.hoisted(() => ({
	clearAuthFeedback: vi.fn(),
	clearPendingSignup: vi.fn(),
	resendSignupConfirmation: vi.fn()
}))

mockNuxtImport('useRoute', () => factories.route)
mockNuxtImport('useUserStore', () => factories.user)

const wrappers = new Set<VueWrapper>()

async function mountPage() {
	const wrapper = await mountSuspended(CheckInboxPage)
	wrappers.add(wrapper)
	await nextTick()
	return wrapper
}

describe('check inbox confirmation recovery', () => {
	beforeEach(() => {
		factories.route.mockReturnValue({ query: { redirect: '/records' } })
		factories.user.mockReturnValue({
			authFeedback: {},
			isResendingSignupConfirmation: false,
			pendingSignup: {
				email: 'ryan@example.com',
				returnPath: '/records'
			},
			...actions
		})
		actions.resendSignupConfirmation.mockResolvedValue(true)
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
	})

	it('shows only a masked destination with resend and correction actions', async () => {
		const wrapper = await mountPage()

		expect(wrapper.text()).toContain('ry•••@example.com')
		expect(wrapper.text()).not.toContain('ryan@example.com')
		expect(wrapper.text()).toContain('Resend confirmation')
		expect(wrapper.get('a[href="/signup?redirect=%2Frecords"]').text()).toBe(
			'Use another email'
		)
	})

	it('does not offer resend after ephemeral context is lost', async () => {
		factories.user.mockReturnValue({
			authFeedback: {},
			isResendingSignupConfirmation: false,
			pendingSignup: null,
			...actions
		})
		const wrapper = await mountPage()

		expect(wrapper.text()).not.toContain('Resend confirmation')
		expect(wrapper.text()).toContain('Return to sign up')
	})

	it('shows local success only after resend completes', async () => {
		const wrapper = await mountPage()
		const button = wrapper
			.findAll('button')
			.find((candidate) => candidate.text().includes('Resend confirmation'))
		if (!button) throw new Error('Resend button not found')

		await button.trigger('click')
		await flushPromises()

		expect(actions.resendSignupConfirmation).toHaveBeenCalledOnce()
		expect(wrapper.text()).toContain('A new confirmation email is on its way.')
	})
})
