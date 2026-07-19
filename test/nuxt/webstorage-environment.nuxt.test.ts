import { describe, expect, it } from 'vitest'

describe('Nuxt Web Storage environment', () => {
	it('uses distinct native DOM storage objects with complete semantics', () => {
		const localKey = 'crate-guide:test:nuxt-local-storage'
		const sessionKey = 'crate-guide:test:nuxt-session-storage'
		const sharedKey = 'crate-guide:test:nuxt-shared-storage'

		expect(globalThis.localStorage).toBe(window.localStorage)
		expect(globalThis.sessionStorage).toBe(window.sessionStorage)
		expect(localStorage).not.toBe(sessionStorage)
		expect(Object.getPrototypeOf(localStorage)).toBe(Storage.prototype)
		expect(Object.getPrototypeOf(sessionStorage)).toBe(Storage.prototype)

		try {
			localStorage.clear()
			sessionStorage.clear()
			expect(localStorage.length).toBe(0)
			expect(sessionStorage.length).toBe(0)

			localStorage.setItem(sharedKey, 'local')
			sessionStorage.setItem(sharedKey, 'session')
			localStorage.setItem(localKey, 'local-only')
			sessionStorage.setItem(sessionKey, 'session-only')

			expect(localStorage.getItem(sharedKey)).toBe('local')
			expect(sessionStorage.getItem(sharedKey)).toBe('session')
			expect(localStorage.getItem(localKey)).toBe('local-only')
			expect(sessionStorage.getItem(sessionKey)).toBe('session-only')
			expect(localStorage.length).toBe(2)
			expect(sessionStorage.length).toBe(2)

			localStorage.removeItem(sharedKey)
			sessionStorage.removeItem(sharedKey)
			expect(localStorage.getItem(sharedKey)).toBeNull()
			expect(sessionStorage.getItem(sharedKey)).toBeNull()
			expect(localStorage.length).toBe(1)
			expect(sessionStorage.length).toBe(1)

			localStorage.clear()
			sessionStorage.clear()
			expect(localStorage.length).toBe(0)
			expect(sessionStorage.length).toBe(0)
		} finally {
			for (const storage of [localStorage, sessionStorage]) {
				storage.removeItem(localKey)
				storage.removeItem(sessionKey)
				storage.removeItem(sharedKey)
			}
		}
	})
})
