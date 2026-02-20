import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSupabaseUser: {
	value: { id: string } | null
} = { value: null }

const mockNavigateTo = vi.fn((path: string) => ({ path }))

vi.stubGlobal('defineNuxtRouteMiddleware', (handler: unknown) => handler)
vi.stubGlobal('useSupabaseUser', () => mockSupabaseUser)
vi.stubGlobal('navigateTo', mockNavigateTo)

describe('auth.global middleware', () => {
	async function loadMiddleware() {
		return (await import('../auth.global')).default as (
			to: { path: string },
			from: { path: string }
		) => unknown
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mockSupabaseUser.value = null
	})

	it('redirects unauthenticated users on protected routes', async () => {
		const middleware = await loadMiddleware()

		const result = middleware({ path: '/tracks' }, { path: '/login' })

		expect(mockNavigateTo).toHaveBeenCalledWith('/login')
		expect(result).toEqual({ path: '/login' })
	})

	it('allows unauthenticated users on public routes', async () => {
		const middleware = await loadMiddleware()

		const result = middleware({ path: '/login' }, { path: '/login' })

		expect(mockNavigateTo).not.toHaveBeenCalled()
		expect(result).toBeUndefined()
	})

	it('redirects authenticated users away from auth pages', async () => {
		mockSupabaseUser.value = { id: 'user-1' }
		const middleware = await loadMiddleware()

		const result = middleware({ path: '/login' }, { path: '/tracks' })

		expect(mockNavigateTo).toHaveBeenCalledWith('/')
		expect(result).toEqual({ path: '/' })
	})

	it('allows authenticated users on protected routes', async () => {
		mockSupabaseUser.value = { id: 'user-1' }
		const middleware = await loadMiddleware()

		const result = middleware({ path: '/tracks' }, { path: '/login' })

		expect(mockNavigateTo).not.toHaveBeenCalled()
		expect(result).toBeUndefined()
	})
})
