import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	BEATPORT_SCRAPING_DISABLED_MESSAGE,
	BEATPORT_SCRAPING_DISABLED_STATUS
} from '../../../shared/types/beatport'

const mockGetQuery = vi.fn()
const mockCreateError = vi.fn(
	(options: { statusCode: number; statusMessage: string }) => {
		const error = new Error(options.statusMessage) as Error & {
			statusCode: number
		}
		error.statusCode = options.statusCode
		return error
	}
)

vi.stubGlobal('getQuery', mockGetQuery)
vi.stubGlobal('createError', mockCreateError)

const mockServerSupabaseUser = vi.fn()
const mockRpc = vi.fn()
const mockServerSupabaseClient = vi.fn()
vi.mock('#supabase/server', () => ({
	serverSupabaseUser: mockServerSupabaseUser,
	serverSupabaseClient: mockServerSupabaseClient
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

type MockEventHandler = (event: unknown) => unknown | Promise<unknown>
vi.stubGlobal(
	'defineEventHandler',
	<T extends MockEventHandler>(handler: T): T => handler
)

let handler: (event: unknown) => Promise<unknown>

describe('beatport/search API', () => {
	beforeEach(async () => {
		vi.resetModules()
		mockGetQuery.mockReset()
		mockCreateError.mockClear()
		mockFetch.mockReset()
		mockServerSupabaseUser.mockReset()
		mockServerSupabaseUser.mockResolvedValue({ id: 'user-123' })
		mockRpc.mockReset()
		mockServerSupabaseClient.mockReset()
		mockServerSupabaseClient.mockResolvedValue({ rpc: mockRpc })
		mockRpc.mockResolvedValue({ data: true, error: null })

		const module = await import('./search.get')
		handler = module.default
	})

	it('still requires authentication', async () => {
		mockServerSupabaseUser.mockResolvedValueOnce(null)

		await expect(handler({})).rejects.toMatchObject({
			statusCode: 401,
			message: 'Authentication required'
		})

		expect(mockGetQuery).not.toHaveBeenCalled()
		expect(mockServerSupabaseClient).not.toHaveBeenCalled()
		expect(mockFetch).not.toHaveBeenCalled()
	})

	it('returns the disabled message without scraping Beatport', async () => {
		await expect(handler({})).rejects.toMatchObject({
			statusCode: BEATPORT_SCRAPING_DISABLED_STATUS,
			message: BEATPORT_SCRAPING_DISABLED_MESSAGE
		})

		expect(mockGetQuery).not.toHaveBeenCalled()
		expect(mockServerSupabaseClient).not.toHaveBeenCalled()
		expect(mockRpc).not.toHaveBeenCalled()
		expect(mockFetch).not.toHaveBeenCalled()
	})
})
