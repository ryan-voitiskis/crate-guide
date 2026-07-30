const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')
const sharedConfiguration = require('../shared/config/localAudioAnalysis.json')

const {
	buildBenchmarkMetadata,
	buildBenchmarkOutput,
	buildEffectiveConfiguration,
	buildKeyExtractorArguments,
	buildRhythmExtractorArguments,
	compareBpm,
	formatBenchmarkReport,
	parseManifest,
	runBenchmarkCli
} = require('./benchmark-local-audio.cjs')

function createVector(values = []) {
	return {
		values,
		delete() {}
	}
}

function createFakeEssentia(events) {
	const calls = {
		rhythm: [],
		keys: []
	}
	const essentia = {
		version: 'essentia-runtime-test',
		arrayToVector(samples) {
			return createVector(Array.from(samples))
		},
		RhythmExtractor2013(signal, ...args) {
			events.push('rhythm')
			calls.rhythm.push({ signal, args })
			return {
				bpm: 128.4,
				confidence: 0.75,
				ticks: createVector(),
				estimates: createVector([127.9, 128.1]),
				bpmIntervals: createVector()
			}
		},
		KeyExtractor(signal, ...args) {
			const profile = args[8]
			events.push(`key:${profile}`)
			calls.keys.push({ signal, args })
			return profile === 'edma'
				? { key: 'A', scale: 'minor', strength: 0.91 }
				: { key: 'C', scale: 'major', strength: 0.72 }
		},
		vectorToArray(vector) {
			return vector.values
		},
		delete() {
			events.push('delete')
		}
	}
	return { calls, essentia }
}

function createAudioBuffer(values = [0.25, -0.25]) {
	const samples = Float32Array.from(values)
	return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)
}

function createFakeAdapters(overrides = {}) {
	const events = []
	const stdout = []
	const stderr = []
	const runtime = createFakeEssentia(events)
	const adapters = {
		fileExists(fileName) {
			events.push(`exists:${fileName}`)
			return true
		},
		readTextFile(fileName) {
			events.push(`read:${fileName}`)
			return 'song.wav\t128\t8A\tTest Artist\tTest Title'
		},
		runCommand(command) {
			events.push(command)
			if (command === 'ffprobe') return '240\n'
			if (command === 'ffmpeg') return createAudioBuffer()
			throw new Error(`Unexpected command: ${command}`)
		},
		createEssentia() {
			events.push('essentia')
			return runtime.essentia
		},
		writeStdout(line) {
			stdout.push(line)
		},
		writeStderr(line) {
			stderr.push(line)
		},
		...overrides
	}
	return { adapters, events, runtime, stderr, stdout }
}

test('imports benchmark helpers without loading Essentia', () => {
	const loadedEssentiaModules = Object.keys(require.cache).filter((fileName) =>
		fileName.includes('/node_modules/essentia.js/')
	)

	assert.deepEqual(loadedEssentiaModules, [])
})

