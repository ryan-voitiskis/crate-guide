import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { type Server, createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	type Browser,
	type BrowserContext,
	type BrowserType,
	type Page,
	chromium,
	firefox,
	webkit
} from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

type EngineName = 'chromium' | 'firefox' | 'webkit'
type StorageContext = 'ephemeral' | 'persistent-headed' | 'persistent-headless'

type BlobProbe =
	| { status: 'success'; text: string }
	| { status: 'unavailable'; message: string }

type EngineProbe = {
	blob: BlobProbe
	broadcastMessage: string
	context: StorageContext
	databaseNamesSupported: boolean
	engine: EngineName
	estimate: { quota: number | null; usage: number | null } | null
	indexedDbSupported: boolean
	upgradeRecovery: {
		blocked: boolean
		completedAfterRelease: boolean
		versionChangeObserved: boolean
	}
	userAgent: string
	webLockSerialized: boolean
	version: string
	webLocksSupported: boolean
}

type ProbeWindow = Window & {
	__browserLibraryProbeBlockingDatabase?: IDBDatabase
	__browserLibraryProbeChannel?: BroadcastChannel
	__browserLibraryProbeSenderChannel?: BroadcastChannel
	__browserLibraryProbeFirstLock?: Promise<void>
	__browserLibraryProbeFirstLockAcquired?: boolean
	__browserLibraryProbeMessage?: string
	__browserLibraryProbeReleaseFirstLock?: () => void
	__browserLibraryProbeSecondLock?: Promise<void>
	__browserLibraryProbeSecondLockAcquired?: boolean
	__browserLibraryProbeUpgradeBlocked?: boolean
	__browserLibraryProbeUpgradeComplete?: boolean
	__browserLibraryProbeUpgradeDatabase?: IDBDatabase
	__browserLibraryProbeUpgradeError?: string
	__browserLibraryProbeUpgradeRequest?: IDBOpenDBRequest
	__browserLibraryProbeVersionChange?: boolean
}

const engines: ReadonlyArray<{
	name: EngineName
	type: BrowserType
}> = [
	{ name: 'chromium', type: chromium },
	{ name: 'firefox', type: firefox },
	{ name: 'webkit', type: webkit }
]
const requireFullMatrix =
	process.env.BROWSER_LIBRARY_REQUIRE_FULL_MATRIX === '1'
let probeOrigin = ''
let probeServer: Server | null = null
const probeDiagnostics = new Map<Page, string[]>()

function guardProbePage(page: Page, label: string) {
	const diagnostics: string[] = []
	probeDiagnostics.set(page, diagnostics)
	page.on('pageerror', (error) => {
		diagnostics.push(`${label} pageerror: ${error.message}`)
	})
	page.on('console', (message) => {
		if (message.type() === 'error') {
			diagnostics.push(`${label} console.error: ${message.text()}`)
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
		diagnostics.push(
			`${label} requestfailed: ${new URL(request.url()).pathname} (${request.failure()?.errorText ?? 'unknown failure'})`
		)
	})
}

function isEngineInstalled(type: BrowserType) {
	return existsSync(type.executablePath())
}

beforeAll(async () => {
	await new Promise<void>((resolve, reject) => {
		const server = createServer((_request, response) => {
			response.writeHead(200, {
				'Cache-Control': 'no-store',
				'Content-Type': 'text/html; charset=utf-8'
			})
			response.end('<!doctype html><title>Crate Guide storage probe</title>')
		})
		probeServer = server
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject)
			const address = server.address()
			if (!address || typeof address === 'string') {
				reject(new Error('Storage probe server did not expose a TCP address.'))
				return
			}
			probeOrigin = `http://127.0.0.1:${address.port}`
			resolve()
		})
	})
})

afterAll(async () => {
	const server = probeServer
	probeServer = null
	if (!server) return
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()))
	})
})

afterEach(() => {
	const diagnostics = [...probeDiagnostics.values()].flat()
	probeDiagnostics.clear()
	if (diagnostics.length > 0) {
		throw new Error(
			`Unexpected storage-probe browser diagnostics:\n${diagnostics.join('\n')}`
		)
	}
})

