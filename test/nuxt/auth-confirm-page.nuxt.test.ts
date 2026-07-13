import { nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthConfirmPage from '~/pages/auth/confirm.vue'

const factories = vi.hoisted(() => ({
	route: vi.fn(),
	user: vi.fn()
}))
const verifyOtp = vi.hoisted(() => vi.fn())

mockNuxtImport('useRoute', () => factories.route)
mockNuxtImport('useUserStore', () => factories.user)

const wrappers = new Set<VueWrapper>()
const failureMessage = 'This confirmation link is invalid or has expired.'
const failureGuidance = 'Return to login and request a new link if needed.'

async function mountPage(
	query: Record<string, string>,
	settle = true
): Promise<VueWrapper> {
	factories.route.mockReturnValue({ query })
	const wrapper = await mountSuspended(AuthConfirmPage)
	wrappers.add(wrapper)

	if (settle) {
		await flushPromises()
		await nextTick()
	}

	return wrapper
}

function expectPersistentFailure(wrapper: VueWrapper) {
	expect(wrapper.text()).toContain(failureMessage)
	expect(wrapper.text()).toContain(failureGuidance)
	const loginLink = wrapper.get('a')
	expect(loginLink.text()).toBe('Back to login')
	expect(loginLink.attributes('href')).toBe('/login')
}

describe('auth confirmation page', () => {
	beforeEach(() => {
		factories.user.mockReturnValue({ verifyOtp })
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
	})

	it('shows a persistent recovery action when parameters are missing', async () => {
		const wrapper = await mountPage({ type: 'email' })

		expectPersistentFailure(wrapper)
		expect(verifyOtp).not.toHaveBeenCalled()
	})

	it('shows a persistent recovery action for an unknown type', async () => {
		const wrapper = await mountPage({
			token_hash: 'token-hash',
			type: 'unknown'
		})

		expectPersistentFailure(wrapper)
		expect(verifyOtp).not.toHaveBeenCalled()
	})

	it('shows a persistent recovery action when verification fails', async () => {
		verifyOtp.mockResolvedValue(false)
		const wrapper = await mountPage({
			token_hash: 'token-hash',
			type: 'email'
		})

		expect(verifyOtp).toHaveBeenCalledWith('token-hash', 'email')
		expectPersistentFailure(wrapper)
	})

	it('keeps the loading state visible while verification is pending', async () => {
		let resolveVerification!: (verified: boolean) => void
		verifyOtp.mockReturnValue(
			new Promise<boolean>((resolve) => {
				resolveVerification = resolve
			})
		)

		const wrapper = await mountPage(
			{ token_hash: 'token-hash', type: 'email' },
			false
		)
		await nextTick()

		expect(wrapper.text()).toContain('Verifying confirmation link...')
		expect(wrapper.text()).not.toContain(failureMessage)

		resolveVerification(true)
		await flushPromises()
	})

	it('keeps a non-error redirect state after successful verification', async () => {
		verifyOtp.mockResolvedValue(true)
		const wrapper = await mountPage({
			token_hash: 'token-hash',
			type: 'email'
		})

		expect(wrapper.text()).toContain('Confirmation successful. Redirecting...')
		expect(wrapper.text()).not.toContain(failureMessage)
		expect(wrapper.find('a[href="/login"]').exists()).toBe(false)
	})
})
