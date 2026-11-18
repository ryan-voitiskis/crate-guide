import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	auditNodeDependencies,
	evaluateNodeAudit,
	validateNodeSuppressions
} from './audit-node-dependencies.mjs'

const id = 'GHSA-86w9-cpqp-85rv'
const now = new Date('2026-10-24T12:00:00Z')
const policy = [
	{
		id,
		package: 'node-forge',
		version: '1.4.0',
		severity: 'high',
		consumer: 'listhen',
		consumerVersion: '1.10.1',
		owner: 'owner',
		expires: '2026-11-23',
		reason: 'Build-only TLS; guarded out of production.',
		evidence: 'docs/security/node-forge-reachability.md',
		integrity: 'sha512-fixture',
		chain: [
			{ package: 'listhen', version: '1.10.1' },
			{ package: 'node-forge', version: '1.4.0' }
		]
	}
]
const lock = {
	packages: {
		'': { dependencies: { listhen: '1.10.1' } },
		'node_modules/listhen': {
			version: '1.10.1',
			dependencies: { 'node-forge': '^1.4.0' }
		},
		'node_modules/node-forge': {
			version: '1.4.0',
			integrity: 'sha512-fixture',
			resolved: 'https://registry.npmjs.org/node-forge/-/node-forge-1.4.0.tgz'
		}
	}
}
const source = (advisory = id, severity = 'high') => ({
	url: `https://github.com/advisories/${advisory}`,
	severity,
	name: 'node-forge'
})
const finding = (name, via, severity = 'high') => ({ name, via, severity })
const report = (vulnerabilities) => ({
	vulnerabilities,
	metadata: {
		vulnerabilities: {
			...Object.fromEntries(
				['info', 'low', 'moderate', 'high', 'critical'].map((severity) => [
					severity,
					Object.values(vulnerabilities).filter((v) => v.severity === severity)
						.length
				])
			),
			total: Object.keys(vulnerabilities).length
		}
	}
})
const current = () =>
	report({ 'node-forge': finding('node-forge', [source()]) })

test('waives only the approved advisory and resolves transitive dependency cycles', () => {
	const input = report({
		'node-forge': finding('node-forge', [source()]),
		nuxt: finding('nuxt', ['node-forge', 'builder']),
		builder: finding('builder', ['nuxt'])
	})
	assert.deepEqual(evaluateNodeAudit(input, policy, lock, now), {
		blocking: [],
		suppressed: [id],
		findingCount: 3
	})
})

test('a second advisory in the same package or a different dependency still blocks', () => {
	for (const elsewhere of [false, true]) {
		const input = current()
		if (elsewhere)
			input.vulnerabilities.other = finding('other', [
				source('GHSA-aaaa-bbbb-cccc')
			])
		else
			input.vulnerabilities['node-forge'].via.push(
				source('GHSA-aaaa-bbbb-cccc')
			)
		const result = evaluateNodeAudit(
			report(input.vulnerabilities),
			policy,
			lock,
			now
		)
		assert.equal(result.blocking.length, 1)
		assert.deepEqual(result.suppressed, [id])
	}
})

test('expiry, invalid dates and increased advisory severity fail closed', () => {
	assert.throws(
		() =>
			evaluateNodeAudit(
				current(),
				policy,
				lock,
				new Date('2026-11-23T00:00:00Z')
			),
		/Expired/
	)
	const invalid = structuredClone(policy)
	invalid[0].expires = '2026-11-31'
	assert.throws(() => validateNodeSuppressions(invalid, lock, now), /expiry/)
	const escalated = report({
		'node-forge': finding('node-forge', [source(id, 'critical')], 'critical')
	})
	assert.throws(() => evaluateNodeAudit(escalated, policy, lock, now), /Unused/)
})

test('changed locked versions, new consumers, nested copies and changed integrity/source are rejected', () => {
	for (const mutate of [
		(l) => {
			l.packages['node_modules/node-forge'].version = '1.4.1'
		},
		(l) => {
			l.packages['node_modules/listhen'].version = '1.10.2'
		},
		(l) => {
			l.packages['node_modules/other'] = { dependencies: { 'node-forge': '*' } }
		},
		(l) => {
			l.packages['node_modules/other/node_modules/node-forge'] = {
				version: '1.4.0'
			}
		},
		(l) => {
			l.packages['node_modules/node-forge'].integrity = 'sha512-changed'
		},
		(l) => {
			l.packages['node_modules/node-forge'].resolved =
				'https://other.invalid/forge.tgz'
		}
	]) {
		const changed = structuredClone(lock)
		mutate(changed)
		assert.throws(
			() => evaluateNodeAudit(current(), policy, changed, now),
			/Changed/
		)
	}
})

test('incomplete, inconsistent and unresolved audit reports or stale exceptions cannot pass', () => {
	for (const input of [
		{},
		{ error: {} },
		{ vulnerabilities: [] },
		{ ...current(), metadata: { vulnerabilities: { total: 0 } } },
		report({ a: finding('a', ['missing']) }),
		report({ a: finding('a', ['a']) }),
		report({ a: finding('a', [source(id, 'moderate')]) }),
		report({})
	])
		assert.throws(() => evaluateNodeAudit(input, policy, lock, now))
})

