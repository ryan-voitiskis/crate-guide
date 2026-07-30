import localAudioAnalysisConfiguration from '../../shared/config/localAudioAnalysis.json'

const BYTES_PER_FLOAT_SAMPLE = 4
const WAV_HEADER_MINIMUM_BYTES = 44
const RIFF_CHUNK_HEADER_BYTES = 8

export const LOCAL_AUDIO_DECODE_SKIP_MESSAGES = Object.freeze({
	budget: 'Analysis skipped: file exceeds the safe decode budget',
	metadata:
		'Analysis skipped: audio metadata could not prove decoding is within the safe budget',
	unsupported:
		'Analysis skipped: this format has no verified safe browser decoder',
	decodeFailed:
		'Analysis skipped: browser could not decode this file within the safe budget'
})

export type LocalAudioDecodeMetadata = {
	container: 'wav'
	codec: 'pcm'
	durationSeconds: number
	sampleRate: number
	channels: number
	bitsPerSample: number
	dataBytes: number
}

export type LocalAudioDecodeEnvelope = {
	fileBytes: number
	headerBytes: number
	decodedPcmBytes: number
	analysisPcmBytes: number
	fixedSafetyMarginBytes: number
	totalPeakBytes: number
}

export type LocalAudioDecodeSafetyPolicy = {
	policyVersion: string
	maxHeaderBytes: number
	maxTotalPeakBytes: number
	fixedSafetyMarginBytes: number
	inputFileCopies: number
	decodedPcmCopies: number
	analysisPcmCopies: number
	maxChannels: number
	maxSampleRate: number
	supportedWavBitsPerSample: readonly number[]
}

export type LocalAudioDecodeDecision =
	| {
			kind: 'safe'
			metadata: LocalAudioDecodeMetadata
			envelope: LocalAudioDecodeEnvelope
	  }
	| {
			kind: 'tags-only'
			code: 'budget' | 'metadata' | 'unsupported'
			message: string
			metadata: LocalAudioDecodeMetadata | null
			envelope: LocalAudioDecodeEnvelope | null
	  }

export const LOCAL_AUDIO_DECODE_SAFETY_POLICY: Readonly<LocalAudioDecodeSafetyPolicy> =
	Object.freeze({
		...localAudioAnalysisConfiguration.decodeSafety,
		supportedWavBitsPerSample: Object.freeze([
			...localAudioAnalysisConfiguration.decodeSafety.supportedWavBitsPerSample
		])
	})

function readAscii(view: DataView, offset: number, length: number): string {
	let value = ''
	for (let index = 0; index < length; index += 1) {
		value += String.fromCharCode(view.getUint8(offset + index))
	}
	return value
}

