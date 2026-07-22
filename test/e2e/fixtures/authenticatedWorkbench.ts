import { setup, url } from '@nuxt/test-utils/e2e'
import type { NuxtPage as Page } from '@nuxt/test-utils/e2e'

export type E2EKeysetCompletion = {
	table: string
	cursor: string | null
	equalityFilters: Array<[column: string, value: unknown]>
	limit: number | null
	orders: Array<[column: string, ascending: boolean]>
	selection: string | null
}

export type E2EQueryObservations = {
	__e2eKeysetCompletions?: E2EKeysetCompletion[]
	__e2eSingleCompletions?: string[]
}

export const LIBRARY_TABLES = ['records', 'tracks', 'crates', 'sets']

export async function setupWorkbenchE2E() {
	await setup({
		browser: true,
		nuxtConfig: {
			nitro: { preset: 'node-server' },
			supabase: {
				url: 'https://e2e.invalid',
				key: 'e2e-public-key'
			}
		}
	})
}

export async function signInViaForm(page: Page, expectedPath = '/') {
	await page.locator('input[name="email"]').fill('e2e@example.com')
	await page.locator('input[name="password"]').fill('Password123')
	await page.locator('button[type="submit"]').click()
	await page.waitForURL(url(expectedPath))
}

export async function waitForWorkbenchShell(page: Page) {
	await page
		.getByRole('link', { name: 'Crate Guide home' })
		.first()
		.waitFor({ state: 'visible' })
	await page
		.getByRole('navigation', { name: 'Library navigation' })
		.waitFor({ state: 'visible' })
	await page
		.getByRole('contentinfo', { name: 'Workspace status' })
		.waitFor({ state: 'visible' })
}

export async function mockAuthenticatedSupabase(page: Page) {
	await page.evaluate(() => {
		type QueryResult = { data: unknown; error: null }
		type QueryBuilder = PromiseLike<QueryResult> & {
			eq: (column: string, value: unknown) => QueryBuilder
			limit: (count: number) => QueryBuilder
			lt: (column: string, value: string) => QueryBuilder
			order: (column: string, options?: { ascending?: boolean }) => QueryBuilder
			select: (columns?: string) => QueryBuilder
			single: () => Promise<QueryResult>
		}
		type NuxtAppLike = {
			$supabase?: {
				client?: {
					from?: (table: string) => QueryBuilder
					auth?: {
						getSession?: () => Promise<{
							data: {
								session: {
									access_token: string
									user: { id: string }
								}
							}
							error: null
						}>
						getClaims?: () => Promise<{
							data: { claims: Record<string, unknown> }
							error: null
						}>
						signInWithPassword?: () => Promise<{
							data: Record<string, unknown>
							error: null
						}>
						signOut?: (options: { scope: string }) => Promise<{
							error: null
						}>
					}
				}
				payload?: {
					state?: Record<string, unknown>
				}
			}
		}

		const maybeWindow = window as unknown as E2EQueryObservations & {
			useNuxtApp?: () => NuxtAppLike
		}
		const nuxtApp = maybeWindow.useNuxtApp?.()
		const client = nuxtApp?.$supabase?.client
		if (!client?.auth) {
			throw new Error('Supabase client not available in test runtime')
		}

		const claims = { sub: 'e2e-user', email: 'e2e@example.com' }
		client.auth.getSession = async () => ({
			data: {
				session: {
					access_token: 'fake',
					user: { id: 'e2e-user' }
				}
			},
			error: null
		})

		client.auth.getClaims = async () => ({
			// Supabase returns a fresh claims object on each navigation. This is
			// important for catching cached auth-page watchers that react to object
			// identity and redirect an already-authenticated user back home.
			data: { claims: { ...claims } },
			error: null
		})

		client.auth.signInWithPassword = async () => ({
			data: { user: { id: 'e2e-user' }, session: { access_token: 'fake' } },
			error: null
		})

		client.auth.signOut = async (options) => {
			if (options.scope !== 'local') {
				throw new Error('Expected session-only logout')
			}
			if (!nuxtApp.payload?.state) {
				throw new Error('Nuxt reactive state not available')
			}
			nuxtApp.payload.state.$ssupabase_user = null
			return { error: null }
		}

		maybeWindow.__e2eKeysetCompletions = []
		maybeWindow.__e2eSingleCompletions = []
		const libraryTables = ['records', 'tracks', 'crates', 'sets']
		client.from = (table: string) => {
			const equalityFilters: Array<[string, unknown]> = []
			const orders: Array<[string, boolean]> = []
			let requestedCursor: string | null = null
			let requestedLimit: number | null = null
			let selection: string | null = null
			const resultForQuery = (): QueryResult => ({
				data:
					table === 'profiles'
						? {
								id: 'e2e-user',
								key_format: 'key',
								ui_theme: 'auto'
							}
						: table === 'sets' && requestedCursor === null
							? Array.from({ length: 1000 }, (_, index) => ({
									id: `set-${String(1000 - index).padStart(4, '0')}`,
									user_id: 'e2e-user',
									name: `Set ${index + 1}`,
									played_tracks: [],
									created_at: '2026-07-12T00:00:00.000Z',
									updated_at: '2026-07-12T00:00:00.000Z'
								}))
							: [],
				error: null
			})
			const builder = {
				eq: (column: string, value: unknown) => {
					equalityFilters.push([column, value])
					return builder
				},
				limit: (count: number) => {
					requestedLimit = count
					return builder
				},
				lt: (column: string, value: string) => {
					if (column !== 'id') throw new Error('Expected an ID keyset cursor')
					requestedCursor = value
					return builder
				},
				order: (column: string, options?: { ascending?: boolean }) => {
					orders.push([column, options?.ascending ?? true])
					return builder
				},
				select: (columns = '*') => {
					selection = columns
					return builder
				},
				single: async () => {
					maybeWindow.__e2eSingleCompletions?.push(table)
					return resultForQuery()
				},
				then: (
					resolve: (value: QueryResult) => unknown,
					reject?: (reason: unknown) => unknown
				) =>
					Promise.resolve(resultForQuery()).then((value) => {
						if (libraryTables.includes(table)) {
							maybeWindow.__e2eKeysetCompletions?.push({
								table,
								cursor: requestedCursor,
								equalityFilters: [...equalityFilters],
								limit: requestedLimit,
								orders: [...orders],
								selection
							})
						}
						return resolve(value)
					}, reject)
			} as QueryBuilder
			return builder
		}
	})
}
