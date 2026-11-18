import { afterEach, describe, expect, it, vi } from 'vitest'
import { yieldToMain } from './yieldToMain'

describe('yieldToMain', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('prefers scheduler.yield when available', async () => {
		const schedulerYield = vi.fn(() => Promise.resolve())
		vi.stubGlobal('scheduler', { yield: schedulerYield })
		await yieldToMain()
		expect(schedulerYield).toHaveBeenCalledTimes(1)
	})

	it('falls back to a message-channel task instead of a clamped timer', async () => {
		vi.stubGlobal('scheduler', undefined)
		const timeout = vi.spyOn(globalThis, 'setTimeout')
		let resolved = false
		const pending = yieldToMain().then(() => {
			resolved = true
		})
		await Promise.resolve()
		expect(resolved).toBe(false)
		await pending
		expect(resolved).toBe(true)
		expect(timeout).not.toHaveBeenCalled()
		timeout.mockRestore()
	})
})