async function openProbePages(context: BrowserContext) {
	const pageA = await context.newPage()
	const pageB = await context.newPage()
	// This is a minimal loopback capability probe rather than a Nuxt page, so it
	// cannot use createErrorAwarePage(). Keep the same fail-on-browser-error
	// contract on both raw Playwright pages.
	guardProbePage(pageA, 'page A')
	guardProbePage(pageB, 'page B')
	await Promise.all([
		pageA.goto(probeOrigin, { waitUntil: 'domcontentloaded' }),
		pageB.goto(probeOrigin, { waitUntil: 'domcontentloaded' })
	])
	return { pageA, pageB }
}

async function roundTripBlob(page: Page, databaseName: string) {
	return page.evaluate(async (name): Promise<BlobProbe> => {
		function requestResult<T>(
			request: IDBRequest<T>,
			label: string
		): Promise<T> {
			return new Promise((resolve, reject) => {
				request.onsuccess = () => resolve(request.result)
				request.onerror = () =>
					reject(
						new Error(
							`${label}: ${request.error?.name ?? 'unknown'}: ${request.error?.message ?? 'No IndexedDB error detail.'}`
						)
					)
			})
		}

		function transactionComplete(
			transaction: IDBTransaction,
			label: string
		): Promise<void> {
			return new Promise((resolve, reject) => {
				transaction.oncomplete = () => resolve()
				transaction.onabort = () =>
					reject(
						new Error(
							`${label} aborted: ${transaction.error?.name ?? 'unknown'}: ${transaction.error?.message ?? 'No IndexedDB error detail.'}`
						)
					)
				transaction.onerror = () => undefined
			})
		}

		let database: IDBDatabase | null = null
		let readDatabase: IDBDatabase | null = null
		try {
			const openRequest = indexedDB.open(name, 1)
			openRequest.onupgradeneeded = () => {
				openRequest.result.createObjectStore('covers')
			}
			database = await requestResult(openRequest, 'open for Blob write')
			const write = database.transaction('covers', 'readwrite')
			const writeComplete = transactionComplete(write, 'Blob write')
			const putRequest = write
				.objectStore('covers')
				.put(
					new Blob(['crate-guide-browser-cover'], { type: 'image/webp' }),
					'cover-1'
				)
			await Promise.all([
				requestResult(putRequest, 'put Blob value'),
				writeComplete
			])
			database.close()
			database = null

			readDatabase = await requestResult(
				indexedDB.open(name),
				'open for Blob read'
			)
			const read = readDatabase.transaction('covers', 'readonly')
			const readComplete = transactionComplete(read, 'Blob read')
			const [blob] = await Promise.all([
				requestResult<Blob>(
					read.objectStore('covers').get('cover-1'),
					'read Blob value'
				),
				readComplete
			])
			return { status: 'success', text: await blob.text() }
		} catch (error) {
			return {
				status: 'unavailable',
				message: error instanceof Error ? error.message : String(error)
			}
		} finally {
			database?.close()
			readDatabase?.close()
		}
	}, databaseName)
}

async function broadcastAcrossPages(
	pages: Awaited<ReturnType<typeof openProbePages>>,
	channelName: string
) {
	await pages.pageB.evaluate((name) => {
		const probeWindow = window as ProbeWindow
		probeWindow.__browserLibraryProbeMessage = undefined
		probeWindow.__browserLibraryProbeChannel?.close()
		const channel = new BroadcastChannel(name)
		probeWindow.__browserLibraryProbeChannel = channel
		channel.onmessage = (event: MessageEvent<unknown>) => {
			if (typeof event.data === 'string')
				probeWindow.__browserLibraryProbeMessage = event.data
		}
	}, channelName)

	try {
		await pages.pageA.evaluate((name) => {
			const probeWindow = window as ProbeWindow
			probeWindow.__browserLibraryProbeSenderChannel?.close()
			const channel = new BroadcastChannel(name)
			probeWindow.__browserLibraryProbeSenderChannel = channel
			channel.postMessage('committed:revision-2')
		}, channelName)
		await pages.pageB.waitForFunction(
			() =>
				(window as ProbeWindow).__browserLibraryProbeMessage ===
				'committed:revision-2'
		)
		return pages.pageB.evaluate(
			() => (window as ProbeWindow).__browserLibraryProbeMessage ?? ''
		)
	} finally {
		await pages.pageA
			.evaluate(() => {
				const probeWindow = window as ProbeWindow
				probeWindow.__browserLibraryProbeSenderChannel?.close()
				probeWindow.__browserLibraryProbeSenderChannel = undefined
			})
			.catch(() => undefined)
	}
}

