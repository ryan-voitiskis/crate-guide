import { setup, url } from '@nuxt/test-utils/e2e'
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it
} from 'vitest'
import { createErrorAwarePage } from '../e2e/fixtures/errorAwarePage'
import {
	type LocalFixture,
	createLocalFixture,
	localConfiguration,
	localService
} from './fixtures/localSupabase'

await setup({
	browser: true,
	// Nitro applies runtime environment values after module configuration.
	// Pin its primary prefix, including parent objects, in the server process.
	env: {
		NITRO_PUBLIC: '{}',
		NITRO_PUBLIC_SUPABASE: '{}',
		NITRO_PUBLIC_SUPABASE_URL: localConfiguration.apiUrl,
		NITRO_PUBLIC_SUPABASE_KEY: localConfiguration.anonKey
	},
	nuxtConfig: {
		nitro: { preset: 'node-server' },
		supabase: {
			url: localConfiguration.apiUrl,
			key: localConfiguration.anonKey
		}
	}
})

let fixture: LocalFixture
let sentinel: LocalFixture
beforeAll(async () => {
	sentinel = await createLocalFixture()
})
beforeEach(async () => {
	fixture = await createLocalFixture()
})
afterEach(async () => {
	await fixture?.dispose()
})
afterAll(async () => {
	await sentinel?.dispose()
})

async function signedInPage(destination = '/tracks') {
	const page = await createErrorAwarePage(
		`/login?redirect=${encodeURIComponent(destination)}`,
		{
			allowedRequestOrigins: [
				new URL(url('/')).origin,
				new URL(localConfiguration.apiUrl).origin
			],
			// GoTrue rejects logout after Auth deletion. The SDK accepts this exact
			// response and clears the local session; the test also checks sign-out.
			expectedResourceErrors: destination.startsWith('/settings')
				? [
						{
							url: `${localConfiguration.apiUrl}/auth/v1/logout?scope=local`,
							status: 403,
							statusText: 'Forbidden'
						}
					]
				: [],
			beforeNavigate: async (page) => {
				// Only the Edge gateway is adapted; requests execute production handlers
				// with real local Auth, database, and Storage. No client or row is mocked.
				for (const [name, handler] of [
					['cleanup-record-covers', fixture.cleanupCovers],
					['delete-account', fixture.deleteAccount]
				] as const) {
					await page.route(
						`${localConfiguration.apiUrl}/functions/v1/${name}`,
						async (route) => {
							const incoming = route.request()
							const response = await handler(
								new Request(incoming.url(), {
									method: incoming.method(),
									headers: incoming.headers(),
									...(incoming.method() === 'POST'
										? { body: incoming.postData() }
										: {})
								})
							)
							await route.fulfill({
								status: response.status,
								headers: {
									...Object.fromEntries(response.headers),
									'access-control-allow-origin': '*',
									'access-control-allow-headers':
										'authorization, apikey, content-type, x-client-info'
								},
								body: await response.text()
							})
						}
					)
				}
			}
		}
	)
	expect(
		await page.evaluate(
			({ apiUrl, anonKey }) => {
				const config = window.__NUXT__?.config?.public?.supabase
				return config?.url === apiUrl && config?.key === anonKey
			},
			{ apiUrl: localConfiguration.apiUrl, anonKey: localConfiguration.anonKey }
		)
	).toBe(true)
	await page.locator('input[name="email"]').fill(fixture.email)
	await page.locator('input[name="password"]').fill(fixture.password)
	await page.locator('button[type="submit"]').click()
	await page.waitForURL(url(destination))
	if (!destination.startsWith('/settings'))
		await page.getByRole('navigation', { name: 'Library navigation' }).waitFor()
	return page
}

