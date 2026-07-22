import { describe, expect, it } from 'vitest'
import {
	type E2EQueryObservations,
	LIBRARY_TABLES,
	mockAuthenticatedSupabase,
	setupWorkbenchE2E,
	signInViaForm
} from './fixtures/authenticatedWorkbench'
import { createErrorAwarePage } from './fixtures/errorAwarePage'

await setupWorkbenchE2E()

describe('Library bootstrap and pagination', () => {
	it('loads account data after email login without a page refresh', async () => {
		const page = await createErrorAwarePage('/login')

		await mockAuthenticatedSupabase(page)
		await signInViaForm(page)
		await page.waitForFunction(() => {
			const observations = window as unknown as E2EQueryObservations
			const completions = observations.__e2eKeysetCompletions ?? []
			const expectedTables = ['records', 'tracks', 'crates', 'sets']
			return (
				expectedTables.every((table) =>
					completions.some(
						(completion) =>
							completion.table === table &&
							completion.cursor === null &&
							completion.limit === 1000
					)
				) &&
				completions.some(
					(completion) =>
						completion.table === 'sets' && completion.cursor === 'set-0001'
				) &&
				observations.__e2eSingleCompletions?.some(
					(completion) => completion.table === 'profiles'
				)
			)
		})

		const completions = await page.evaluate(() => {
			const observations = window as unknown as E2EQueryObservations
			return {
				keysets: observations.__e2eKeysetCompletions ?? [],
				singles: observations.__e2eSingleCompletions ?? []
			}
		})
		const libraryKeysets = completions.keysets.filter((completion) =>
			LIBRARY_TABLES.includes(completion.table)
		)
		expect(libraryKeysets).toHaveLength(5)
		for (const table of ['records', 'tracks', 'crates']) {
			expect(libraryKeysets.filter((query) => query.table === table)).toEqual([
				{
					table,
					cursor: null,
					equalityFilters: [['user_id', 'e2e-user']],
					limit: 1000,
					orders: [['id', false]],
					selection: '*'
				}
			])
		}
		const setQueries = libraryKeysets.filter((query) => query.table === 'sets')
		expect(setQueries).toHaveLength(2)
		for (const cursor of [null, 'set-0001']) {
			expect(setQueries.filter((query) => query.cursor === cursor)).toEqual([
				{
					table: 'sets',
					cursor,
					equalityFilters: [['user_id', 'e2e-user']],
					limit: 1000,
					orders: [['id', false]],
					selection: '*'
				}
			])
		}
		const trackQuery = libraryKeysets.find((query) => query.table === 'tracks')
		expect(trackQuery?.selection).toBe('*')
		expect(trackQuery?.equalityFilters).toContainEqual(['user_id', 'e2e-user'])
		expect(completions.singles).toEqual([
			{
				table: 'profiles',
				equalityFilters: [['id', 'e2e-user']],
				selection:
					'id, name, discogs_avatar_url, discogs_uid, discogs_username, just_completed_discogs_oauth'
			},
			{
				table: 'profiles',
				equalityFilters: [['id', 'e2e-user']],
				selection:
					'id, key_format, list_layout, selected_crate, turntable_pitch_range, turntable_theme, ui_theme'
			}
		])
	})
})
