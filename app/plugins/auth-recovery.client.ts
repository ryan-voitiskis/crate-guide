import type { AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js'

type PasswordRecoveryState = ReturnType<typeof usePasswordRecovery>

export function observePasswordRecoveryEvents(
	client: SupabaseClient<Database>,
	recovery: PasswordRecoveryState
) {
	let terminalCheckTimeout: ReturnType<typeof setTimeout> | null = null

	function cancelTerminalCheck() {
		if (terminalCheckTimeout === null) return
		clearTimeout(terminalCheckTimeout)
		terminalCheckTimeout = null
	}

	function scheduleTerminalCheck() {
		if (recovery.status.value !== 'checking') return
		cancelTerminalCheck()
		// Auth JS defers PASSWORD_RECOVERY after its initial session. Waiting one
		// task lets that authoritative event win before ordinary sessions are
		// classified as invalid recovery attempts.
		terminalCheckTimeout = setTimeout(() => {
			terminalCheckTimeout = null
			recovery.finishChecking()
		}, 0)
	}

	recovery.startChecking()
	const {
		data: { subscription }
	} = client.auth.onAuthStateChange((event: AuthChangeEvent) => {
		if (event === 'PASSWORD_RECOVERY') {
			cancelTerminalCheck()
			recovery.activate()
			return
		}
		if (event === 'SIGNED_OUT') {
			cancelTerminalCheck()
			recovery.invalidate()
			return
		}
		if (event === 'SIGNED_IN') {
			cancelTerminalCheck()
			recovery.invalidate()
			return
		}
		if (event === 'INITIAL_SESSION') scheduleTerminalCheck()
	})

	return () => {
		cancelTerminalCheck()
		subscription.unsubscribe()
	}
}

export default defineNuxtPlugin({
	name: 'auth-recovery',
	dependsOn: ['supabase'],
	setup(nuxtApp) {
		const cleanup = observePasswordRecoveryEvents(
			useSupabaseClient<Database>(),
			usePasswordRecovery()
		)
		nuxtApp.vueApp.onUnmount(cleanup)
		if (import.meta.hot) import.meta.hot.dispose(cleanup)
	}
})
