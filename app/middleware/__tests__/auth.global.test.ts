import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSupabaseUser: {
	value: { id: string } | null
} = { value: null }
const mockGetSession = vi.fn()
const mockSupabaseClient = {
	auth: {
		getSession: mockGetSession
	}
}

const mockNavigateTo = vi.fn((path: string) => ({ path }))
const mockCreateError = vi.fn(
	(options: { statusCode: number; statusMessage: string }) => {
		const error = new Error(options.statusMessage) as Error & {
			statusCode: number
		}
		error.statusCode = options.statusCode
		return error
	}
)

vi.stubGlobal('defineNuxtRouteMiddleware', (handler: unknown) => handler)
vi.stubGlobal('useSupabaseUser', () => mockSupabaseUser)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)
vi.stubGlobal('navigateTo', mockNavigateTo)
vi.stubGlobal('createError', mockCreateError)

describe('auth.global middleware', () => {
	async function loadMiddleware() {
		return (await import('../auth.global')).default as (
			to: { path: string },
			from: { path: string }
		) => Promise<unknown>
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mockSupabaseUser.value = null
		mockGetSession.mockResolvedValue({ data: { session: null } })
	})

	it('redirects unauthenticated users on protected routes', async () => {
		const middleware = await loadMiddleware()

		const result = await middleware({ path: '/tracks' }, { path: '/login' })

		expect(mockNavigateTo).toHaveBeenCalledWith('/login')
		expect(result).toEqual({ path: '/login' })
	})

	it('allows unauthenticated users on public routes', async () => {
		const middleware = await loadMiddleware()

		const result = await middleware({ path: '/login' }, { path: '/login' })

		expect(mockNavigateTo).not.toHaveBeenCalled()
		expect(result).toBeUndefined()
	})

	it('redirects authenticated users away from auth pages', async () => {
		mockSupabaseUser.value = { id: 'user-1' }
		const middleware = await loadMiddleware()

		const result = await middleware({ path: '/login' }, { path: '/tracks' })

		expect(mockNavigateTo).toHaveBeenCalledWith('/')
		expect(result).toEqual({ path: '/' })
	})

	it('allows authenticated users on protected routes', async () => {
		mockSupabaseUser.value = { id: 'user-1' }
		const middleware = await loadMiddleware()

		const result = await middleware({ path: '/tracks' }, { path: '/login' })

		expect(mockNavigateTo).not.toHaveBeenCalled()
		expect(result).toBeUndefined()
	})

	it('allows protected routes while user state is hydrating', async () => {
		mockGetSession.mockResolvedValue({
			data: { session: { user: { id: 'user-1' } } }
		})
		const middleware = await loadMiddleware()

		const result = await middleware({ path: '/tracks' }, { path: '/' })

		expect(mockNavigateTo).not.toHaveBeenCalled()
		expect(result).toBeUndefined()
	})

	it('throws when session lookup fails', async () => {
		mockGetSession.mockResolvedValue({
			data: { session: null },
			error: new Error('Session lookup failed')
		})
		const middleware = await loadMiddleware()

		await expect(
			middleware({ path: '/tracks' }, { path: '/' })
		).rejects.toMatchObject({
			statusCode: 503,
			message: 'Failed to verify session'
		})
		expect(mockNavigateTo).not.toHaveBeenCalled()
	})
})
