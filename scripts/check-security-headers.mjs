import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
	ENFORCED_CONTENT_SECURITY_POLICY,
	HTML_SECURITY_HEADERS,
	HTTPS_SECURITY_HEADERS,
	extractExecutableInlineScripts
} from '../shared/security/browserHeaders.ts'

const REQUIRED_REPORT_ONLY_DIRECTIVES = Object.freeze([
	'base-uri',
	'connect-src',
	'default-src',
	'font-src',
	'form-action',
	'frame-ancestors',
	'frame-src',
	'img-src',
	'manifest-src',
	'media-src',
	'object-src',
	'script-src',
	'script-src-attr',
	'style-src',
	'style-src-attr',
	'worker-src'
])

export function parseContentSecurityPolicy(policy) {
	const directives = new Map()
	for (const rawDirective of policy.split(';')) {
		const tokens = rawDirective.trim().split(/\s+/).filter(Boolean)
		if (tokens.length === 0) continue
		const [name, ...values] = tokens
		if (directives.has(name))
			throw new Error('Duplicate CSP directive: ' + name)
		directives.set(name, values)
	}
	return directives
}

function sha256Source(value) {
	return "'sha256-" + createHash('sha256').update(value).digest('base64') + "'"
}

export function assertHtmlSecurityResponse(response, html, options = {}) {
	const expectedHsts = options.expectHsts ?? true
	const expectedSupabaseOrigin =
		'supabaseOrigin' in options
			? options.supabaseOrigin
			: 'https://config.test.invalid'
	assert.equal(
		response.headers.get('content-security-policy'),
		ENFORCED_CONTENT_SECURITY_POLICY
	)
	for (const [name, value] of Object.entries(HTML_SECURITY_HEADERS)) {
		assert.equal(response.headers.get(name), value, name + ' drifted')
	}
	assert.equal(
		response.headers.get('strict-transport-security'),
		expectedHsts ? HTTPS_SECURITY_HEADERS['strict-transport-security'] : null
	)
	assert.equal(response.headers.has('x-powered-by'), false)

	const reportOnly = response.headers.get('content-security-policy-report-only')
	assert.ok(reportOnly, 'report-only CSP is missing')
	const directives = parseContentSecurityPolicy(reportOnly)
	assert.deepEqual(
		[...directives.keys()].sort(),
		REQUIRED_REPORT_ONLY_DIRECTIVES
	)
	assert.equal(
		[...directives.values()].flat().includes('*'),
		false,
		'report-only CSP must not contain a wildcard source'
	)
	assert.equal(
		[...directives.values()].flat().includes("'unsafe-eval'"),
		false,
		'report-only CSP must not enable unsafe-eval'
	)
	assert.deepEqual(directives.get('frame-ancestors'), ["'none'"])
	assert.deepEqual(directives.get('object-src'), ["'none'"])
	assert.deepEqual(directives.get('script-src-attr'), ["'none'"])
	if (expectedSupabaseOrigin) {
		const websocketOrigin = expectedSupabaseOrigin.replace(/^http/, 'ws')
		assert.ok(directives.get('connect-src')?.includes(expectedSupabaseOrigin))
		assert.ok(directives.get('connect-src')?.includes(websocketOrigin))
	}
	assert.ok(directives.get('img-src')?.includes('https://i.discogs.com'))
	assert.ok(directives.get('img-src')?.includes('blob:'))
	assert.ok(directives.get('img-src')?.includes('https:'))
	assert.ok(directives.get('script-src')?.includes("'wasm-unsafe-eval'"))

	const inlineScripts = extractExecutableInlineScripts(html)
	assert.ok(inlineScripts.length >= 2, 'expected Nuxt and theme inline scripts')
	for (const script of inlineScripts) {
		assert.ok(
			directives.get('script-src')?.includes(sha256Source(script)),
			'an executable inline script hash is missing from report-only CSP'
		)
	}
}

export async function loadBuiltWorker(buildDirectory = 'dist') {
	const workerPath = resolve(buildDirectory, '_worker.js/index.js')
	assert.ok(
		existsSync(workerPath),
		'Missing Cloudflare worker build: ' + workerPath
	)
	const moduleUrl =
		pathToFileURL(workerPath).href + '?security-check=' + Date.now()
	return (await import(moduleUrl)).default
}

function embeddedSupabaseOrigin(html) {
	const match = html.match(/supabase:\{url:"([^"]+)"/)
	return match ? new URL(match[1]).origin : null
}

function executionContext() {
	return {
		passThroughOnException() {},
		waitUntil() {}
	}
}

export async function checkBuiltSecurityHeaders(buildDirectory = 'dist') {
	const routes = JSON.parse(
		readFileSync(resolve(buildDirectory, '_routes.json'), 'utf8')
	)
	assert.ok(routes.include.includes('/*'))
	assert.ok(
		routes.exclude.includes('/_nuxt/*'),
		'static assets must retain direct Pages delivery'
	)

	const worker = await loadBuiltWorker(buildDirectory)
	for (const path of ['/', '/route-that-uses-the-spa-fallback']) {
		const response = await worker.fetch(
			new Request('https://crate.guide' + path),
			{},
			executionContext()
		)
		const html = await response.text()
		assert.equal(response.status, 200)
		assertHtmlSecurityResponse(response, html, {
			supabaseOrigin: embeddedSupabaseOrigin(html)
		})
	}

	const localResponse = await worker.fetch(
		new Request('http://localhost/'),
		{},
		executionContext()
	)
	const localHtml = await localResponse.text()
	assertHtmlSecurityResponse(localResponse, localHtml, {
		expectHsts: false,
		supabaseOrigin: embeddedSupabaseOrigin(localHtml)
	})

	assert.equal(
		readFileSync(resolve(buildDirectory, '_headers'), 'utf8').includes(
			'content-security-policy'
		),
		false,
		'HTML-only CSP must not be emitted as a blanket static asset rule'
	)
}

const isDirectRun =
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
	await checkBuiltSecurityHeaders(process.argv[2] ?? 'dist')
	console.log('Built Cloudflare browser security headers passed.')
}
