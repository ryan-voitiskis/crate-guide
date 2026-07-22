import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OSV_API = 'https://api.osv.dev/v1'

function parseLockedPackage(key) {
	const versionSeparator = key.lastIndexOf('@')
	if (versionSeparator <= 0 || versionSeparator === key.length - 1) {
		throw new Error(`Unsupported npm lock entry: ${key}`)
	}
	return {
		ecosystem: 'npm',
		name: key.slice(0, versionSeparator),
		version: key.slice(versionSeparator + 1)
	}
}

export function extractEdgePackages(lockContents) {
	let lock
	try {
		lock = JSON.parse(lockContents)
	} catch {
		throw new Error('supabase/deno.lock must contain valid JSON')
	}
	if (lock?.version !== '5' || !lock.npm || typeof lock.npm !== 'object') {
		throw new Error('supabase/deno.lock must use the reviewed version 5 format')
	}
	if (lock.remote && Object.keys(lock.remote).length > 0) {
		throw new Error(
			'Remote URL dependencies cannot be audited by package version; replace or explicitly map them'
		)
	}
	if (lock.jsr && Object.keys(lock.jsr).length > 0) {
		throw new Error(
			'JSR dependencies require an audited ecosystem mapping before they can enter the Edge lock'
		)
	}
	return Object.keys(lock.npm).map(parseLockedPackage)
}

function validateSuppressions(suppressions, now) {
	if (!Array.isArray(suppressions)) {
		throw new Error('Edge audit suppressions must be a JSON array')
	}
	for (const suppression of suppressions) {
		if (
			typeof suppression?.id !== 'string' ||
			typeof suppression?.package !== 'string' ||
			typeof suppression?.owner !== 'string' ||
			suppression.owner.trim().length === 0 ||
			typeof suppression?.reason !== 'string' ||
			suppression.reason.trim().length === 0 ||
			typeof suppression?.expires !== 'string'
		) {
			throw new Error(
				'Each Edge audit suppression needs id, package, owner, reason, and expires'
			)
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(suppression.expires)) {
			throw new Error(`Invalid suppression expiry for ${suppression.id}`)
		}
		const expiry = Date.parse(`${suppression.expires}T23:59:59.999Z`)
		if (!Number.isFinite(expiry)) {
			throw new Error(`Invalid suppression expiry for ${suppression.id}`)
		}
		if (expiry < now.getTime()) {
			throw new Error(
				`Expired Edge audit suppression ${suppression.id} for ${suppression.package}`
			)
		}
	}
}

function advisorySeverity(advisory) {
	const severities = [
		advisory?.database_specific?.severity,
		...(advisory?.affected ?? []).map(
			(affected) => affected?.database_specific?.severity
		)
	]
		.filter((value) => typeof value === 'string')
		.map((value) => value.toUpperCase())
	if (severities.includes('CRITICAL')) return 'CRITICAL'
	if (severities.includes('HIGH')) return 'HIGH'
	if (
		severities.some((severity) =>
			['LOW', 'MODERATE', 'MEDIUM'].includes(severity)
		)
	) {
		return 'BELOW_HIGH'
	}
	return 'UNKNOWN'
}

export function evaluateAuditFindings({
	findings,
	suppressions,
	now = new Date()
}) {
	validateSuppressions(suppressions, now)
	const actionable = []
	for (const finding of findings) {
		const severity = advisorySeverity(finding.advisory)
		if (severity === 'BELOW_HIGH') continue
		const suppressed = suppressions.some(
			(suppression) =>
				suppression.id === finding.advisory.id &&
				suppression.package === finding.package.name
		)
		if (!suppressed) {
			actionable.push({ ...finding, severity })
		}
	}
	return actionable
}

async function fetchJson(url, init, fetcher) {
	const response = await fetcher(url, init)
	if (!response.ok) {
		throw new Error(`OSV request failed with status ${response.status}`)
	}
	return response.json()
}

export async function queryOsv(packages, fetcher = fetch) {
	const batch = await fetchJson(
		`${OSV_API}/querybatch`,
		{
			body: JSON.stringify({
				queries: packages.map((pkg) => ({
					package: { ecosystem: pkg.ecosystem, name: pkg.name },
					version: pkg.version
				}))
			}),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
			signal: AbortSignal.timeout(20_000)
		},
		fetcher
	)
	if (
		!Array.isArray(batch.results) ||
		batch.results.length !== packages.length
	) {
		throw new Error('OSV batch response did not match the frozen package list')
	}
	if (batch.results.some((result) => result.next_page_token)) {
		throw new Error(
			'OSV batch response was paginated; audit coverage is incomplete'
		)
	}

	const advisoryCache = new Map()
	const findings = []
	for (const [index, result] of batch.results.entries()) {
		for (const summary of result.vulns ?? []) {
			if (!advisoryCache.has(summary.id)) {
				advisoryCache.set(
					summary.id,
					fetchJson(
						`${OSV_API}/vulns/${encodeURIComponent(summary.id)}`,
						{ signal: AbortSignal.timeout(20_000) },
						fetcher
					)
				)
			}
			findings.push({
				advisory: await advisoryCache.get(summary.id),
				package: packages[index]
			})
		}
	}
	return findings
}

export async function auditEdgeDependencies({
	fetcher = fetch,
	lockPath = resolve(repositoryRoot, 'supabase/deno.lock'),
	now = new Date(),
	suppressionPath = resolve(
		repositoryRoot,
		'security/edge-audit-suppressions.json'
	)
} = {}) {
	const [lockContents, suppressionContents] = await Promise.all([
		readFile(lockPath, 'utf8'),
		readFile(suppressionPath, 'utf8')
	])
	const packages = extractEdgePackages(lockContents)
	const findings = await queryOsv(packages, fetcher)
	const actionable = evaluateAuditFindings({
		findings,
		now,
		suppressions: JSON.parse(suppressionContents)
	})
	if (actionable.length > 0) {
		throw new Error(
			actionable
				.map(
					(finding) =>
						`${finding.advisory.id} ${finding.severity} in ${finding.package.name}@${finding.package.version}`
				)
				.join('; ')
		)
	}
	return { findingCount: findings.length, packageCount: packages.length }
}

const isDirectRun =
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
	auditEdgeDependencies()
		.then(({ findingCount, packageCount }) => {
			console.log(
				`Edge dependency audit passed (${packageCount} frozen packages, ${findingCount} below-threshold or suppressed advisories).`
			)
		})
		.catch((error) => {
			console.error(`Edge dependency audit failed: ${error.message}`)
			process.exitCode = 1
		})
}
