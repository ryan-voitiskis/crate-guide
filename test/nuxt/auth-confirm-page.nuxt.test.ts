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
const failureGuidance = 'Request another sign-in link or use your credentials.'

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
	const loginLink = wrapper
		.findAll('a[href^="/login"]')
		.find((link) => link.text() === 'Go to login')
	if (!loginLink) throw new Error('Back to login link not found')
	expect(loginLink.text()).toBe('Go to login')
	expect(loginLink.attributes('href')).toBe('/login?redirect=%2F')
}

describe('auth confirmation page', () => {
	beforeEach(() => {
		factories.user.mockReturnValue({
			pendingSignup: null,
			supaUser: null,
			verifyOtp
		})
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

		expect(verifyOtp).toHaveBeenCalledWith('token-hash', 'email', '/')
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

		expect(wrapper.text()).toContain('Verifying sign-in link...')
		expect(document.title).toBe('Verify sign in · Crate Guide')
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

		expect(wrapper.text()).toContain('Sign in verified. Redirecting...')
		expect(wrapper.text()).not.toContain(failureMessage)
		expect(
			wrapper
				.findAll('a[href^="/login"]')
				.some((link) => link.text() === 'Back to login')
		).toBe(false)
	})

	it('forwards a safe return destination through verification', async () => {
		verifyOtp.mockResolvedValue(true)
		await mountPage({
			token_hash: 'token-hash',
			type: 'signup',
			redirect: '/records?crate=house'
		})

		expect(verifyOtp).toHaveBeenCalledWith(
			'token-hash',
			'signup',
			'/records?crate=house'
		)
	})

	it.each([
		[
			'recovery',
			'Request a new reset link',
			'/reset-password?redirect=%2Frecords'
		],
		['signup', 'Return to sign up', '/signup?redirect=%2Frecords'],
		['magiclink', 'Go to login', '/login?redirect=%2Frecords'],
		['invite', 'Go to login', '/login?redirect=%2Frecords'],
		['email', 'Go to login', '/login?redirect=%2Frecords'],
		['email_change', 'Go to login', '/login?redirect=%2Frecords']
	])(
		'offers a purpose-specific action for %s failures',
		async (type, label, href) => {
			verifyOtp.mockResolvedValue(false)
			const wrapper = await mountPage({
				token_hash: 'token-hash',
				type,
				redirect: '/records'
			})
			const link = wrapper
				.findAll('a')
				.find((candidate) => candidate.text() === label)
			expect(link?.attributes('href')).toBe(href)
		}
	)
})
