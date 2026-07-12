#!/usr/bin/env node

const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const sharedConfiguration = require('../shared/config/localAudioAnalysis.json')

function buildEffectiveConfiguration(environment = {}) {
	const keyProfiles = (
		environment.ESSENTIA_KEY_PROFILES ||
		sharedConfiguration.keyExtractor.profile
	)
		.split(',')
		.map((profile) => profile.trim())
		.filter(Boolean)
	const minimumConfidence = Object.freeze({
		...sharedConfiguration.minimumConfidence
	})
	const rhythmExtractor = Object.freeze({
		...sharedConfiguration.rhythmExtractor,
		method:
			environment.ESSENTIA_RHYTHM_METHOD ||
			sharedConfiguration.rhythmExtractor.method
	})
	const keyExtractor = Object.freeze({ ...sharedConfiguration.keyExtractor })

	return Object.freeze({
		analyzerVersion: sharedConfiguration.analyzerVersion,
		configurationVersion: sharedConfiguration.configurationVersion,
		sampleRate: sharedConfiguration.sampleRate,
		maxAnalysisSeconds: sharedConfiguration.maxAnalysisSeconds,
		minimumConfidence,
		rhythmExtractor,
		keyExtractor,
		keyProfiles: Object.freeze(keyProfiles),
		analysisLayout: environment.ESSENTIA_ANALYSIS_LAYOUT || 'center',
		includeEstimates: environment.ESSENTIA_INCLUDE_ESTIMATES === '1'
	})
}

function buildBenchmarkMetadata(
	effectiveConfiguration,
	essentiaRuntimeVersion
) {
	return Object.freeze({
		analyzerVersion: effectiveConfiguration.analyzerVersion,
		configurationVersion: effectiveConfiguration.configurationVersion,
		sampleRate: effectiveConfiguration.sampleRate,
		maxAnalysisSeconds: effectiveConfiguration.maxAnalysisSeconds,
		rhythmExtractor: Object.freeze({
			...effectiveConfiguration.rhythmExtractor
		}),
		keyProfiles: Object.freeze([...effectiveConfiguration.keyProfiles]),
		analysisLayout: effectiveConfiguration.analysisLayout,
		includeEstimates: effectiveConfiguration.includeEstimates,
		essentiaRuntimeVersion
	})
}

function buildBenchmarkOutput(results, summary, analysisMetadata) {
	return {
		results: results.map((result) => ({
			...result,
			analysisMetadata
		})),
		summary: { ...summary, analysisMetadata }
	}
}

const notePitchClasses = {
	C: 0,
	'C#': 1,
	Db: 1,
	D: 2,
	'D#': 3,
	Eb: 3,
	E: 4,
	F: 5,
	'F#': 6,
	Gb: 6,
	G: 7,
	'G#': 8,
	Ab: 8,
	A: 9,
	'A#': 10,
	Bb: 10,
	B: 11
}

const camelotMinor = [null, 8, 3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1]
const camelotMajor = [null, 11, 6, 1, 8, 3, 10, 5, 0, 7, 2, 9, 4]

function fail(message) {
	console.error(message)
	process.exit(1)
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		encoding: options.encoding,
		maxBuffer: options.maxBuffer,
		stdio: ['ignore', 'pipe', 'pipe']
	})
	if (result.status !== 0) {
		throw new Error(
			`${command} failed: ${String(result.stderr || '').trim() || 'unknown error'}`
		)
	}
	return result.stdout
}

function durationSeconds(fileName) {
	const output = run(
		'ffprobe',
		[
			'-v',
			'error',
			'-show_entries',
			'format=duration',
			'-of',
			'default=noprint_wrappers=1:nokey=1',
			fileName
		],
		{ encoding: 'utf8' }
	)
	const duration = Number.parseFloat(output.trim())
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error(`Unable to read duration for ${fileName}`)
	}
	return duration
}

function decodeWindow(fileName, offset, duration, effectiveConfiguration) {
	const maxDecodedBytes =
		effectiveConfiguration.maxAnalysisSeconds *
			effectiveConfiguration.sampleRate *
			Float32Array.BYTES_PER_ELEMENT +
		1024
	return run(
		'ffmpeg',
		[
			'-v',
			'error',
			'-ss',
			offset.toFixed(6),
			'-t',
			duration.toFixed(6),
			'-i',
			fileName,
			'-vn',
			'-ac',
			'1',
			'-ar',
			String(effectiveConfiguration.sampleRate),
			'-f',
			'f32le',
			'pipe:1'
		],
		{ maxBuffer: maxDecodedBytes }
	)
}

