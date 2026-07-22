import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	type Browser,
	type BrowserContext,
	type BrowserType,
	type Page,
	chromium,
	firefox,
	webkit
} from 'playwright'
import { type ViteDevServer, createServer as createViteServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserRepositoryChange } from '../../app/repositories/library/browser/browserLibraryTypes'
import type {
	AdapterOutcomeSummary,
	AdapterSnapshotSummary,
	AdapterWorkspaceIdentity,
	BrowserLibraryAdapterHarness
} from './fixtures/browserLibraryAdapterHarness'

type EngineName = 'chromium' | 'firefox' | 'webkit'

type Engine = {
	name: EngineName
	type: BrowserType
	usePersistentContext?: boolean
}

type GuardedPage = {
	diagnostics: string[]
	page: Page
}

type LaunchedEngine = {
	browser: Browser | null
	context: BrowserContext
	profileDirectory: string | null
	version: string
}

const REPOSITORY_ROOT = dirname(
	dirname(dirname(fileURLToPath(import.meta.url)))
)
const HARNESS_PATH = '/test/e2e/fixtures/browserLibraryAdapterHarness.html'
const COVER_ASSET_ID = 'record-a/cover.webp'
const REQUIRE_FULL_MATRIX =
	process.env.BROWSER_LIBRARY_REQUIRE_FULL_MATRIX === '1'
const ENGINES: readonly Engine[] = [
	{ name: 'chromium', type: chromium },
	{ name: 'firefox', type: firefox },
	{ name: 'webkit', type: webkit, usePersistentContext: true }
]

let harnessOrigin = ''
let viteServer: ViteDevServer | null = null

function isEngineInstalled(engine: Engine): boolean {
	return existsSync(engine.type.executablePath())
}

function safePath(value: string): string {
	try {
		return new URL(value).pathname
	} catch {
		return value.slice(0, 300)
	}
}

function guardPage(page: Page, label: string): GuardedPage {
	const guarded = { diagnostics: [] as string[], page }
	page.on('pageerror', (error) => {
		guarded.diagnostics.push(`${label} pageerror: ${error.message}`)
	})
	page.on('console', (message) => {
		if (message.type() === 'error') {
			guarded.diagnostics.push(`${label} console.error: ${message.text()}`)
		}
	})
	page.on('requestfailed', (request) => {
		if (
			!['document', 'fetch', 'script', 'stylesheet', 'xhr'].includes(
				request.resourceType()
			)
		) {
			return
		}
		guarded.diagnostics.push(
			`${label} requestfailed: ${safePath(request.url())} (${request.failure()?.errorText ?? 'unknown failure'})`
		)
	})
	return guarded
}

async function invoke<TResult>(
	page: Page,
	command: keyof BrowserLibraryAdapterHarness,
	args: unknown[] = []
): Promise<TResult> {
	return page.evaluate(
		async ({ commandName, values }) => {
			const harness = (
				window as unknown as {
					__browserLibraryAdapterHarness: BrowserLibraryAdapterHarness
				}
			).__browserLibraryAdapterHarness
			const method = harness[commandName] as unknown as (
				...methodArgs: unknown[]
			) => unknown
			return await method(...values)
		},
		{ commandName: command, values: args }
	) as TResult
}

async function waitForHarness(page: Page) {
	await page.waitForFunction(
		() =>
			document.documentElement.dataset.browserLibraryAdapterHarness === 'ready'
	)
}

async function openHarnessPages(context: BrowserContext, engine: EngineName) {
	const pageA = context.pages()[0] ?? (await context.newPage())
	const pageB = await context.newPage()
	const guarded = [
		guardPage(pageA, `${engine} page A`),
		guardPage(pageB, `${engine} page B`)
	]
	await Promise.all(
		guarded.map(({ page }) =>
			page.goto(`${harnessOrigin}${HARNESS_PATH}`, {
				waitUntil: 'domcontentloaded'
			})
		)
	)
	await Promise.all(guarded.map(({ page }) => waitForHarness(page)))
	return { guarded, pageA, pageB }
}

async function waitForRepositoryEvent(
	page: Page,
	eventKey: string,
	type: BrowserRepositoryChange['type'],
	repositoryId: string
) {
	await page.waitForFunction(
		({ eventKey, repositoryId, type }) => {
			const harness = (
				window as unknown as {
					__browserLibraryAdapterHarness: BrowserLibraryAdapterHarness
				}
			).__browserLibraryAdapterHarness
			return harness
				.events(eventKey)
				.some(
					(event) => event.type === type && event.repositoryId === repositoryId
				)
		},
		{ eventKey, repositoryId, type }
	)
}

