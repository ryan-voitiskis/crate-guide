#!/usr/bin/env node

import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertHtmlSecurityResponse } from './check-security-headers.mjs'
import {
	parseReleaseArguments,
	releaseOrigin,
	releaseTarget
} from './lib/release-targets.mjs'

export const releaseSmokeRoutes = [
	'/',
	'/login',
	'/privacy/',
	'/PRIVACY/',
	'/tracks/',
	'/TRACKS/?genre=House',
	'/demo',
	'/demo/tracks',
	'/demo/records',
	'/demo/enrichment'
]

export function assertReleaseHtml(html, target, buildId) {
	assert.equal(
		html.match(/supabase:\{url:"([^"]+)"/)?.[1],
		`https://${target.projectRef}.supabase.co`,
		'Compiled backend does not match the selected environment.'
	)
	assert.equal(
		html.match(/buildId:"([^"]+)"/)?.[1],
		buildId,
		'Route served a different build.'
	)
	const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(
		(match) => match[1]
	)
	assert.ok(scripts.length > 0, 'No application JavaScript entry was found.')
	assert.ok(
		scripts.every((path) => /^\/_nuxt\/[A-Za-z0-9_./-]+\.js$/.test(path)),
		'Unexpected application script origin or path.'
	)
	return scripts
}

export async function smokeRelease(
	{ environment, url, 'build-id': buildId },
	fetcher = fetch
) {
	const target = releaseTarget(environment)
	const origin = releaseOrigin(target, url)
	assert.match(
		buildId ?? '',
		/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,
		'Supply the exact expected build ID.'
	)
	const request = (path) =>
		fetcher(`${origin}${path}`, {
			redirect: 'error',
			signal: AbortSignal.timeout(15_000),
			headers: { 'Cache-Control': 'no-cache' }
		})
	const latest = await request('/_nuxt/builds/latest.json')
	assert.equal(latest.status, 200)
	assert.equal(
		(await latest.json()).id,
		buildId,
		'Latest build manifest differs from the expected deployment.'
	)
	const assets = new Set()
	for (const path of releaseSmokeRoutes) {
		const response = await request(path)
		assert.equal(response.status, 200, `${path} did not return HTTP 200.`)
		assert.match(response.headers.get('content-type') ?? '', /text\/html/)
		const html = await response.text()
		assertHtmlSecurityResponse(response, html, {
			supabaseOrigin: `https://${target.projectRef}.supabase.co`
		})
		for (const script of assertReleaseHtml(html, target, buildId))
			assets.add(script)
	}
	for (const path of assets) {
		const response = await request(path)
		assert.equal(response.status, 200, `${path} did not return HTTP 200.`)
		assert.match(
			response.headers.get('content-type') ?? '',
			/(?:javascript|ecmascript)/,
			'JavaScript asset returned another content type.'
		)
		assert.ok((await response.text()).length > 0, 'JavaScript asset was empty.')
	}
	return {
		checkedAt: new Date().toISOString(),
		environment,
		origin,
		buildId,
		backend: target.projectRef,
		routes: releaseSmokeRoutes,
		assets: [...assets],
		scope:
			'Read-only HTTP, build identity, compiled backend, headers, and entry assets. Authenticated browser and data checks are separate.'
	}
}

if (
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
	try {
		console.log(
			JSON.stringify(
				await smokeRelease(
					parseReleaseArguments(
						process.argv.slice(2),
						['environment', 'build-id'],
						['url']
					)
				),
				null,
				2
			)
		)
	} catch (error) {
		console.error(error.message)
		process.exitCode = 1
	}
}