async function serializeAcrossPages(
	pages: Awaited<ReturnType<typeof openProbePages>>,
	lockName: string
) {
	await pages.pageA.evaluate((name) => {
		const probeWindow = window as ProbeWindow
		probeWindow.__browserLibraryProbeFirstLockAcquired = false
		probeWindow.__browserLibraryProbeFirstLock = navigator.locks.request(
			name,
			async () => {
				probeWindow.__browserLibraryProbeFirstLockAcquired = true
				await new Promise<void>((resolve) => {
					probeWindow.__browserLibraryProbeReleaseFirstLock = resolve
				})
			}
		)
	}, lockName)
	await pages.pageA.waitForFunction(
		() =>
			(window as ProbeWindow).__browserLibraryProbeFirstLockAcquired === true
	)

	await pages.pageB.evaluate((name) => {
		const probeWindow = window as ProbeWindow
		probeWindow.__browserLibraryProbeSecondLockAcquired = false
		probeWindow.__browserLibraryProbeSecondLock = navigator.locks.request(
			name,
			() => {
				probeWindow.__browserLibraryProbeSecondLockAcquired = true
			}
		)
	}, lockName)
	await pages.pageB.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			})
	)
	const secondWasBlocked = await pages.pageB.evaluate(
		() =>
			(window as ProbeWindow).__browserLibraryProbeSecondLockAcquired === false
	)

	await pages.pageA.evaluate(() => {
		const probeWindow = window as ProbeWindow
		probeWindow.__browserLibraryProbeReleaseFirstLock?.()
	})
	await pages.pageB.waitForFunction(
		() =>
			(window as ProbeWindow).__browserLibraryProbeSecondLockAcquired === true
	)
	await Promise.all([
		pages.pageA.evaluate(async () => {
			const probeWindow = window as ProbeWindow
			await probeWindow.__browserLibraryProbeFirstLock
			probeWindow.__browserLibraryProbeFirstLock = undefined
			probeWindow.__browserLibraryProbeReleaseFirstLock = undefined
		}),
		pages.pageB.evaluate(async () => {
			const probeWindow = window as ProbeWindow
			await probeWindow.__browserLibraryProbeSecondLock
			probeWindow.__browserLibraryProbeSecondLock = undefined
		})
	])
	return secondWasBlocked
}

async function recoverBlockedUpgrade(
	pages: Awaited<ReturnType<typeof openProbePages>>,
	databaseName: string
) {
	await pages.pageA.evaluate(
		(name) =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.open(name, 1)
				request.onupgradeneeded = () => {
					if (!request.result.objectStoreNames.contains('covers'))
						request.result.createObjectStore('covers')
				}
				request.onerror = () => reject(request.error)
				request.onsuccess = () => {
					const probeWindow = window as ProbeWindow
					probeWindow.__browserLibraryProbeVersionChange = false
					probeWindow.__browserLibraryProbeBlockingDatabase = request.result
					request.result.onversionchange = () => {
						probeWindow.__browserLibraryProbeVersionChange = true
					}
					resolve()
				}
			}),
		databaseName
	)

	await pages.pageB.evaluate((name) => {
		const probeWindow = window as ProbeWindow
		probeWindow.__browserLibraryProbeUpgradeBlocked = false
		probeWindow.__browserLibraryProbeUpgradeComplete = false
		probeWindow.__browserLibraryProbeUpgradeError = undefined
		const request = indexedDB.open(name, 2)
		probeWindow.__browserLibraryProbeUpgradeRequest = request
		request.onblocked = () => {
			probeWindow.__browserLibraryProbeUpgradeBlocked = true
		}
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains('upgrade-marker'))
				request.result.createObjectStore('upgrade-marker')
		}
		request.onerror = () => {
			probeWindow.__browserLibraryProbeUpgradeError = `${request.error?.name ?? 'unknown'}: ${request.error?.message ?? 'No IndexedDB error detail.'}`
		}
		request.onsuccess = () => {
			probeWindow.__browserLibraryProbeUpgradeDatabase = request.result
			probeWindow.__browserLibraryProbeUpgradeComplete = true
		}
	}, databaseName)
	await Promise.all([
		pages.pageA.waitForFunction(
			() => (window as ProbeWindow).__browserLibraryProbeVersionChange === true
		),
		pages.pageB.waitForFunction(
			() => (window as ProbeWindow).__browserLibraryProbeUpgradeBlocked === true
		)
	])

	const observedBeforeRelease = await Promise.all([
		pages.pageA.evaluate(
			() => (window as ProbeWindow).__browserLibraryProbeVersionChange === true
		),
		pages.pageB.evaluate(
			() => (window as ProbeWindow).__browserLibraryProbeUpgradeBlocked === true
		)
	])
	await pages.pageA.evaluate(() => {
		const probeWindow = window as ProbeWindow
		probeWindow.__browserLibraryProbeBlockingDatabase?.close()
		probeWindow.__browserLibraryProbeBlockingDatabase = undefined
	})
	await pages.pageB.waitForFunction(() => {
		const probeWindow = window as ProbeWindow
		return Boolean(
			probeWindow.__browserLibraryProbeUpgradeComplete ||
			probeWindow.__browserLibraryProbeUpgradeError
		)
	})
	const result = await pages.pageB.evaluate((observed) => {
		const probeWindow = window as ProbeWindow
		const completedAfterRelease =
			probeWindow.__browserLibraryProbeUpgradeComplete === true &&
			!probeWindow.__browserLibraryProbeUpgradeError
		probeWindow.__browserLibraryProbeUpgradeDatabase?.close()
		probeWindow.__browserLibraryProbeUpgradeDatabase = undefined
		probeWindow.__browserLibraryProbeUpgradeRequest = undefined
		return {
			blocked: observed[1],
			completedAfterRelease,
			versionChangeObserved: observed[0]
		}
	}, observedBeforeRelease)
	return result
}

