type SchedulerWithYield = { yield?: () => Promise<void> }

/**
 * Yields to the browser without the nested `setTimeout` clamp (at least 4 ms
 * per yield after five levels). Prefers `scheduler.yield`, which keeps the
 * continuation ahead of other queued tasks.
 */
export function yieldToMain(): Promise<void> {
	const scheduler = (globalThis as { scheduler?: SchedulerWithYield }).scheduler
	if (typeof scheduler?.yield === 'function') return scheduler.yield()
	return new Promise((resolve) => {
		const channel = new MessageChannel()
		channel.port1.onmessage = () => {
			channel.port1.close()
			resolve()
		}
		channel.port2.postMessage(null)
	})
}
