import { describe, expect, it } from 'vitest'
import type {
	LocalAudioWorkerRequest,
	LocalAudioWorkerResponse
} from '../../app/types/localAudio'
import {
	LOCAL_AUDIO_ANALYZER_VERSION,
	LOCAL_AUDIO_CONFIGURATION_VERSION,
	LOCAL_AUDIO_SAMPLE_RATE
} from '../../app/utils/localAudio'

const DURATION_SECONDS = 12
const RESPONSE_TIMEOUT_MS = 60_000
const TRIAD_FREQUENCIES = [261.625565, 329.627557, 391.995436] as const

function createDeterministicSamples(): Float32Array {
	const samples = new Float32Array(LOCAL_AUDIO_SAMPLE_RATE * DURATION_SECONDS)

	for (let index = 0; index < samples.length; index += 1) {
		const time = index / LOCAL_AUDIO_SAMPLE_RATE
		samples[index] =
			0.04 *
			TRIAD_FREQUENCIES.reduce(
				(sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * time),
				0
			)
	}

	const impulseSpacing = LOCAL_AUDIO_SAMPLE_RATE / 2
	const impulseLength = Math.round(LOCAL_AUDIO_SAMPLE_RATE * 0.005)
	for (
		let impulseStart = 0;
		impulseStart < samples.length;
		impulseStart += impulseSpacing
	) {
		for (
			let offset = 0;
			offset < impulseLength && impulseStart + offset < samples.length;
			offset += 1
		) {
			samples[impulseStart + offset] += 0.2 * Math.exp(-offset / 30)
		}
	}

	return samples
}

function analyzeInWorker(
	worker: Worker,
	request: LocalAudioWorkerRequest
): Promise<LocalAudioWorkerResponse> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			reject(new Error(`Worker response exceeded ${RESPONSE_TIMEOUT_MS}ms`))
		}, RESPONSE_TIMEOUT_MS)

		worker.onmessage = (event: MessageEvent<LocalAudioWorkerResponse>) => {
			window.clearTimeout(timeout)
			resolve(event.data)
		}
		worker.onerror = (event) => {
			window.clearTimeout(timeout)
			reject(new Error(event.message || 'Local audio worker failed'))
		}

		worker.postMessage(request, [request.samples])
	})
}

describe('local audio analysis worker', () => {
	it('runs the production Essentia/WASM worker on generated audio', async () => {
		const worker = new Worker(
			new URL(
				'../../app/workers/localAudioAnalysis.worker.ts',
				import.meta.url
			),
			{ type: 'module' }
		)
		const samples = createDeterministicSamples()
		const request: LocalAudioWorkerRequest = {
			id: 'real-essentia-worker-smoke',
			samples: samples.buffer as ArrayBuffer,
			durationSeconds: DURATION_SECONDS,
			analyzedDurationSeconds: DURATION_SECONDS,
			analysisOffsetSeconds: 0
		}

		try {
			const response = await analyzeInWorker(worker, request)

			expect(response.id).toBe(request.id)
			expect('result' in response).toBe(true)
			if (!('result' in response)) {
				throw new Error(`Worker returned an error: ${response.error}`)
			}

			const { result } = response
			const analyzerPrefix = `${LOCAL_AUDIO_ANALYZER_VERSION} (`
			expect(result.analyzerVersion.startsWith(analyzerPrefix)).toBe(true)
			expect(result.analyzerVersion.endsWith(')')).toBe(true)
			expect(
				result.analyzerVersion.slice(analyzerPrefix.length, -1).trim()
			).not.toBe('')
			expect(result.configurationVersion).toBe(
				LOCAL_AUDIO_CONFIGURATION_VERSION
			)
			expect(result.sampleRate).toBe(LOCAL_AUDIO_SAMPLE_RATE)
			expect(result.durationSeconds).toBe(request.durationSeconds)
			expect(result.analyzedDurationSeconds).toBe(
				request.analyzedDurationSeconds
			)
			expect(result.analysisOffsetSeconds).toBe(request.analysisOffsetSeconds)

			if (result.bpm !== null) {
				expect(Number.isFinite(result.bpm)).toBe(true)
				expect(result.bpm).toBeGreaterThanOrEqual(30)
				expect(result.bpm).toBeLessThanOrEqual(300)
			}
			if (result.bpmConfidence !== null) {
				expect(Number.isFinite(result.bpmConfidence)).toBe(true)
			}
			expect(result.bpmEstimates.every(Number.isFinite)).toBe(true)
			expect(result.key).toEqual(expect.any(String))
			expect(result.key?.length).toBeGreaterThan(0)
			expect(['major', 'minor']).toContain(result.scale)
			expect(result.keyStrength).not.toBeNull()
			expect(Number.isFinite(result.keyStrength)).toBe(true)
		} finally {
			worker.terminate()
		}
	})
})
