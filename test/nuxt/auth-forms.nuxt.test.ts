import { type Component, nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '~/pages/login.vue'
import ResetPasswordPage from '~/pages/reset-password.vue'
import SignupPage from '~/pages/signup.vue'

const factories = vi.hoisted(() => ({
	route: vi.fn(),
	user: vi.fn()
}))

const authActions = vi.hoisted(() => ({
	sendPasswordResetEmail: vi.fn(),
	signInWithEmail: vi.fn(),
	signInWithProvider: vi.fn(),
	signUpWithEmail: vi.fn()
}))

mockNuxtImport('useRoute', () => factories.route)
mockNuxtImport('useUserStore', () => factories.user)

const wrappers = new Set<VueWrapper>()

async function mountPage(page: Component) {
	const wrapper = await mountSuspended(page)
	wrappers.add(wrapper)
	await nextTick()
	return wrapper
}

function expectEmailSemantics(input: {
	attributes: () => Record<string, string>
}) {
	expect(input.attributes()).toMatchObject({
		type: 'email',
		name: 'email',
		autocomplete: 'email',
		inputmode: 'email',
		autocapitalize: 'none'
	})
}

function expectPasswordSemantics(
	wrapper: VueWrapper,
	autocomplete: 'current-password' | 'new-password'
) {
	const input = wrapper.get<HTMLInputElement>('input[name="password"]')
	expect(input.attributes()).toMatchObject({
		type: 'password',
		name: 'password',
		autocomplete
	})
	expect(
		wrapper.get('button[aria-label="Show password"]').attributes('type')
	).toBe('button')
}

async function submit(wrapper: VueWrapper) {
	await wrapper.get('form').trigger('submit.prevent')
	await flushPromises()
	await nextTick()
}

async function setFieldValue(
	wrapper: VueWrapper,
	name: 'email' | 'password',
	value: string
) {
	const field = wrapper
		.findAllComponents({ name: 'Field' })
		.find((candidate) => candidate.props('name') === name)
	if (!field) throw new Error(`${name} field not found`)
	const { exposed } = (
		field.vm as unknown as {
			$: { exposed: { setValue: (fieldValue: string) => void } }
		}
	).$
	exposed.setValue(value)
	await nextTick()
}

describe('auth form contracts', () => {
	beforeEach(() => {
		factories.route.mockReturnValue({ query: {} })
		factories.user.mockReturnValue({
			userAlreadyRegistered: false,
			...authActions
		})
		authActions.sendPasswordResetEmail.mockResolvedValue(false)
		authActions.signInWithEmail.mockResolvedValue(false)
		authActions.signInWithProvider.mockResolvedValue(false)
		authActions.signUpWithEmail.mockResolvedValue(false)
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('renders login fields with current-credential browser semantics', async () => {
		const wrapper = await mountPage(LoginPage)

		expectEmailSemantics(wrapper.get('input[name="email"]'))
		expectPasswordSemantics(wrapper, 'current-password')
	})

	it('keeps login compatible with an existing non-composition password', async () => {
		const wrapper = await mountPage(LoginPage)
		await setFieldValue(wrapper, 'email', 'user@example.com')
		await setFieldValue(wrapper, 'password', 'legacy')

		await submit(wrapper)

		await vi.waitFor(() => {
			expect(authActions.signInWithEmail).toHaveBeenCalledWith(
				'user@example.com',
				'legacy'
			)
		})
	})

	it('renders signup fields with new-credential browser semantics', async () => {
		const wrapper = await mountPage(SignupPage)

		expectEmailSemantics(wrapper.get('input[name="email"]'))
		expectPasswordSemantics(wrapper, 'new-password')
		expect(wrapper.vm.$router.resolve('/signup').meta.keepalive).toBe(false)
	})

	it('preserves signup credentials on failure and clears them on success', async () => {
		const wrapper = await mountPage(SignupPage)
		const email = wrapper.get<HTMLInputElement>('input[name="email"]')
		const password = wrapper.get<HTMLInputElement>('input[name="password"]')
		await setFieldValue(wrapper, 'email', 'user@example.com')
		await setFieldValue(wrapper, 'password', 'Password123')

		await submit(wrapper)

		await vi.waitFor(() => {
			expect(authActions.signUpWithEmail).toHaveBeenCalledWith(
				'user@example.com',
				'Password123'
			)
		})
		expect(email.element.value).toBe('user@example.com')
		expect(password.element.value).toBe('Password123')

		authActions.signUpWithEmail.mockResolvedValue(true)
		await submit(wrapper)

		await vi.waitFor(() => {
			expect(email.element.value).toBe('')
			expect(password.element.value).toBe('')
		})
	})

	it('starts signup with empty credentials after a remount', async () => {
		const first = await mountPage(SignupPage)
		await setFieldValue(first, 'email', 'user@example.com')
		await setFieldValue(first, 'password', 'Password123')
		first.unmount()
		wrappers.delete(first)

		const remounted = await mountPage(SignupPage)

		expect(
			remounted.get<HTMLInputElement>('input[name="email"]').element.value
		).toBe('')
		expect(
			remounted.get<HTMLInputElement>('input[name="password"]').element.value
		).toBe('')
	})

	it('renders reset email semantics and preserves the email on failure', async () => {
		const wrapper = await mountPage(ResetPasswordPage)
		const email = wrapper.get<HTMLInputElement>('input[name="email"]')
		expectEmailSemantics(email)
		await setFieldValue(wrapper, 'email', 'user@example.com')

		await submit(wrapper)

		await vi.waitFor(() => {
			expect(authActions.sendPasswordResetEmail).toHaveBeenCalledWith(
				'user@example.com'
			)
		})
		expect(email.element.value).toBe('user@example.com')
		expect(wrapper.text()).toContain('Reset password')
	})

	it('shows reset success only after the reset email was sent', async () => {
		authActions.sendPasswordResetEmail.mockResolvedValue(true)
		const wrapper = await mountPage(ResetPasswordPage)
		await setFieldValue(wrapper, 'email', 'user@example.com')

		await submit(wrapper)

		await vi.waitFor(() => {
			expect(wrapper.find('form').exists()).toBe(false)
			expect(wrapper.text()).toContain('Check your inbox')
		})
	})
})
