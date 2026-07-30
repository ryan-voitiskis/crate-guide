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

function parseManifest(manifestText) {
	const normalized = manifestText.trim()
	if (!normalized) return []

	return normalized.split(/\r?\n/).map((line) => {
		const [fileName, bpm, key, artist = '', title = ''] = line.split('\t')
		return {
			fileName,
			expectedBpm: Number.parseFloat(bpm),
			expectedKey: key,
			artist,
			title
		}
	})
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

function compareKeyProfiles(actualKeys, expectedKeyValue) {
	const expectedKey = parseKey(expectedKeyValue)
	return Object.fromEntries(
		Object.entries(actualKeys).map(([profile, key]) => {
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
}

function compareTrackResult(row, actual, decoded) {
	const bpmComparison = compareBpm(actual.bpm, row.expectedBpm)
	return {
		artist: row.artist,
		title: row.title,
		expectedBpm: row.expectedBpm,
		actualBpm: Math.round(actual.bpm * 100) / 100,
		bpmClassification: bpmComparison.classification,
		bpmConfidence: actual.bpmConfidence,
		bpmEstimates: actual.bpmEstimates,
		expectedKey: row.expectedKey,
		keys: compareKeyProfiles(actual.keys, row.expectedKey),
		analyzedDuration: decoded.analyzedDuration,
		offsets: decoded.offsets
	}
}

function buildSummary(results, keyProfiles) {
	return {
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
			keyProfiles.map((profile) => [
				profile,
				results.filter((result) => result.keys[profile]?.matches).length
			])
		)
	}
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
		decodeSafety: Object.freeze({
			...effectiveConfiguration.decodeSafety,
			supportedWavBitsPerSample: Object.freeze([
				...effectiveConfiguration.decodeSafety.supportedWavBitsPerSample
			])
		}),
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

function formatBenchmarkReport(output) {
	return [
		...output.results.map((result) => JSON.stringify(result)),
		JSON.stringify({ summary: output.summary })
	]
}

module.exports = {
	buildBenchmarkMetadata,
	buildBenchmarkOutput,
	buildSummary,
	compareBpm,
	compareKeyProfiles,
	compareTrackResult,
	formatBenchmarkReport,
	parseKey,
	parseManifest
}