test('without exceptions ordinary high/critical findings block and lower-severity findings remain visible', () => {
	assert.equal(evaluateNodeAudit(current(), [], lock, now).blocking.length, 1)
	const low = report({
		low: finding('low', [source('GHSA-aaaa-bbbb-cccc', 'moderate')], 'moderate')
	})
	assert.deepEqual(evaluateNodeAudit(low, [], lock, now), {
		blocking: [],
		suppressed: [],
		findingCount: 1
	})
})

test('audit command covers dev dependencies explicitly and rejects network or malformed output', () => {
	for (const production of [false, true]) {
		assert.throws(
			() =>
				auditNodeDependencies({
					production,
					root: '/',
					command: (cmd, args) => {
						assert.equal(cmd, 'npm')
						assert.deepEqual(args, [
							'audit',
							'--json',
							production ? '--omit=dev' : '--include=dev'
						])
						return { status: 2, stdout: '' }
					}
				}),
			/no findings were waived/
		)
	}
	assert.throws(
		() =>
			auditNodeDependencies({
				production: false,
				root: '/',
				command: () => ({ status: 0, stdout: 'not JSON' })
			}),
		/invalid JSON/
	)
})

const buildOnlyId = 'GHSA-fc5q-39xc-vjpf'
const buildOnlyPolicy = [
	{
		id: buildOnlyId,
		package: 'picomatch',
		scope: 'build-only',
		severity: 'high',
		owner: 'owner',
		expires: '2026-12-18',
		reason: 'Unpatched build tooling; guarded out of production.',
		evidence: 'docs/security/picomatch-reachability.md',
		installations: [
			{
				path: 'node_modules/picomatch',
				version: '4.0.7',
				integrity: 'sha512-new'
			},
			{
				path: 'node_modules/micromatch/node_modules/picomatch',
				version: '2.3.2',
				integrity: 'sha512-old'
			}
		]
	}
]
const buildOnlyLock = {
	packages: {
		'': { dependencies: { vite: '*', micromatch: '*' } },
		'node_modules/vite': { dependencies: { picomatch: '^4' } },
		'node_modules/micromatch': { dependencies: { picomatch: '^2' } },
		'node_modules/picomatch': {
			version: '4.0.7',
			integrity: 'sha512-new',
			resolved: 'https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz'
		},
		'node_modules/micromatch/node_modules/picomatch': {
			version: '2.3.2',
			integrity: 'sha512-old',
			resolved: 'https://registry.npmjs.org/picomatch/-/picomatch-2.3.2.tgz'
		}
	}
}
const buildOnlyReport = () =>
	report({
		picomatch: finding('picomatch', [
			{ ...source(buildOnlyId), name: 'picomatch' }
		]),
		vite: finding('vite', ['picomatch']),
		micromatch: finding('micromatch', ['picomatch'])
	})

test('build-only exceptions waive one guarded advisory across every pinned installation', () => {
	assert.deepEqual(
		evaluateNodeAudit(buildOnlyReport(), buildOnlyPolicy, buildOnlyLock, now),
		{ blocking: [], suppressed: [buildOnlyId], findingCount: 3 }
	)
	const another = buildOnlyReport()
	another.vulnerabilities.picomatch.via.push({
		...source('GHSA-aaaa-bbbb-cccc'),
		name: 'picomatch'
	})
	assert.equal(
		evaluateNodeAudit(
			report(another.vulnerabilities),
			buildOnlyPolicy,
			buildOnlyLock,
			now
		).blocking.length,
		1
	)
})

test('build-only exceptions fail closed on changed installations, unguarded packages, expiry or missing fields', () => {
	for (const mutate of [
		(l) => {
			l.packages['node_modules/picomatch'].version = '4.0.8'
		},
		(l) => {
			l.packages['node_modules/picomatch'].integrity = 'sha512-changed'
		},
		(l) => {
			l.packages['node_modules/picomatch'].resolved =
				'https://other.invalid/picomatch.tgz'
		},
		(l) => {
			l.packages['node_modules/other/node_modules/picomatch'] = {
				version: '4.0.7',
				integrity: 'sha512-new',
				resolved: 'https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz'
			}
		},
		(l) => {
			delete l.packages['node_modules/micromatch/node_modules/picomatch']
		}
	]) {
		const changed = structuredClone(buildOnlyLock)
		mutate(changed)
		assert.throws(
			() => evaluateNodeAudit(buildOnlyReport(), buildOnlyPolicy, changed, now),
			/Changed Node audit dependency installations/
		)
	}
	const unguarded = structuredClone(buildOnlyPolicy)
	unguarded[0].package = 'micromatch'
	assert.throws(
		() => validateNodeSuppressions(unguarded, buildOnlyLock, now),
		/production bundle guard/
	)
	assert.throws(
		() =>
			validateNodeSuppressions(
				buildOnlyPolicy,
				buildOnlyLock,
				new Date('2026-12-18T00:00:00Z')
			),
		/Expired/
	)
	for (const field of ['installations', 'evidence', 'owner', 'expires']) {
		const incomplete = structuredClone(buildOnlyPolicy)
		delete incomplete[0][field]
		assert.throws(() =>
			validateNodeSuppressions(incomplete, buildOnlyLock, now)
		)
	}
	const duplicated = structuredClone(buildOnlyPolicy)
	duplicated[0].installations.push(duplicated[0].installations[0])
	assert.throws(
		() => validateNodeSuppressions(duplicated, buildOnlyLock, now),
		/Changed/
	)
})
