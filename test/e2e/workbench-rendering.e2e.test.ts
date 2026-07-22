import { url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import renderingBudget from '../../shared/config/workbenchRenderingBudget.json'
import {
	mockAuthenticatedSupabase,
	setupWorkbenchE2E,
	signInViaForm,
	waitForWorkbenchShell
} from './fixtures/authenticatedWorkbench'
import { createErrorAwarePage } from './fixtures/errorAwarePage'

type WorkbenchRenderMetrics = {
	breakpointMs: number
	filterMs: number
	initialRenderMs: number
	longTasks: number
	mountedCovers: number
	mountedItems: number
	retainedCovers: number
	retainedItems: number
	responsiveRowTrees: number
	scrollMs: number
	sortMs: number
	surface: 'record-covers' | 'records' | 'tracks'
	viewport: 'desktop' | 'mobile'
}

type CandidateRenderMetrics = {
	mountedCovers: number
	mountedItems: number
	retainedItems: number
	selectedItems?: number
	surface: 'crate-candidates' | 'discogs-candidates'
	totalItems: number
}

type CoverRequestMetrics = {
	atRest: number
	interaction: 'initial' | 'scroll'
	surface: 'crate-candidates' | 'record-covers' | 'records' | 'tracks'
}

await setupWorkbenchE2E()

async function nextFrames(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>
) {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	)
}

async function navigateWorkbench(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	path: '/crates' | '/records' | '/tracks'
) {
	await Promise.all([
		page.waitForURL(url(path)),
		page.evaluate(async (destination) => {
			type NuxtWindow = Window & {
				useNuxtApp?: () => {
					$router?: { push: (path: string) => Promise<void> }
				}
			}
			const router = (window as NuxtWindow).useNuxtApp?.().$router
			if (!router) throw new Error('Nuxt router is unavailable')
			await router.push(destination)
		}, path)
	])
}

async function installLongTaskObserver(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>
) {
	await page.evaluate(() => {
		type PerformanceWindow = Window & {
			__workbenchLongTaskCount?: number
			__workbenchLongTaskObserver?: PerformanceObserver
		}
		const performanceWindow = window as PerformanceWindow
		performanceWindow.__workbenchLongTaskCount = 0
		performanceWindow.__workbenchLongTaskObserver?.disconnect()
		if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) return

		performanceWindow.__workbenchLongTaskObserver = new PerformanceObserver(
			(entries) => {
				performanceWindow.__workbenchLongTaskCount =
					(performanceWindow.__workbenchLongTaskCount ?? 0) +
					entries.getEntries().length
			}
		)
		performanceWindow.__workbenchLongTaskObserver.observe({
			entryTypes: ['longtask']
		})
	})
}

async function readLongTaskCount(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>
) {
	return page.evaluate(() => {
		type PerformanceWindow = Window & {
			__workbenchLongTaskCount?: number
			__workbenchLongTaskObserver?: PerformanceObserver
		}
		const performanceWindow = window as PerformanceWindow
		const buffered =
			performanceWindow.__workbenchLongTaskObserver?.takeRecords().length ?? 0
		return (performanceWindow.__workbenchLongTaskCount ?? 0) + buffered
	})
}

async function installDeferredCoverSigner(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>
) {
	await page.evaluate(() => {
		type SignedUrlResult = {
			data: { signedUrl: string }
			error: null
		}
		type PendingCoverRequest = {
			path: string
			resolve: (result: SignedUrlResult) => void
			settled: boolean
		}
		type NuxtWindow = Window & {
			__workbenchCoverRequests?: PendingCoverRequest[]
			useNuxtApp?: () => {
				$supabase?: {
					client?: {
						storage?: {
							from: (bucket: string) => {
								createSignedUrl: (
									path: string,
									lifetime: number
								) => Promise<SignedUrlResult>
							}
						}
					}
				}
			}
		}
		const performanceWindow = window as NuxtWindow
		const storage = performanceWindow.useNuxtApp?.().$supabase?.client?.storage
		if (!storage) throw new Error('Supabase Storage is unavailable')
		const requests: PendingCoverRequest[] = []
		performanceWindow.__workbenchCoverRequests = requests
		storage.from = () => ({
			createSignedUrl: (path) =>
				new Promise<SignedUrlResult>((resolve) => {
					requests.push({ path, resolve, settled: false })
				})
		})
	})
}

