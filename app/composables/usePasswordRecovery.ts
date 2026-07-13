export type PasswordRecoveryStatus = 'checking' | 'active' | 'invalid'

const PASSWORD_RECOVERY_MARKER_KEY = 'crate-guide:password-recovery'
const PASSWORD_RECOVERY_MARKER_VALUE = 'v1'

function readRecoveryMarker(): boolean {
	try {
		return (
			typeof sessionStorage !== 'undefined' &&
			sessionStorage.getItem(PASSWORD_RECOVERY_MARKER_KEY) ===
				PASSWORD_RECOVERY_MARKER_VALUE
		)
	} catch {
		return false
	}
}

function writeRecoveryMarker() {
	try {
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem(
				PASSWORD_RECOVERY_MARKER_KEY,
				PASSWORD_RECOVERY_MARKER_VALUE
			)
		}
	} catch {
		// Recovery remains available for this app lifetime when storage is blocked.
	}
}

function clearRecoveryMarker() {
	try {
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.removeItem(PASSWORD_RECOVERY_MARKER_KEY)
		}
	} catch {
		// State still invalidates in memory when storage is blocked.
	}
}

export function usePasswordRecovery() {
	const status = useState<PasswordRecoveryStatus>(
		'password-recovery-status',
		() => 'checking'
	)

	function startChecking() {
		status.value = 'checking'
	}

	function finishChecking() {
		if (status.value !== 'checking') return
		if (readRecoveryMarker()) {
			status.value = 'active'
			return
		}
		clearRecoveryMarker()
		status.value = 'invalid'
	}

	function activate() {
		writeRecoveryMarker()
		status.value = 'active'
	}

	function invalidate() {
		clearRecoveryMarker()
		status.value = 'invalid'
	}

	function consume() {
		invalidate()
	}

	return {
		status: readonly(status),
		startChecking,
		finishChecking,
		activate,
		invalidate,
		consume
	}
}
