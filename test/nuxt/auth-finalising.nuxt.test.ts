import { nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthFinalisingPage from '~/pages/auth/finalising.vue'
import LoginPage from '~/pages/login.vue'

const factories = vi.hoisted(() => ({
	navigate: vi.fn(),
	route: vi.fn(),
	user: vi.fn()
}))
const signInWithProvider = vi.hoisted(() => vi.fn())

mockNuxtImport('navigateTo', () => factories.navigate)
mockNuxtImport('useRoute', () => factories.route)
mockNuxtImport('useUserStore', () => factories.user)

const wrappers = new Set<VueWrapper>()
const callbackFailureMessage = "We couldn't complete your sign in."
const timeoutFailureMessage = 'Sign in is taking longer than expected.'
const failureGuidance = 'Please try again or return to login.'

async function mountPage(
	query: Record<string, unknown> = {},
	supaUser: { id: string } | null = null
): Promise<VueWrapper> {
	factories.route.mockReturnValue({ query })
	factories.user.mockReturnValue({ supaUser })
	const wrapper = await mountSuspended(AuthFinalisingPage)
	wrappers.add(wrapper)
	await flushPromises()
	await nextTick()
	return wrapper
}

async function mountLoginPage(query: Record<string, unknown>) {
	factories.route.mockReturnValue({ query })
	factories.user.mockReturnValue({
		authOperationError: null,
		supaUser: null,
		userAlreadyRegistered: false,
		signInWithEmail: vi.fn(),
		signInWithProvider
	})
	const wrapper = await mountSuspended(LoginPage)
	wrappers.add(wrapper)
	await nextTick()
	return wrapper
}

async function clickProvider(wrapper: VueWrapper, label: string) {
	const button = wrapper
		.findAll('button')
		.find((candidate) => candidate.text().includes(label))
	if (!button) throw new Error(`${label} sign-in button not found`)
	await button.trigger('click')
	await flushPromises()
}

function expectFailureActions(wrapper: VueWrapper, retryHref: string) {
	expect(wrapper.text()).toContain(failureGuidance)
	const links = wrapper.findAll('a')
	expect(
		links.some(
			(link) =>
				link.text() === 'Try again' && link.attributes('href') === retryHref
		)
	).toBe(true)
	expect(
		links.some(
			(link) =>
				link.text() === 'Open demo' && link.attributes('href') === '/demo'
		)
	).toBe(true)
}

function replacementNavigations() {
	return factories.navigate.mock.calls.filter(
		([, options]) =>
			(options as { replace?: boolean } | undefined)?.replace === true
	)
}

describe('auth finalising page', () => {
	beforeEach(() => {
		factories.navigate.mockResolvedValue(undefined)
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		vi.useRealTimers()
	})

	it('redirects an authenticated user to the safe requested target', async () => {
		const wrapper = await mountPage(
			{ redirect: '/records?crate=house#release-1' },
			{ id: 'user-1' }
		)

		expect(replacementNavigations()).toEqual([
			['/records?crate=house#release-1', { replace: true }]
		])
		expect(wrapper.text()).toContain('Sign in successful. Redirecting...')
		expect(wrapper.text()).not.toContain(callbackFailureMessage)
	})

	it('falls back to home for an unsafe requested target', async () => {
		await mountPage(
			{ redirect: 'https://evil.example/records' },
			{ id: 'user-1' }
		)

		expect(replacementNavigations()).toEqual([['/', { replace: true }]])
	})

	it('shows a persistent failure when navigation resolves false', async () => {
		factories.navigate.mockImplementation(async (_path, options) =>
			(options as { replace?: boolean } | undefined)?.replace
				? false
				: undefined
		)
		const wrapper = await mountPage({ redirect: '/records' }, { id: 'user-1' })

		expect(replacementNavigations()).toEqual([['/records', { replace: true }]])
		expect(wrapper.text()).toContain(callbackFailureMessage)
		expectFailureActions(wrapper, '/login?redirect=%2Frecords')
	})

	it('shows the same persistent failure when navigation throws', async () => {
		factories.navigate.mockImplementation(async (_path, options) => {
			if ((options as { replace?: boolean } | undefined)?.replace)
				throw new Error('SECRET navigation detail')
		})
		const wrapper = await mountPage({ redirect: '/records' }, { id: 'user-1' })

		expect(wrapper.text()).toContain(callbackFailureMessage)
		expect(wrapper.text()).not.toContain('SECRET navigation detail')
		expectFailureActions(wrapper, '/login?redirect=%2Frecords')
	})

	it('shows a generic persistent failure for a denied callback', async () => {
		const wrapper = await mountPage(
			{
				redirect: '/records',
				error: 'access_denied',
				error_description: 'SECRET provider detail'
			},
			{ id: 'user-1' }
		)

		expect(replacementNavigations()).toEqual([])
		expect(wrapper.text()).toContain(callbackFailureMessage)
		expect(wrapper.text()).not.toContain('access_denied')
		expect(wrapper.text()).not.toContain('SECRET provider detail')
		expectFailureActions(wrapper, '/login?redirect=%2Frecords')
	})

	it('shows the same generic failure for malformed callback details', async () => {
		const wrapper = await mountPage({
			redirect: '/records',
			error_description: ['unexpected', 'provider', 'values']
		})

		expect(wrapper.text()).toContain(callbackFailureMessage)
		expect(wrapper.text()).not.toContain('unexpected')
		expect(wrapper.text()).not.toContain('provider')
		expectFailureActions(wrapper, '/login?redirect=%2Frecords')
	})

	it('replaces indefinite loading with a persistent timeout failure', async () => {
		vi.useFakeTimers()
		const wrapper = await mountPage({ redirect: '/records' })

		expect(wrapper.text()).toContain('Completing sign in...')
		await vi.advanceTimersByTimeAsync(10_000)
		await nextTick()

		expect(wrapper.text()).toContain(timeoutFailureMessage)
		expect(wrapper.text()).not.toContain('Completing sign in...')
		expectFailureActions(wrapper, '/login?redirect=%2Frecords')
	})

	it('clears the hydration timeout when unmounted', async () => {
		vi.useFakeTimers()
		const wrapper = await mountPage()

		const timerCount = vi.getTimerCount()
		expect(timerCount).toBeGreaterThan(0)
		wrapper.unmount()
		wrappers.delete(wrapper)

		expect(vi.getTimerCount()).toBe(timerCount - 1)
	})
})

describe('login return-path forwarding', () => {
	beforeEach(() => {
		signInWithProvider.mockResolvedValue(true)
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
	})

	it('forwards a safe destination to provider sign-in', async () => {
		const wrapper = await mountLoginPage({
			redirect: '/records?crate=house#release-1'
		})

		await clickProvider(wrapper, 'GitHub')

		expect(signInWithProvider).toHaveBeenCalledWith(
			'github',
			'/records?crate=house#release-1'
		)
	})

	it('forwards the safe fallback for a malicious destination', async () => {
		const wrapper = await mountLoginPage({
			redirect: 'https://evil.example/records'
		})

		await clickProvider(wrapper, 'Google')

		expect(signInWithProvider).toHaveBeenCalledWith('google', '/')
	})
})