async function stubCoverCleanup(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>
) {
	await page.evaluate(() => {
		type Store = { drainCoverCleanup?: () => Promise<boolean> }
		type Pinia = { _s: Map<string, Store> }
		type NuxtWindow = Window & {
			useNuxtApp?: () => { $pinia?: Pinia }
		}
		const records = (window as NuxtWindow)
			.useNuxtApp?.()
			.$pinia?._s.get('records')
		if (!records) throw new Error('Records store is unavailable')
		records.drainCoverCleanup = async () => true
	})
}

async function readCoverRequests(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>
) {
	return page.evaluate(() => {
		type CoverRequestWindow = Window & {
			__workbenchCoverRequests?: Array<{ path: string; settled: boolean }>
		}
		return ((window as CoverRequestWindow).__workbenchCoverRequests ?? []).map(
			(request) => ({ path: request.path, settled: request.settled })
		)
	})
}

async function resolveCoverRequests(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	end: number
) {
	await page.evaluate((endIndex) => {
		type SignedUrlResult = {
			data: { signedUrl: string }
			error: null
		}
		type PendingCoverRequest = {
			path: string
			resolve: (result: SignedUrlResult) => void
			settled: boolean
		}
		type CoverRequestWindow = Window & {
			__workbenchCoverRequests?: PendingCoverRequest[]
		}
		const requests =
			(window as CoverRequestWindow).__workbenchCoverRequests ?? []
		for (
			let index = 0;
			index < Math.min(endIndex, requests.length);
			index += 1
		) {
			const request = requests[index]
			if (!request || request.settled) continue
			request.settled = true
			request.resolve({
				data: {
					signedUrl: `data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=#${request.path}`
				},
				error: null
			})
		}
	}, end)
	await nextFrames(page)
}

async function seedRecords(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	count: number
) {
	return page.evaluate(async (recordCount) => {
		type Store = { $patch: (state: Record<string, unknown>) => void }
		type Pinia = { _s: Map<string, Store> }
		type NuxtWindow = Window & {
			useNuxtApp?: () => { $pinia?: Pinia }
		}
		const pinia = (window as NuxtWindow).useNuxtApp?.().$pinia
		const records = pinia?._s.get('records')
		const tracks = pinia?._s.get('tracks')
		if (!records || !tracks) throw new Error('Workbench stores are unavailable')

		const generatedRecords = Array.from(
			{ length: recordCount },
			(_, index) => ({
				artists: [
					{
						discogs_id: index % 997,
						name: `Artist ${String(index % 211).padStart(3, '0')}`,
						role: null
					}
				],
				cover: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
				cover_storage_path: `e2e-user/record-${String(index).padStart(5, '0')}/cover.webp`,
				created_at: '2026-07-22T00:00:00.000Z',
				discogs_id: index + 1,
				discogs_release_url: `https://discogs.example/release/${index + 1}`,
				id: `record-${String(index).padStart(5, '0')}`,
				labels: [
					{
						catno: `CAT-${String(index).padStart(5, '0')}`,
						discogs_id: index % 487,
						name: `Label ${index % 89}`
					}
				],
				title: `${index % 17 === 7 ? 'Needle-7 Release' : 'Release'} ${String(index).padStart(5, '0')}`,
				updated_at: '2026-07-22T00:00:00.000Z',
				user_id: 'e2e-user',
				year: 1980 + (index % 46)
			})
		)

		const startedAt = performance.now()
		tracks.$patch({ tracks: [] })
		records.$patch({ records: generatedRecords })
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		)
		return performance.now() - startedAt
	}, count)
}

async function seedTracks(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	count: number,
	recordCount: number
) {
	return page.evaluate(
		async ({ generatedTrackCount, generatedRecordCount }) => {
			type Store = { $patch: (state: Record<string, unknown>) => void }
			type Pinia = { _s: Map<string, Store> }
			type NuxtWindow = Window & {
				useNuxtApp?: () => { $pinia?: Pinia }
			}
			const tracks = (window as NuxtWindow)
				.useNuxtApp?.()
				.$pinia?._s.get('tracks')
			if (!tracks) throw new Error('Tracks store is unavailable')

			const generatedTracks = Array.from(
				{ length: generatedTrackCount },
				(_, index) => ({
					artists: [
						{
							discogs_id: index % 997,
							name: `Artist ${String(index % 211).padStart(3, '0')}`,
							role: null
						}
					],
					audio_features: null,
					beatport_data: null,
					bpm: 112 + (index % 400) / 10,
					created_at: '2026-07-22T00:00:00.000Z',
					duration: 150000 + (index % 180) * 1000,
					extraartists: [],
					genres: [`Genre ${index % 12}`],
					id: `track-${String(index).padStart(5, '0')}`,
					key: index % 12,
					mode: index % 2,
					playable: index % 19 !== 0,
					position: `${String.fromCharCode(65 + (index % 4))}${(index % 5) + 1}`,
					record_id: `record-${String(index % generatedRecordCount).padStart(5, '0')}`,
					rpm: index % 5 === 0 ? 45 : 33,
					time_signature_lower: null,
					time_signature_upper: null,
					title: `${index % 17 === 7 ? 'Needle-7 Track' : 'Track'} ${String(index).padStart(5, '0')}`,
					updated_at: '2026-07-22T00:00:00.000Z'
				})
			)

			const startedAt = performance.now()
			tracks.$patch({ tracks: generatedTracks })
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
			return performance.now() - startedAt
		},
		{ generatedRecordCount: recordCount, generatedTrackCount: count }
	)
}

