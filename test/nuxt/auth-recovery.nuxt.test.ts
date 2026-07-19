import { defineComponent, h, nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type {
	AuthChangeEvent,
	Session,
	SupabaseClient
} from '@supabase/supabase-js'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePasswordRecovery } from '~/composables/usePasswordRecovery'
import UpdatePasswordPage from '~/pages/update-password.vue'
import { observePasswordRecoveryEvents } from '~/plugins/auth-recovery.client'

const factories = vi.hoisted(() => ({
	user: vi.fn()
}))
const resetPassword = vi.hoisted(() => vi.fn())
const passiveAuthSubscription = vi.hoisted(() => ({
	onAuthStateChange: vi.fn(() => ({
		data: { subscription: { unsubscribe: vi.fn() } }
	})),
	getSession: vi.fn().mockResolvedValue({
		data: { session: { user: { id: 'ordinary-user' } } },
		error: null
	})
}))

mockNuxtImport('useUserStore', () => factories.user)
mockNuxtImport('useSupabaseClient', () => () => ({
	auth: passiveAuthSubscription
}))

type PasswordRecoveryState = ReturnType<typeof usePasswordRecovery>
type AuthListener = (event: AuthChangeEvent, session: Session | null) => void

const wrappers = new Set<VueWrapper>()
let recovery: PasswordRecoveryState

const RecoveryHarness = defineComponent({
	setup() {
		recovery = usePasswordRecovery()
		return () => h('div', { 'data-recovery': recovery.status.value })
	}
})

function createAuthEventSource() {
	let listener: AuthListener | null = null
	const unsubscribe = vi.fn()
	const onAuthStateChange = vi.fn((callback: AuthListener) => {
		listener = callback
		return { data: { subscription: { unsubscribe } } }
	})
	const client = {
		auth: { onAuthStateChange }
	} as unknown as SupabaseClient<Database>

	return {
		client,
		onAuthStateChange,
		unsubscribe,
		emit(event: AuthChangeEvent) {
			if (!listener) throw new Error('Auth listener was not registered')
			listener(event, null)
		}
	}
}

async function mountRecoveryHarness() {
	const wrapper = await mountSuspended(RecoveryHarness)
	wrappers.add(wrapper)
	await nextTick()
	return recovery
}

async function mountPage() {
	const wrapper = await mountSuspended(UpdatePasswordPage)
	wrappers.add(wrapper)
	await nextTick()
	return wrapper
}

async function enterPassword(wrapper: VueWrapper, password: string) {
	const passwordField = wrapper.getComponent({ name: 'Field' })
	const { exposed } = (
		passwordField.vm as unknown as {
			$: { exposed: { setValue: (value: string) => void } }
		}
	).$
	exposed.setValue(password)
	await nextTick()
	const input = wrapper.get('input[type="password"]')
	return input
}

