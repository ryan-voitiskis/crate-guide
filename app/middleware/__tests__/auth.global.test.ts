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

type MockRoute = {
	fullPath: string
	path: string
	query: Record<string, unknown>
}

function createRoute(
	path: string,
	fullPath = path,
	query: Record<string, unknown> = {}
): MockRoute {
	return { fullPath, path, query }
}

vi.stubGlobal('defineNuxtRouteMiddleware', (handler: unknown) => handler)
vi.stubGlobal('useSupabaseUser', () => mockSupabaseUser)
vi.stubGlobal('useSupabaseClient', () => mockSupabaseClient)
vi.stubGlobal('navigateTo', mockNavigateTo)
vi.stubGlobal('createError', mockCreateError)

describe('auth.global middleware', () => {
	async function loadMiddleware() {
		return (await import('../auth.global')).default as (
			to: MockRoute,
			from: MockRoute
		) => Promise<unknown>
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mockSupabaseUser.value = null
		mockGetSession.mockResolvedValue({ data: { session: null } })
	})

	it('redirects unauthenticated users on protected routes', async () => {
		const middleware = await loadMiddleware()

		const result = await middleware(
			createRoute('/tracks'),
			createRoute('/login')
		)

		expect(mockNavigateTo).toHaveBeenCalledWith('/login?redirect=%2Ftracks')
		expect(result).toEqual({ path: '/login?redirect=%2Ftracks' })
	})

	it('preserves the full protected destination in the login redirect', async () => {
		const middleware = await loadMiddleware()
		const fullPath = '/records?crate=house&sort=year#release-1'

		const result = await middleware(
			createRoute('/records', fullPath),
			createRoute('/login')
		)

		expect(mockNavigateTo).toHaveBeenCalledWith(
			'/login?redirect=%2Frecords%3Fcrate%3Dhouse%26sort%3Dyear%23release-1'
		)
		expect(result).toEqual({
			path: '/login?redirect=%2Frecords%3Fcrate%3Dhouse%26sort%3Dyear%23release-1'
		})
	})

	it.each([
		'/login',
		'/signup',
		'/reset-password',
		'/update-password',
		'/auth/check-inbox',
		'/auth/confirm',
		'/auth/finalising',
		'/privacy',
		'/terms',
		'/demo',
		'/demo/records'
	])('allows unauthenticated users on public route %s', async (path) => {
		const middleware = await loadMiddleware()

		const result = await middleware(createRoute(path), createRoute('/login'))

		expect(mockNavigateTo).not.toHaveBeenCalled()
		expect(mockGetSession).not.toHaveBeenCalled()
		expect(result).toBeUndefined()
	})

	it.each(['/auth/discogs/capture-verifier', '/auth/future-callback'])(
		'redirects unauthenticated users from protected auth route %s',
		async (path) => {
			const middleware = await loadMiddleware()

			const result = await middleware(createRoute(path), createRoute('/login'))

			const expected = `/login?redirect=${encodeURIComponent(path)}`
			expect(mockNavigateTo).toHaveBeenCalledWith(expected)
			expect(result).toEqual({ path: expected })
		}
	)

	it('redirects authenticated users away from auth pages', async () => {
		mockSupabaseUser.value = { id: 'user-1' }
		const middleware = await loadMiddleware()

		const result = await middleware(
			createRoute('/login'),
			createRoute('/tracks')
		)

		expect(mockNavigateTo).toHaveBeenCalledWith('/')
		expect(result).toEqual({ path: '/' })
	})

	it('returns authenticated users to a safe requested destination', async () => {
		mockSupabaseUser.value = { id: 'user-1' }
		const middleware = await loadMiddleware()

		const result = await middleware(
			createRoute(
				'/login',
				'/login?redirect=%2Frecords%3Fcrate%3Dhouse%23release-1',
				{ redirect: '/records?crate=house#release-1' }
			),
			createRoute('/records')
		)

		expect(mockNavigateTo).toHaveBeenCalledWith(
			'/records?crate=house#release-1'
		)
		expect(result).toEqual({ path: '/records?crate=house#release-1' })
	})

	it('falls back to home for an unsafe authenticated return target', async () => {
		mockSupabaseUser.value = { id: 'user-1' }
		const middleware = await loadMiddleware()

		const result = await middleware(
			createRoute('/login', '/login?redirect=https://evil.example', {
				redirect: 'https://evil.example'
			}),
			createRoute('/records')
		)

		expect(mockNavigateTo).toHaveBeenCalledWith('/')
		expect(result).toEqual({ path: '/' })
	})

	it('allows authenticated users on protected routes', async () => {
		mockSupabaseUser.value = { id: 'user-1' }
		const middleware = await loadMiddleware()

		const result = await middleware(
			createRoute('/tracks'),
			createRoute('/login')
		)

		expect(mockNavigateTo).not.toHaveBeenCalled()
		expect(result).toBeUndefined()
	})

	it('allows protected routes while user state is hydrating', async () => {
		mockGetSession.mockResolvedValue({
			data: { session: { user: { id: 'user-1' } } }
		})
		const middleware = await loadMiddleware()

		const result = await middleware(createRoute('/tracks'), createRoute('/'))

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
			middleware(createRoute('/tracks'), createRoute('/'))
		).rejects.toMatchObject({
			statusCode: 503,
			message: 'Failed to verify session'
		})
		expect(mockNavigateTo).not.toHaveBeenCalled()
	})
})