async function seedCrate(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>
) {
	await page.evaluate(() => {
		type Store = { $patch: (state: Record<string, unknown>) => void }
		type Pinia = { _s: Map<string, Store> }
		type NuxtWindow = Window & {
			useNuxtApp?: () => { $pinia?: Pinia }
		}
		const crates = (window as NuxtWindow)
			.useNuxtApp?.()
			.$pinia?._s.get('crates')
		if (!crates) throw new Error('Crates store is unavailable')
		crates.$patch({
			crates: [
				{
					color: null,
					created_at: '2026-07-22T00:00:00.000Z',
					description: 'Performance fixture',
					id: 'crate-performance',
					name: 'Performance crate',
					records: [],
					updated_at: '2026-07-22T00:00:00.000Z',
					user_id: 'e2e-user'
				}
			]
		})
	})
}

async function openDiscogsCandidates(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	count: number
) {
	await page.evaluate((releaseCount) => {
		type Store = { $patch: (state: Record<string, unknown>) => void }
		type Pinia = { _s: Map<string, Store> }
		type NuxtWindow = Window & {
			useNuxtApp?: () => { $pinia?: Pinia }
		}
		const discogs = (window as NuxtWindow)
			.useNuxtApp?.()
			.$pinia?._s.get('discogs')
		if (!discogs) throw new Error('Discogs store is unavailable')
		const releases = Array.from({ length: releaseCount }, (_, index) => ({
			alreadyImported: false,
			basic_information: {
				artists: [
					{
						anv: '',
						id: index + 1,
						join: '',
						name: `Discogs Artist ${index % 211}`,
						resource_url: '',
						role: '',
						tracks: ''
					}
				],
				cover_image: '',
				formats: [],
				genres: ['House'],
				id: index + 1,
				labels: [
					{
						catno: `DISC-${String(index).padStart(5, '0')}`,
						entity_type: '',
						entity_type_name: '',
						id: index + 1,
						name: `Discogs Label ${index % 89}`,
						resource_url: ''
					}
				],
				styles: [],
				thumb: '',
				title: `Discogs Release ${String(index).padStart(5, '0')}`,
				year: 1980 + (index % 46)
			},
			id: index + 1,
			selected: true
		}))
		discogs.$patch({ releasesToImport: releases, showFilterDialog: true })
	}, count)
}

async function measureInput(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	selector: string,
	value: string
) {
	const startedAt = performance.now()
	await page.locator(selector).fill(value)
	await nextFrames(page)
	return performance.now() - startedAt
}

async function measureClick(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	name: string
) {
	const startedAt = performance.now()
	await page.getByRole('button', { name, exact: true }).first().click()
	await nextFrames(page)
	return performance.now() - startedAt
}

async function measureScroll(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	selector = '.workbench-scrollbar'
) {
	return page
		.locator(selector)
		.first()
		.evaluate(async (element) => {
			const startedAt = performance.now()
			element.scrollTop = Math.floor(
				(element.scrollHeight - element.clientHeight) / 2
			)
			element.dispatchEvent(new Event('scroll'))
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
			return performance.now() - startedAt
		})
}

async function readFirstVisibleRecordId(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	selector: string
) {
	return page.locator(selector).evaluate((element) => {
		const firstVisibleIndex = element.getAttribute(
			'data-virtual-first-visible-index'
		)
		if (firstVisibleIndex === null) return null
		return element
			.querySelector(
				`[data-virtual-index="${firstVisibleIndex}"] [data-record-id]`
			)
			?.getAttribute('data-record-id')
	})
}

async function readFirstVisibleTrackId(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	selector: string
) {
	return page.locator(selector).evaluate((element) => {
		const firstVisibleIndex = element.getAttribute(
			'data-virtual-first-visible-index'
		)
		if (firstVisibleIndex === null) return null
		return element
			.querySelector(
				`[data-virtual-index="${firstVisibleIndex}"] [data-track-id]`
			)
			?.getAttribute('data-track-id')
	})
}

