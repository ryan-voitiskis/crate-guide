import { describe, expect, it, vi } from 'vitest'
import type { LocalAudioWorkerRequest } from '~/types/localAudio'
import {
	LOCAL_AUDIO_ANALYZER_VERSION,
	LOCAL_AUDIO_CONFIGURATION_VERSION,
	LOCAL_AUDIO_KEY_EXTRACTOR_ARGS,
	LOCAL_AUDIO_RHYTHM_EXTRACTOR_ARGS,
	LOCAL_AUDIO_SAMPLE_RATE
} from '~/utils/localAudio'
import {
	type EssentiaLike,
	analyzeLocalAudioRequest
} from './localAudioAnalysisCore'

type TestVector = {
	values: number[]
	delete: ReturnType<typeof vi.fn>
}

function createVector(values: number[] = []): TestVector {
	return { values, delete: vi.fn() }
}

function createRequest(
	overrides: Partial<LocalAudioWorkerRequest> = {}
): LocalAudioWorkerRequest {
	const samples = new Float32Array([0.25, -0.5, 0.75])
	return {
		id: 'request-1',
		samples: samples.buffer as ArrayBuffer,
		durationSeconds: 12,
		analyzedDurationSeconds: 12,
		analysisOffsetSeconds: 0,
		...overrides
	}
}

function createEssentiaFixture() {
	const signal = createVector()
	const ticks = createVector([0.5, 1])
	const estimates = createVector([119.5, 120, 120.5])
	const intervals = createVector([0.5, 0.5])
	const rhythm: Record<string, unknown> = {
		bpm: 120,
		confidence: 3.5,
		ticks,
		estimates,
		bpmIntervals: intervals
	}
	const key: Record<string, unknown> = {
		key: 'C',
		scale: 'major',
		strength: 0.85
	}
	const essentia: EssentiaLike = {
		version: 'test-essentia',
		arrayToVector: vi.fn(() => signal),
		vectorToArray: vi.fn((vector: unknown) => (vector as TestVector).values),
		RhythmExtractor2013: vi.fn(() => rhythm),
		KeyExtractor: vi.fn(() => key)
	}

	return { essentia, signal, ticks, estimates, intervals, rhythm, key }
}

function expectAllVectorsDeleted(
	fixture: ReturnType<typeof createEssentiaFixture>
) {
	for (const vector of [
		fixture.signal,
		fixture.ticks,
		fixture.estimates,
		fixture.intervals
	]) {
		expect(vector.delete).toHaveBeenCalledTimes(1)
	}
}

describe('analyzeLocalAudioRequest', () => {
	it('maps every result field and deletes every vector after success', () => {
		const fixture = createEssentiaFixture()
		const request = createRequest()

		const result = analyzeLocalAudioRequest(request, fixture.essentia)

		const samples = vi.mocked(fixture.essentia.arrayToVector).mock.calls[0]?.[0]
		expect(Array.from(samples ?? [])).toEqual([0.25, -0.5, 0.75])
		expect(fixture.essentia.RhythmExtractor2013).toHaveBeenCalledWith(
			fixture.signal,
			...LOCAL_AUDIO_RHYTHM_EXTRACTOR_ARGS
		)
		expect(fixture.essentia.KeyExtractor).toHaveBeenCalledWith(
			fixture.signal,
			...LOCAL_AUDIO_KEY_EXTRACTOR_ARGS
		)
		expect(result).toEqual({
			analyzerVersion: `${LOCAL_AUDIO_ANALYZER_VERSION} (test-essentia)`,
			configurationVersion: LOCAL_AUDIO_CONFIGURATION_VERSION,
			bpm: 120,
			bpmConfidence: 3.5,
			bpmEstimates: [119.5, 120, 120.5],
			key: 'C',
			scale: 'major',
			keyStrength: 0.85,
			sampleRate: LOCAL_AUDIO_SAMPLE_RATE,
			durationSeconds: 12,
			analyzedDurationSeconds: 12,
			analysisOffsetSeconds: 0,
			warnings: []
		})
		expectAllVectorsDeleted(fixture)
	})

	it('deletes every created vector when key extraction throws', () => {
		const fixture = createEssentiaFixture()
		fixture.essentia.KeyExtractor = vi.fn(() => {
			throw new Error('key extraction failed')
		})

		expect(() =>
			analyzeLocalAudioRequest(createRequest(), fixture.essentia)
		).toThrow('key extraction failed')
		expectAllVectorsDeleted(fixture)
	})

	it('returns no estimates when a vector is unreadable and still cleans up', () => {
		const fixture = createEssentiaFixture()
		fixture.essentia.vectorToArray = vi.fn(() => {
			throw new Error('unreadable vector')
		})

		const result = analyzeLocalAudioRequest(createRequest(), fixture.essentia)

		expect(result.bpmEstimates).toEqual([])
		expectAllVectorsDeleted(fixture)
	})

	it('preserves the existing truncated-analysis warning', () => {
		const fixture = createEssentiaFixture()

		const result = analyzeLocalAudioRequest(
			createRequest({
				durationSeconds: 125.4,
				analyzedDurationSeconds: 60.2,
				analysisOffsetSeconds: 32.6
			}),
			fixture.essentia
		)

		expect(result.warnings).toEqual([
			'Analyzed a 60 second center segment of a 125 second track'
		])
	})

	it('preserves the existing out-of-range BPM warning', () => {
		const fixture = createEssentiaFixture()
		fixture.rhythm.bpm = 301.25

		const result = analyzeLocalAudioRequest(createRequest(), fixture.essentia)

		expect(result.warnings).toEqual([
			'Analyzer returned out-of-range BPM 301.3'
		])
	})

	it('nulls non-finite fields and filters non-finite estimates', () => {
		const fixture = createEssentiaFixture()
		fixture.rhythm.bpm = Number.POSITIVE_INFINITY
		fixture.rhythm.confidence = Number.NaN
		fixture.estimates.values = [119, Number.NaN, Number.NEGATIVE_INFINITY, 121]
		fixture.key.strength = Number.POSITIVE_INFINITY

		const result = analyzeLocalAudioRequest(createRequest(), fixture.essentia)

		expect(result.bpm).toBeNull()
		expect(result.bpmConfidence).toBeNull()
		expect(result.bpmEstimates).toEqual([119, 121])
		expect(result.keyStrength).toBeNull()
		expect(result.warnings).toEqual([])
		expectAllVectorsDeleted(fixture)
	})
})