describe('Cloud library with real local Supabase', () => {
	it('removes its Auth fixture when creation commits but the response is lost', async () => {
		let committedId: string | undefined
		await expect(
			createLocalFixture(async (attributes) => {
				const created = await localService.auth.admin.createUser(attributes)
				expect(created.error).toBeNull()
				committedId = created.data.user?.id
				throw new Error('Simulated lost Auth creation response')
			})
		).rejects.toThrow('Simulated lost Auth creation response')
		expect(committedId).toBeDefined()
		expect(
			(await localService.auth.admin.getUserById(committedId!)).error?.status
		).toBe(404)
		expect((await sentinel.readTrack()).title).toBe('Integration track 1')
	})

	it('rejects a stale editor save, preserves input, and retries without losing another session’s BPM or precise duration', async () => {
		const page = await signedInPage()
		await page
			.getByText('Integration track 1', { exact: true })
			.first()
			.dblclick()
		const dialog = page.getByRole('dialog')
		await dialog
			.getByRole('button', { name: 'Edit Track', exact: true })
			.click()
		await dialog
			.locator('input[name="title"]')
			.fill('Reviewed integration title')
		expect(
			(
				await fixture.client
					.from('tracks')
					.update({ bpm: 141 })
					.eq('id', fixture.tracks[0]!)
					.select()
					.single()
			).error
		).toBeNull()
		await dialog
			.getByRole('button', { name: 'Save Changes', exact: true })
			.click()
		await dialog
			.getByText('This track changed while you were editing.')
			.waitFor()
		expect(await dialog.locator('input[name="title"]').inputValue()).toBe(
			'Reviewed integration title'
		)
		expect(
			await dialog
				.getByRole('button', { name: 'Save Changes', exact: true })
				.isDisabled()
		).toBe(true)
		expect(await fixture.readTrack()).toMatchObject({
			title: 'Integration track 1',
			bpm: 141,
			duration: 180
		})
		await dialog
			.getByRole('button', { name: 'Keep my edits and review' })
			.click()
		await dialog
			.getByRole('button', { name: 'Save Changes', exact: true })
			.click()
		await expect
			.poll(async () => (await fixture.readTrack()).title)
			.toBe('Reviewed integration title')
		expect(await fixture.readTrack()).toMatchObject({ bpm: 141, duration: 180 })
	})

	it('rejects cross-owner updates and removes a deleted record’s cover without changing another account', async () => {
		const forbidden = await fixture.client
			.from('tracks')
			.update({ title: 'Forbidden' })
			.eq('id', sentinel.tracks[0]!)
			.select()
		expect(forbidden.error).toBeNull()
		expect(forbidden.data).toEqual([])
		expect(
			(
				await fixture.client.rpc('remove_record_from_collection', {
					target_record_id: fixture.records[0]!
				})
			).error
		).toBeNull()
		const queued = await localService
			.from('record_cover_cleanup_jobs')
			.select('object_path')
			.eq('user_id', fixture.userId)
		expect(queued.error).toBeNull()
		expect(queued.data).toEqual([{ object_path: fixture.paths[0] }])
		const session = await fixture.client.auth.getSession()
		const response = await fixture.cleanupCovers(
			new Request(
				`${localConfiguration.apiUrl}/functions/v1/cleanup-record-covers`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${session.data.session!.access_token}`
					}
				}
			)
		)
		expect(response.status).toBe(200)
		expect(
			(
				await localService.storage
					.from('record-covers')
					.list(`${fixture.userId}/${fixture.records[0]}`)
			).data
		).toEqual([])
		expect(
			(
				await localService
					.from('record_cover_cleanup_jobs')
					.select('id')
					.eq('user_id', fixture.userId)
			).data
		).toEqual([])
		expect(
			(
				await localService.storage
					.from('record-covers')
					.download(sentinel.paths[0]!)
			).error
		).toBeNull()
		expect((await sentinel.readTrack()).title).toBe('Integration track 1')
	})

	it('abandons enrichment preparation without a write, recovers the saved draft, and applies it once', async () => {
		const page = await signedInPage('/enrichment')
		const before = await fixture.readTrack(1)
		let applyRequests = 0
		page.on('request', (request) => {
			if (request.url().includes('/rest/v1/rpc/persist_track_enrichment_batch'))
				applyRequests++
		})
		await page.locator('input[type="file"][accept*="xml"]').setInputFiles({
			name: 'integration.xml',
			mimeType: 'application/xml',
			buffer: Buffer.from(
				'<DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="1"><TRACK TrackID="2" Name="Integration track 2" Artist="Integration Artist" Album="Integration record 2" TotalTime="180" AverageBpm="128" Tonality="8A" /></COLLECTION></DJ_PLAYLISTS>'
			)
		})
		await page.getByTestId('enrichment-review-workspace').waitFor()
		await page
			.getByRole('checkbox', { name: 'Stage all eligible tracks in this view' })
			.setChecked(true)
		await page
			.getByText(/^Saved locally /)
			.first()
			.waitFor()
		await page
			.getByRole('button', { name: /Review staged changes \(\s*1\s*\)/ })
			.click()
		// Hold the real asynchronous digest, never the Supabase client or response.
		await page.evaluate(() => {
			type DigestWindow = Window & {
				__integrationDigest?: {
					held: boolean
					settled: boolean
					release: () => void
					restore: () => void
				}
			}
			const host = window as DigestWindow
			const original = crypto.subtle.digest.bind(crypto.subtle)
			let release!: () => void
			const gate = new Promise<void>((resolve) => {
				release = resolve
			})
			const state = {
				held: false,
				settled: false,
				release,
				restore: () => {
					crypto.subtle.digest = original
				}
			}
			host.__integrationDigest = state
			crypto.subtle.digest = async (...args) => {
				if (!state.held) {
					state.held = true
					await gate
				}
				try {
					return await original(...args)
				} finally {
					state.settled = true
				}
			}
		})
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Save changes', exact: true })
			.click()
		await page.waitForFunction(
			() =>
				(window as Window & { __integrationDigest?: { held: boolean } })
					.__integrationDigest?.held
		)
		await page.evaluate(async () => {
			const host = window as Window & {
				useNuxtApp?: () => { $router: { push(path: string): Promise<void> } }
			}
			if (!host.useNuxtApp) throw new Error('Nuxt router unavailable')
			await host.useNuxtApp().$router.push('/tracks')
		})
		await page.waitForURL(url('/tracks'))
		await page.evaluate(() =>
			(
				window as Window & { __integrationDigest?: { release(): void } }
			).__integrationDigest?.release()
		)
		await page.waitForFunction(
			() =>
				(window as Window & { __integrationDigest?: { settled: boolean } })
					.__integrationDigest?.settled
		)
		await page.evaluate(async () => {
			const host = window as Window & {
				__integrationDigest?: { restore(): void }
			}
			host.__integrationDigest?.restore()
			delete host.__integrationDigest
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
		})
		expect(await fixture.readTrack(1)).toEqual(before)
		expect(applyRequests).toBe(0)
		// Reload proves recovery from IndexedDB, independent of in-memory state.
		await page.goto(url('/enrichment'), { waitUntil: 'hydration' })
		await page.getByRole('button', { name: 'Resume', exact: true }).click()
		await page.getByTestId('enrichment-resume-summary').waitFor()
		if (await page.getByTestId('enrichment-draft-read-only').isVisible()) {
			page.once('dialog', (dialog) => dialog.accept())
			await page.getByRole('button', { name: 'Take over', exact: true }).click()
		}
		await page
			.getByRole('button', { name: /Review staged changes \(\s*1\s*\)/ })
			.click()
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Save changes', exact: true })
			.click()
		await expect.poll(async () => (await fixture.readTrack(1)).bpm).toBe(128)
		const saved = await fixture.readTrack(1)
		expect(saved).toMatchObject({
			key: 9,
			mode: 0,
			duration: 180000,
			audio_features: { version: 2 }
		})
		expect(saved.updated_at).not.toBe(before.updated_at)
		expect(applyRequests).toBe(1)
		expect(await fixture.readTrack()).toMatchObject({
			bpm: 128,
			duration: 180,
			title: 'Integration track 1'
		})
	})

	it('deletes through the real account dialog, reports queued cleanup, and completes the scoped cover worker', async () => {
		fixture.seedExpiredRateLimit()
		sentinel.seedExpiredRateLimit()
		const sentinelQuota = sentinel.rateLimitRow()
		expect(sentinelQuota).not.toBeNull()
		const page = await signedInPage('/settings?action=delete-account')
		await page.locator('#account-deletion-confirmation').fill(fixture.email)
		const deleted = page.waitForResponse(
			`${localConfiguration.apiUrl}/functions/v1/delete-account`
		)
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Delete Account', exact: true })
			.click()
		const response = await deleted
		expect(response.status()).toBe(200)
		expect(await response.json()).toMatchObject({
			success: true,
			cleanup_state: 'queued',
			cleanup_queued: true
		})
		await page
			.getByText(
				'Your account has been deleted. Remaining cover images will be removed in the background.'
			)
			.waitFor()
		expect(
			(await localService.auth.admin.getUserById(fixture.userId)).error?.status
		).toBe(404)
		expect(fixture.ownedRowCount('records')).toBe(0)
		await page.waitForURL(url('/login'))
		expect(
			(
				await localService.storage
					.from('record-covers')
					.download(fixture.paths[0]!)
			).error
		).toBeNull()
		expect(fixture.rateLimitRow()).not.toBeNull()
		expect(await fixture.drainAccountCovers()).toEqual({
			processed: true,
			complete: true,
			failed: false
		})
		expect(fixture.accountJobCount()).toBe(0)
		expect(fixture.rateLimitRow()).toBeNull()
		expect(sentinel.rateLimitRow()).toEqual(sentinelQuota)
		for (const recordId of fixture.records)
			expect(
				(
					await localService.storage
						.from('record-covers')
						.list(`${fixture.userId}/${recordId}`)
				).data
			).toEqual([])
		expect(
			(
				await fixture.client.auth.signInWithPassword({
					email: fixture.email,
					password: fixture.password
				})
			).error?.code
		).toBe('invalid_credentials')
		expect(
			(
				await localService.storage
					.from('record-covers')
					.download(sentinel.paths[0]!)
			).error
		).toBeNull()
	})
})
