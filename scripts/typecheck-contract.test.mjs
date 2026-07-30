import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

test('the repository typecheck uses vue-tsc as the failing process', () => {
	const packageJson = JSON.parse(
		readFileSync(join(root, 'package.json'), 'utf8')
	)
	assert.equal(
		packageJson.scripts.typecheck,
		'nuxt prepare && vue-tsc --noEmit'
	)
})

test('vue-tsc exits non-zero for a TypeScript diagnostic', () => {
	const fixtureRoot = mkdtempSync(join(tmpdir(), 'crate-guide-typecheck-'))
	try {
		writeFileSync(
			join(fixtureRoot, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					noEmit: true,
					strict: true,
					types: []
				},
				files: ['failure.ts']
			})
		)
		writeFileSync(
			join(fixtureRoot, 'failure.ts'),
			"const count: number = 'nope'\n"
		)

		const result = spawnSync(
			join(root, 'node_modules', '.bin', 'vue-tsc'),
			['--noEmit', '--project', join(fixtureRoot, 'tsconfig.json')],
			{ encoding: 'utf8' }
		)
		assert.notEqual(result.status, 0)
		assert.match(`${result.stdout}\n${result.stderr}`, /error TS2322/)
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true })
	}
})