function getExtension(fileName: string): string {
	return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function tagsOnly(
	code: 'budget' | 'metadata' | 'unsupported',
	metadata: LocalAudioDecodeMetadata | null = null,
	envelope: LocalAudioDecodeEnvelope | null = null
): LocalAudioDecodeDecision {
	return {
		kind: 'tags-only',
		code,
		message: LOCAL_AUDIO_DECODE_SKIP_MESSAGES[code],
		metadata,
		envelope
	}
}

function checkedProduct(...values: number[]): number | null {
	let product = 1
	for (const value of values) {
		if (!Number.isFinite(value) || value < 0) return null
		product *= value
		if (!Number.isSafeInteger(Math.ceil(product))) return null
	}
	return Math.ceil(product)
}

function checkedSum(...values: number[]): number | null {
	let sum = 0
	for (const value of values) {
		if (!Number.isSafeInteger(value) || value < 0) return null
		sum += value
		if (!Number.isSafeInteger(sum)) return null
	}
	return sum
}

function hasValidMetadata(
	metadata: LocalAudioDecodeMetadata,
	policy: Readonly<LocalAudioDecodeSafetyPolicy>
): boolean {
	return (
		metadata.container === 'wav' &&
		metadata.codec === 'pcm' &&
		Number.isFinite(metadata.durationSeconds) &&
		metadata.durationSeconds > 0 &&
		Number.isSafeInteger(metadata.sampleRate) &&
		metadata.sampleRate > 0 &&
		metadata.sampleRate <= policy.maxSampleRate &&
		Number.isSafeInteger(metadata.channels) &&
		metadata.channels > 0 &&
		metadata.channels <= policy.maxChannels &&
		policy.supportedWavBitsPerSample.includes(metadata.bitsPerSample) &&
		Number.isSafeInteger(metadata.dataBytes) &&
		metadata.dataBytes > 0
	)
}

export function estimateLocalAudioDecodeEnvelope(
	input: {
		fileSize: number
		headerBytes: number
		metadata: LocalAudioDecodeMetadata
	},
	policy: Readonly<LocalAudioDecodeSafetyPolicy> = LOCAL_AUDIO_DECODE_SAFETY_POLICY
): LocalAudioDecodeEnvelope | null {
	if (
		!Number.isSafeInteger(input.fileSize) ||
		input.fileSize <= 0 ||
		!Number.isSafeInteger(input.headerBytes) ||
		input.headerBytes < 0 ||
		input.headerBytes > policy.maxHeaderBytes ||
		!hasValidMetadata(input.metadata, policy)
	) {
		return null
	}

	const fileBytes = checkedProduct(input.fileSize, policy.inputFileCopies)
	const decodedSampleRate = Math.max(
		input.metadata.sampleRate,
		localAudioAnalysisConfiguration.sampleRate
	)
	const decodedPcmBytes = checkedProduct(
		input.metadata.durationSeconds,
		decodedSampleRate,
		input.metadata.channels,
		BYTES_PER_FLOAT_SAMPLE,
		policy.decodedPcmCopies
	)
	const analyzedDurationSeconds = Math.min(
		input.metadata.durationSeconds,
		localAudioAnalysisConfiguration.maxAnalysisSeconds
	)
	const analysisPcmBytes = checkedProduct(
		analyzedDurationSeconds,
		localAudioAnalysisConfiguration.sampleRate,
		BYTES_PER_FLOAT_SAMPLE,
		policy.analysisPcmCopies
	)

	if (
		fileBytes === null ||
		decodedPcmBytes === null ||
		analysisPcmBytes === null
	) {
		return null
	}

	const totalPeakBytes = checkedSum(
		fileBytes,
		input.headerBytes,
		decodedPcmBytes,
		analysisPcmBytes,
		policy.fixedSafetyMarginBytes
	)
	if (totalPeakBytes === null) return null

	return {
		fileBytes,
		headerBytes: input.headerBytes,
		decodedPcmBytes,
		analysisPcmBytes,
		fixedSafetyMarginBytes: policy.fixedSafetyMarginBytes,
		totalPeakBytes
	}
}

export function evaluateLocalAudioDecodeSafety(
	input: {
		fileSize: number
		headerBytes: number
		metadata: LocalAudioDecodeMetadata
	},
	policy: Readonly<LocalAudioDecodeSafetyPolicy> = LOCAL_AUDIO_DECODE_SAFETY_POLICY
): LocalAudioDecodeDecision {
	const envelope = estimateLocalAudioDecodeEnvelope(input, policy)
	if (!envelope) return tagsOnly('metadata', input.metadata)
	if (envelope.totalPeakBytes > policy.maxTotalPeakBytes) {
		return tagsOnly('budget', input.metadata, envelope)
	}
	return { kind: 'safe', metadata: input.metadata, envelope }
}

function parsePcmWavMetadata(
	bytes: ArrayBuffer,
	fileSize: number,
	policy: Readonly<LocalAudioDecodeSafetyPolicy>
):
	| { kind: 'metadata'; metadata: LocalAudioDecodeMetadata }
	| { kind: 'metadata-error' }
	| { kind: 'unsupported' } {
	if (bytes.byteLength < WAV_HEADER_MINIMUM_BYTES) {
		return { kind: 'metadata-error' }
	}

	const view = new DataView(bytes)
	if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
		return { kind: 'metadata-error' }
	}

	let audioFormat: number | null = null
	let channels: number | null = null
	let sampleRate: number | null = null
	let byteRate: number | null = null
	let blockAlign: number | null = null
	let bitsPerSample: number | null = null
	let dataBytes: number | null = null
	let dataOffset: number | null = null
	let offset = 12

	while (offset + RIFF_CHUNK_HEADER_BYTES <= view.byteLength) {
		const chunkId = readAscii(view, offset, 4)
		const chunkSize = view.getUint32(offset + 4, true)
		const chunkDataOffset = offset + RIFF_CHUNK_HEADER_BYTES

		if (chunkId === 'fmt ') {
			if (chunkSize < 16 || chunkDataOffset + 16 > view.byteLength) {
				return { kind: 'metadata-error' }
			}
			audioFormat = view.getUint16(chunkDataOffset, true)
			channels = view.getUint16(chunkDataOffset + 2, true)
			sampleRate = view.getUint32(chunkDataOffset + 4, true)
			byteRate = view.getUint32(chunkDataOffset + 8, true)
			blockAlign = view.getUint16(chunkDataOffset + 12, true)
			bitsPerSample = view.getUint16(chunkDataOffset + 14, true)
		} else if (chunkId === 'data') {
			dataBytes = chunkSize
			dataOffset = chunkDataOffset
			break
		}

		const paddedChunkSize = chunkSize + (chunkSize % 2)
		const nextOffset = chunkDataOffset + paddedChunkSize
		if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
			return { kind: 'metadata-error' }
		}
		offset = nextOffset
	}

	if (
		audioFormat === null ||
		channels === null ||
		sampleRate === null ||
		byteRate === null ||
		blockAlign === null ||
		bitsPerSample === null ||
		dataBytes === null ||
		dataOffset === null
	) {
		return { kind: 'metadata-error' }
	}

	if (
		audioFormat !== 1 ||
		!policy.supportedWavBitsPerSample.includes(bitsPerSample)
	) {
		return { kind: 'unsupported' }
	}

	const expectedBlockAlign = (channels * bitsPerSample) / 8
	const expectedByteRate = sampleRate * expectedBlockAlign
	if (
		!Number.isInteger(expectedBlockAlign) ||
		blockAlign !== expectedBlockAlign ||
		byteRate !== expectedByteRate ||
		dataBytes === 0 ||
		dataBytes % blockAlign !== 0 ||
		dataOffset + dataBytes > fileSize
	) {
		return { kind: 'metadata-error' }
	}

	return {
		kind: 'metadata',
		metadata: {
			container: 'wav',
			codec: 'pcm',
			durationSeconds: dataBytes / byteRate,
			sampleRate,
			channels,
			bitsPerSample,
			dataBytes
		}
	}
}

