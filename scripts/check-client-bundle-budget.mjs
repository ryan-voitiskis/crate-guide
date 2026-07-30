import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const JAVASCRIPT_PATTERN = /\.m?js$/
const SOURCE_MAP_PATTERN = /\.map$/

function matchesAnyPattern(file, patterns) {
	return patterns.some((pattern) => file.includes(pattern))
}

export function applyDeferredClientAssetPrefetchPolicy(manifest, config) {
	const assetPatterns = [
		...(config.workerAssetPatterns ?? []),
		...(config.wasmAssetPatterns ?? [])
	]
	for (const [moduleId, chunk] of Object.entries(manifest)) {
		if (
			(config.expectedLazyModules ?? []).includes(moduleId) ||
			(typeof chunk.file === 'string' &&
				matchesAnyPattern(chunk.file, assetPatterns))
		) {
			chunk.prefetch = false
		}
	}
}

function describeOwners(manifest, file) {
	return Object.entries(manifest.modules)
		.filter(([, module]) => module.file === file)
		.map(([id, module]) => {
			const resource = manifest.dependencies?.[id]?.preload?.[id] ?? module
			return resource.name ?? module.name ?? resource.src ?? module.src ?? id
		})
		.sort()
}

function collectInitialModuleIds(manifest) {
	assert.ok(
		Array.isArray(manifest.entrypoints) && manifest.entrypoints.length === 1,
		'Expected one semantic Nuxt client entrypoint'
	)
	const initialIds = new Set()
	const pending = [...manifest.entrypoints]

	while (pending.length > 0) {
		const moduleId = pending.pop()
		if (initialIds.has(moduleId)) continue
		const module = manifest.modules[moduleId]
		assert.ok(module, 'Missing client manifest module: ' + moduleId)
		initialIds.add(moduleId)
		const resource =
			manifest.dependencies?.[moduleId]?.preload?.[moduleId] ?? module
		for (const importedId of resource.imports ?? []) pending.push(importedId)
	}

	return initialIds
}

function metric(file, bytes, category, owners = []) {
	return {
		category,
		file,
		gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
		owners,
		rawBytes: bytes.byteLength
	}
}

export function analyzeClientBundle({ assets, config, manifest }) {
	const initialIds = collectInitialModuleIds(manifest)
	const initialFiles = new Set(
		[...initialIds]
			.map((moduleId) => manifest.modules[moduleId].file)
			.filter((file) => JAVASCRIPT_PATTERN.test(file))
	)
	const metrics = []

	for (const asset of assets) {
		if (SOURCE_MAP_PATTERN.test(asset.file)) continue
		const owners = describeOwners(manifest, asset.file)
		let category = 'other'
		if (matchesAnyPattern(asset.file, config.workerAssetPatterns)) {
			category = 'worker'
		} else if (matchesAnyPattern(asset.file, config.wasmAssetPatterns)) {
			category = 'wasm'
		} else if (initialFiles.has(asset.file)) {
			category = 'initial-js'
		} else if (JAVASCRIPT_PATTERN.test(asset.file)) {
			category = 'ordinary-js'
		} else if (asset.file.endsWith('.css')) {
			category = 'css'
		}
		metrics.push(metric(asset.file, asset.bytes, category, owners))
	}

	const initial = metrics.filter((asset) => asset.category === 'initial-js')
	assert.equal(
		initial.length,
		initialFiles.size,
		'Every initial JavaScript asset must exist in the built public directory'
	)
	const ordinary = metrics
		.filter((asset) => asset.category === 'ordinary-js')
		.sort((left, right) => right.rawBytes - left.rawBytes)
	const semanticLazyBoundaries = Object.fromEntries(
		(config.expectedLazyModules ?? []).map((moduleId) => {
			const module = manifest.modules[moduleId]
			assert.ok(module, 'Missing expected semantic lazy module: ' + moduleId)
			const resource =
				manifest.dependencies?.[moduleId]?.preload?.[moduleId] ?? module
			return [
				moduleId,
				{
					file: module.file,
					isInitial: initialIds.has(moduleId) || initialFiles.has(module.file),
					isPrefetched: resource.prefetch !== false
				}
			]
		})
	)

	return {
		initialJavaScript: {
			files: initial.map((asset) => asset.file).sort(),
			gzipBytes: initial.reduce((total, asset) => total + asset.gzipBytes, 0),
			rawBytes: initial.reduce((total, asset) => total + asset.rawBytes, 0)
		},
		largestOrdinaryChunk: ordinary[0] ?? null,
		metrics: metrics.sort((left, right) => right.rawBytes - left.rawBytes),
		semanticLazyBoundaries
	}
}

function assertBudget(label, actual, budget) {
	for (const kind of ['rawBytes', 'gzipBytes']) {
		if (actual[kind] <= budget[kind]) continue
		throw new Error(
			label +
				' exceeds the ' +
				kind +
				' budget: actual ' +
				actual[kind] +
				' bytes, limit ' +
				budget[kind] +
				' bytes'
		)
	}
}

