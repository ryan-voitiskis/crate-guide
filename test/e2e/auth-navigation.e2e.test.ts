import { url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import {
	mockAuthenticatedSupabase,
	setupWorkbenchE2E,
	signInViaForm
} from './fixtures/authenticatedWorkbench'
import { createErrorAwarePage } from './fixtures/errorAwarePage'

await setupWorkbenchE2E()

describe('Authentication navigation', () => {
	it.each([
		{ width: 375, height: 667 },
		{ width: 390, height: 844 }
	])(
		'keeps auth validation usable without overflow at $width×$height',
		async (viewport) => {
			const page = await createErrorAwarePage('/login')
			await page.waitForLoadState('networkidle')
			await page.setViewportSize(viewport)
			await page.reload()
			await page.getByRole('button', { name: 'Sign in' }).click()

			await page.getByText('Email is required').waitFor()
			await page.getByText('Password is required').waitFor()
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth > window.innerWidth
				)
			).toBe(false)
			expect(
				await page.evaluate(() => document.activeElement?.getAttribute('name'))
			).toBe('email')
		}
	)

	it('applies the saved anonymous dark theme before auth styles and content', async () => {
		const page = await createErrorAwarePage('/login')
		await page.waitForLoadState('networkidle')
		await page.addInitScript(() => {
			localStorage.setItem('crate-guide:anonymous-theme', 'dark')
		})

		const response = await page.reload()
		await page.waitForLoadState('networkidle')
		await page.getByRole('heading', { name: 'Log in' }).waitFor()
		const html = (await response?.text()) ?? ''
		const bootstrapIndex = html.indexOf('crate-guide:anonymous-theme')
		const stylesheetIndex = html.indexOf('rel="stylesheet"')

		expect(bootstrapIndex).toBeGreaterThan(-1)
		expect(stylesheetIndex).toBeGreaterThan(-1)
		expect(bootstrapIndex).toBeLessThan(stylesheetIndex)
		expect(
			await page.evaluate(() =>
				document.documentElement.classList.contains('dark')
			)
		).toBe(true)
	})

	it('returns a signed-out protected deep link after email login', async () => {
		const page = await createErrorAwarePage('/records')

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
	})

	it('redirects to home after successful email login', async () => {
		const page = await createErrorAwarePage('/login')

		await mockAuthenticatedSupabase(page)

		await signInViaForm(page)
		expect(new URL(page.url()).pathname).toBe('/')
	})

	it('redirects authenticated users away from /login', async () => {
		const page = await createErrorAwarePage('/login')

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
	})

	it('replaces rendered Settings content after local logout', async () => {
		const page = await createErrorAwarePage('/login')

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
	})
})
