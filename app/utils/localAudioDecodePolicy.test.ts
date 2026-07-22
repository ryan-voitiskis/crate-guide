import { describe, expect, it, vi } from 'vitest'
import {
	LOCAL_AUDIO_DECODE_SAFETY_POLICY,
	LOCAL_AUDIO_DECODE_SKIP_MESSAGES,
	type LocalAudioDecodeMetadata,
	estimateLocalAudioDecodeEnvelope,
	evaluateLocalAudioDecodeSafety,
	inspectLocalAudioDecodeSafety
} from './localAudioDecodePolicy'

type WavFixtureOptions = {
	sampleRate?: number
	channels?: number
	bitsPerSample?: number
	frames?: number
	audioFormat?: number
	declaredDataBytes?: number
	includeSampleBytes?: boolean
}

function writeAscii(view: DataView, offset: number, value: string) {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index))
	}
}

function createPcmWavFixture(options: WavFixtureOptions = {}) {
	const sampleRate = options.sampleRate ?? 44_100
	const channels = options.channels ?? 2
	const bitsPerSample = options.bitsPerSample ?? 16
	const frames = options.frames ?? sampleRate
	const blockAlign = (channels * bitsPerSample) / 8
	const dataBytes = options.declaredDataBytes ?? frames * blockAlign
	const includeSampleBytes = options.includeSampleBytes ?? true
	const bytes = new Uint8Array(44 + (includeSampleBytes ? dataBytes : 0))
	const view = new DataView(bytes.buffer)

	writeAscii(view, 0, 'RIFF')
	view.setUint32(4, 36 + dataBytes, true)
	writeAscii(view, 8, 'WAVE')
	writeAscii(view, 12, 'fmt ')
	view.setUint32(16, 16, true)
	view.setUint16(20, options.audioFormat ?? 1, true)
	view.setUint16(22, channels, true)
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, sampleRate * blockAlign, true)
	view.setUint16(32, blockAlign, true)
	view.setUint16(34, bitsPerSample, true)
	writeAscii(view, 36, 'data')
	view.setUint32(40, dataBytes, true)

	return { bytes, dataBytes }
}

function createAiffFixture() {
	const bytes = new Uint8Array(54)
	const view = new DataView(bytes.buffer)
	writeAscii(view, 0, 'FORM')
	view.setUint32(4, 46)
	writeAscii(view, 8, 'AIFF')
	writeAscii(view, 12, 'COMM')
	return bytes
}

function createVirtualFile(
	name: string,
	bytes: Uint8Array,
	declaredSize = bytes.byteLength
) {
	const fullArrayBuffer = vi.fn(() => {
		throw new Error(
			'Whole-file arrayBuffer must not be called during inspection'
		)
	})
	const slice = vi.fn((start = 0, end = declaredSize) => {
		return new Blob([bytes.slice(start, Math.min(end, bytes.byteLength))])
	})
	const file = {
		name,
		size: declaredSize,
		type: 'audio/wav',
		lastModified: 1,
		slice,
		arrayBuffer: fullArrayBuffer
	} as unknown as File

	return { file, fullArrayBuffer, slice }
}

const oneSecondMetadata: LocalAudioDecodeMetadata = {
	container: 'wav',
	codec: 'pcm',
	durationSeconds: 1,
	sampleRate: 44_100,
	channels: 2,
	bitsPerSample: 16,
	dataBytes: 176_400
}