test('builds an immutable effective configuration from shared defaults', () => {
	const effectiveConfiguration = buildEffectiveConfiguration({})

	assert.deepEqual(effectiveConfiguration, {
		analyzerVersion: 'essentia.js@0.1.3',
		configurationVersion: 'center-180s-44k1-v1',
		sampleRate: 44_100,
		maxAnalysisSeconds: 180,
		decodeSafety: {
			policyVersion: 'whole-file-pcm-wav-v1',
			maxHeaderBytes: 1_048_576,
			maxTotalPeakBytes: 268_435_456,
			fixedSafetyMarginBytes: 33_554_432,
			inputFileCopies: 2,
			decodedPcmCopies: 2,
			analysisPcmCopies: 3,
			maxChannels: 2,
			maxSampleRate: 192_000,
			supportedWavBitsPerSample: [16, 24]
		},
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
	assert.equal(Object.isFrozen(effectiveConfiguration.decodeSafety), true)
	assert.equal(
		Object.isFrozen(
			effectiveConfiguration.decodeSafety.supportedWavBitsPerSample
		),
		true
	)
	assert.equal(Object.isFrozen(effectiveConfiguration.rhythmExtractor), true)
	assert.equal(Object.isFrozen(effectiveConfiguration.keyExtractor), true)
	assert.equal(Object.isFrozen(effectiveConfiguration.keyProfiles), true)
})

test('trims every scalar override and preserves shared defaults', () => {
	const sharedConfigurationSnapshot = structuredClone(sharedConfiguration)
	const effectiveConfiguration = buildEffectiveConfiguration({
		ESSENTIA_KEY_PROFILES: ' edma, bgate ',
		ESSENTIA_ANALYSIS_LAYOUT: ' distributed ',
		ESSENTIA_RHYTHM_METHOD: ' degara ',
		ESSENTIA_INCLUDE_ESTIMATES: ' 1 '
	})

	assert.deepEqual(effectiveConfiguration.keyProfiles, ['edma', 'bgate'])
	assert.equal(effectiveConfiguration.analysisLayout, 'distributed')
	assert.equal(effectiveConfiguration.rhythmExtractor.method, 'degara')
	assert.equal(effectiveConfiguration.includeEstimates, true)
	assert.deepEqual(sharedConfiguration, sharedConfigurationSnapshot)
})

test('uses documented defaults for empty and whitespace-only overrides', () => {
	for (const value of ['', '   ']) {
		const configuration = buildEffectiveConfiguration({
			ESSENTIA_KEY_PROFILES: value,
			ESSENTIA_ANALYSIS_LAYOUT: value,
			ESSENTIA_RHYTHM_METHOD: value,
			ESSENTIA_INCLUDE_ESTIMATES: value
		})

		assert.deepEqual(configuration.keyProfiles, ['edma'])
		assert.equal(configuration.analysisLayout, 'center')
		assert.equal(configuration.rhythmExtractor.method, 'multifeature')
		assert.equal(configuration.includeEstimates, false)
	}
})

test('rejects invalid enumerated overrides before execution', () => {
	assert.throws(
		() =>
			buildEffectiveConfiguration({
				ESSENTIA_ANALYSIS_LAYOUT: 'edges'
			}),
		/ESSENTIA_ANALYSIS_LAYOUT must be one of: center, distributed/
	)
	assert.throws(
		() =>
			buildEffectiveConfiguration({
				ESSENTIA_RHYTHM_METHOD: 'legacy'
			}),
		/ESSENTIA_RHYTHM_METHOD must be one of: multifeature, degara/
	)
	assert.throws(
		() =>
			buildEffectiveConfiguration({
				ESSENTIA_KEY_PROFILES: 'edma, unknown'
			}),
		/ESSENTIA_KEY_PROFILES must be one of:/
	)
	assert.throws(
		() =>
			buildEffectiveConfiguration({
				ESSENTIA_INCLUDE_ESTIMATES: 'true'
			}),
		/ESSENTIA_INCLUDE_ESTIMATES must be either "0" or "1"/
	)
})

test('rejects a comma-only empty profile list with one clear diagnostic', () => {
	assert.throws(
		() =>
			buildEffectiveConfiguration({
				ESSENTIA_KEY_PROFILES: ' , , '
			}),
		(error) => {
			assert.equal(
				error.message.startsWith(
					'ESSENTIA_KEY_PROFILES must contain at least one supported profile:'
				),
				true
			)
			return true
		}
	)
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

test('parses manifests and compares BPM without I/O', () => {
	assert.deepEqual(
		parseManifest('one.wav\t128\t8A\tArtist One\tTitle One\r\ntwo.wav\t\tC'),
		[
			{
				fileName: 'one.wav',
				expectedBpm: 128,
				expectedKey: '8A',
				artist: 'Artist One',
				title: 'Title One'
			},
			{
				fileName: 'two.wav',
				expectedBpm: Number.NaN,
				expectedKey: 'C',
				artist: '',
				title: ''
			}
		]
	)
	assert.deepEqual(compareBpm(128.5, 128), {
		classification: 'exact',
		error: 0.5
	})
	assert.deepEqual(compareBpm(64, 128), {
		classification: 'half-double',
		error: 0
	})
	assert.deepEqual(compareBpm(100, Number.NaN), {
		classification: 'unavailable',
		error: null
	})
})

test('formats immutable analysis metadata into exact JSON lines', () => {
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
	const output = buildBenchmarkOutput(
		[{ track: 'one' }, { track: 'two' }],
		{ tracks: 2 },
		metadata
	)

	assert.equal(Object.isFrozen(metadata), true)
	assert.equal(Object.isFrozen(metadata.rhythmExtractor), true)
	assert.equal(Object.isFrozen(metadata.decodeSafety), true)
	assert.equal(
		Object.isFrozen(metadata.decodeSafety.supportedWavBitsPerSample),
		true
	)
	assert.equal(Object.isFrozen(metadata.keyProfiles), true)
	assert.deepEqual(formatBenchmarkReport(output), [
		JSON.stringify({ track: 'one', analysisMetadata: metadata }),
		JSON.stringify({ track: 'two', analysisMetadata: metadata }),
		JSON.stringify({ summary: { tracks: 2, analysisMetadata: metadata } })
	])
})

test('returns exact usage and missing-manifest diagnostics', () => {
	const usageFixture = createFakeAdapters()
	assert.equal(
		runBenchmarkCli({
			argv: ['node', 'benchmark'],
			environment: {},
			adapters: usageFixture.adapters
		}),
		1
	)
	assert.deepEqual(usageFixture.stderr, [
		'Usage: scripts/benchmark-local-audio.cjs <manifest.tsv>'
	])

	const missingFixture = createFakeAdapters({ fileExists: () => false })
	assert.equal(
		runBenchmarkCli({
			argv: ['node', 'benchmark', 'missing.tsv'],
			environment: {},
			adapters: missingFixture.adapters
		}),
		1
	)
	assert.deepEqual(missingFixture.stderr, ['Manifest not found: missing.tsv'])
	assert.deepEqual(missingFixture.stdout, [])
})

test('rejects invalid configuration before reading, ffmpeg, or Essentia', () => {
	const fixture = createFakeAdapters()
	const exitCode = runBenchmarkCli({
		argv: ['node', 'benchmark', 'manifest.tsv'],
		environment: { ESSENTIA_ANALYSIS_LAYOUT: 'invalid' },
		adapters: fixture.adapters
	})

	assert.equal(exitCode, 1)
	assert.deepEqual(fixture.events, ['exists:manifest.tsv'])
	assert.equal(fixture.stderr.length, 1)
	assert.match(fixture.stderr[0], /ESSENTIA_ANALYSIS_LAYOUT must be one of/)
})

test('reports a child-process failure and disposes the analyzer', () => {
	const fixture = createFakeAdapters({
		runCommand(command) {
			fixture.events.push(command)
			throw new Error(`${command} failed: synthetic failure`)
		}
	})
	const exitCode = runBenchmarkCli({
		argv: ['node', 'benchmark', 'manifest.tsv'],
		environment: {},
		adapters: fixture.adapters
	})

	assert.equal(exitCode, 1)
	assert.deepEqual(fixture.stderr, ['ffprobe failed: synthetic failure'])
	assert.deepEqual(fixture.stdout, [])
	assert.deepEqual(fixture.events, [
		'exists:manifest.tsv',
		'read:manifest.tsv',
		'essentia',
		'ffprobe',
		'delete'
	])
})

test('executes and routes a successful multi-profile benchmark in order', () => {
	const fixture = createFakeAdapters()
	const commandCalls = []
	fixture.adapters.runCommand = (command, args, options) => {
		fixture.events.push(command)
		commandCalls.push({ command, args, options })
		return command === 'ffprobe' ? '240\n' : createAudioBuffer()
	}

	const exitCode = runBenchmarkCli({
		argv: ['node', 'benchmark', 'manifest.tsv'],
		environment: {
			ESSENTIA_KEY_PROFILES: 'edma, bgate',
			ESSENTIA_RHYTHM_METHOD: 'degara',
			ESSENTIA_INCLUDE_ESTIMATES: '1'
		},
		adapters: fixture.adapters
	})

	assert.equal(exitCode, 0)
	assert.deepEqual(fixture.stderr, [])
	assert.deepEqual(fixture.events, [
		'exists:manifest.tsv',
		'read:manifest.tsv',
		'essentia',
		'ffprobe',
		'ffmpeg',
		'rhythm',
		'key:edma',
		'key:bgate',
		'delete'
	])
	assert.deepEqual(commandCalls, [
		{
			command: 'ffprobe',
			args: [
				'-v',
				'error',
				'-show_entries',
				'format=duration',
				'-of',
				'default=noprint_wrappers=1:nokey=1',
				'song.wav'
			],
			options: { encoding: 'utf8' }
		},
		{
			command: 'ffmpeg',
			args: [
				'-v',
				'error',
				'-ss',
				'30.000000',
				'-t',
				'180.000000',
				'-i',
				'song.wav',
				'-vn',
				'-ac',
				'1',
				'-ar',
				'44100',
				'-f',
				'f32le',
				'pipe:1'
			],
			options: { maxBuffer: 31_753_024 }
		}
	])
	assert.deepEqual(fixture.runtime.calls.rhythm[0].args, [208, 'degara', 40])
	assert.deepEqual(
		fixture.runtime.calls.keys.map((call) => call.args[8]),
		['edma', 'bgate']
	)

	const metadata = {
		analyzerVersion: 'essentia.js@0.1.3',
		configurationVersion: 'center-180s-44k1-v1',
		sampleRate: 44_100,
		maxAnalysisSeconds: 180,
		decodeSafety: {
			policyVersion: 'whole-file-pcm-wav-v1',
			maxHeaderBytes: 1_048_576,
			maxTotalPeakBytes: 268_435_456,
			fixedSafetyMarginBytes: 33_554_432,
			inputFileCopies: 2,
			decodedPcmCopies: 2,
			analysisPcmCopies: 3,
			maxChannels: 2,
			maxSampleRate: 192_000,
			supportedWavBitsPerSample: [16, 24]
		},
		rhythmExtractor: {
			maximumTempo: 208,
			method: 'degara',
			minimumTempo: 40
		},
		keyProfiles: ['edma', 'bgate'],
		analysisLayout: 'center',
		includeEstimates: true,
		essentiaRuntimeVersion: 'essentia-runtime-test'
	}
	assert.deepEqual(fixture.stdout, [
		JSON.stringify({
			artist: 'Test Artist',
			title: 'Test Title',
			expectedBpm: 128,
			actualBpm: 128.4,
			bpmClassification: 'exact',
			bpmConfidence: 0.75,
			bpmEstimates: [127.9, 128.1],
			expectedKey: '8A',
			keys: {
				edma: { value: 'A minor', strength: 0.91, matches: true },
				bgate: { value: 'C major', strength: 0.72, matches: false }
			},
			analyzedDuration: 180,
			offsets: [30],
			analysisMetadata: metadata
		}),
		JSON.stringify({
			summary: {
				tracks: 1,
				bpmReferenceTracks: 1,
				bpmExact: 1,
				bpmHalfDouble: 0,
				bpmMisses: 0,
				keyExactByProfile: { edma: 1, bgate: 0 },
				analysisMetadata: metadata
			}
		})
	])
})

const smokeManifest = process.env.ESSENTIA_BENCHMARK_SMOKE_MANIFEST
test(
	'optionally runs the installed CLI against a disposable local manifest',
	{ skip: !smokeManifest },
	() => {
		const result = spawnSync(
			process.execPath,
			[require.resolve('./benchmark-local-audio.cjs'), smokeManifest],
			{
				encoding: 'utf8',
				env: {
					...process.env,
					ESSENTIA_KEY_PROFILES: 'edma',
					ESSENTIA_ANALYSIS_LAYOUT: 'center',
					ESSENTIA_RHYTHM_METHOD: 'multifeature',
					ESSENTIA_INCLUDE_ESTIMATES: '0'
				}
			}
		)

		assert.equal(result.status, 0, result.stderr)
		const lines = result.stdout.trim().split(/\r?\n/)
		assert.equal(lines.length >= 2, true)
		assert.equal(typeof JSON.parse(lines.at(-1)).summary.tracks, 'number')
	}
)
