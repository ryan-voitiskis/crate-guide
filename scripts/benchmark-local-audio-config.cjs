const sharedConfiguration = require('../shared/config/localAudioAnalysis.json')

const ANALYSIS_LAYOUTS = Object.freeze(['center', 'distributed'])
const RHYTHM_METHODS = Object.freeze(['multifeature', 'degara'])
const KEY_PROFILES = Object.freeze([
	'diatonic',
	'krumhansl',
	'temperley',
	'weichai',
	'tonictriad',
	'temperley2005',
	'thpcp',
	'shaath',
	'gomez',
	'noland',
	'edmm',
	'edma',
	'bgate',
	'braw'
])

function normalizedScalar(value, fallback) {
	if (value === undefined || value === null) return fallback
	const normalized = String(value).trim()
	return normalized || fallback
}

function assertEnumeration(name, value, acceptedValues) {
	if (acceptedValues.includes(value)) return value
	throw new Error(
		`${name} must be one of: ${acceptedValues.join(', ')} (received ${JSON.stringify(value)})`
	)
}

function parseKeyProfiles(value) {
	const fallback = sharedConfiguration.keyExtractor.profile
	const normalized = normalizedScalar(value, fallback)
	const profiles = normalized
		.split(',')
		.map((profile) => profile.trim())
		.filter(Boolean)

	if (profiles.length === 0) {
		throw new Error(
			`ESSENTIA_KEY_PROFILES must contain at least one supported profile: ${KEY_PROFILES.join(', ')}`
		)
	}

	for (const profile of profiles) {
		assertEnumeration('ESSENTIA_KEY_PROFILES', profile, KEY_PROFILES)
	}
	return profiles
}

function parseIncludeEstimates(value) {
	const normalized = normalizedScalar(value, '0')
	if (normalized === '1') return true
	if (normalized === '0') return false
	throw new Error(
		`ESSENTIA_INCLUDE_ESTIMATES must be either "0" or "1" (received ${JSON.stringify(normalized)})`
	)
}

function buildEffectiveConfiguration(environment = {}) {
	const keyProfiles = parseKeyProfiles(environment.ESSENTIA_KEY_PROFILES)
	const analysisLayout = assertEnumeration(
		'ESSENTIA_ANALYSIS_LAYOUT',
		normalizedScalar(environment.ESSENTIA_ANALYSIS_LAYOUT, 'center'),
		ANALYSIS_LAYOUTS
	)
	const rhythmMethod = assertEnumeration(
		'ESSENTIA_RHYTHM_METHOD',
		normalizedScalar(
			environment.ESSENTIA_RHYTHM_METHOD,
			sharedConfiguration.rhythmExtractor.method
		),
		RHYTHM_METHODS
	)
	const minimumConfidence = Object.freeze({
		...sharedConfiguration.minimumConfidence
	})
	const rhythmExtractor = Object.freeze({
		...sharedConfiguration.rhythmExtractor,
		method: rhythmMethod
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
		analysisLayout,
		includeEstimates: parseIncludeEstimates(
			environment.ESSENTIA_INCLUDE_ESTIMATES
		)
	})
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

module.exports = {
	ANALYSIS_LAYOUTS,
	KEY_PROFILES,
	RHYTHM_METHODS,
	buildEffectiveConfiguration,
	buildKeyExtractorArguments,
	buildRhythmExtractorArguments
}
