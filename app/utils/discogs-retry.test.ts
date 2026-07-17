import { describe, expect, it, vi } from 'vitest'
import {
	calculateDiscogsRetryDelay,
	waitForDiscogsRetry
} from './discogs-retry'

describe('calculateDiscogsRetryDelay', () => {
	it('uses bounded exponential backoff with deterministic jitter', () => {
		expect(calculateDiscogsRetryDelay(1, undefined, () => 0.5)).toBe(1500)
		expect(calculateDiscogsRetryDelay(2, undefined, () => 0.5)).toBe(3000)
	})

	it('honours a longer Retry-After delay and caps untrusted values', () => {
		expect(calculateDiscogsRetryDelay(1, 5000, () => 0.5)).toBe(5000)
		expect(calculateDiscogsRetryDelay(1, 999_999, () => 0.5)).toBe(120_000)
	})
})

describe('waitForDiscogsRetry', () => {
	it('polls in short intervals so cancellation remains responsive', async () => {
		const sleep = vi.fn().mockResolvedValue(undefined)

		await expect(waitForDiscogsRetry(600, () => false, sleep)).resolves.toBe(
			true
		)
		expect(sleep).toHaveBeenNthCalledWith(1, 250)
		expect(sleep).toHaveBeenNthCalledWith(2, 250)
		expect(sleep).toHaveBeenNthCalledWith(3, 100)
	})

	it('stops waiting as soon as cancellation is observed', async () => {
		let cancelled = false
		const sleep = vi.fn().mockImplementation(async () => {
			cancelled = true
		})

		await expect(
			waitForDiscogsRetry(1000, () => cancelled, sleep)
		).resolves.toBe(false)
		expect(sleep).toHaveBeenCalledOnce()
	})
})