export function assertClientBundleBudget(report, config) {
	assertBudget(
		'Initial client JavaScript',
		report.initialJavaScript,
		config.budgets.initialJavaScript
	)
	assert.ok(
		report.largestOrdinaryChunk,
		'Expected at least one lazy or shared ordinary JavaScript chunk'
	)
	assertBudget(
		'Largest ordinary chunk ' + report.largestOrdinaryChunk.file,
		report.largestOrdinaryChunk,
		config.budgets.largestOrdinaryChunk
	)
	for (const pattern of config.workerAssetPatterns) {
		assert.ok(
			report.metrics.some(
				(asset) => asset.category === 'worker' && asset.file.includes(pattern)
			),
			'Missing expected Worker asset boundary: ' + pattern
		)
	}
	for (const pattern of config.wasmAssetPatterns) {
		assert.ok(
			report.metrics.some(
				(asset) => asset.category === 'wasm' && asset.file.includes(pattern)
			),
			'Missing expected WASM asset boundary: ' + pattern
		)
	}
	for (const moduleId of config.expectedLazyModules ?? []) {
		assert.equal(
			report.semanticLazyBoundaries[moduleId].isInitial,
			false,
			'Expected semantic module to stay outside initial JavaScript: ' + moduleId
		)
		assert.equal(
			report.semanticLazyBoundaries[moduleId].isPrefetched,
			false,
			'Expected semantic module not to be prefetched before use: ' + moduleId
		)
	}
}

export async function loadClientBundleReport({
	assetDirectory,
	config,
	manifestDirectory,
	manifestDirectories = [manifestDirectory]
}) {
	const precomputedFiles = []
	for (const directory of manifestDirectories) {
		const resolvedDirectory = resolve(directory)
		try {
			for (const file of await readdir(resolvedDirectory)) {
				if (!/^(?:client\.)?precomputed(?:\..*)?\.mjs$/.test(file)) continue
				precomputedFiles.push(resolve(resolvedDirectory, file))
			}
		} catch (error) {
			if (error?.code === 'ENOENT') continue
			throw new Error(
				`Could not inspect client manifest directory: ${resolvedDirectory}`,
				{ cause: error }
			)
		}
	}
	assert.equal(
		precomputedFiles.length,
		1,
		'Expected one client precomputed manifest'
	)
	const manifestUrl =
		pathToFileURL(precomputedFiles[0]).href + '?bundle-budget=' + Date.now()
	const manifest = (await import(manifestUrl)).default
	const resolvedAssetDirectory = resolve(assetDirectory)
	const assetFiles = (
		await readdir(resolvedAssetDirectory, { withFileTypes: true })
	)
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
	const assets = await Promise.all(
		assetFiles.map(async (file) => ({
			bytes: await readFile(resolve(resolvedAssetDirectory, file)),
			file
		}))
	)
	return analyzeClientBundle({ assets, config, manifest })
}

async function loadBuild(buildDirectory, config) {
	const buildRoot = resolve(buildDirectory)
	return loadClientBundleReport({
		assetDirectory: resolve(buildRoot, '_nuxt'),
		config,
		manifestDirectories: [
			resolve(buildRoot, '_worker.js/chunks/build'),
			resolve(buildRoot, '_worker.js/chunks/virtual')
		]
	})
}

function formatMetric(metric) {
	const owners =
		metric.owners?.length > 0 ? ' [' + metric.owners.join(', ') + ']' : ''
	return (
		metric.file +
		': ' +
		metric.rawBytes +
		' raw / ' +
		metric.gzipBytes +
		' gzip' +
		owners
	)
}

export function formatClientBundleReport(report) {
	const lines = [
		'Initial client JavaScript: ' +
			report.initialJavaScript.rawBytes +
			' raw / ' +
			report.initialJavaScript.gzipBytes +
			' gzip across ' +
			report.initialJavaScript.files.join(', '),
		'Largest ordinary chunk: ' + formatMetric(report.largestOrdinaryChunk)
	]
	for (const category of ['worker', 'wasm', 'css']) {
		const assets = report.metrics.filter((asset) => asset.category === category)
		for (const asset of assets)
			lines.push(category + ': ' + formatMetric(asset))
	}
	for (const [moduleId, boundary] of Object.entries(
		report.semanticLazyBoundaries
	)) {
		lines.push('lazy module: ' + moduleId + ' -> ' + boundary.file)
	}
	return lines.join('\n')
}

export async function checkClientBundleBudget(options = {}) {
	const root = resolve(options.root ?? process.cwd())
	const config = JSON.parse(
		await readFile(
			resolve(root, 'shared/config/clientBundleBudget.json'),
			'utf8'
		)
	)
	const report = await loadBuild(
		resolve(root, options.buildDirectory ?? 'dist'),
		config
	)
	assertClientBundleBudget(report, config)
	return report
}

const isDirectRun =
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
	const report = await checkClientBundleBudget()
	console.log(formatClientBundleReport(report))
	console.log('Client bundle budget passed.')
}
