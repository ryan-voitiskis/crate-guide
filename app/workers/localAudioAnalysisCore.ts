import type {
	LocalAudioAnalysis,
	LocalAudioWorkerRequest
} from '~/types/localAudio'
import {
	LOCAL_AUDIO_ANALYZER_VERSION,
	LOCAL_AUDIO_CONFIGURATION_VERSION,
	LOCAL_AUDIO_KEY_EXTRACTOR_ARGS,
	LOCAL_AUDIO_RHYTHM_EXTRACTOR_ARGS,
	LOCAL_AUDIO_SAMPLE_RATE
} from '~/utils/localAudio'

export interface EssentiaLike {
	version: string
	arrayToVector(samples: Float32Array): unknown
	vectorToArray(vector: unknown): ArrayLike<number>
	RhythmExtractor2013(
		signal: unknown,
		maxTempo?: number,
		method?: string,
		minTempo?: number
	): Record<string, unknown>
	KeyExtractor(
		audio: unknown,
		averageDetuningCorrection?: boolean,
		frameSize?: number,
		hopSize?: number,
		hpcpSize?: number,
		maxFrequency?: number,
		maximumSpectralPeaks?: number,
		minFrequency?: number,
		pcpThreshold?: number,
		profileType?: string,
		sampleRate?: number,
		spectralPeaksThreshold?: number,
		tuningFrequency?: number,
		weightType?: string,
		windowType?: string
	): Record<string, unknown>
}

function numberField(
	source: Record<string, unknown>,
	key: string
): number | null {
	const value = source[key]
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringField(
	source: Record<string, unknown>,
	key: string
): string | null {
	const value = source[key]
	return typeof value === 'string' && value ? value : null
}

function vectorField(
	essentia: EssentiaLike,
	source: Record<string, unknown>,
	key: string
): number[] {
	const value = source[key]
	if (!value) return []
	try {
		return Array.from(essentia.vectorToArray(value)).filter(Number.isFinite)
	} catch {
		return []
	}
}

function deleteVector(vector: unknown) {
	if (
		typeof vector === 'object' &&
		vector !== null &&
		'delete' in vector &&
		typeof vector.delete === 'function'
	) {
		vector.delete()
	}
}

export function analyzeLocalAudioRequest(
	request: LocalAudioWorkerRequest,
	essentia: EssentiaLike
): LocalAudioAnalysis {
	const samples = new Float32Array(request.samples)
	const signal = essentia.arrayToVector(samples)
	let rhythm: Record<string, unknown> | null = null

	try {
		rhythm = essentia.RhythmExtractor2013(
			signal,
			...LOCAL_AUDIO_RHYTHM_EXTRACTOR_ARGS
		)
		const key = essentia.KeyExtractor(signal, ...LOCAL_AUDIO_KEY_EXTRACTOR_ARGS)

		const bpm = numberField(rhythm, 'bpm')
		const warnings: string[] = []
		if (bpm !== null && (bpm < 30 || bpm > 300)) {
			warnings.push(`Analyzer returned out-of-range BPM ${bpm.toFixed(1)}`)
		}
		if (request.analyzedDurationSeconds < request.durationSeconds - 1) {
			warnings.push(
				`Analyzed a ${Math.round(request.analyzedDurationSeconds)} second ` +
					`center segment of a ${Math.round(request.durationSeconds)} second track`
			)
		}

		return {
			analyzerVersion: `${LOCAL_AUDIO_ANALYZER_VERSION} (${essentia.version})`,
			configurationVersion: LOCAL_AUDIO_CONFIGURATION_VERSION,
			bpm,
			bpmConfidence: numberField(rhythm, 'confidence'),
			bpmEstimates: vectorField(essentia, rhythm, 'estimates'),
			key: stringField(key, 'key'),
			scale: stringField(key, 'scale'),
			keyStrength: numberField(key, 'strength'),
			sampleRate: LOCAL_AUDIO_SAMPLE_RATE,
			durationSeconds: request.durationSeconds,
			analyzedDurationSeconds: request.analyzedDurationSeconds,
			analysisOffsetSeconds: request.analysisOffsetSeconds,
			warnings
		}
	} finally {
		deleteVector(rhythm?.ticks)
		deleteVector(rhythm?.estimates)
		deleteVector(rhythm?.bpmIntervals)
		deleteVector(signal)
	}
}
