import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
	checkConventions,
	discoverAppFiles,
	evaluateAppPath,
	evaluateEdgeDeployConfig
} from './check-conventions.mjs'

const DEPLOY_WITH_JWT_BYPASS = [
	'supabase functions deploy',
	'--no-verify-jwt'
].join(' ')

function withTemporaryRepository(callback) {
	const root = mkdtempSync(join(tmpdir(), 'crate-guide-conventions-'))
	const write = (path, contents = '') => {
		const absolutePath = join(root, path)
		mkdirSync(dirname(absolutePath), { recursive: true })
		writeFileSync(absolutePath, contents)
	}

	try {
		execFileSync('git', ['init', '--quiet'], { cwd: root })
		callback({ root, write })
	} finally {
		rmSync(root, { force: true, recursive: true })
	}
}

test('accepts compliant PascalCase Tailwind-only components', () => {
	assert.deepEqual(
		evaluateAppPath(
			'app/components/records/CardRecordShort.vue',
			'<template><article class="rounded-lg border" /></template>'
		),
		[]
	)
})

test('rejects first-party style, @apply, SCSS, and invalid component names', () => {
	assert.deepEqual(
		evaluateAppPath(
			'app/components/CardRecord.vue',
			'<template /><style scoped>.record { @apply border; }</style>'
		),
		['contains a <style> block', 'contains @apply']
	)
	assert.deepEqual(evaluateAppPath('app/assets/css/legacy.scss'), [
		'SCSS files are not allowed'
	])
	assert.deepEqual(evaluateAppPath('app/components/record-card.vue'), [
		'component filename must be PascalCase'
	])
})

test('rejects clear suffix-first names and accepts type-first equivalents', () => {
	assert.deepEqual(evaluateAppPath('app/components/ColorPicker.vue'), [
		'component filename must use a type-first name'
	])
	assert.deepEqual(
		evaluateAppPath('app/components/SessionHeaderControls.vue'),
		['component filename must use a type-first name']
	)
	assert.deepEqual(evaluateAppPath('app/components/PickerColor.vue'), [])
	assert.deepEqual(
		evaluateAppPath('app/components/HeaderSessionControls.vue'),
		[]
	)
	assert.deepEqual(evaluateAppPath('app/components/turntable/Platter.vue'), [])
})

test('excludes generated UI only', () => {
	const violation = '<style>.example { @apply border; }</style>'
	assert.deepEqual(
		evaluateAppPath('app/components/ui/generated-card.vue', violation),
		[]
	)
	assert.deepEqual(
		evaluateAppPath('app/components/generated/generated-card.vue', violation),
		[
			'contains a <style> block',
			'contains @apply',
			'component filename must be PascalCase'
		]
	)
})

test('accepts Edge deploy tasks with gateway JWT verification', () => {
	assert.deepEqual(
		evaluateEdgeDeployConfig(
			JSON.stringify({
				tasks: {
					deploy: 'supabase functions deploy',
					'deploy-all': 'supabase functions deploy'
				}
			})
		),
		[]
	)
})

test('accepts the local Edge serve JWT bypass', () => {
	assert.deepEqual(
		evaluateEdgeDeployConfig(
			JSON.stringify({
				tasks: {
					dev: 'supabase functions serve --no-verify-jwt'
				}
			})
		),
		[]
	)
})

test('rejects a JWT bypass in an Edge deployment task', () => {
	assert.deepEqual(
		evaluateEdgeDeployConfig(
			JSON.stringify({
				tasks: {
					'deploy-all': DEPLOY_WITH_JWT_BYPASS
				}
			})
		),
		['task "deploy-all" must not disable JWT verification during deployment']
	)
})

test('reports malformed Edge deployment configuration without throwing', () => {
	assert.deepEqual(evaluateEdgeDeployConfig('{ invalid'), [
		'must contain valid JSON'
	])
})

test('reports Edge deployment diagnostics at the Supabase config path', () => {
	withTemporaryRepository(({ root, write }) => {
		write(
			'supabase/deno.json',
			JSON.stringify({
				tasks: {
					deploy: DEPLOY_WITH_JWT_BYPASS
				}
			})
		)

		assert.deepEqual(checkConventions(root), [
			{
				message:
					'task "deploy" must not disable JWT verification during deployment',
				path: 'supabase/deno.json'
			}
		])
	})
})

test('discovers tracked and untracked files without ignored or deleted paths', () => {
	withTemporaryRepository(({ root, write }) => {
		write('app/components/CardTracked.vue', '<template />')
		write('app/components/CardDeleted.vue', '<template />')
		write('.gitignore', 'app/components/CardIgnored.vue\n')
		execFileSync(
			'git',
			[
				'add',
				'.gitignore',
				'app/components/CardTracked.vue',
				'app/components/CardDeleted.vue'
			],
			{ cwd: root }
		)
		rmSync(join(root, 'app/components/CardDeleted.vue'))
		write(
			'app/components/untracked-card.vue',
			'<template /><style>.card { color: red; }</style>'
		)
		write('app/components/CardIgnored.vue', '<style />')

		assert.deepEqual(discoverAppFiles(root), [
			'app/components/CardTracked.vue',
			'app/components/untracked-card.vue'
		])

		const before = readFileSync(
			join(root, 'app/components/untracked-card.vue'),
			'utf8'
		)
		assert.deepEqual(checkConventions(root), [
			{
				message: 'contains a <style> block',
				path: 'app/components/untracked-card.vue'
			},
			{
				message: 'component filename must be PascalCase',
				path: 'app/components/untracked-card.vue'
			}
		])
		assert.equal(
			readFileSync(join(root, 'app/components/untracked-card.vue'), 'utf8'),
			before
		)
	})
})
