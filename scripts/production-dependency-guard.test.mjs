import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	assertProductionModules,
	productionDependencyGuard
} from './production-dependency-guard.mjs'

test('rejects build-only TLS packages in local, Windows, pnpm and external module paths', () => {
	for (const name of ['node-forge', 'listhen']) {
		for (const id of [
			name,
			`\0${name}?commonjs-external`,
			`${name}/lib/index.js`,
			`/repo/node_modules/${name}/lib/index.js`,
			`C:\\repo\\node_modules\\${name}\\lib\\index.js`,
			`/repo/node_modules/.pnpm/${name}@1/node_modules/${name}/lib/index.js`
		])
			assert.throws(() => assertProductionModules([id]), /production bundle/)
	}
	assertProductionModules([
		'/repo/app/listen.ts',
		'/repo/node_modules/h3/index.js'
	])
})

test('checks actual rendered chunk modules and static or dynamic external imports', () => {
	const plugin = productionDependencyGuard('test')
	for (const changed of [
		{ modules: { '/repo/node_modules/node-forge/lib/rsa.js': {} } },
		{ imports: ['listhen'] },
		{ dynamicImports: ['node-forge'] }
	]) {
		assert.throws(
			() =>
				plugin.generateBundle(
					{},
					{
						'worker.js': {
							type: 'chunk',
							modules: {},
							imports: [],
							dynamicImports: [],
							...changed
						}
					}
				),
			/production bundle/
		)
	}
})
