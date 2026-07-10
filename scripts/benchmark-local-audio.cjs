#!/usr/bin/env node

const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const Essentia = require('../node_modules/essentia.js/dist/essentia.js-core.umd.js')
const EssentiaWASM = require('../node_modules/essentia.js/dist/essentia-wasm.umd.js')

const SAMPLE_RATE = 44_100
const MAX_ANALYSIS_SECONDS = 180
const MAX_DECODED_BYTES =
	MAX_ANALYSIS_SECONDS * SAMPLE_RATE * Float32Array.BYTES_PER_ELEMENT + 1024
const KEY_PROFILES = (process.env.ESSENTIA_KEY_PROFILES || 'edma')
	.split(',')
	.map((profile) => profile.trim())
	.filter(Boolean)
const ANALYSIS_LAYOUT = process.env.ESSENTIA_ANALYSIS_LAYOUT || 'center'
const RHYTHM_METHOD = process.env.ESSENTIA_RHYTHM_METHOD || 'multifeature'
const INCLUDE_ESTIMATES = process.env.ESSENTIA_INCLUDE_ESTIMATES === '1'

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

function decodeWindow(fileName, offset, duration) {
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
			String(SAMPLE_RATE),
			'-f',
			'f32le',
			'pipe:1'
		],
		{ maxBuffer: MAX_DECODED_BYTES }
	)
}

function decodeSegment(fileName, duration) {
	const analyzedDuration = Math.min(duration, MAX_ANALYSIS_SECONDS)
	const windows =
		ANALYSIS_LAYOUT === 'distributed' && duration > MAX_ANALYSIS_SECONDS
			? [0.2, 0.5, 0.8].map((position) => ({
					duration: MAX_ANALYSIS_SECONDS / 3,
					offset: Math.max(
						0,
						Math.min(
							duration - MAX_ANALYSIS_SECONDS / 3,
							duration * position - MAX_ANALYSIS_SECONDS / 6
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
			decodeWindow(fileName, window.offset, window.duration)
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

function analyze(essentia, samples) {
	const signal = essentia.arrayToVector(samples)
	let rhythm = null
	try {
		rhythm = essentia.RhythmExtractor2013(signal, 208, RHYTHM_METHOD, 40)
		const keys = Object.fromEntries(
			KEY_PROFILES.map((profile) => {
				const key = essentia.KeyExtractor(
					signal,
					true,
					4096,
					4096,
					12,
					3500,
					60,
					25,
					0.2,
					profile,
					SAMPLE_RATE,
					0.0001,
					440,
					'cosine',
					'hann'
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
			bpmEstimates: INCLUDE_ESTIMATES
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

const manifestPath = process.argv[2]
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

const essentia = new Essentia(EssentiaWASM)
const results = []

try {
	for (const row of rows) {
		const duration = durationSeconds(row.fileName)
		const decoded = decodeSegment(row.fileName, duration)
		const actual = analyze(essentia, decoded.samples)
		const bpmComparison = compareBpm(actual.bpm, row.expectedBpm)
		const expectedKey = parseKey(row.expectedKey)
		const keys = Object.fromEntries(
			Object.entries(actual.keys).map(([profile, key]) => {
				const parsed = parseKey(`${key.key}${key.scale === 'minor' ? 'm' : ''}`)
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
		const result = {
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
		}
		results.push(result)
		console.log(JSON.stringify(result))
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
		KEY_PROFILES.map((profile) => [
			profile,
			results.filter((result) => result.keys[profile]?.matches).length
		])
	)
}

console.log(JSON.stringify({ summary }))
