declare module 'essentia.js/dist/essentia.js-core.es.js' {
	export default class Essentia {
		constructor(EssentiaWASM: unknown, isDebug?: boolean)
		version: string
		arrayToVector(inputArray: Float32Array): unknown
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
		delete(): void
	}
}

declare module 'essentia.js/dist/essentia-wasm.es.js' {
	export const EssentiaWASM: unknown
}
