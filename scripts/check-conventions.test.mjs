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
	COMPONENT_KIND_NAMES,
	checkConventions,
	discoverAppFiles,
	evaluateAppPath,
	evaluateEdgeFunctionGatewayConfig
} from './check-conventions.mjs'

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

test('rejects inverted names and accepts type-first names for every documented kind', () => {
	for (const kind of COMPONENT_KIND_NAMES) {
		assert.deepEqual(
			evaluateAppPath(`app/components/Domain${kind}.vue`),
			['component filename must use a type-first name'],
			kind
		)
		assert.deepEqual(
			evaluateAppPath(`app/components/${kind}Domain.vue`),
			[],
			kind
		)
	}
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

test('accepts function configuration that delegates authentication to handlers', () => {
	assert.deepEqual(
		evaluateEdgeFunctionGatewayConfig(
			'[functions.example]\nverify_jwt = false\n',
			['example']
		),
		[]
	)
})

test('rejects missing or gateway-verified function configuration', () => {
	assert.deepEqual(
		evaluateEdgeFunctionGatewayConfig(
			'[functions.first]\nverify_jwt = true\n',
			['first', 'second']
		),
		[
			'[functions.first] must set verify_jwt = false because the handler authenticates internally',
			'missing [functions.second] configuration'
		]
	)
})

test('reports function gateway diagnostics at the Supabase config path', () => {
	withTemporaryRepository(({ root, write }) => {
		write('supabase/functions/example/index.ts', '')
		write('supabase/config.toml', '[functions.example]\nverify_jwt = true\n')

		assert.deepEqual(checkConventions(root), [
			{
				message:
					'[functions.example] must set verify_jwt = false because the handler authenticates internally',
				path: 'supabase/config.toml'
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