function decodeSegment(fileName, duration, effectiveConfiguration) {
	const analyzedDuration = Math.min(
		duration,
		effectiveConfiguration.maxAnalysisSeconds
	)
	const windows =
		effectiveConfiguration.analysisLayout === 'distributed' &&
		duration > effectiveConfiguration.maxAnalysisSeconds
			? [0.2, 0.5, 0.8].map((position) => ({
					duration: effectiveConfiguration.maxAnalysisSeconds / 3,
					offset: Math.max(
						0,
						Math.min(
							duration - effectiveConfiguration.maxAnalysisSeconds / 3,
							duration * position -
								effectiveConfiguration.maxAnalysisSeconds / 6
						)
					)
				}))
			: [
					{
						duration: analyzedDuration,
						offset: Math.max(0, (duration - analyzedDuration) / 2)
					}
				]
	const output = Buffer.concat(
		windows.map((window) =>
			decodeWindow(
				fileName,
				window.offset,
				window.duration,
				effectiveConfiguration
			)
		)
	)
	return {
		samples: new Float32Array(
			output.buffer,
			output.byteOffset,
			Math.floor(output.byteLength / Float32Array.BYTES_PER_ELEMENT)
		),
		analyzedDuration,
		offsets: windows.map((window) => window.offset)
	}
}

function deleteVector(vector) {
	if (vector && typeof vector.delete === 'function') vector.delete()
}

