import { describe, expect, it } from 'vitest'
import {
	mockAuthenticatedSupabase,
	setupWorkbenchE2E,
	signInViaForm,
	waitForWorkbenchShell
} from './fixtures/authenticatedWorkbench'
import { createErrorAwarePage } from './fixtures/errorAwarePage'

await setupWorkbenchE2E()

const CHECKLIST_NAME = 'Get your records gig-ready'

describe('Session home first-run checklist', () => {
	it('guides a new account and stays dismissed in this browser', async () => {
		const page = await createErrorAwarePage('/login')

		await mockAuthenticatedSupabase(page)
		await signInViaForm(page)
		await waitForWorkbenchShell(page)

		const checklist = page.getByRole('region', { name: CHECKLIST_NAME })
		await checklist.waitFor({ state: 'visible' })
		// The fixture account has saved sets but no records, tracks or crates.
		await expect(checklist.textContent()).resolves.toContain('1 of 5 done')
		await expect(
			checklist
				.getByRole('progressbar', {
					name: '0% of your tracks have BPM and key'
				})
				.count()
		).resolves.toBe(1)
		await expect(
			checklist
				.getByRole('link', { name: 'Start importing' })
				.getAttribute('href')
		).resolves.toBe('/records')

		await checklist
			.getByRole('button', { name: 'Dismiss getting started checklist' })
			.click()
		await checklist.waitFor({ state: 'detached' })
		await expect(
			page.evaluate(() =>
				window.localStorage.getItem('crate-guide-first-run-checklist-dismissed')
			)
		).resolves.toBe('1')
	})

	it('does not appear in the read-only demo', async () => {
		const page = await createErrorAwarePage('/demo')
		await waitForWorkbenchShell(page)
		// The decks render only once the seeded library has loaded, which is
		// the point at which a writable workspace would show the checklist.
		await page.getByText('Deck 1', { exact: true }).waitFor()

		await expect(
			page.getByRole('region', { name: CHECKLIST_NAME }).count()
		).resolves.toBe(0)
	})
})
