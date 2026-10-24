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
