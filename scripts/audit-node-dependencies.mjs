import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const severities = ['info', 'low', 'moderate', 'high', 'critical']
const high = (severity) => ['high', 'critical'].includes(severity)
const advisoryId = (url) =>
	/^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/.exec(
		url
	)?.[1]

export function validateNodeSuppressions(suppressions, lock, now = new Date()) {
	if (!Array.isArray(suppressions) || !lock?.packages)
		throw new Error('Invalid Node audit policy or lockfile.')
	const ids = new Set()
	for (const entry of suppressions) {
		if (
			!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(entry.id || '') ||
			ids.has(entry.id) ||
			!['package', 'version', 'owner', 'reason'].every(
				(field) => typeof entry[field] === 'string' && entry[field].length > 0
			) ||
			entry.severity !== 'high' ||
			!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires || '') ||
			!Number.isFinite(Date.parse(`${entry.expires}T00:00:00Z`)) ||
			!Array.isArray(entry.chain) ||
			entry.chain.length < 2 ||
			!entry.evidence?.startsWith('docs/security/') ||
			!entry.integrity
		)
			throw new Error(
				'Each Node audit exception needs an exact advisory, version, chain, owner, evidence and expiry.'
			)
		ids.add(entry.id)
		if (
			new Date(`${entry.expires}T00:00:00Z`).toISOString().slice(0, 10) !==
			entry.expires
		)
			throw new Error('Invalid Node audit exception expiry date.')
		if (now >= new Date(`${entry.expires}T00:00:00Z`))
			throw new Error(`Expired Node audit exception ${entry.id}.`)
		const last = entry.chain.at(-1)
		const consumer = entry.chain.at(-2)
		if (
			last.package !== entry.package ||
			last.version !== entry.version ||
			consumer.package !== entry.consumer ||
			consumer.version !== entry.consumerVersion
		)
			throw new Error(
				'Node audit exception chain does not match its package and consumer.'
			)
		for (const item of entry.chain) {
			const path = `node_modules/${item.package}`
			const installations = Object.entries(lock.packages).filter(
				([name]) => name === path || name.endsWith(`/${path}`)
			)
			if (
				installations.length !== 1 ||
				installations[0][0] !== path ||
				installations[0][1].version !== item.version
			)
				throw new Error(
					`Changed Node audit dependency version or location: ${item.package}.`
				)
		}
		for (let index = 1; index < entry.chain.length; index++) {
			const child = entry.chain[index].package
			const parent = entry.chain[index - 1].package
			const consumers = Object.entries(lock.packages).filter(([, value]) =>
				[
					'dependencies',
					'optionalDependencies',
					'peerDependencies',
					'devDependencies'
				].some((field) => Object.hasOwn(value[field] || {}, child))
			)
			if (
				consumers.length !== 1 ||
				consumers[0][0] !== `node_modules/${parent}`
			)
				throw new Error(`Changed Node audit dependency consumer: ${child}.`)
		}
		const installed = lock.packages[`node_modules/${entry.package}`]
		if (
			installed.integrity !== entry.integrity ||
			installed.resolved !==
				`https://registry.npmjs.org/${entry.package}/-/${entry.package}-${entry.version}.tgz`
		)
			throw new Error('Changed Node audit package source or integrity.')
	}
	return suppressions
}

