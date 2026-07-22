import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	createBrowserSecurityHeaders,
	extractExecutableInlineScripts
} from '../shared/security/browserHeaders.ts'
import { assertHtmlSecurityResponse } from './check-security-headers.mjs'

const HTML = [
	'<!doctype html>',
	'<script data-hid="anonymous-theme-bootstrap">theme()</script>',
	'<script type="module" src="/entry.js"></script>',
	'<script>window.__NUXT__={}</script>',
	'<script type="application/json">{"serverRendered":false}</script>'
].join('')

function responseWith(headers) {
	return new Response(HTML, { headers })
}

test('extracts only executable inline script bodies', () => {
	assert.deepEqual(extractExecutableInlineScripts(HTML), [
		'theme()',
		'window.__NUXT__={}'
	])
})

test('sets exact HTML containment and hashes on HTTPS', async () => {
	const headers = await createBrowserSecurityHeaders({
		contentType: 'text/html; charset=utf-8',
		htmlBody: HTML,
		isHttps: true,
		supabaseOrigin: 'https://config.test.invalid'
	})
	assertHtmlSecurityResponse(responseWith(headers), HTML)
})

test('does not send HSTS over local HTTP', async () => {
	const headers = await createBrowserSecurityHeaders({
		contentType: 'text/html',
		htmlBody: HTML,
		isHttps: false,
		supabaseOrigin: 'https://config.test.invalid'
	})
	assertHtmlSecurityResponse(responseWith(headers), HTML, { expectHsts: false })
})

test('keeps redirects and assets free of HTML-only policies', async () => {
	for (const contentType of [null, 'application/javascript']) {
		const headers = await createBrowserSecurityHeaders({
			contentType,
			htmlBody: null,
			isHttps: true,
			supabaseOrigin: 'https://config.test.invalid'
		})
		assert.deepEqual(headers, { 'strict-transport-security': 'max-age=86400' })
	}
})

test('applies the HTML policy to error documents without broadening it', async () => {
	const headers = await createBrowserSecurityHeaders({
		contentType: 'text/html',
		htmlBody: HTML,
		isHttps: true,
		supabaseOrigin: 'https://config.test.invalid'
	})
	const response = new Response(HTML, { headers, status: 500 })
	assert.equal(response.status, 500)
	assertHtmlSecurityResponse(response, HTML)
})

test('rejects invalid runtime origins and missing inline hashes', async () => {
	await assert.rejects(
		createBrowserSecurityHeaders({
			contentType: 'text/html',
			htmlBody: '',
			isHttps: true,
			supabaseOrigin: 'https://config.test.invalid/path'
		}),
		/valid inline script hashes|HTTP\(S\) origin/
	)
})