async function removeProbeDatabase(page: Page, databaseName: string) {
	await page.evaluate(
		(name) =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.deleteDatabase(name)
				request.onsuccess = () => resolve()
				request.onerror = () => reject(request.error)
				request.onblocked = () =>
					reject(new Error(`Probe database ${name} remained blocked.`))
			}),
		databaseName
	)
}

async function probeContext(options: {
	context: BrowserContext
	contextKind: StorageContext
	engine: EngineName
	testId: string
	version: string
}): Promise<EngineProbe> {
	const pages = await openProbePages(options.context)
	const databaseName = `crate-guide-library-engine-probe-${options.testId}-${options.engine}`
	const channelName = `${databaseName}-commits`
	const capabilities = await pages.pageA.evaluate(async () => {
		const estimate = navigator.storage?.estimate
			? await navigator.storage.estimate()
			: null
		return {
			databaseNamesSupported: typeof indexedDB.databases === 'function',
			estimate: estimate
				? {
						quota: typeof estimate.quota === 'number' ? estimate.quota : null,
						usage: typeof estimate.usage === 'number' ? estimate.usage : null
					}
				: null,
			indexedDbSupported: typeof indexedDB !== 'undefined',
			userAgent: navigator.userAgent,
			webLocksSupported: typeof navigator.locks !== 'undefined'
		}
	})
	const blob = await roundTripBlob(pages.pageA, databaseName)
	const broadcastMessage = await broadcastAcrossPages(pages, channelName)
	const webLockSerialized = await serializeAcrossPages(
		pages,
		`${databaseName}-wide-write`
	)
	const upgradeRecovery = await recoverBlockedUpgrade(pages, databaseName)
	await pages.pageB.evaluate(() => {
		const probeWindow = window as ProbeWindow
		probeWindow.__browserLibraryProbeChannel?.close()
		probeWindow.__browserLibraryProbeChannel = undefined
	})
	await removeProbeDatabase(pages.pageA, databaseName)
	return {
		...capabilities,
		blob,
		broadcastMessage,
		context: options.contextKind,
		engine: options.engine,
		upgradeRecovery,
		webLockSerialized,
		version: options.version
	}
}

async function probeEphemeralEngine(
	engine: { name: EngineName; type: BrowserType },
	testId: string
): Promise<EngineProbe> {
	let browser: Browser | null = null
	try {
		browser = await engine.type.launch({ headless: true })
		const context = await browser.newContext()
		try {
			return await probeContext({
				context,
				contextKind: 'ephemeral',
				engine: engine.name,
				testId,
				version: browser.version()
			})
		} finally {
			await context.close()
		}
	} finally {
		await browser?.close()
	}
}

