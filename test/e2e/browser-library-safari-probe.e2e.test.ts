import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, chromium } from 'playwright'
import { type ViteDevServer, createServer as createViteServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPOSITORY_ROOT = dirname(
	dirname(dirname(fileURLToPath(import.meta.url)))
)
const PROBE_PATH = '/test/e2e/fixtures/browserLibrarySafariProbe.html'

let origin = ''
let server: ViteDevServer | null = null

function captureDiagnostics(page: Page, diagnostics: string[]) {
	page.on('pageerror', (error) =>
		diagnostics.push(`pageerror: ${error.message}`)
	)
	page.on('console', (message) => {
		if (message.type() === 'error') {
			diagnostics.push(`console.error: ${message.text()}`)
		}
	})
}

beforeAll(async () => {
	server = await createViteServer({
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
	await server.listen()
	const address = server.httpServer?.address()
	if (!address || typeof address === 'string') {
		throw new Error('The Safari probe server did not expose a TCP address.')
	}
	origin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
	await server?.close()
	server = null
})

describe('physical Safari probe fixture', () => {
	it('passes its disposable multi-page repository contract in Chromium', async () => {
		const browser = await chromium.launch({ headless: true })
		const context = await browser.newContext()
		const page = await context.newPage()
		const diagnostics: string[] = []
		captureDiagnostics(page, diagnostics)
		context.on('page', (popup) => captureDiagnostics(popup, diagnostics))

		try {
			await page.goto(`${origin}${PROBE_PATH}`, {
				waitUntil: 'domcontentloaded'
			})
			await page.locator('#run-probe').click()
			await page.waitForFunction(
				() => {
					const probe = document.documentElement.dataset.physicalSafariProbe
					return probe === 'pass' || probe === 'fail'
				},
				undefined,
				{ timeout: 30_000 }
			)
			expect(await page.locator('#probe-status').textContent()).toBe(
				'PASS: physical Safari library probe completed.'
			)
			expect(await page.locator('#probe-environment').textContent()).toContain(
				'IndexedDB: supported'
			)
			expect(
				JSON.parse(await page.locator('#probe-result').innerText())
			).toMatchObject({
				abortedUpgrade: {
					errorName: 'AbortError',
					upgradeStarted: true
				},
				indexedDb: true,
				reloadSnapshot: {
					cover: { text: 'physical-safari-cover', type: 'image/webp' },
					recordCount: 1,
					trackCount: 1
				}
			})
			expect(diagnostics).toEqual([])
		} finally {
			await context.close()
			await browser.close()
		}
	}, 45_000)
})