function databaseName(engine: EngineName, scenario: string): string {
	return `crate-guide-adapter-e2e-${engine}-${scenario}-${randomUUID()}`
}

async function createWorkspace(page: Page, database: string, label: string) {
	return invoke<AdapterWorkspaceIdentity>(page, 'createWorkspace', [
		database,
		'workspace-a',
		label
	])
}

async function proveSnapshotReload(
	page: Page,
	engine: EngineName,
	databases: Set<string>
) {
	const database = databaseName(engine, 'reload')
	databases.add(database)
	const identity = await createWorkspace(page, database, 'Reload library')
	await invoke(page, 'openRepository', ['reload', database, identity])
	const coverText = `adapter-cover-${engine}`
	expect(
		await invoke<AdapterOutcomeSummary>(page, 'replaceSnapshot', [
			'reload',
			'Persisted release',
			coverText
		])
	).toEqual({ status: 'success' })
	expect(await invoke(page, 'manifest', ['reload'])).toMatchObject({
		contentRevision: 1,
		repositoryRevision: 1
	})
	await invoke(page, 'closeRepository', ['reload'])

	await page.reload({ waitUntil: 'domcontentloaded' })
	await waitForHarness(page)
	await invoke(page, 'openRepository', ['reload-reopened', database, identity])
	const snapshot = await invoke<AdapterSnapshotSummary>(page, 'readSnapshot', [
		'reload-reopened'
	])
	expect(snapshot).toEqual({
		status: 'success',
		contentRevision: 1,
		durableRepositoryRevision: 1,
		coverCompleteness: 'complete',
		recordCount: 1,
		trackCount: 1,
		recordTitle: 'Persisted release',
		trackRecordId: 'record-a',
		crateRecordIds: ['record-a'],
		preferences: {
			ui_theme: 'auto',
			key_format: 'camelot',
			list_layout: 'cover',
			selected_crate: 'crate-a',
			turntable_pitch_range: 8,
			turntable_theme: 'black'
		},
		cover: {
			size: coverText.length,
			text: coverText,
			type: 'image/webp'
		}
	})
	await invoke(page, 'closeRepository', ['reload-reopened'])
}

async function proveContentCasAndOperationalRebase(
	pageA: Page,
	pageB: Page,
	engine: EngineName,
	databases: Set<string>
) {
	const database = databaseName(engine, 'cas-rebase')
	databases.add(database)
	const identity = await createWorkspace(pageA, database, 'CAS library')
	await Promise.all([
		invoke(pageA, 'openRepository', ['cas-a', database, identity]),
		invoke(pageB, 'openRepository', ['cas-b', database, identity])
	])

	expect(
		await invoke<AdapterOutcomeSummary>(pageA, 'updatePreferences', [
			'cas-a',
			{ ui_theme: 'dark' }
		])
	).toMatchObject({ status: 'success', value: { ui_theme: 'dark' } })
	expect(
		await invoke<AdapterOutcomeSummary>(pageB, 'updatePreferences', [
			'cas-b',
			{ key_format: 'key' }
		])
	).toEqual({
		status: 'conflict',
		reason: 'revision-mismatch',
		currentRepositoryRevision: 1
	})
	expect(await invoke(pageB, 'recoverRepository', ['cas-b'])).toMatchObject({
		status: 'recovered',
		health: { code: 'healthy' }
	})
	expect(
		await invoke<AdapterOutcomeSummary>(pageB, 'updatePreferences', [
			'cas-b',
			{ key_format: 'key' }
		])
	).toMatchObject({ status: 'success', value: { key_format: 'key' } })
	await Promise.all([
		invoke(pageA, 'closeRepository', ['cas-a']),
		invoke(pageB, 'closeRepository', ['cas-b'])
	])

	await invoke(pageA, 'openRepository', ['rebase', database, identity])
	const beforeOperational = (await invoke(pageA, 'manifest', ['rebase'])) as {
		contentRevision: number
		repositoryRevision: number
	}
	expect(beforeOperational).toMatchObject({
		contentRevision: 2,
		repositoryRevision: 2
	})
	const exported = await invoke<{
		repositoryRevision: number
		value: { lastExportedContentRevision: number; lastExportedAt: string }
	}>(pageB, 'recordExport', [
		database,
		identity,
		beforeOperational.contentRevision,
		beforeOperational.repositoryRevision
	])
	expect(exported).toMatchObject({
		repositoryRevision: 3,
		value: {
			lastExportedContentRevision: 2,
			lastExportedAt: '2026-07-23T06:00:00.000Z'
		}
	})
	expect(
		await invoke<AdapterOutcomeSummary>(pageA, 'updatePreferences', [
			'rebase',
			{ list_layout: 'compact' }
		])
	).toMatchObject({ status: 'success', value: { list_layout: 'compact' } })
	expect(await invoke(pageA, 'manifest', ['rebase'])).toMatchObject({
		contentRevision: 3,
		repositoryRevision: 4
	})
	expect(
		await invoke(pageB, 'readOperations', [database, identity])
	).toMatchObject({
		repositoryRevision: 4,
		value: {
			lastExportedContentRevision: 2,
			lastExportedAt: '2026-07-23T06:00:00.000Z'
		}
	})
	expect(
		await invoke<AdapterSnapshotSummary>(pageA, 'readSnapshot', ['rebase'])
	).toMatchObject({
		status: 'success',
		contentRevision: 3,
		durableRepositoryRevision: 4,
		preferences: {
			ui_theme: 'dark',
			key_format: 'key',
			list_layout: 'compact'
		}
	})
	await invoke(pageA, 'closeRepository', ['rebase'])
}