export function evaluateNodeAudit(
	report,
	suppressions,
	lock,
	now = new Date()
) {
	const approved = validateNodeSuppressions(suppressions, lock, now)
	if (
		report?.error ||
		!report?.vulnerabilities ||
		typeof report.vulnerabilities !== 'object' ||
		Array.isArray(report.vulnerabilities)
	)
		throw new Error('Incomplete npm audit report.')
	const graph = new Map()
	const roots = new Map()
	for (const [name, finding] of Object.entries(report.vulnerabilities)) {
		if (
			finding.name !== name ||
			!Array.isArray(finding.via) ||
			!severities.includes(finding.severity)
		)
			throw new Error('Malformed npm audit finding.')
		const node = { roots: new Set(), parents: [], severity: finding.severity }
		for (const source of finding.via) {
			if (typeof source === 'string') {
				node.parents.push(source)
				continue
			}
			if (!source || !source.url || !severities.includes(source.severity))
				throw new Error('Malformed npm audit advisory.')
			const key = `${name}\n${source.url}`
			roots.set(key, { ...source, package: name })
			node.roots.add(key)
		}
		graph.set(name, node)
	}
	const totals = report.metadata?.vulnerabilities
	if (
		!totals ||
		totals.total !== graph.size ||
		severities.some(
			(severity) =>
				totals[severity] !==
				[...graph.values()].filter((node) => node.severity === severity).length
		)
	)
		throw new Error('npm audit finding counts do not match the report.')
	// Resolve transitive findings to their actual advisories, including dependency cycles.
	let changed = true
	while (changed) {
		changed = false
		for (const node of graph.values())
			for (const name of node.parents) {
				const parent = graph.get(name)
				if (!parent) throw new Error('Incomplete npm audit dependency graph.')
				for (const root of parent.roots)
					if (!node.roots.has(root)) {
						node.roots.add(root)
						changed = true
					}
			}
	}
	for (const node of graph.values())
		if (
			high(node.severity) &&
			![...node.roots].some((key) => high(roots.get(key).severity))
		)
			throw new Error('High-severity npm finding has no resolved advisory.')
	const suppressed = new Set()
	const blocking = []
	for (const root of roots.values()) {
		if (!high(root.severity)) continue
		const policy = approved.find(
			(entry) =>
				entry.package === root.package &&
				entry.id === advisoryId(root.url) &&
				entry.severity === root.severity
		)
		if (policy) suppressed.add(policy.id)
		else blocking.push(root)
	}
	for (const entry of approved)
		if (!suppressed.has(entry.id))
			throw new Error(
				`Unused Node audit exception ${entry.id}; remove or reassess it.`
			)
	return { blocking, suppressed: [...suppressed], findingCount: graph.size }
}

export function auditNodeDependencies({
	production,
	root,
	command = spawnSync
}) {
	const result = command(
		'npm',
		['audit', '--json', production ? '--omit=dev' : '--include=dev'],
		{
			cwd: root,
			encoding: 'utf8',
			timeout: 120_000,
			maxBuffer: 16 * 1024 * 1024
		}
	)
	if (result.error || ![0, 1].includes(result.status))
		throw new Error('npm audit failed; no findings were waived.')
	let report
	try {
		report = JSON.parse(result.stdout)
	} catch {
		throw new Error('npm audit returned invalid JSON; no findings were waived.')
	}
	if (result.status === 1 && report.metadata?.vulnerabilities?.total === 0)
		throw new Error(
			'npm audit failed without findings; no findings were waived.'
		)
	return evaluateNodeAudit(
		report,
		JSON.parse(
			readFileSync(resolve(root, 'security/npm-audit-suppressions.json'))
		),
		JSON.parse(readFileSync(resolve(root, 'package-lock.json')))
	)
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		if (
			process.argv.length !== 3 ||
			!['--production', '--all'].includes(process.argv[2])
		)
			throw new Error('Choose exactly --production or --all.')
		const result = auditNodeDependencies({
			production: process.argv[2] === '--production',
			root: resolve(dirname(fileURLToPath(import.meta.url)), '..')
		})
		for (const finding of result.blocking)
			console.error(`${finding.severity}: ${finding.package} ${finding.url}`)
		if (result.blocking.length) process.exitCode = 1
		else
			console.log(
				`Node dependency audit passed (${result.findingCount} findings; approved root advisories: ${result.suppressed.join(', ') || 'none'}).`
			)
	} catch (error) {
		console.error(
			`Node dependency audit failed: ${error instanceof SyntaxError ? 'Invalid policy or lockfile JSON.' : error.message}`
		)
		process.exitCode = 1
	}
}