describe('password recovery auth lifecycle', () => {
	beforeEach(async () => {
		factories.user.mockReturnValue({
			authFeedback: {},
			clearAuthFeedback: vi.fn(),
			resetPassword
		})
		sessionStorage.clear()
		await mountRecoveryHarness()
		recovery.invalidate()
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		vi.useRealTimers()
		sessionStorage.clear()
		document.body.innerHTML = ''
	})

	it('activates only from PASSWORD_RECOVERY and clears on sign-out', () => {
		vi.useFakeTimers()
		const auth = createAuthEventSource()
		const cleanup = observePasswordRecoveryEvents(auth.client, recovery)

		expect(auth.onAuthStateChange).toHaveBeenCalledOnce()
		expect(recovery.status.value).toBe('checking')

		auth.emit('SIGNED_IN')
		vi.runAllTimers()
		expect(recovery.status.value).toBe('invalid')
		expect(sessionStorage.length).toBe(0)

		recovery.startChecking()
		auth.emit('PASSWORD_RECOVERY')
		expect(recovery.status.value).toBe('active')
		expect(sessionStorage.length).toBe(1)
		expect(sessionStorage.getItem('crate-guide:password-recovery')).toBe('v1')

		auth.emit('SIGNED_OUT')
		expect(recovery.status.value).toBe('invalid')
		expect(sessionStorage.length).toBe(0)

		cleanup()
		expect(auth.unsubscribe).toHaveBeenCalledOnce()
	})

	it('restores only the boolean recovery marker after a same-tab remount', () => {
		vi.useFakeTimers()
		const firstAuth = createAuthEventSource()
		const firstCleanup = observePasswordRecoveryEvents(
			firstAuth.client,
			recovery
		)
		firstAuth.emit('PASSWORD_RECOVERY')
		expect(recovery.status.value).toBe('active')
		firstCleanup()

		const remountedAuth = createAuthEventSource()
		const remountedCleanup = observePasswordRecoveryEvents(
			remountedAuth.client,
			recovery
		)
		expect(recovery.status.value).toBe('checking')
		remountedAuth.emit('INITIAL_SESSION')
		vi.runAllTimers()

		expect(recovery.status.value).toBe('active')
		expect(sessionStorage.length).toBe(1)
		expect(sessionStorage.getItem('crate-guide:password-recovery')).toBe('v1')
		remountedCleanup()
	})

	it('terminally clears a stale recovery marker on ordinary sign-in', () => {
		recovery.activate()
		const auth = createAuthEventSource()
		const cleanup = observePasswordRecoveryEvents(auth.client, recovery)
		expect(recovery.status.value).toBe('checking')
		expect(sessionStorage.getItem('crate-guide:password-recovery')).toBe('v1')

		auth.emit('SIGNED_IN')

		expect(recovery.status.value).toBe('invalid')
		expect(sessionStorage.length).toBe(0)
		cleanup()
	})

	it('terminally consumes recovery state and its marker', () => {
		recovery.activate()

		recovery.consume()

		expect(recovery.status.value).toBe('invalid')
		expect(sessionStorage.length).toBe(0)
	})

	it('shows stable invalid guidance without a password form', async () => {
		recovery.invalidate()

		const wrapper = await mountPage()

		expect(wrapper.text()).toContain(
			'This password reset link is invalid or has expired.'
		)
		expect(wrapper.text()).toContain(
			'Request a new link to restart the recovery flow.'
		)
		expect(wrapper.find('input[type="password"]').exists()).toBe(false)
		expect(wrapper.text()).not.toContain('Update password')
		const loginLink = wrapper
			.findAll('a[href^="/login"]')
			.find((link) => link.text() === 'Back to login')
		if (!loginLink) throw new Error('Back to login link not found')
		expect(loginLink.text()).toBe('Back to login')
		expect(resetPassword).not.toHaveBeenCalled()
	})

	it('renders loading while recovery state is checking', async () => {
		recovery.startChecking()

		const wrapper = await mountPage()

		expect(wrapper.text()).toContain('Checking password reset link...')
		expect(wrapper.find('form').exists()).toBe(false)
		expect(wrapper.find('input[type="password"]').exists()).toBe(false)
	})

	it('preserves the entered password when reset fails', async () => {
		recovery.activate()
		resetPassword.mockResolvedValue(false)
		const wrapper = await mountPage()
		const input = await enterPassword(wrapper, 'Password123')
		expect(input.attributes()).toMatchObject({
			type: 'password',
			name: 'password',
			autocomplete: 'new-password'
		})
		expect(
			wrapper.get('button[aria-label="Show password"]').attributes('type')
		).toBe('button')
		expect(wrapper.vm.$router.resolve('/update-password').meta.keepalive).toBe(
			false
		)
		await wrapper.get('form').trigger('submit.prevent')
		await flushPromises()
		await nextTick()

		await vi.waitFor(() => {
			expect(resetPassword).toHaveBeenCalledWith('Password123', '/')
		})
		expect(input.attributes('aria-describedby')?.split(' ')).toContain(
			'update-password-requirements'
		)
		expect((input.element as HTMLInputElement).value).toBe('Password123')
	})

	it('clears the form only after a successful reset', async () => {
		recovery.activate()
		resetPassword.mockResolvedValue(true)
		const wrapper = await mountPage()
		const input = await enterPassword(wrapper, 'Password123')

		await wrapper.get('form').trigger('submit.prevent')
		await flushPromises()
		await nextTick()

		await vi.waitFor(() => {
			expect(resetPassword).toHaveBeenCalledWith('Password123', '/')
		})
		expect((input.element as HTMLInputElement).value).toBe('')
	})

	it('starts password update empty after a remount', async () => {
		recovery.activate()
		const first = await mountPage()
		await enterPassword(first, 'Password123')
		first.unmount()
		wrappers.delete(first)

		const remounted = await mountPage()

		expect(
			(remounted.get('input[name="password"]').element as HTMLInputElement)
				.value
		).toBe('')
	})
})