async function proveBroadcastResetAndDelete(
	pageA: Page,
	pageB: Page,
	engine: EngineName,
	databases: Set<string>
) {
	const database = databaseName(engine, 'broadcast')
	databases.add(database)
	const identity = await createWorkspace(pageA, database, 'Broadcast library')
	await Promise.all([
		invoke(pageA, 'openRepository', ['broadcast-a', database, identity]),
		invoke(pageB, 'openRepository', ['broadcast-b', database, identity])
	])
	await invoke(pageB, 'subscribeRepository', ['broadcast-b', 'remote-events'])

	expect(
		await invoke<AdapterOutcomeSummary>(pageA, 'replaceSnapshot', [
			'broadcast-a',
			'Remote reset',
			'broadcast-cover'
		])
	).toEqual({ status: 'success' })
	await waitForRepositoryEvent(
		pageB,
		'remote-events',
		'reset',
		identity.repositoryId
	)
	const resetEvents = await invoke<BrowserRepositoryChange[]>(pageB, 'events', [
		'remote-events'
	])
	const reset = resetEvents.find((event) => event.type === 'reset')
	expect(reset).toMatchObject({
		workspaceId: identity.workspaceId,
		repositoryId: identity.repositoryId,
		repositoryRevision: 1,
		contentRevision: 1,
		invalidations: expect.arrayContaining([
			{ entity: 'records', ids: ['record-a'] },
			{ entity: 'covers', ids: [COVER_ASSET_ID] }
		])
	})
	expect(
		await invoke<AdapterOutcomeSummary>(pageB, 'updatePreferences', [
			'broadcast-b',
			{ ui_theme: 'dark' }
		])
	).toEqual({
		status: 'conflict',
		reason: 'revision-mismatch',
		currentRepositoryRevision: 1
	})

	await invoke(pageA, 'deleteWorkspace', [
		database,
		{
			...identity,
			repositoryRevision: 1
		}
	])
	await waitForRepositoryEvent(
		pageB,
		'remote-events',
		'delete',
		identity.repositoryId
	)
	const events = await invoke<BrowserRepositoryChange[]>(pageB, 'events', [
		'remote-events'
	])
	const deletion = events.find((event) => event.type === 'delete')
	expect(deletion).toMatchObject({
		workspaceId: identity.workspaceId,
		repositoryId: identity.repositoryId,
		repositoryRevision: null,
		contentRevision: null
	})
	expect(
		await invoke<AdapterOutcomeSummary>(pageB, 'updatePreferences', [
			'broadcast-b',
			{ ui_theme: 'light' }
		])
	).toEqual({
		status: 'conflict',
		reason: 'not-found'
	})
	expect(
		events
			.filter((event) => event.type === 'reset' || event.type === 'delete')
			.every((event) => event.repositoryId === identity.repositoryId)
	).toBe(true)
}

async function expectOperationBlocked(page: Page, operationId: string) {
	await page.waitForTimeout(100)
	expect(await invoke(page, 'pending', [operationId])).toEqual({
		error: null,
		result: null,
		settled: false
	})
}

