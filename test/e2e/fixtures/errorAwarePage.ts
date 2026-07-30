import { createPage, url } from '@nuxt/test-utils/e2e'
import type { NuxtPage } from '@nuxt/test-utils/e2e'
import { afterEach } from 'vitest'

type GuardedPage = {
	diagnostics: string[]
	page: NuxtPage
}

type ErrorAwarePageOptions = {
	beforeNavigate?: (page: NuxtPage) => Promise<void> | void
}

const guardedPages = new Set<GuardedPage>()
const relevantResourceTypes = new Set([
	'document',
	'fetch',
	'script',
	'stylesheet',
	'xhr'
])

function redact(value: string) {
	return value
		.replace(
			/([?&](?:code|key|secret|token|verifier)=)[^&#\s]+/gi,
			'$1[redacted]'
		)
		.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
		.replace(
			/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/g,
			'[redacted-jwt]'
		)
		.slice(0, 500)
}

function safeRequestUrl(requestUrl: string) {
	try {
		const parsed = new URL(requestUrl)
		return `${parsed.origin}${parsed.pathname}`
	} catch {
		return redact(requestUrl)
	}
}

function isKnownBrowserNoise(errorText: string, isNavigationRequest: boolean) {
	// Chromium reports superseded client-side navigations as aborted requests.
	// Route assertions cover the destination, so only that exact event is ignored.
	return isNavigationRequest && errorText === 'net::ERR_ABORTED'
}

export async function createErrorAwarePage(
	path: string,
	options: ErrorAwarePageOptions = {}
): Promise<NuxtPage> {
	const page = await createPage()
	const guardedPage: GuardedPage = { diagnostics: [], page }
	guardedPages.add(guardedPage)

	page.on('pageerror', (error) => {
		guardedPage.diagnostics.push(`pageerror: ${redact(error.message)}`)
	})
	page.on('console', (message) => {
		if (message.type() !== 'error') return
		guardedPage.diagnostics.push(`console.error: ${redact(message.text())}`)
	})
	page.on('requestfailed', (request) => {
		if (!relevantResourceTypes.has(request.resourceType())) return
		const errorText = request.failure()?.errorText ?? 'unknown failure'
		if (isKnownBrowserNoise(errorText, request.isNavigationRequest())) return
		guardedPage.diagnostics.push(
			`requestfailed: ${safeRequestUrl(request.url())} (${redact(errorText)})`
		)
	})

	try {
		await options.beforeNavigate?.(page)
		await page.goto(url(path), { waitUntil: 'hydration' })
		return page
	} catch (error) {
		guardedPages.delete(guardedPage)
		await page.close().catch(() => undefined)
		if (guardedPage.diagnostics.length === 0) throw error
		throw new AggregateError(
			[error, new Error(guardedPage.diagnostics.join('\n'))],
			'Page creation failed with browser diagnostics',
			{ cause: error }
		)
	}
}

afterEach(async () => {
	const diagnostics: string[] = []
	for (const guardedPage of guardedPages) {
		guardedPages.delete(guardedPage)
		try {
			await guardedPage.page.close()
		} catch (error) {
			diagnostics.push(
				`page.close: ${redact(error instanceof Error ? error.message : String(error))}`
			)
		}
		diagnostics.push(...guardedPage.diagnostics)
	}

	if (diagnostics.length > 0) {
		throw new Error(
			`Unexpected browser diagnostics:\n${diagnostics.join('\n')}`
		)
	}
})
