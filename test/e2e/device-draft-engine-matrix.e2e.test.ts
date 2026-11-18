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
import {
	BROWSER_LIBRARY_SCHEMA_VERSION,
	type BrowserRepositoryChange
} from '../../app/repositories/library/browser/browserLibraryTypes'
import type { DeviceDraftEngineHarness } from './fixtures/deviceDraftEngineHarness'

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
const HARNESS_PATH = '/test/e2e/fixtures/deviceDraftEngineHarness.html'
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
	command: keyof DeviceDraftEngineHarness,
	args: unknown[] = []
): Promise<TResult> {
	return page.evaluate(
		async ({ commandName, values }) => {
			const harness = (
				window as unknown as {
					__deviceDraftEngineHarness: DeviceDraftEngineHarness
				}
			).__deviceDraftEngineHarness
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
		() => document.documentElement.dataset.deviceDraftEngineHarness === 'ready'
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

async function waitForDraftEvent(
	page: Page,
	eventKey: string,
	repositoryId: string,
	minimumCount: number
) {
	await page.waitForFunction(
		({ eventKey, minimumCount, repositoryId }) => {
			const harness = (
				window as unknown as {
					__deviceDraftEngineHarness: DeviceDraftEngineHarness
				}
			).__deviceDraftEngineHarness
			return (
				harness
					.events(eventKey)
					.filter(
						(event) =>
							event.type === 'commit' &&
							event.repositoryId === repositoryId &&
							event.invalidations.some(
								(invalidation) => invalidation.entity === 'drafts'
							)
					).length >= minimumCount
			)
		},
		{ eventKey, minimumCount, repositoryId }
	)
}

function databaseName(engine: EngineName, scenario: string): string {
	return `crate-guide-device-draft-e2e-${engine}-${scenario}-${randomUUID()}`
}

async function proveDraftLeaseFencing(
	pageA: Page,
	pageB: Page,
	engine: EngineName,
	databases: Set<string>
) {
	const database = databaseName(engine, 'draft-leases')
	databases.add(database)
	const identity = {
		workspaceId: 'cloud-workspace-a',
		repositoryId: 'cloud-repository-a'
	}
	await Promise.all([
		invoke(pageA, 'setClock', [database, '2026-07-23T06:00:00.000Z']),
		invoke(pageB, 'setClock', [database, '2026-07-23T06:00:00.000Z'])
	])
	await Promise.all([
		invoke(pageA, 'openDeviceDraftRepository', [
			'draft-repository-a',
			database,
			identity
		]),
		invoke(pageB, 'openDeviceDraftRepository', [
			'draft-repository-b',
			database,
			identity
		])
	])
	await Promise.all([
		invoke(pageA, 'subscribeDeviceDraftRepository', [
			'draft-repository-a',
			'draft-events-a'
		]),
		invoke(pageB, 'subscribeDeviceDraftRepository', [
			'draft-repository-b',
			'draft-events-b'
		])
	])
	const ownerA = 'engine-owner-a-secret'
	const ownerB = 'engine-owner-b-secret'
	const ownerC = 'engine-owner-c-secret'

	const created = await invoke<{
		deviceRevision: number
		value: {
			draft: { draftRevision: number }
			lease: { leaseRevision: number }
		}
	}>(pageA, 'createDraftAndClaim', ['draft-repository-a', ownerA, 0])
	expect(created).toMatchObject({
		deviceRevision: 1,
		value: { draft: { draftRevision: 0 }, lease: { leaseRevision: 0 } }
	})
	await waitForDraftEvent(pageB, 'draft-events-b', identity.repositoryId, 1)
	expect(
		await invoke(pageB, 'readDraft', ['draft-repository-b', 'draft-a'])
	).toMatchObject({
		deviceRevision: 1,
		value: {
			draft: { status: 'ready', metadata: { draftRevision: 0 } },
			lease: { status: 'live', lease: { leaseRevision: 0 } }
		}
	})

	const takenOver = await invoke<{
		deviceRevision: number
		value: { lease: { leaseRevision: number } }
	}>(pageB, 'takeOverDraft', ['draft-repository-b', 'draft-a', ownerB, 1, 0])
	expect(takenOver).toMatchObject({
		deviceRevision: 2,
		value: { lease: { leaseRevision: 1 } }
	})
	await waitForDraftEvent(pageA, 'draft-events-a', identity.repositoryId, 2)
	const rejectedA = await invoke<unknown[]>(pageA, 'attemptOldOwnerMutations', [
		'draft-repository-a',
		'draft-a',
		ownerA,
		2,
		1
	])
	expect(rejectedA).toHaveLength(3)
	for (const outcome of rejectedA) {
		expect(outcome).toMatchObject({
			status: 'rejected',
			error: { code: 'conflict', scope: 'draft-lease' }
		})
	}

	await Promise.all([
		invoke(pageA, 'setClock', [database, '2026-07-23T06:01:00.000Z']),
		invoke(pageB, 'setClock', [database, '2026-07-23T06:01:00.000Z'])
	])
	expect(
		await invoke(pageA, 'readDraft', ['draft-repository-a', 'draft-a'])
	).toMatchObject({
		deviceRevision: 2,
		value: { lease: { status: 'expired', lease: { leaseRevision: 1 } } }
	})
	const claimedAfterExpiry = await invoke<{
		deviceRevision: number
		value: { lease: { leaseRevision: number } }
	}>(pageA, 'claimDraft', ['draft-repository-a', 'draft-a', ownerC, 2])
	expect(claimedAfterExpiry).toMatchObject({
		deviceRevision: 3,
		value: { lease: { leaseRevision: 2 } }
	})
	await waitForDraftEvent(pageB, 'draft-events-b', identity.repositoryId, 3)
	const rejectedB = await invoke<unknown[]>(pageB, 'attemptOldOwnerMutations', [
		'draft-repository-b',
		'draft-a',
		ownerB,
		3,
		2
	])
	for (const outcome of rejectedB) {
		expect(outcome).toMatchObject({
			status: 'rejected',
			error: { code: 'conflict', scope: 'draft-lease' }
		})
	}

	const eventsA = await invoke<BrowserRepositoryChange[]>(pageA, 'events', [
		'draft-events-a'
	])
	const eventsB = await invoke<BrowserRepositoryChange[]>(pageB, 'events', [
		'draft-events-b'
	])
	for (const event of [...eventsA, ...eventsB]) {
		expect(event).toMatchObject({
			workspaceId: identity.workspaceId,
			repositoryId: identity.repositoryId,
			repositoryRevision: null,
			contentRevision: null
		})
	}
	const observable = JSON.stringify({
		rejectedA,
		rejectedB,
		eventsA,
		eventsB
	})
	for (const owner of [ownerA, ownerB, ownerC]) {
		expect(observable).not.toContain(owner)
	}
	await Promise.all([
		invoke(pageA, 'closeDeviceDraftRepository', ['draft-repository-a']),
		invoke(pageB, 'closeDeviceDraftRepository', ['draft-repository-b'])
	])
}

async function proveVersionChangeRecovery(
	pageA: Page,
	pageB: Page,
	engine: EngineName,
	databases: Set<string>
) {
	const database = databaseName(engine, 'versionchange')
	databases.add(database)
	const identity = {
		workspaceId: 'cloud-workspace-upgrade',
		repositoryId: 'cloud-repository-upgrade'
	}
	const owner = 'upgrade-owner-secret'
	await Promise.all([
		invoke(pageA, 'setClock', [database, '2026-07-23T06:00:00.000Z']),
		invoke(pageB, 'setClock', [database, '2026-07-23T06:00:00.000Z'])
	])
	await invoke(pageA, 'openDeviceDraftRepository', [
		'upgrade-repository',
		database,
		identity
	])
	expect(
		await invoke(pageA, 'createDraftAndClaim', ['upgrade-repository', owner, 0])
	).toMatchObject({
		deviceRevision: 1,
		value: { draft: { draftRevision: 0 }, lease: { leaseRevision: 0 } }
	})

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
				__deviceDraftEngineHarness: DeviceDraftEngineHarness
			}
		).__deviceDraftEngineHarness
		return harness.lifecycle('upgrade-repository').blockingUpgrade > 0
	})
	expect(
		await invoke(pageA, 'lifecycle', ['upgrade-repository'])
	).toMatchObject({ blockingUpgrade: 1 })

	// The versionchange handler closed the stale connection, so it must fail
	// closed for both reads and lease writes instead of committing anything.
	expect(
		await invoke(pageA, 'readDraftOutcome', ['upgrade-repository', 'draft-a'])
	).toMatchObject({ status: 'rejected', error: { code: 'unavailable' } })
	await Promise.all([
		invoke(pageA, 'setClock', [database, '2026-07-23T06:00:20.000Z']),
		invoke(pageB, 'setClock', [database, '2026-07-23T06:00:20.000Z'])
	])
	expect(
		await invoke(pageA, 'renewDraftLease', [
			'upgrade-repository',
			'draft-a',
			owner,
			1,
			0
		])
	).toMatchObject({ status: 'rejected', error: { code: 'unavailable' } })
	expect(await invoke(pageB, 'databaseVersion', [database])).toBe(
		BROWSER_LIBRARY_SCHEMA_VERSION
	)

	// Device drafts recover by reopening; the aborted upgrade left the draft,
	// its lease, and the device revision untouched.
	await invoke(pageB, 'openDeviceDraftRepository', [
		'upgrade-observer',
		database,
		identity
	])
	const intact = {
		deviceRevision: 1,
		value: {
			draft: { status: 'ready', metadata: { draftRevision: 0 } },
			lease: { status: 'live', lease: { leaseRevision: 0 } }
		}
	}
	expect(
		await invoke(pageB, 'readDraft', ['upgrade-observer', 'draft-a'])
	).toMatchObject(intact)
	await invoke(pageA, 'openDeviceDraftRepository', [
		'upgrade-repository',
		database,
		identity
	])
	expect(
		await invoke(pageA, 'readDraft', ['upgrade-repository', 'draft-a'])
	).toMatchObject(intact)
	expect(
		await invoke(pageA, 'renewDraftLease', [
			'upgrade-repository',
			'draft-a',
			owner,
			1,
			0
		])
	).toMatchObject({
		status: 'success',
		value: {
			deviceRevision: 2,
			value: {
				leaseRevision: 1,
				renewedAt: '2026-07-23T06:00:20.000Z'
			}
		}
	})
	expect(await invoke(pageB, 'databaseVersion', [database])).toBe(
		BROWSER_LIBRARY_SCHEMA_VERSION
	)
	await Promise.all([
		invoke(pageA, 'closeDeviceDraftRepository', ['upgrade-repository']),
		invoke(pageB, 'closeDeviceDraftRepository', ['upgrade-observer'])
	])
}

