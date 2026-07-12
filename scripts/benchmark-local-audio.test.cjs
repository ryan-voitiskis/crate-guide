const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { afterEach, test } = require('node:test')
const sharedConfiguration = require('../shared/config/localAudioAnalysis.json')

const environmentKeys = [
	'ESSENTIA_KEY_PROFILES',
	'ESSENTIA_ANALYSIS_LAYOUT',
	'ESSENTIA_RHYTHM_METHOD',
	'ESSENTIA_INCLUDE_ESTIMATES'
]
const originalEnvironment = Object.fromEntries(
	environmentKeys.map((key) => [key, process.env[key]])
)
const sharedConfigurationSnapshot = structuredClone(sharedConfiguration)

const {
	buildBenchmarkMetadata,
	buildBenchmarkOutput,
	buildEffectiveConfiguration,
	buildKeyExtractorArguments,
	buildRhythmExtractorArguments
} = require('./benchmark-local-audio.cjs')
const benchmarkSource = readFileSync(
	require.resolve('./benchmark-local-audio.cjs'),
	'utf8'
)

afterEach(() => {
	for (const key of environmentKeys) {
		const originalValue = originalEnvironment[key]
		if (originalValue === undefined) delete process.env[key]
		else process.env[key] = originalValue
	}
})

function replaceBenchmarkEnvironment(overrides = {}) {
	for (const key of environmentKeys) delete process.env[key]
	Object.assign(process.env, overrides)
}

test('imports benchmark helpers without loading Essentia', () => {
	const loadedEssentiaModules = Object.keys(require.cache).filter((fileName) =>
		fileName.includes('/node_modules/essentia.js/')
	)

	assert.deepEqual(loadedEssentiaModules, [])
})

test('builds an immutable effective configuration from shared defaults', () => {
	replaceBenchmarkEnvironment()

	const effectiveConfiguration = buildEffectiveConfiguration(process.env)

	assert.deepEqual(effectiveConfiguration, {
		analyzerVersion: 'essentia.js@0.1.3',
		configurationVersion: 'center-180s-44k1-v1',
		sampleRate: 44_100,
		maxAnalysisSeconds: 180,
		minimumConfidence: {
			bpm: 1.5,
			keyStrength: 0.8
		},
		rhythmExtractor: {
			maximumTempo: 208,
			method: 'multifeature',
			minimumTempo: 40
		},
		keyExtractor: {
			averageDetuningCorrection: true,
			frameSize: 4096,
			hopSize: 4096,
			hpcpSize: 12,
			maximumFrequency: 3500,
			maximumSpectralPeaks: 60,
			minimumFrequency: 25,
			pcpThreshold: 0.2,
			profile: 'edma',
			sampleRate: 44_100,
			spectralPeaksThreshold: 0.0001,
			tuningFrequency: 440,
			weightType: 'cosine',
			windowType: 'hann'
		},
		keyProfiles: ['edma'],
		analysisLayout: 'center',
		includeEstimates: false
	})
	assert.equal(Object.isFrozen(effectiveConfiguration), true)
	assert.equal(Object.isFrozen(effectiveConfiguration.minimumConfidence), true)
	assert.equal(Object.isFrozen(effectiveConfiguration.rhythmExtractor), true)
	assert.equal(Object.isFrozen(effectiveConfiguration.keyExtractor), true)
	assert.equal(Object.isFrozen(effectiveConfiguration.keyProfiles), true)
})

test('applies environment overrides without mutating shared defaults', () => {
	replaceBenchmarkEnvironment({
		ESSENTIA_KEY_PROFILES: 'edma, bgate',
		ESSENTIA_ANALYSIS_LAYOUT: 'distributed',
		ESSENTIA_RHYTHM_METHOD: 'degara',
		ESSENTIA_INCLUDE_ESTIMATES: '1'
	})

	const effectiveConfiguration = buildEffectiveConfiguration(process.env)

	assert.deepEqual(effectiveConfiguration.keyProfiles, ['edma', 'bgate'])
	assert.equal(effectiveConfiguration.analysisLayout, 'distributed')
	assert.equal(effectiveConfiguration.rhythmExtractor.method, 'degara')
	assert.equal(effectiveConfiguration.includeEstimates, true)
	assert.notStrictEqual(
		effectiveConfiguration.rhythmExtractor,
		sharedConfiguration.rhythmExtractor
	)
	assert.notStrictEqual(
		effectiveConfiguration.keyExtractor,
		sharedConfiguration.keyExtractor
	)
	assert.deepEqual(sharedConfiguration, sharedConfigurationSnapshot)
})

test('preserves empty, whitespace, and estimates override semantics', () => {
	const emptyOverrides = buildEffectiveConfiguration({
		ESSENTIA_KEY_PROFILES: '',
		ESSENTIA_ANALYSIS_LAYOUT: '',
		ESSENTIA_RHYTHM_METHOD: '',
		ESSENTIA_INCLUDE_ESTIMATES: 'true'
	})
	const whitespaceOverrides = buildEffectiveConfiguration({
		ESSENTIA_KEY_PROFILES: ' ',
		ESSENTIA_ANALYSIS_LAYOUT: ' ',
		ESSENTIA_RHYTHM_METHOD: ' ',
		ESSENTIA_INCLUDE_ESTIMATES: '0'
	})

	assert.deepEqual(emptyOverrides.keyProfiles, ['edma'])
	assert.equal(emptyOverrides.analysisLayout, 'center')
	assert.equal(emptyOverrides.rhythmExtractor.method, 'multifeature')
	assert.equal(emptyOverrides.includeEstimates, false)
	assert.deepEqual(whitespaceOverrides.keyProfiles, [])
	assert.equal(whitespaceOverrides.analysisLayout, ' ')
	assert.equal(whitespaceOverrides.rhythmExtractor.method, ' ')
	assert.equal(whitespaceOverrides.includeEstimates, false)
})

