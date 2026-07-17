const DEFAULT_BASE_DELAY_MS = 1500
const MAX_RETRY_DELAY_MS = 120_000
const CANCELLATION_POLL_MS = 250

export function calculateDiscogsRetryDelay(
	failedAttempt: number,
	retryAfterMs?: number,
	random: () => number = Math.random
): number {
	const exponentialDelay =
		DEFAULT_BASE_DELAY_MS * Math.pow(2, Math.max(0, failedAttempt - 1))
	const jitteredDelay = Math.round(exponentialDelay * (0.85 + random() * 0.3))
	return Math.min(
		MAX_RETRY_DELAY_MS,
		Math.max(jitteredDelay, retryAfterMs ?? 0)
	)
}

export async function waitForDiscogsRetry(
	delayMs: number,
	shouldCancel: () => boolean,
	sleep: (delay: number) => Promise<void> = (delay) =>
		new Promise((resolve) => setTimeout(resolve, delay))
): Promise<boolean> {
	let remaining = delayMs
	while (remaining > 0) {
		if (shouldCancel()) return false
		const interval = Math.min(CANCELLATION_POLL_MS, remaining)
		await sleep(interval)
		remaining -= interval
	}
	return !shouldCancel()
}