async function launchEngine(engine: Engine): Promise<LaunchedEngine> {
	if (engine.usePersistentContext) {
		const profileDirectory = await mkdtemp(
			join(tmpdir(), 'crate-guide-device-draft-webkit-')
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

async function runDeviceDraftMatrix(engine: Engine) {
	let launched: LaunchedEngine | null = null
	let pages: Awaited<ReturnType<typeof openHarnessPages>> | null = null
	let primaryError: unknown = null
	const cleanupErrors: unknown[] = []
	const databases = new Set<string>()

	try {
		launched = await launchEngine(engine)
		expect(launched.version).not.toBe('')
		pages = await openHarnessPages(launched.context, engine.name)
		await proveDraftLeaseFencing(
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
			`${engine.name} device draft matrix and cleanup failures`
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
		throw new Error(
			'The device draft harness server did not expose a TCP address.'
		)
	}
	harnessOrigin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
	const server = viteServer
	viteServer = null
	await server?.close()
})

describe.sequential('device draft repository engine matrix', () => {
	for (const engine of ENGINES) {
		it.skipIf(!REQUIRE_FULL_MATRIX && !isEngineInstalled(engine))(
			`proves multi-page device draft behavior in ${engine.name}`,
			() => runDeviceDraftMatrix(engine),
			120_000
		)
	}
})
