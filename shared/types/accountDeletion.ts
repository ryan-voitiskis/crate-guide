export type AccountCleanupState = 'queued' | 'complete' | 'failed' | 'unknown'

export type AccountDeletionSuccess = {
	success: true
	cleanup_state: AccountCleanupState
	// Retained while older deployed clients consume these response fields.
	cover_cleanup_complete: boolean
	cleanup_queue_complete: boolean
	cleanup_queued: boolean
}

export const ACCOUNT_DELETION_QUEUED_RESPONSE: Readonly<AccountDeletionSuccess> =
	{
		success: true,
		cleanup_state: 'queued',
		cover_cleanup_complete: false,
		cleanup_queue_complete: false,
		cleanup_queued: true
	}

/** Accept the current response and older immediate/queued cleanup responses. */
export function readAccountCleanupState(
	response: unknown
): AccountCleanupState {
	if (
		!response ||
		typeof response !== 'object' ||
		!('success' in response) ||
		response.success !== true
	)
		return 'unknown'
	if ('cleanup_state' in response) {
		const state = response.cleanup_state
		if (
			state === 'queued' ||
			state === 'complete' ||
			state === 'failed' ||
			state === 'unknown'
		)
			return state
		return 'unknown'
	}
	if ('cleanup_queued' in response && response.cleanup_queued === true)
		return 'queued'
	if (
		('cover_cleanup_complete' in response &&
			response.cover_cleanup_complete !== true) ||
		('cleanup_queue_complete' in response &&
			response.cleanup_queue_complete !== true)
	)
		return 'unknown'
	// The oldest successful response represented synchronous cleanup.
	return 'complete'
}
