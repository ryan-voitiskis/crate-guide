import assert from 'node:assert/strict'
import test from 'node:test'
import {
	evaluateAuditFindings,
	extractEdgePackages
} from './audit-edge-dependencies.mjs'

const now = new Date('2026-07-22T00:00:00.000Z')
const highFinding = {
	advisory: {
		id: 'GHSA-test-high',
		database_specific: { severity: 'HIGH' }
	},
	package: { ecosystem: 'npm', name: 'fixture', version: '1.0.0' }
}

test('extracts every exact npm package version from the Deno lock', () => {
	assert.deepEqual(
		extractEdgePackages(
			JSON.stringify({
				version: '5',
				npm: {
					'@scope/package@1.2.3': { integrity: 'fixture' },
					'plain@4.5.6': { integrity: 'fixture' }
				}
			})
		),
		[
			{ ecosystem: 'npm', name: '@scope/package', version: '1.2.3' },
			{ ecosystem: 'npm', name: 'plain', version: '4.5.6' }
		]
	)
})

test('fails closed on unversioned remote dependencies', () => {
	assert.throws(
		() =>
			extractEdgePackages(
				JSON.stringify({
					version: '5',
					npm: {},
					remote: { 'https://example.test/module.ts': 'hash' }
				})
			),
		/cannot be audited by package version/
	)
})

test('reports a simulated high advisory', () => {
	assert.deepEqual(
		evaluateAuditFindings({ findings: [highFinding], now, suppressions: [] }),
		[{ ...highFinding, severity: 'HIGH' }]
	)
})

test('accepts a narrow current suppression with ownership and rationale', () => {
	assert.deepEqual(
		evaluateAuditFindings({
			findings: [highFinding],
			now,
			suppressions: [
				{
					expires: '2026-08-01',
					id: 'GHSA-test-high',
					owner: '@maintainer',
					package: 'fixture',
					reason: 'Not reachable in the Edge entry points'
				}
			]
		}),
		[]
	)
})

test('rejects an expired suppression even when no advisory is returned', () => {
	assert.throws(
		() =>
			evaluateAuditFindings({
				findings: [],
				now,
				suppressions: [
					{
						expires: '2026-07-21',
						id: 'GHSA-test-high',
						owner: '@maintainer',
						package: 'fixture',
						reason: 'Temporary reachability exception'
					}
				]
			}),
		/Expired Edge audit suppression/
	)
})
