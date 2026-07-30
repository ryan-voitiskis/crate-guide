const {
	buildEffectiveConfiguration,
	buildKeyExtractorArguments,
	buildRhythmExtractorArguments
} = require('./benchmark-local-audio-config.cjs')
const {
	buildBenchmarkMetadata,
	buildBenchmarkOutput,
	buildSummary,
	compareTrackResult,
	formatBenchmarkReport,
	parseManifest
} = require('./benchmark-local-audio-core.cjs')

function durationSeconds(fileName, adapters) {
	const output = adapters.runCommand(
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

function decodeWindow(
	fileName,
	offset,
	duration,
	effectiveConfiguration,
	adapters
) {
	const maxDecodedBytes =
		effectiveConfiguration.maxAnalysisSeconds *
			effectiveConfiguration.sampleRate *
			Float32Array.BYTES_PER_ELEMENT +
		1024
	return adapters.runCommand(
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

function decodeSegment(fileName, duration, effectiveConfiguration, adapters) {
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
				effectiveConfiguration,
				adapters
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

function executeBenchmark(manifestPath, environment, adapters) {
	const effectiveConfiguration = buildEffectiveConfiguration(environment)
	const rows = parseManifest(adapters.readTextFile(manifestPath))
	const essentia = adapters.createEssentia()
	const essentiaRuntimeVersion = essentia.version
	const results = []

	try {
		for (const row of rows) {
			const duration = durationSeconds(row.fileName, adapters)
			const decoded = decodeSegment(
				row.fileName,
				duration,
				effectiveConfiguration,
				adapters
			)
			const actual = analyze(essentia, decoded.samples, effectiveConfiguration)
			results.push(compareTrackResult(row, actual, decoded))
		}
	} finally {
		essentia.delete()
	}

	const summary = buildSummary(results, effectiveConfiguration.keyProfiles)
	const analysisMetadata = buildBenchmarkMetadata(
		effectiveConfiguration,
		essentiaRuntimeVersion
	)
	return buildBenchmarkOutput(results, summary, analysisMetadata)
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error)
}

function runBenchmarkCli({ argv, environment, adapters }) {
	const manifestPath = argv[2]
	if (!manifestPath) {
		adapters.writeStderr(
			'Usage: scripts/benchmark-local-audio.cjs <manifest.tsv>'
		)
		return 1
	}
	if (!adapters.fileExists(manifestPath)) {
		adapters.writeStderr(`Manifest not found: ${manifestPath}`)
		return 1
	}

	try {
		const output = executeBenchmark(manifestPath, environment, adapters)
		for (const line of formatBenchmarkReport(output)) {
			adapters.writeStdout(line)
		}
		return 0
	} catch (error) {
		adapters.writeStderr(errorMessage(error))
		return 1
	}
}

module.exports = {
	analyze,
	decodeSegment,
	durationSeconds,
	executeBenchmark,
	runBenchmarkCli
}