function parseKey(value) {
	const camelot = value.match(/^([1-9]|1[0-2])([AB])$/i)
	if (camelot) {
		const number = Number.parseInt(camelot[1], 10)
		const mode = camelot[2].toUpperCase() === 'B' ? 'major' : 'minor'
		return {
			pitchClass:
				mode === 'major' ? camelotMajor[number] : camelotMinor[number],
			mode
		}
	}

	const note = value.match(/^([A-G])([#b]?)(m?)$/)
	if (!note) return null
	return {
		pitchClass: notePitchClasses[`${note[1]}${note[2]}`],
		mode: note[3] ? 'minor' : 'major'
	}
}

function compareBpm(actual, expected) {
	if (!Number.isFinite(expected) || expected <= 0) {
		return { classification: 'unavailable', error: null }
	}
	const directError = Math.abs(actual - expected)
	if (directError <= 1) return { classification: 'exact', error: directError }

	const doubleError = Math.abs(actual * 2 - expected)
	const halfError = Math.abs(actual / 2 - expected)
	const harmonicError = Math.min(doubleError, halfError)
	if (harmonicError <= 1) {
		return { classification: 'half-double', error: harmonicError }
	}
	return { classification: 'miss', error: directError }
}

function buildRhythmExtractorArguments(effectiveConfiguration) {
	const { rhythmExtractor } = effectiveConfiguration
	return [
		rhythmExtractor.maximumTempo,
		rhythmExtractor.method,
		rhythmExtractor.minimumTempo
	]
}

function buildKeyExtractorArguments(effectiveConfiguration, profile) {
	const { keyExtractor } = effectiveConfiguration
	return [
		keyExtractor.averageDetuningCorrection,
		keyExtractor.frameSize,
		keyExtractor.hopSize,
		keyExtractor.hpcpSize,
		keyExtractor.maximumFrequency,
		keyExtractor.maximumSpectralPeaks,
		keyExtractor.minimumFrequency,
		keyExtractor.pcpThreshold,
		profile,
		keyExtractor.sampleRate,
		keyExtractor.spectralPeaksThreshold,
		keyExtractor.tuningFrequency,
		keyExtractor.weightType,
		keyExtractor.windowType
	]
}

function analyze(essentia, samples, effectiveConfiguration) {
	const signal = essentia.arrayToVector(samples)
	let rhythm = null
	try {
		rhythm = essentia.RhythmExtractor2013(
			signal,
			...buildRhythmExtractorArguments(effectiveConfiguration)
		)
		const keys = Object.fromEntries(
			effectiveConfiguration.keyProfiles.map((profile) => {
				const key = essentia.KeyExtractor(
					signal,
					...buildKeyExtractorArguments(effectiveConfiguration, profile)
				)
				return [
					profile,
					{ key: key.key, scale: key.scale, strength: key.strength }
				]
			})
		)
		return {
			bpm: rhythm.bpm,
			bpmConfidence: rhythm.confidence,
			bpmEstimates: effectiveConfiguration.includeEstimates
				? Array.from(essentia.vectorToArray(rhythm.estimates))
				: undefined,
			keys
		}
	} finally {
		deleteVector(rhythm?.ticks)
		deleteVector(rhythm?.estimates)
		deleteVector(rhythm?.bpmIntervals)
		deleteVector(signal)
	}
}

function main(argv = process.argv, environment = process.env) {
	const manifestPath = argv[2]
	if (!manifestPath) {
		fail('Usage: scripts/benchmark-local-audio.cjs <manifest.tsv>')
	}
	if (!fs.existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}`)

	const rows = fs
		.readFileSync(manifestPath, 'utf8')
		.trim()
		.split(/\r?\n/)
		.map((line) => {
			const [fileName, bpm, key, artist = '', title = ''] = line.split('\t')
			return {
				fileName,
				expectedBpm: Number.parseFloat(bpm),
				expectedKey: key,
				artist,
				title
			}
		})
	const effectiveConfiguration = buildEffectiveConfiguration(environment)
	const Essentia = require('../node_modules/essentia.js/dist/essentia.js-core.umd.js')
	const EssentiaWASM = require('../node_modules/essentia.js/dist/essentia-wasm.umd.js')
	const essentia = new Essentia(EssentiaWASM)
	const essentiaRuntimeVersion = essentia.version
	const results = []

	try {
		for (const row of rows) {
			const duration = durationSeconds(row.fileName)
			const decoded = decodeSegment(
				row.fileName,
				duration,
				effectiveConfiguration
			)
			const actual = analyze(essentia, decoded.samples, effectiveConfiguration)
			const bpmComparison = compareBpm(actual.bpm, row.expectedBpm)
			const expectedKey = parseKey(row.expectedKey)
			const keys = Object.fromEntries(
				Object.entries(actual.keys).map(([profile, key]) => {
					const parsed = parseKey(
						`${key.key}${key.scale === 'minor' ? 'm' : ''}`
					)
					return [
						profile,
						{
							value: `${key.key} ${key.scale}`,
							strength: key.strength,
							matches:
								expectedKey !== null &&
								parsed !== null &&
								expectedKey.pitchClass === parsed.pitchClass &&
								expectedKey.mode === parsed.mode
						}
					]
				})
			)
			results.push({
				artist: row.artist,
				title: row.title,
				expectedBpm: row.expectedBpm,
				actualBpm: Math.round(actual.bpm * 100) / 100,
				bpmClassification: bpmComparison.classification,
				bpmConfidence: actual.bpmConfidence,
				bpmEstimates: actual.bpmEstimates,
				expectedKey: row.expectedKey,
				keys,
				analyzedDuration: decoded.analyzedDuration,
				offsets: decoded.offsets
			})
		}
	} finally {
		essentia.delete()
	}

	const summary = {
		tracks: results.length,
		bpmReferenceTracks: results.filter(
			(result) => result.bpmClassification !== 'unavailable'
		).length,
		bpmExact: results.filter((result) => result.bpmClassification === 'exact')
			.length,
		bpmHalfDouble: results.filter(
			(result) => result.bpmClassification === 'half-double'
		).length,
		bpmMisses: results.filter((result) => result.bpmClassification === 'miss')
			.length,
		keyExactByProfile: Object.fromEntries(
			effectiveConfiguration.keyProfiles.map((profile) => [
				profile,
				results.filter((result) => result.keys[profile]?.matches).length
			])
		)
	}
	const analysisMetadata = buildBenchmarkMetadata(
		effectiveConfiguration,
		essentiaRuntimeVersion
	)
	const output = buildBenchmarkOutput(results, summary, analysisMetadata)

	for (const result of output.results) console.log(JSON.stringify(result))
	console.log(JSON.stringify({ summary: output.summary }))
}

module.exports = {
	buildBenchmarkMetadata,
	buildBenchmarkOutput,
	buildEffectiveConfiguration,
	buildKeyExtractorArguments,
	buildRhythmExtractorArguments
}

if (require.main === module) main()