export async function inspectLocalAudioDecodeSafety(
	file: File,
	policy: Readonly<LocalAudioDecodeSafetyPolicy> = LOCAL_AUDIO_DECODE_SAFETY_POLICY
): Promise<LocalAudioDecodeDecision> {
	const extension = getExtension(file.name)
	if (!['wav', 'aif', 'aiff'].includes(extension)) {
		return tagsOnly('unsupported')
	}

	const headerBytes = Math.min(file.size, policy.maxHeaderBytes)
	if (headerBytes < WAV_HEADER_MINIMUM_BYTES) return tagsOnly('metadata')

	let bytes: ArrayBuffer
	try {
		bytes = await file.slice(0, headerBytes).arrayBuffer()
	} catch {
		return tagsOnly('metadata')
	}

	const view = new DataView(bytes)
	if (
		bytes.byteLength >= 12 &&
		readAscii(view, 0, 4) === 'FORM' &&
		['AIFF', 'AIFC'].includes(readAscii(view, 8, 4))
	) {
		return tagsOnly('unsupported')
	}

	const parsed = parsePcmWavMetadata(bytes, file.size, policy)
	if (parsed.kind === 'unsupported') return tagsOnly('unsupported')
	if (parsed.kind === 'metadata-error') return tagsOnly('metadata')
	return evaluateLocalAudioDecodeSafety(
		{
			fileSize: file.size,
			headerBytes: bytes.byteLength,
			metadata: parsed.metadata
		},
		policy
	)
}