async function proveProductionWideLocks(
	pageA: Page,
	pageB: Page,
	engine: EngineName,
	databases: Set<string>
) {
	const database = databaseName(engine, 'wide-lock')
	databases.add(database)
	const identity = await createWorkspace(pageA, database, 'Wide lock library')
	await invoke(pageB, 'openRepository', ['wide-repository', database, identity])

	const restoreLock = await invoke<string>(pageA, 'holdWideLock', [
		'restore-lock',
		database,
		identity.workspaceId
	])
	expect(restoreLock).toBe(
		`${database}:workspace:${identity.workspaceId}:wide-write`
	)
	await invoke(pageB, 'startReplaceSnapshot', [
		'restore-operation',
		'wide-repository',
		'Locked restore',
		'locked-cover'
	])
	await expectOperationBlocked(pageB, 'restore-operation')
	await invoke(pageA, 'releaseWideLock', ['restore-lock'])
	expect(await invoke(pageB, 'awaitPending', ['restore-operation'])).toEqual({
		error: null,
		result: { status: 'success' },
		settled: true
	})
	expect(await invoke(pageB, 'manifest', ['wide-repository'])).toMatchObject({
		contentRevision: 1,
		repositoryRevision: 1
	})
	await invoke(pageB, 'closeRepository', ['wide-repository'])

	await invoke(pageB, 'openCatalog', ['wide-catalog', database])
	const deleteLock = await invoke<string>(pageA, 'holdWideLock', [
		'delete-lock',
		database,
		identity.workspaceId
	])
	expect(deleteLock).toBe(restoreLock)
	await invoke(pageB, 'startCatalogDelete', [
		'delete-operation',
		'wide-catalog',
		{ ...identity, repositoryRevision: 1 }
	])
	await expectOperationBlocked(pageB, 'delete-operation')
	await invoke(pageA, 'releaseWideLock', ['delete-lock'])
	expect(await invoke(pageB, 'awaitPending', ['delete-operation'])).toEqual({
		error: null,
		result: { catalogRevision: 2 },
		settled: true
	})
	await invoke(pageB, 'closeCatalog', ['wide-catalog'])
}

async function proveVersionChangeRecovery(
	pageA: Page,
	pageB: Page,
	engine: EngineName,
	databases: Set<string>
) {
	const database = databaseName(engine, 'versionchange')
	databases.add(database)
	const identity = await createWorkspace(pageA, database, 'Upgrade library')
	await invoke(pageA, 'openRepository', [
		'upgrade-repository',
		database,
		identity
	])
	const aborted = await invoke<{
		blocked: boolean
		errorName: string
		upgradeStarted: boolean
	}>(pageB, 'triggerAbortedUpgrade', [database])
	expect(aborted).toMatchObject({
		errorName: 'AbortError',
		upgradeStarted: true
	})
	await pageA.waitForFunction(() => {
		const harness = (
			window as unknown as {
				__browserLibraryAdapterHarness: BrowserLibraryAdapterHarness
			}
		).__browserLibraryAdapterHarness
		return harness.lifecycle('upgrade-repository').blockingUpgrade > 0
	})
	expect(
		await invoke(pageA, 'lifecycle', ['upgrade-repository'])
	).toMatchObject({
		blockingUpgrade: 1
	})
	expect(
		await invoke<AdapterOutcomeSummary>(pageA, 'updatePreferences', [
			'upgrade-repository',
			{ ui_theme: 'dark' }
		])
	).toMatchObject({ status: 'unavailable', reason: 'read-only' })
	expect(
		await invoke(pageA, 'recoverRepository', ['upgrade-repository'])
	).toMatchObject({ status: 'recovered', health: { code: 'healthy' } })
	expect(await invoke(pageB, 'databaseVersion', [database])).toBe(1)
	expect(
		await invoke<AdapterOutcomeSummary>(pageA, 'updatePreferences', [
			'upgrade-repository',
			{ ui_theme: 'dark' }
		])
	).toMatchObject({ status: 'success', value: { ui_theme: 'dark' } })
	expect(await invoke(pageA, 'manifest', ['upgrade-repository'])).toMatchObject(
		{
			contentRevision: 1,
			repositoryRevision: 1
		}
	)
}