async function probePersistentWebKit(
	testId: string,
	headless: boolean
): Promise<EngineProbe> {
	const profileDirectory = await mkdtemp(
		join(tmpdir(), 'crate-guide-webkit-profile-')
	)
	let context: BrowserContext | null = null
	try {
		context = await webkit.launchPersistentContext(profileDirectory, {
			headless
		})
		return await probeContext({
			context,
			contextKind: headless ? 'persistent-headless' : 'persistent-headed',
			engine: 'webkit',
			testId,
			version: context.browser()?.version() ?? ''
		})
	} finally {
		await context?.close()
		await rm(profileDirectory, { force: true, recursive: true })
	}
}

function expectSuccessfulBlob(result: EngineProbe) {
	expect(result.blob).toEqual({
		status: 'success',
		text: 'crate-guide-browser-cover'
	})
}

function hasExpectedStorageEstimateCapability(
	result: Pick<EngineProbe, 'engine' | 'estimate'>
) {
	if (result.estimate === null) {
		return result.engine === 'webkit'
	}

	return (
		typeof result.estimate.quota === 'number' &&
		Number.isFinite(result.estimate.quota) &&
		result.estimate.quota >= 0 &&
		typeof result.estimate.usage === 'number' &&
		Number.isFinite(result.estimate.usage) &&
		result.estimate.usage >= 0
	)
}

function expectCommonCapabilities(result: EngineProbe) {
	expect(result.indexedDbSupported).toBe(true)
	expect(result.databaseNamesSupported).toBe(true)
	expect(hasExpectedStorageEstimateCapability(result)).toBe(true)
	expect(result.broadcastMessage).toBe('committed:revision-2')
	expect(result.webLocksSupported).toBe(true)
	expect(result.webLockSerialized).toBe(true)
	expect(result.upgradeRecovery).toEqual({
		blocked: true,
		completedAfterRelease: true,
		versionChangeObserved: true
	})
	expect(result.version).not.toBe('')
}

describe('browser library engine matrix', () => {
	it('treats storage estimates as an optional WebKit diagnostic', () => {
		expect(
			hasExpectedStorageEstimateCapability({
				engine: 'webkit',
				estimate: null
			})
		).toBe(true)
		expect(
			hasExpectedStorageEstimateCapability({
				engine: 'chromium',
				estimate: { quota: 1_000, usage: 100 }
			})
		).toBe(true)
		expect(
			hasExpectedStorageEstimateCapability({
				engine: 'firefox',
				estimate: null
			})
		).toBe(false)
	})

	for (const engine of engines) {
		it.skipIf(!requireFullMatrix && !isEngineInstalled(engine.type))(
			`probes two-page storage primitives in ephemeral ${engine.name}`,
			async () => {
				const result = await probeEphemeralEngine(engine, crypto.randomUUID())
				console.info(
					JSON.stringify({ kind: 'browser-library-engine-probe', ...result })
				)
				expectCommonCapabilities(result)

				if (engine.name !== 'webkit' || result.blob.status === 'success')
					expectSuccessfulBlob(result)
				else
					expect(result.blob.message).toContain(
						'Error preparing Blob/File data to be stored in object store'
					)
			},
			120_000
		)
	}

	it.skipIf(!requireFullMatrix && !isEngineInstalled(webkit))(
		'round-trips IndexedDB Blobs in a persistent headless WebKit profile',
		async () => {
			const result = await probePersistentWebKit(crypto.randomUUID(), true)
			console.info(
				JSON.stringify({ kind: 'browser-library-engine-probe', ...result })
			)
			expectCommonCapabilities(result)
			expectSuccessfulBlob(result)
		},
		120_000
	)

	it.skipIf(
		process.env.BROWSER_LIBRARY_HEADED !== '1' ||
			(!requireFullMatrix && !isEngineInstalled(webkit))
	)(
		'round-trips IndexedDB Blobs in a persistent headed WebKit profile',
		async () => {
			const result = await probePersistentWebKit(crypto.randomUUID(), false)
			console.info(
				JSON.stringify({ kind: 'browser-library-engine-probe', ...result })
			)
			expectCommonCapabilities(result)
			expectSuccessfulBlob(result)
		},
		120_000
	)
})
