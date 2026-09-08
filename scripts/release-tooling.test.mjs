import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	parseReleaseArguments,
	releaseOrganization,
	releaseOrigin,
	releaseTarget
} from './lib/release-targets.mjs'
import {
	assertReleaseChecks,
	assertReleaseProjects
} from './release-preflight.mjs'
import { assertReleaseHtml, smokeRelease } from './smoke-release.mjs'

const target = releaseTarget('production')
const source = 'a'.repeat(40)
const buildId = 'bb61232f-6a51-4ba5-96af-4a12b6d21c8f'
const html = `<script>supabase:{url:"https://${target.projectRef}.supabase.co"},buildId:"${buildId}"</script><script src="/_nuxt/app.js"></script>`

test('release tooling rejects ambiguous targets, extra flags, and duplicate arguments', () => {
	for (const name of ['prod', '__proto__', 'constructor', ''])
		assert.throws(() => releaseTarget(name))
	for (const args of [
		['--environment'],
		['--environment', 'production', '--environment', 'staging'],
		['--other', 'production']
	])
		assert.throws(() => parseReleaseArguments(args, ['environment']))
	assert.deepEqual(
		parseReleaseArguments(['--environment', 'production'], ['environment']),
		{ environment: 'production' }
	)
})

test('release smoke permits only the selected origin and immutable Pages deployments', () => {
	assert.equal(
		releaseOrigin(target, 'https://a511fedf.crate-guide.pages.dev'),
		'https://a511fedf.crate-guide.pages.dev'
	)
	for (const origin of [
		'http://crate.guide',
		'https://crate.guide.evil.test',
		'https://crate-guide-staging.pages.dev',
		'https://branch.crate-guide.pages.dev',
		'https://user:secret@crate.guide',
		'https://crate.guide/?token=secret'
	])
		assert.throws(() => releaseOrigin(target, origin))
})

test('backend preflight fails closed for the wrong CLI organization and unhealthy project', () => {
	const project = {
		id: target.projectRef,
		name: target.projectName,
		organization_id: releaseOrganization,
		status: 'ACTIVE_HEALTHY'
	}
	assert.doesNotThrow(() => assertReleaseProjects([project], target))
	for (const projects of [
		[],
		{},
		[{ ...project, organization_id: 'another-organization' }],
		[{ ...project, status: 'INACTIVE' }],
		[{ ...project, name: 'renamed' }]
	])
		assert.throws(() => assertReleaseProjects(projects, target))
})

test('preflight requires the latest successful workflow for the exact requested commit', () => {
	const run = {
		headSha: source,
		status: 'completed',
		conclusion: 'success',
		url: 'https://github.com/example/run'
	}
	assert.equal(assertReleaseChecks([run], source), run.url)
	for (const runs of [
		[],
		[{ ...run, headSha: 'b'.repeat(40) }],
		[{ ...run, status: 'in_progress' }, run],
		[{ ...run, conclusion: 'failure' }, run]
	])
		assert.throws(() => assertReleaseChecks(runs, source))
})

test('smoke rejects mixed builds, wrong backends, and missing or external entry assets', () => {
	assert.deepEqual(assertReleaseHtml(html, target, buildId), ['/_nuxt/app.js'])
	for (const invalid of [
		html.replace(buildId, 'old-build'),
		html.replace(target.projectRef, 'xrekloexiottvfueijgb'),
		html.replace('<script src="/_nuxt/app.js"></script>', ''),
		html.replace('/_nuxt/app.js', 'https://evil.test/app.js')
	])
		assert.throws(() => assertReleaseHtml(invalid, target, buildId))
})

test('smoke stops on a mismatched live build manifest before requesting routes', async () => {
	const paths = []
	await assert.rejects(
		smokeRelease(
			{ environment: 'production', 'build-id': buildId },
			async (url) => {
				paths.push(url)
				return Response.json({ id: 'another-build' })
			}
		),
		/Latest build manifest/
	)
	assert.deepEqual(paths, ['https://crate.guide/_nuxt/builds/latest.json'])
})
