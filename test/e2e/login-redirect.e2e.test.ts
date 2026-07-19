import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import type { Page } from 'playwright-core'
import { describe, expect, it } from 'vitest'

type E2ERangeCompletion = {
	table: string
	from: number
	to: number
}

type E2EQueryObservations = {
	__e2eRangeCompletions?: E2ERangeCompletion[]
	__e2eSingleCompletions?: string[]
}

const LIBRARY_TABLES = ['records', 'tracks', 'crates']

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

async function signInViaForm(page: Page, expectedPath = '/') {
	await page.locator('input[name="email"]').fill('e2e@example.com')
	await page.locator('input[name="password"]').fill('Password123')
	await page.locator('button[type="submit"]').click()
	await page.waitForURL(url(expectedPath))
}

async function waitForWorkbenchShell(page: Page) {
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

async function mockAuthenticatedSupabase(page: Page) {
	await page.evaluate(() => {
		type QueryResult = { data: unknown; error: null }
		type QueryBuilder = PromiseLike<QueryResult> & {
			eq: () => QueryBuilder
			order: () => QueryBuilder
			range: (from: number, to: number) => QueryBuilder
			select: () => QueryBuilder
			single: () => Promise<QueryResult>
		}
		type NuxtAppLike = {
			$supabase?: {
				client?: {
					from?: (table: string) => QueryBuilder
					auth?: {
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

		client.auth.getClaims = async () => ({
			// Supabase returns a fresh claims object on each navigation. This is
			// important for catching cached auth-page watchers that react to object
			// identity and redirect an already-authenticated user back home.
			data: { claims: { ...claims } },
			error: null
		})

		client.auth.signInWithPassword = async () => {
			return {
				data: { user: { id: 'e2e-user' }, session: { access_token: 'fake' } },
				error: null
			}
		}

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

		maybeWindow.__e2eRangeCompletions = []
		maybeWindow.__e2eSingleCompletions = []
		client.from = (table: string) => {
			const result: QueryResult = {
				data:
					table === 'profiles'
						? {
								id: 'e2e-user',
								key_format: 'key',
								ui_theme: 'auto'
							}
						: [],
				error: null
			}
			let requestedRange: { from: number; to: number } | null = null
			const builder = {
				eq: () => builder,
				order: () => builder,
				range: (from: number, to: number) => {
					requestedRange = { from, to }
					return builder
				},
				select: () => builder,
				single: async () => {
					maybeWindow.__e2eSingleCompletions?.push(table)
					return result
				},
				then: (
					resolve: (value: QueryResult) => unknown,
					reject?: (reason: unknown) => unknown
				) =>
					Promise.resolve(result).then((value) => {
						if (requestedRange) {
							maybeWindow.__e2eRangeCompletions?.push({
								table,
								...requestedRange
							})
						}
						return resolve(value)
					}, reject)
			} as QueryBuilder
			return builder
		}
	})
}

describe('Login redirects', () => {
	it('mounts the complete workbench when opening the demo from login', async () => {
		const page = await createPage('/login')

		await page.getByRole('link', { name: 'Demo', exact: true }).click()
		await page.waitForURL(url('/demo'))
		await waitForWorkbenchShell(page)

		await expect(
			page.getByRole('link', { name: 'Crate Guide home' }).count()
		).resolves.toBeGreaterThan(0)
		await expect(
			page.getByRole('navigation', { name: 'Library navigation' }).count()
		).resolves.toBe(1)
		await expect(
			page.getByRole('contentinfo', { name: 'Workspace status' }).count()
		).resolves.toBe(1)
		await expect(
			page.locator('[data-auth-page-scroll-container]').count()
		).resolves.toBe(0)

		await page.close()
	})

	it('loads account data after email login without a page refresh', async () => {
		const page = await createPage('/login')
		const pageErrors: string[] = []
		page.on('pageerror', (error) => pageErrors.push(error.message))

		await mockAuthenticatedSupabase(page)
		await signInViaForm(page)
		await page.waitForFunction(() => {
			const observations = window as unknown as E2EQueryObservations
			const completedRanges = observations.__e2eRangeCompletions ?? []
			const expectedTables = ['records', 'tracks', 'crates']
			return (
				expectedTables.every((table) =>
					completedRanges.some(
						(completion) =>
							completion.table === table &&
							completion.from === 0 &&
							completion.to === 999
					)
				) && observations.__e2eSingleCompletions?.includes('profiles')
			)
		})

		const completions = await page.evaluate(() => {
			const observations = window as unknown as E2EQueryObservations
			return {
				ranges: observations.__e2eRangeCompletions ?? [],
				singles: observations.__e2eSingleCompletions ?? []
			}
		})
		const libraryRanges = completions.ranges.filter((completion) =>
			LIBRARY_TABLES.includes(completion.table)
		)
		expect(libraryRanges).toHaveLength(3)
		for (const table of LIBRARY_TABLES) {
			expect(
				libraryRanges.filter(
					(completion) =>
						completion.table === table &&
						completion.from === 0 &&
						completion.to === 999
				)
			).toHaveLength(1)
		}
		expect(completions.singles).toEqual(['profiles'])
		expect(pageErrors).toEqual([])

		await page.close()
	})

	it('returns a signed-out protected deep link after email login', async () => {
		const page = await createPage('/records')

		await page.waitForURL(
			(currentUrl) =>
				currentUrl.pathname === '/login' &&
				currentUrl.searchParams.get('redirect') === '/records'
		)
		const loginUrl = new URL(page.url())
		expect(loginUrl.pathname).toBe('/login')
		expect(loginUrl.searchParams.get('redirect')).toBe('/records')

		await mockAuthenticatedSupabase(page)
		await signInViaForm(page, '/records')

		expect(new URL(page.url()).pathname).toBe('/records')

		await page.close()
	})

	it('redirects to home after successful email login', async () => {
		const page = await createPage('/login')

		await mockAuthenticatedSupabase(page)

		await signInViaForm(page)
		expect(new URL(page.url()).pathname).toBe('/')

		await page.close()
	})

	it('redirects authenticated users away from /login', async () => {
		const page = await createPage('/login')

		await mockAuthenticatedSupabase(page)
		await signInViaForm(page)

		await page.evaluate(async () => {
			const maybeWindow = window as unknown as {
				useNuxtApp?: () => {
					$router?: {
						push: (path: string) => Promise<void>
					}
				}
			}

			const router = maybeWindow.useNuxtApp?.().$router
			if (!router) throw new Error('Nuxt router not available')
			await router.push('/login')
		})

		await page.waitForURL(url('/'))
		expect(new URL(page.url()).pathname).toBe('/')

		await page.close()
	})

	it('allows navigation after the authentication redirect completes', async () => {
		const page = await createPage('/login')

		await mockAuthenticatedSupabase(page)
		await signInViaForm(page)

		await page.getByRole('link', { name: 'Settings' }).click()
		await page.waitForURL(url('/settings'))

		expect(new URL(page.url()).pathname).toBe('/settings')
		await expect(
			page.getByRole('heading', { name: 'About Crate Guide' }).count()
		).resolves.toBe(1)

		const scrollMetrics = await page
			.locator('[data-settings-scroll-container]')
			.evaluate((element) => {
				const container = element as HTMLElement
				container.scrollTop = container.scrollHeight
				return {
					clientHeight: container.clientHeight,
					scrollHeight: container.scrollHeight,
					scrollTop: container.scrollTop
				}
			})

		expect(scrollMetrics.scrollHeight).toBeGreaterThan(
			scrollMetrics.clientHeight
		)
		expect(scrollMetrics.scrollTop).toBeGreaterThan(0)

		await page.close()
	})

	it('restores the workbench shell after visiting a legal page', async () => {
		const page = await createPage('/login')

		await mockAuthenticatedSupabase(page)
		await signInViaForm(page)
		await page.getByRole('link', { name: 'Settings' }).click()
		await page.waitForURL(url('/settings'))
		await page.getByRole('link', { name: 'Privacy', exact: true }).click()
		await page.waitForURL(url('/privacy'))

		await page.getByRole('link', { name: 'Back to Crate Guide' }).click()
		await page.waitForURL(url('/'))
		await waitForWorkbenchShell(page)

		await expect(
			page.getByRole('link', { name: 'Crate Guide home' }).count()
		).resolves.toBeGreaterThan(0)
		await expect(
			page.getByRole('navigation', { name: 'Library navigation' }).count()
		).resolves.toBe(1)
		await expect(
			page.getByRole('contentinfo', { name: 'Workspace status' }).count()
		).resolves.toBe(1)

		await page.close()
	})

	it('replaces rendered Settings content after local logout', async () => {
		const page = await createPage('/login')

		await mockAuthenticatedSupabase(page)
		await signInViaForm(page)
		await page.getByRole('link', { name: 'Settings' }).click()
		await page.waitForURL(url('/settings'))

		await expect(
			page.getByRole('heading', { name: 'Settings', exact: true }).count()
		).resolves.toBe(1)
		await expect(
			page.getByRole('heading', { name: 'Account', exact: true }).count()
		).resolves.toBe(1)

		await page.getByRole('button', { name: 'Log out' }).click()
		await page.waitForURL(url('/login'))

		expect(new URL(page.url()).pathname).toBe('/login')
		await expect(
			page.getByRole('heading', { name: 'Settings', exact: true }).count()
		).resolves.toBe(0)
		await expect(
			page.getByRole('heading', { name: 'Account', exact: true }).count()
		).resolves.toBe(0)

		await page.close()
	})
})