describe('localAudioDecodePolicy', () => {
	it('pins a conservative immutable total-peak policy', () => {
		expect(LOCAL_AUDIO_DECODE_SAFETY_POLICY).toEqual({
			policyVersion: 'whole-file-pcm-wav-v1',
			maxHeaderBytes: 1_048_576,
			maxTotalPeakBytes: 268_435_456,
			fixedSafetyMarginBytes: 33_554_432,
			inputFileCopies: 2,
			decodedPcmCopies: 2,
			analysisPcmCopies: 3,
			maxChannels: 2,
			maxSampleRate: 192_000,
			supportedWavBitsPerSample: [16, 24]
		})
		expect(Object.isFrozen(LOCAL_AUDIO_DECODE_SAFETY_POLICY)).toBe(true)
		expect(
			Object.isFrozen(
				LOCAL_AUDIO_DECODE_SAFETY_POLICY.supportedWavBitsPerSample
			)
		).toBe(true)
	})

	it.each([16, 24])(
		'inspects generated %i-bit PCM WAV headers through a bounded slice',
		async (bitsPerSample) => {
			const { bytes } = createPcmWavFixture({ bitsPerSample, frames: 8 })
			const fixture = createVirtualFile(`fixture-${bitsPerSample}.wav`, bytes)

			const decision = await inspectLocalAudioDecodeSafety(fixture.file)

			expect(decision.kind).toBe('safe')
			if (decision.kind !== 'safe') throw new Error(decision.message)
			expect(decision.metadata).toMatchObject({
				container: 'wav',
				codec: 'pcm',
				bitsPerSample
			})
			expect(fixture.slice).toHaveBeenCalledWith(0, bytes.byteLength)
			expect(fixture.fullArrayBuffer).not.toHaveBeenCalled()
		}
	)

	it('accepts the exact total-peak boundary and refuses one byte below it', () => {
		const input = {
			fileSize: 176_444,
			headerBytes: 44,
			metadata: oneSecondMetadata
		}
		const envelope = estimateLocalAudioDecodeEnvelope(input)
		expect(envelope).not.toBeNull()
		if (!envelope) throw new Error('Expected a valid envelope')

		const exactPolicy = {
			...LOCAL_AUDIO_DECODE_SAFETY_POLICY,
			maxTotalPeakBytes: envelope.totalPeakBytes
		}
		const belowPolicy = {
			...exactPolicy,
			maxTotalPeakBytes: envelope.totalPeakBytes - 1
		}

		expect(evaluateLocalAudioDecodeSafety(input, exactPolicy).kind).toBe('safe')
		expect(evaluateLocalAudioDecodeSafety(input, belowPolicy)).toMatchObject({
			kind: 'tags-only',
			code: 'budget',
			message: LOCAL_AUDIO_DECODE_SKIP_MESSAGES.budget
		})
	})

	it('refuses a virtual two-hour WAV before any whole-file read', async () => {
		const sampleRate = 8_000
		const channels = 1
		const bitsPerSample = 16
		const dataBytes = 2 * 60 * 60 * sampleRate * channels * 2
		const { bytes } = createPcmWavFixture({
			sampleRate,
			channels,
			bitsPerSample,
			declaredDataBytes: dataBytes,
			includeSampleBytes: false
		})
		const fixture = createVirtualFile('two-hours.wav', bytes, 44 + dataBytes)

		const decision = await inspectLocalAudioDecodeSafety(fixture.file)

		expect(decision).toMatchObject({
			kind: 'tags-only',
			code: 'budget',
			message: LOCAL_AUDIO_DECODE_SKIP_MESSAGES.budget,
			metadata: { durationSeconds: 7_200 }
		})
		expect(fixture.slice).toHaveBeenCalledWith(
			0,
			LOCAL_AUDIO_DECODE_SAFETY_POLICY.maxHeaderBytes
		)
		expect(fixture.fullArrayBuffer).not.toHaveBeenCalled()
	})

	it.each([
		['truncated', new Uint8Array(12)],
		['bad RIFF signature', createPcmWavFixture({ frames: 8 }).bytes]
	])('keeps %s WAV metadata in the tags-only path', async (_label, source) => {
		const bytes = source.slice()
		if (_label === 'bad RIFF signature') bytes[0] = 0
		const fixture = createVirtualFile('corrupt.wav', bytes)

		await expect(
			inspectLocalAudioDecodeSafety(fixture.file)
		).resolves.toMatchObject({
			kind: 'tags-only',
			code: 'metadata',
			message: LOCAL_AUDIO_DECODE_SKIP_MESSAGES.metadata
		})
		expect(fixture.fullArrayBuffer).not.toHaveBeenCalled()
	})

	it.each([
		{ label: 'channel count', channels: 3, sampleRate: 44_100 },
		{ label: 'sample rate', channels: 2, sampleRate: 384_000 }
	])('refuses an extreme $label as unprovable metadata', async (options) => {
		const { bytes } = createPcmWavFixture({ ...options, frames: 1 })
		const fixture = createVirtualFile('extreme.wav', bytes)

		await expect(
			inspectLocalAudioDecodeSafety(fixture.file)
		).resolves.toMatchObject({ kind: 'tags-only', code: 'metadata' })
		expect(fixture.fullArrayBuffer).not.toHaveBeenCalled()
	})

	it('keeps unverified containers and codecs tags-only', async () => {
		const mp3 = createVirtualFile(
			'fixture.mp3',
			new Uint8Array([0x49, 0x44, 0x33])
		)
		const aiff = createVirtualFile('fixture.aiff', createAiffFixture())
		const floatWavBytes = createPcmWavFixture({
			audioFormat: 3,
			bitsPerSample: 32,
			frames: 8
		}).bytes
		const floatWav = createVirtualFile('float.wav', floatWavBytes)

		await expect(
			inspectLocalAudioDecodeSafety(mp3.file)
		).resolves.toMatchObject({ kind: 'tags-only', code: 'unsupported' })
		await expect(
			inspectLocalAudioDecodeSafety(aiff.file)
		).resolves.toMatchObject({ kind: 'tags-only', code: 'unsupported' })
		await expect(
			inspectLocalAudioDecodeSafety(floatWav.file)
		).resolves.toMatchObject({ kind: 'tags-only', code: 'unsupported' })
		expect(mp3.slice).not.toHaveBeenCalled()
		expect(mp3.fullArrayBuffer).not.toHaveBeenCalled()
		expect(aiff.fullArrayBuffer).not.toHaveBeenCalled()
		expect(floatWav.fullArrayBuffer).not.toHaveBeenCalled()
	})

	it('fails closed when the bounded header slice cannot be read', async () => {
		const { bytes } = createPcmWavFixture({ frames: 8 })
		const fixture = createVirtualFile('unreadable.wav', bytes)
		fixture.slice.mockReturnValue({
			arrayBuffer: vi.fn().mockRejectedValue(new Error('read failed'))
		} as unknown as Blob)

		await expect(
			inspectLocalAudioDecodeSafety(fixture.file)
		).resolves.toMatchObject({ kind: 'tags-only', code: 'metadata' })
		expect(fixture.fullArrayBuffer).not.toHaveBeenCalled()
	})
})
