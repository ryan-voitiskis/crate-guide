import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import type { Page } from 'playwright-core'
import { describe, expect, it } from 'vitest'

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

async function signInViaForm(page: Page) {
	await page.locator('input[name="email"]').fill('e2e@example.com')
	await page.locator('input[name="password"]').fill('password123')
	await page.locator('button[type="submit"]').click()
	await page.waitForURL(url('/'))
}

async function mockAuthenticatedSupabase(page: Page) {
	await page.evaluate(() => {
		type NuxtAppLike = {
			$supabase?: {
				client?: {
					auth?: {
						getClaims?: () => Promise<{
							data: { claims: Record<string, unknown> }
							error: null
						}>
						signInWithPassword?: () => Promise<{
							data: Record<string, unknown>
							error: null
						}>
					}
				}
			}
		}

		const maybeWindow = window as unknown as {
			useNuxtApp?: () => NuxtAppLike
		}
		const nuxtApp = maybeWindow.useNuxtApp?.()
		if (!nuxtApp?.$supabase?.client?.auth) {
			throw new Error('Supabase client not available in test runtime')
		}

		const claims = { sub: 'e2e-user', email: 'e2e@example.com' }

		nuxtApp.$supabase.client.auth.getClaims = async () => ({
			data: { claims },
			error: null
		})

		nuxtApp.$supabase.client.auth.signInWithPassword = async () => {
			return {
				data: { user: { id: 'e2e-user' }, session: { access_token: 'fake' } },
				error: null
			}
		}
	})
}

describe('Login redirects', () => {
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
})
