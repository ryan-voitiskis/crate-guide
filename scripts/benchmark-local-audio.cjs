#!/usr/bin/env node

const {
	buildEffectiveConfiguration,
	buildKeyExtractorArguments,
	buildRhythmExtractorArguments
} = require('./benchmark-local-audio-config.cjs')
const {
	buildBenchmarkMetadata,
	buildBenchmarkOutput,
	buildSummary,
	compareBpm,
	compareKeyProfiles,
	compareTrackResult,
	formatBenchmarkReport,
	parseKey,
	parseManifest
} = require('./benchmark-local-audio-core.cjs')
const {
	createNodeBenchmarkAdapters
} = require('./benchmark-local-audio-adapters.cjs')
const {
	analyze,
	decodeSegment,
	durationSeconds,
	executeBenchmark,
	runBenchmarkCli
} = require('./benchmark-local-audio-runner.cjs')

function main(argv = process.argv, environment = process.env) {
	const exitCode = runBenchmarkCli({
		argv,
		environment,
		adapters: createNodeBenchmarkAdapters()
	})
	process.exitCode = exitCode
	return exitCode
}

module.exports = {
	analyze,
	buildBenchmarkMetadata,
	buildBenchmarkOutput,
	buildEffectiveConfiguration,
	buildKeyExtractorArguments,
	buildRhythmExtractorArguments,
	buildSummary,
	compareBpm,
	compareKeyProfiles,
	compareTrackResult,
	decodeSegment,
	durationSeconds,
	executeBenchmark,
	formatBenchmarkReport,
	main,
	parseKey,
	parseManifest,
	runBenchmarkCli
}

if (require.main === module) main()