test('preserves benchmark extractor positional argument values and order', () => {
	const effectiveConfiguration = buildEffectiveConfiguration({
		ESSENTIA_KEY_PROFILES: 'bgate',
		ESSENTIA_RHYTHM_METHOD: 'degara'
	})

	assert.deepEqual(buildRhythmExtractorArguments(effectiveConfiguration), [
		208,
		'degara',
		40
	])
	assert.deepEqual(
		buildKeyExtractorArguments(effectiveConfiguration, 'bgate'),
		[
			true,
			4096,
			4096,
			12,
			3500,
			60,
			25,
			0.2,
			'bgate',
			44_100,
			0.0001,
			440,
			'cosine',
			'hann'
		]
	)
})

test('adds exact immutable analysis metadata to every output row and summary', () => {
	const effectiveConfiguration = buildEffectiveConfiguration({
		ESSENTIA_KEY_PROFILES: 'edma,bgate',
		ESSENTIA_ANALYSIS_LAYOUT: 'distributed',
		ESSENTIA_RHYTHM_METHOD: 'degara',
		ESSENTIA_INCLUDE_ESTIMATES: '1'
	})
	const metadata = buildBenchmarkMetadata(
		effectiveConfiguration,
		'essentia-runtime-test'
	)
	const results = [{ track: 'one' }, { track: 'two' }]
	const summary = { tracks: 2 }

	const output = buildBenchmarkOutput(results, summary, metadata)

	assert.deepEqual(metadata, {
		analyzerVersion: 'essentia.js@0.1.3',
		configurationVersion: 'center-180s-44k1-v1',
		sampleRate: 44_100,
		maxAnalysisSeconds: 180,
		rhythmExtractor: {
			maximumTempo: 208,
			method: 'degara',
			minimumTempo: 40
		},
		keyProfiles: ['edma', 'bgate'],
		analysisLayout: 'distributed',
		includeEstimates: true,
		essentiaRuntimeVersion: 'essentia-runtime-test'
	})
	assert.equal(Object.isFrozen(metadata), true)
	assert.equal(Object.isFrozen(metadata.rhythmExtractor), true)
	assert.equal(Object.isFrozen(metadata.keyProfiles), true)
	assert.deepEqual(output.results, [
		{ track: 'one', analysisMetadata: metadata },
		{ track: 'two', analysisMetadata: metadata }
	])
	assert.deepEqual(output.summary, { tracks: 2, analysisMetadata: metadata })
	assert.strictEqual(output.results[0].analysisMetadata, metadata)
	assert.strictEqual(output.results[1].analysisMetadata, metadata)
	assert.strictEqual(output.summary.analysisMetadata, metadata)
	assert.deepEqual(results, [{ track: 'one' }, { track: 'two' }])
	assert.deepEqual(summary, { tracks: 2 })
})

test('routes the CLI through effective configuration and output builders', () => {
	assert.equal(
		(benchmarkSource.match(/essentia\.RhythmExtractor2013\(/g) || []).length,
		1
	)
	assert.equal(
		(benchmarkSource.match(/essentia\.KeyExtractor\(/g) || []).length,
		1
	)
	assert.match(
		benchmarkSource,
		/essentia\.RhythmExtractor2013\(\s*signal,\s*\.\.\.buildRhythmExtractorArguments\(effectiveConfiguration\)\s*\)/s
	)
	assert.match(
		benchmarkSource,
		/essentia\.KeyExtractor\(\s*signal,\s*\.\.\.buildKeyExtractorArguments\(effectiveConfiguration, profile\)\s*\)/s
	)
	assert.match(
		benchmarkSource,
		/decodeSegment\(\s*row\.fileName,\s*duration,\s*effectiveConfiguration\s*\)/s
	)
	assert.match(
		benchmarkSource,
		/analyze\(\s*essentia,\s*decoded\.samples,\s*effectiveConfiguration\s*\)/s
	)
	assert.match(
		benchmarkSource,
		/effectiveConfiguration\.keyProfiles\.map\(\(profile\) =>/s
	)
	assert.match(
		benchmarkSource,
		/buildBenchmarkMetadata\(\s*effectiveConfiguration,\s*essentiaRuntimeVersion\s*\)/s
	)
	assert.match(
		benchmarkSource,
		/const output = buildBenchmarkOutput\(results, summary, analysisMetadata\)/
	)
	assert.match(
		benchmarkSource,
		/for \(const result of output\.results\) console\.log\(JSON\.stringify\(result\)\)/
	)
	assert.match(
		benchmarkSource,
		/console\.log\(JSON\.stringify\(\{ summary: output\.summary \}\)\)/
	)
	assert.equal((benchmarkSource.match(/console\.log\(/g) || []).length, 2)
})
