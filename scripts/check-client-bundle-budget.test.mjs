import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	analyzeClientBundle,
	assertClientBundleBudget,
	formatClientBundleReport
} from './check-client-bundle-budget.mjs'

const config = {
	budgets: {
		initialJavaScript: { gzipBytes: 1_000, rawBytes: 2_000 },
		largestOrdinaryChunk: { gzipBytes: 500, rawBytes: 1_000 }
	},
	expectedLazyModules: ['lazy'],
	wasmAssetPatterns: ['analysis-wasm.'],
	workerAssetPatterns: ['analysis.worker-']
}

const manifest = {
	entrypoints: ['entry'],
	modules: {
		entry: { file: 'entry-hash.js', imports: ['shared'], name: 'entry' },
		lazy: { file: 'lazy-hash.js', name: 'enrichment' },
		shared: { file: 'shared-hash.js', name: 'shared' }
	}
}

function fixture(overrides = {}) {
	return analyzeClientBundle({
		assets: [
			{ bytes: Buffer.alloc(600, 1), file: 'entry-hash.js' },
			{ bytes: Buffer.alloc(300, 2), file: 'shared-hash.js' },
			{ bytes: Buffer.alloc(700, 3), file: 'lazy-hash.js' },
			{ bytes: Buffer.alloc(2_500, 4), file: 'analysis-wasm.hash.js' },
			{ bytes: Buffer.alloc(200, 5), file: 'analysis.worker-hash.js' },
			{ bytes: Buffer.alloc(400, 6), file: 'entry-hash.js.map' },
			{ bytes: Buffer.alloc(100, 7), file: 'entry-hash.css' }
		],
		config,
		manifest,
		...overrides
	})
}

test('classifies the semantic entry closure separately from optional assets', () => {
	const report = fixture()
	assert.deepEqual(report.initialJavaScript.files, [
		'entry-hash.js',
		'shared-hash.js'
	])
	assert.equal(report.initialJavaScript.rawBytes, 900)
	assert.equal(report.largestOrdinaryChunk.file, 'lazy-hash.js')
	expectLazyBoundary(report)
	assert.equal(
		report.metrics.find((asset) => asset.file.includes('analysis-wasm'))
			.category,
		'wasm'
	)
	assert.equal(
		report.metrics.find((asset) => asset.file.includes('analysis.worker'))
			.category,
		'worker'
	)
	assert.equal(
		report.metrics.some((asset) => asset.file.endsWith('.map')),
		false
	)
	assert.doesNotThrow(() => assertClientBundleBudget(report, config))
})

function expectLazyBoundary(report) {
	assert.deepEqual(report.semanticLazyBoundaries.lazy, {
		file: 'lazy-hash.js',
		isInitial: false
	})
}

test('reports the offending semantic asset and byte dimension', () => {
	const report = fixture()
	assert.throws(
		() =>
			assertClientBundleBudget(report, {
				...config,
				budgets: {
					...config.budgets,
					largestOrdinaryChunk: { gzipBytes: 500, rawBytes: 699 }
				}
			}),
		/Largest ordinary chunk lazy-hash\.js exceeds the rawBytes budget.*actual 700 bytes, limit 699 bytes/
	)
	assert.throws(
		() =>
			assertClientBundleBudget(report, {
				...config,
				budgets: {
					...config.budgets,
					initialJavaScript: { gzipBytes: 10, rawBytes: 2_000 }
				}
			}),
		/Initial client JavaScript exceeds the gzipBytes budget.*actual \d+ bytes, limit 10 bytes/
	)
})

test('fails when an expected optional boundary disappears', () => {
	const report = fixture()
	assert.throws(
		() =>
			assertClientBundleBudget(report, {
				...config,
				workerAssetPatterns: ['missing.worker-']
			}),
		/Missing expected Worker asset boundary/
	)
	assert.throws(
		() =>
			fixture({
				config: { ...config, expectedLazyModules: ['missing'] }
			}),
		/Missing expected semantic lazy module/
	)
})

test('formats initial, lazy, Worker, WASM, and CSS evidence', () => {
	const output = formatClientBundleReport(fixture())
	for (const label of [
		'Initial client JavaScript',
		'Largest ordinary chunk',
		'worker:',
		'wasm:',
		'css:',
		'lazy module:'
	]) {
		assert.match(output, new RegExp(label))
	}
	assert.match(output, /enrichment/)
})