async function launchEngine(engine: Engine): Promise<LaunchedEngine> {
	if (engine.usePersistentContext) {
		const profileDirectory = await mkdtemp(
			join(tmpdir(), 'crate-guide-adapter-webkit-')
		)
		try {
			const context = await engine.type.launchPersistentContext(
				profileDirectory,
				{ headless: true }
			)
			return {
				browser: null,
				context,
				profileDirectory,
				version: context.browser()?.version() ?? ''
			}
		} catch (error) {
			await rm(profileDirectory, { force: true, recursive: true })
			throw error
		}
	}

	const browser = await engine.type.launch({ headless: true })
	try {
		return {
			browser,
			context: await browser.newContext(),
			profileDirectory: null,
			version: browser.version()
		}
	} catch (error) {
		await browser.close()
		throw error
	}
}

async function runAdapterMatrix(engine: Engine) {
	let launched: LaunchedEngine | null = null
	let pages: Awaited<ReturnType<typeof openHarnessPages>> | null = null
	let primaryError: unknown = null
	const cleanupErrors: unknown[] = []
	const databases = new Set<string>()

	try {
		launched = await launchEngine(engine)
		expect(launched.version).not.toBe('')
		pages = await openHarnessPages(launched.context, engine.name)
		await proveSnapshotReload(pages.pageA, engine.name, databases)
		await proveContentCasAndOperationalRebase(
			pages.pageA,
			pages.pageB,
			engine.name,
			databases
		)
		await proveBroadcastResetAndDelete(
			pages.pageA,
			pages.pageB,
			engine.name,
			databases
		)
		await proveProductionWideLocks(
			pages.pageA,
			pages.pageB,
			engine.name,
			databases
		)
		await proveVersionChangeRecovery(
			pages.pageA,
			pages.pageB,
			engine.name,
			databases
		)
	} catch (error) {
		primaryError = error
	} finally {
		if (pages) {
			const closed = await Promise.allSettled([
				invoke(pages.pageA, 'closeAll'),
				invoke(pages.pageB, 'closeAll')
			])
			for (const result of closed) {
				if (result.status === 'rejected') cleanupErrors.push(result.reason)
			}
			for (const database of databases) {
				try {
					await invoke(pages.pageA, 'deleteDatabase', [database])
				} catch (error) {
					cleanupErrors.push(error)
				}
			}
		}
		if (launched) {
			try {
				await launched.context.close()
			} catch (error) {
				cleanupErrors.push(error)
			}
			try {
				await launched.browser?.close()
			} catch (error) {
				cleanupErrors.push(error)
			}
			if (launched.profileDirectory) {
				try {
					await rm(launched.profileDirectory, {
						force: true,
						recursive: true
					})
				} catch (error) {
					cleanupErrors.push(error)
				}
			}
		}
	}

	const diagnostics = pages?.guarded.flatMap((page) => page.diagnostics) ?? []
	const failures = [
		...(primaryError ? [primaryError] : []),
		...cleanupErrors,
		...(diagnostics.length
			? [
					new Error(
						`Unexpected ${engine.name} browser diagnostics:\n${diagnostics.join('\n')}`
					)
				]
			: [])
	]
	if (failures.length === 1) throw failures[0]
	if (failures.length > 1) {
		throw new AggregateError(
			failures,
			`${engine.name} adapter matrix and cleanup failures`
		)
	}
}

beforeAll(async () => {
	const server = await createViteServer({
		appType: 'mpa',
		configFile: false,
		logLevel: 'silent',
		root: REPOSITORY_ROOT,
		resolve: {
			alias: [
				{ find: /^~~\//, replacement: `${REPOSITORY_ROOT}/` },
				{ find: /^~\//, replacement: `${REPOSITORY_ROOT}/app/` }
			]
		},
		server: { host: '127.0.0.1', port: 0, strictPort: false }
	})
	viteServer = server
	await server.listen()
	const address = server.httpServer?.address()
	if (!address || typeof address === 'string') {
		await server.close()
		viteServer = null
		throw new Error('The adapter harness server did not expose a TCP address.')
	}
	harnessOrigin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
	const server = viteServer
	viteServer = null
	await server?.close()
})

describe.sequential('browser library actual-adapter engine matrix', () => {
	for (const engine of ENGINES) {
		it.skipIf(!REQUIRE_FULL_MATRIX && !isEngineInstalled(engine))(
			`proves multi-page adapter behavior in ${engine.name}`,
			() => runAdapterMatrix(engine),
			120_000
		)
	}
})
