import { url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import {
	mockAuthenticatedSupabase,
	setupWorkbenchE2E,
	signInViaForm,
	waitForWorkbenchShell
} from './fixtures/authenticatedWorkbench'
import { createErrorAwarePage } from './fixtures/errorAwarePage'

await setupWorkbenchE2E()

describe('Layout transitions', () => {
	it('mounts the complete workbench when opening the demo from login', async () => {
		const page = await createErrorAwarePage('/login')

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
	})

	it('allows navigation after the authentication redirect completes', async () => {
		const page = await createErrorAwarePage('/login')

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
	})

	it('restores the workbench shell after visiting a legal page', async () => {
		const page = await createErrorAwarePage('/login')

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
	})
})