async function waitForRecordInFirstVisibleRow(
	page: Awaited<ReturnType<typeof createErrorAwarePage>>,
	selector: string,
	recordId: string
) {
	await page.waitForFunction(
		({ regionSelector, expectedRecordId }) => {
			const region = document.querySelector(regionSelector)
			const firstVisibleIndex = region?.getAttribute(
				'data-virtual-first-visible-index'
			)
			if (!region || firstVisibleIndex === null) return false
			const row = region.querySelector(
				`[data-virtual-index="${firstVisibleIndex}"]`
			)
			return Array.from(row?.querySelectorAll('[data-record-id]') ?? []).some(
				(element) => element.getAttribute('data-record-id') === expectedRecordId
			)
		},
		{ expectedRecordId: recordId, regionSelector: selector }
	)
}

describe('workbench rendering structural budgets', () => {
	it('bounds records and tracks in the supported real-browser viewports', async () => {
		const page = await createErrorAwarePage('/login')
		await page.setViewportSize(renderingBudget.viewports.desktop)
		await mockAuthenticatedSupabase(page)
		await stubCoverCleanup(page)
		await signInViaForm(page)
		await waitForWorkbenchShell(page)
		await installDeferredCoverSigner(page)
		await navigateWorkbench(page, '/records')
		await installLongTaskObserver(page)

		const recordInitialRenderMs = await seedRecords(
			page,
			renderingBudget.corpora.records
		)
		const initialRecordRequests = await readCoverRequests(page)
		expect(initialRecordRequests.length).toBeGreaterThan(0)
		expect(initialRecordRequests.length).toBeLessThanOrEqual(
			renderingBudget.structural.maxSignedCoverRequestsAtRest
		)
		expect(
			initialRecordRequests.some((request) =>
				request.path.includes('record-00999')
			)
		).toBe(false)
		const recordMountedItems = await page.locator('[data-record-id]').count()
		const recordMountedCovers = await page
			.locator('[data-testid="record-cover"]')
			.count()
		const recordResponsiveTrees = await page
			.locator(
				'[data-testid="desktop-record-rows"], [data-testid="compact-record-rows"]'
			)
			.count()
		const recordScrollMs = await measureScroll(page)
		const scrolledRecordRequests = await readCoverRequests(page)
		expect(
			scrolledRecordRequests.length - initialRecordRequests.length
		).toBeLessThanOrEqual(
			renderingBudget.structural.maxSignedCoverRequestsPerScroll
		)
		const mountedRecordIds = await page
			.locator('[data-record-id]')
			.evaluateAll((elements) =>
				elements
					.map((element) => element.getAttribute('data-record-id'))
					.filter((recordId): recordId is string => Boolean(recordId))
			)
		const lateRequest = initialRecordRequests.find((request) => {
			const recordId = request.path.match(/record-\d+/)?.[0]
			return recordId && !mountedRecordIds.includes(recordId)
		})
		expect(lateRequest).toBeDefined()
		await resolveCoverRequests(page, initialRecordRequests.length)
		expect(
			await page
				.locator('img')
				.evaluateAll(
					(elements, stalePath) =>
						elements.some((element) =>
							element.getAttribute('src')?.includes(stalePath)
						),
					lateRequest!.path
				)
		).toBe(false)
		await resolveCoverRequests(page, scrolledRecordRequests.length)
		const retainedRecordItems = await page.locator('[data-record-id]').count()
		const retainedRecordCovers = await page
			.locator('[data-testid="record-cover"]')
			.count()
		const recordSortAnchorId = await readFirstVisibleRecordId(
			page,
			'[aria-label="Record collection"]'
		)
		expect(recordSortAnchorId).not.toBeNull()
		const recordSortMs = await measureClick(page, 'Title')
		expect(
			await page.locator(`[data-record-id="${recordSortAnchorId}"]`).count()
		).toBe(1)
		await resolveCoverRequests(page, (await readCoverRequests(page)).length)
		await page
			.locator('[aria-label="Record collection"]')
			.evaluate((element) => {
				element.scrollTop = 0
				element.dispatchEvent(new Event('scroll'))
			})
		await nextFrames(page)
		const recordFilterMs = await measureInput(
			page,
			'[data-records-search-input]',
			'needle-7'
		)
		const filteredRecordCount = Number(
			await page
				.locator('[aria-label="Record collection"]')
				.getAttribute('data-virtual-total-count')
		)
		const recordSearchState = await page.evaluate(() => {
			type Store = {
				displayedRecords?: unknown[]
				searchQuery?: string
			}
			type Pinia = { _s: Map<string, Store> }
			type NuxtWindow = Window & {
				useNuxtApp?: () => { $pinia?: Pinia }
			}
			const records = (window as NuxtWindow)
				.useNuxtApp?.()
				.$pinia?._s.get('records')
			return {
				displayedRecords: records?.displayedRecords?.length,
				input: document.querySelector<HTMLInputElement>(
					'[data-records-search-input]'
				)?.value,
				searchQuery: records?.searchQuery
			}
		})
		expect(filteredRecordCount).toBeGreaterThan(0)
		expect(filteredRecordCount, JSON.stringify(recordSearchState)).toBeLessThan(
			renderingBudget.corpora.records
		)
		await measureInput(page, '[data-records-search-input]', '')
		await resolveCoverRequests(page, (await readCoverRequests(page)).length)
		await measureClick(page, 'Title')
		await resolveCoverRequests(page, (await readCoverRequests(page)).length)

		const breakpointStartedAt = performance.now()
		await page.setViewportSize(renderingBudget.viewports.mobile)
		await nextFrames(page)
		const recordBreakpointMs = performance.now() - breakpointStartedAt
		expect(await page.locator('[data-record-id]').count()).toBeLessThanOrEqual(
			renderingBudget.structural.maxMountedItems
		)
		expect(
			await page.locator('[data-testid="record-cover"]').count()
		).toBeLessThanOrEqual(renderingBudget.structural.maxMountedCovers)
		expect(
			await page
				.locator(
					'[data-testid="desktop-record-rows"], [data-testid="compact-record-rows"]'
				)
				.count()
		).toBe(renderingBudget.structural.maxResponsiveRowTrees)
		const recordLongTasks = await readLongTaskCount(page)

		await page.setViewportSize(renderingBudget.viewports.desktop)
		await nextFrames(page)
		const requestsBeforeCoverView = (await readCoverRequests(page)).length
		const coverViewInitialRenderMs = await measureClick(page, 'Cover view')
		const coverViewRequests = await readCoverRequests(page)
		expect(
			coverViewRequests.length - requestsBeforeCoverView
		).toBeLessThanOrEqual(
			renderingBudget.structural.maxSignedCoverRequestsAtRest
		)
		const coverViewMountedItems = await page.locator('[data-record-id]').count()
		const coverViewMountedCovers = await page
			.locator('[data-testid="record-cover"]')
			.count()
		await resolveCoverRequests(page, coverViewRequests.length)
		const requestsBeforeCoverScroll = (await readCoverRequests(page)).length
		const coverViewScrollMs = await measureScroll(
			page,
			'[aria-label="Record cover collection"]'
		)
		const coverViewScrolledRequests = await readCoverRequests(page)
		expect(
			coverViewScrolledRequests.length - requestsBeforeCoverScroll
		).toBeLessThanOrEqual(
			renderingBudget.structural.maxSignedCoverRequestsPerScroll
		)
		await resolveCoverRequests(page, coverViewScrolledRequests.length)
		const coverViewRetainedItems = await page
			.locator('[data-record-id]')
			.count()
		const coverViewRetainedCovers = await page
			.locator('[data-testid="record-cover"]')
			.count()
		const coverRegionSelector = '[aria-label="Record cover collection"]'
		const coverAnchorRecordId = await readFirstVisibleRecordId(
			page,
			coverRegionSelector
		)
		expect(coverAnchorRecordId).not.toBeNull()
		const firstMountedCoverCard = page
			.locator(`${coverRegionSelector} [data-record-id]`)
			.first()
		expect(await firstMountedCoverCard.getAttribute('role')).toBe('button')
		expect(await firstMountedCoverCard.getAttribute('tabindex')).toBe('0')
		await page.setViewportSize(renderingBudget.viewports.mobile)
		await nextFrames(page)
		await waitForRecordInFirstVisibleRow(
			page,
			coverRegionSelector,
			coverAnchorRecordId!
		)
		expect(
			await page.locator(`${coverRegionSelector} [data-record-id]`).count()
		).toBeLessThanOrEqual(renderingBudget.structural.maxMountedCovers)
		await page.setViewportSize(renderingBudget.viewports.desktop)
		await nextFrames(page)
		await waitForRecordInFirstVisibleRow(
			page,
			coverRegionSelector,
			coverAnchorRecordId!
		)

		await navigateWorkbench(page, '/tracks')
		await waitForWorkbenchShell(page)
		await installLongTaskObserver(page)
		const requestsBeforeTracks = (await readCoverRequests(page)).length
		const trackInitialRenderMs = await seedTracks(
			page,
			renderingBudget.corpora.tracks,
			renderingBudget.corpora.records
		)
		const initialTrackRequests = await readCoverRequests(page)
		expect(
			initialTrackRequests.length - requestsBeforeTracks
		).toBeLessThanOrEqual(
			renderingBudget.structural.maxSignedCoverRequestsAtRest
		)
		await resolveCoverRequests(page, initialTrackRequests.length)
		const trackMountedItems = await page.locator('[data-track-id]').count()
		const trackMountedCovers = await page
			.locator('[data-testid="record-cover"]')
			.count()
		const trackResponsiveTrees = await page
			.locator(
				'[data-testid="desktop-track-rows"], [data-testid="compact-track-rows"]'
			)
			.count()
		const trackFilterMs = await measureInput(
			page,
			'input[placeholder="Search tracks, artists or genres"]',
			'needle-7'
		)
		const filteredTrackCount = Number(
			await page
				.locator('[aria-label="Track collection"]')
				.getAttribute('data-virtual-total-count')
		)
		expect(filteredTrackCount).toBeGreaterThan(0)
		expect(filteredTrackCount).toBeLessThan(renderingBudget.corpora.tracks)
		await measureInput(
			page,
			'input[placeholder="Search tracks, artists or genres"]',
			''
		)
		await resolveCoverRequests(page, (await readCoverRequests(page)).length)
		const requestsBeforeTrackScroll = (await readCoverRequests(page)).length
		const trackScrollMs = await measureScroll(page)
		const scrolledTrackRequests = await readCoverRequests(page)
		expect(
			scrolledTrackRequests.length - requestsBeforeTrackScroll
		).toBeLessThanOrEqual(
			renderingBudget.structural.maxSignedCoverRequestsPerScroll
		)
		await resolveCoverRequests(page, scrolledTrackRequests.length)
		const trackSortAnchorId = await readFirstVisibleTrackId(
			page,
			'[aria-label="Track collection"]'
		)
		expect(trackSortAnchorId).not.toBeNull()
		const trackSortMs = await measureClick(page, 'Title')
		expect(
			await page.locator(`[data-track-id="${trackSortAnchorId}"]`).count()
		).toBe(1)
		await resolveCoverRequests(page, (await readCoverRequests(page)).length)
		const retainedTrackItems = await page.locator('[data-track-id]').count()
		const retainedTrackCovers = await page
			.locator('[data-testid="record-cover"]')
			.count()
		const trackBreakpointStartedAt = performance.now()
		await page.setViewportSize(renderingBudget.viewports.mobile)
		await nextFrames(page)
		const trackBreakpointMs = performance.now() - trackBreakpointStartedAt
		expect(await page.locator('[data-track-id]').count()).toBeLessThanOrEqual(
			renderingBudget.structural.maxMountedItems
		)
		expect(
			await page.locator('[data-testid="record-cover"]').count()
		).toBeLessThanOrEqual(renderingBudget.structural.maxMountedCovers)
		expect(
			await page
				.locator(
					'[data-testid="desktop-track-rows"], [data-testid="compact-track-rows"]'
				)
				.count()
		).toBe(renderingBudget.structural.maxResponsiveRowTrees)
		const trackLongTasks = await readLongTaskCount(page)

		await page.setViewportSize(renderingBudget.viewports.desktop)
		await nextFrames(page)
		await seedCrate(page)
		await navigateWorkbench(page, '/crates')
		await waitForWorkbenchShell(page)
		const requestsBeforeCrateCandidates = (await readCoverRequests(page)).length
		await page
			.getByRole('button', { name: 'Add records', exact: true })
			.first()
			.click()
		const crateCandidates = page.locator(
			'[data-testid="crate-record-candidates"]'
		)
		await crateCandidates.waitFor({ state: 'visible' })
		await nextFrames(page)
		const crateCandidateRequests = await readCoverRequests(page)
		const crateAtRestCoverRequests =
			crateCandidateRequests.length - requestsBeforeCrateCandidates
		expect(crateAtRestCoverRequests).toBeLessThanOrEqual(
			renderingBudget.structural.maxSignedCoverRequestsAtRest
		)
		const crateCandidateTotal = Number(
			await crateCandidates.getAttribute('data-virtual-total-count')
		)
		expect(crateCandidateTotal).toBe(renderingBudget.corpora.candidateRecords)
		const crateCandidateMountedItems = await page
			.locator('[data-candidate-record-id]')
			.count()
		const crateCandidateMountedCovers = await crateCandidates
			.locator('[data-testid="record-cover"]')
			.count()
		expect(crateCandidateMountedItems).toBeLessThanOrEqual(
			renderingBudget.structural.maxMountedItems
		)
		expect(crateCandidateMountedCovers).toBeLessThanOrEqual(
			renderingBudget.structural.maxMountedCovers
		)
		expect(
			await page.locator('[data-candidate-record-id="record-00999"]').count()
		).toBe(0)
		await resolveCoverRequests(page, crateCandidateRequests.length)
		await measureInput(
			page,
			'input[placeholder="Search records..."]',
			'Release 00999'
		)
		expect(
			Number(await crateCandidates.getAttribute('data-virtual-total-count'))
		).toBe(1)
		expect(
			await page.locator('[data-candidate-record-id="record-00999"]').count()
		).toBe(1)
		await resolveCoverRequests(page, (await readCoverRequests(page)).length)
		await measureInput(page, 'input[placeholder="Search records..."]', '')
		await resolveCoverRequests(page, (await readCoverRequests(page)).length)
		const requestsBeforeCrateScroll = (await readCoverRequests(page)).length
		await measureScroll(page, '[data-testid="crate-record-candidates"]')
		const scrolledCrateRequests = await readCoverRequests(page)
		const crateScrollCoverRequests =
			scrolledCrateRequests.length - requestsBeforeCrateScroll
		expect(crateScrollCoverRequests).toBeLessThanOrEqual(
			renderingBudget.structural.maxSignedCoverRequestsPerScroll
		)
		await resolveCoverRequests(page, scrolledCrateRequests.length)
		const crateCandidateRetainedItems = await page
			.locator('[data-candidate-record-id]')
			.count()
		expect(crateCandidateRetainedItems).toBeLessThanOrEqual(
			renderingBudget.structural.maxMountedItems
		)
		await page.getByRole('button', { name: 'Done', exact: true }).click()

		await openDiscogsCandidates(page, renderingBudget.corpora.candidateReleases)
		const discogsCandidates = page.locator(
			'[data-testid="discogs-release-candidates"]'
		)
		await discogsCandidates.waitFor({ state: 'visible' })
		await nextFrames(page)
		const discogsCandidateTotal = Number(
			await discogsCandidates.getAttribute('data-virtual-total-count')
		)
		expect(discogsCandidateTotal).toBe(
			renderingBudget.corpora.candidateReleases
		)
		const discogsCandidateMountedItems = await page
			.locator('[data-candidate-release-id]')
			.count()
		expect(discogsCandidateMountedItems).toBeLessThanOrEqual(
			renderingBudget.structural.maxMountedItems
		)
		await page.getByText('10000 selected · 0 in library').waitFor()
		await page.getByRole('checkbox').first().click()
		await page.getByText('0 selected · 0 in library').waitFor()
		await expect(
			page.getByRole('button', { name: 'Import 0', exact: true }).isDisabled()
		).resolves.toBe(true)
		await measureScroll(page, '[data-testid="discogs-release-candidates"]')
		const discogsCandidateRetainedItems = await page
			.locator('[data-candidate-release-id]')
			.count()
		expect(discogsCandidateRetainedItems).toBeLessThanOrEqual(
			renderingBudget.structural.maxMountedItems
		)
		await page.getByRole('button', { name: 'Cancel', exact: true }).click()
		await navigateWorkbench(page, '/records')
		await waitForWorkbenchShell(page)
		await nextFrames(page)
		expect(
			await page
				.locator(
					'[aria-label="Record collection"], [aria-label="Record cover collection"]'
				)
				.count()
		).toBe(1)
		expect(await page.locator('[data-record-id]').count()).toBeLessThanOrEqual(
			renderingBudget.structural.maxMountedItems
		)

		const candidateMetrics: CandidateRenderMetrics[] = [
			{
				mountedCovers: crateCandidateMountedCovers,
				mountedItems: crateCandidateMountedItems,
				retainedItems: crateCandidateRetainedItems,
				surface: 'crate-candidates',
				totalItems: crateCandidateTotal
			},
			{
				mountedCovers: 0,
				mountedItems: discogsCandidateMountedItems,
				retainedItems: discogsCandidateRetainedItems,
				selectedItems: 0,
				surface: 'discogs-candidates',
				totalItems: discogsCandidateTotal
			}
		]
		const coverRequestMetrics: CoverRequestMetrics[] = [
			{
				atRest: initialRecordRequests.length,
				interaction: 'initial',
				surface: 'records'
			},
			{
				atRest: scrolledRecordRequests.length - initialRecordRequests.length,
				interaction: 'scroll',
				surface: 'records'
			},
			{
				atRest: coverViewRequests.length - requestsBeforeCoverView,
				interaction: 'initial',
				surface: 'record-covers'
			},
			{
				atRest: coverViewScrolledRequests.length - requestsBeforeCoverScroll,
				interaction: 'scroll',
				surface: 'record-covers'
			},
			{
				atRest: initialTrackRequests.length - requestsBeforeTracks,
				interaction: 'initial',
				surface: 'tracks'
			},
			{
				atRest: scrolledTrackRequests.length - requestsBeforeTrackScroll,
				interaction: 'scroll',
				surface: 'tracks'
			},
			{
				atRest: crateAtRestCoverRequests,
				interaction: 'initial',
				surface: 'crate-candidates'
			},
			{
				atRest: crateScrollCoverRequests,
				interaction: 'scroll',
				surface: 'crate-candidates'
			}
		]

		const metrics: WorkbenchRenderMetrics[] = [
			{
				breakpointMs: recordBreakpointMs,
				filterMs: recordFilterMs,
				initialRenderMs: recordInitialRenderMs,
				longTasks: recordLongTasks,
				mountedCovers: recordMountedCovers,
				mountedItems: recordMountedItems,
				retainedCovers: retainedRecordCovers,
				retainedItems: retainedRecordItems,
				responsiveRowTrees: recordResponsiveTrees,
				scrollMs: recordScrollMs,
				sortMs: recordSortMs,
				surface: 'records',
				viewport: 'desktop'
			},
			{
				breakpointMs: 0,
				filterMs: 0,
				initialRenderMs: coverViewInitialRenderMs,
				longTasks: recordLongTasks,
				mountedCovers: coverViewMountedCovers,
				mountedItems: coverViewMountedItems,
				retainedCovers: coverViewRetainedCovers,
				retainedItems: coverViewRetainedItems,
				responsiveRowTrees: 1,
				scrollMs: coverViewScrollMs,
				sortMs: 0,
				surface: 'record-covers',
				viewport: 'desktop'
			},
			{
				breakpointMs: trackBreakpointMs,
				filterMs: trackFilterMs,
				initialRenderMs: trackInitialRenderMs,
				longTasks: trackLongTasks,
				mountedCovers: trackMountedCovers,
				mountedItems: trackMountedItems,
				retainedCovers: retainedTrackCovers,
				retainedItems: retainedTrackItems,
				responsiveRowTrees: trackResponsiveTrees,
				scrollMs: trackScrollMs,
				sortMs: trackSortMs,
				surface: 'tracks',
				viewport: 'desktop'
			}
		]

		process.stdout.write(
			`${JSON.stringify({
				candidateMetrics,
				coverRequestMetrics,
				kind: 'workbench-rendering-performance',
				metrics,
				structuralBudget: renderingBudget.structural,
				timingReference: renderingBudget.timingReference
			})}\n`
		)
		for (const result of metrics) {
			expect(result.mountedItems, JSON.stringify(metrics)).toBeLessThanOrEqual(
				renderingBudget.structural.maxMountedItems
			)
			expect(result.retainedItems).toBeLessThanOrEqual(
				renderingBudget.structural.maxMountedItems
			)
			expect(result.mountedCovers).toBeLessThanOrEqual(
				renderingBudget.structural.maxMountedCovers
			)
			expect(result.retainedCovers).toBeLessThanOrEqual(
				renderingBudget.structural.maxMountedCovers
			)
			expect(result.responsiveRowTrees).toBeLessThanOrEqual(
				renderingBudget.structural.maxResponsiveRowTrees
			)
		}
		for (const result of candidateMetrics) {
			expect(result.mountedItems).toBeLessThanOrEqual(
				renderingBudget.structural.maxMountedItems
			)
			expect(result.retainedItems).toBeLessThanOrEqual(
				renderingBudget.structural.maxMountedItems
			)
			expect(result.mountedCovers).toBeLessThanOrEqual(
				renderingBudget.structural.maxMountedCovers
			)
		}
		for (const result of coverRequestMetrics) {
			const limit =
				result.interaction === 'initial'
					? renderingBudget.structural.maxSignedCoverRequestsAtRest
					: renderingBudget.structural.maxSignedCoverRequestsPerScroll
			expect(result.atRest).toBeLessThanOrEqual(limit)
		}
	}, 120_000)
})
