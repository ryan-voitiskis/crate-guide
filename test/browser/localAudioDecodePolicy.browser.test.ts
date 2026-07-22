import { describe, expect, it } from 'vitest'
import { LOCAL_AUDIO_SAMPLE_RATE } from '../../app/utils/localAudio'
import { inspectLocalAudioDecodeSafety } from '../../app/utils/localAudioDecodePolicy'

function writeAscii(view: DataView, offset: number, value: string) {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index))
	}
}

function createGeneratedPcmWav(
	bitsPerSample: 16 | 24,
	sampleRate: number
): Uint8Array {
	const channels = 2
	const frameCount = Math.round(sampleRate / 10)
	const bytesPerSample = bitsPerSample / 8
	const blockAlign = channels * bytesPerSample
	const dataBytes = frameCount * blockAlign
	const bytes = new Uint8Array(44 + dataBytes)
	const view = new DataView(bytes.buffer)

	writeAscii(view, 0, 'RIFF')
	view.setUint32(4, 36 + dataBytes, true)
	writeAscii(view, 8, 'WAVE')
	writeAscii(view, 12, 'fmt ')
	view.setUint32(16, 16, true)
	view.setUint16(20, 1, true)
	view.setUint16(22, channels, true)
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, sampleRate * blockAlign, true)
	view.setUint16(32, blockAlign, true)
	view.setUint16(34, bitsPerSample, true)
	writeAscii(view, 36, 'data')
	view.setUint32(40, dataBytes, true)

	for (let frame = 0; frame < frameCount; frame += 1) {
		const sample = Math.sin((2 * Math.PI * 440 * frame) / sampleRate) * 0.25
		for (let channel = 0; channel < channels; channel += 1) {
			const offset = 44 + (frame * channels + channel) * bytesPerSample
			if (bitsPerSample === 16) {
				view.setInt16(offset, Math.round(sample * 0x7fff), true)
			} else {
				const value = Math.round(sample * 0x7fffff)
				view.setUint8(offset, value & 0xff)
				view.setUint8(offset + 1, (value >> 8) & 0xff)
				view.setUint8(offset + 2, (value >> 16) & 0xff)
			}
		}
	}

	return bytes
}

describe('local audio safe decode adapter', () => {
	it.each([
		{ bitsPerSample: 16 as const, sampleRate: 44_100 },
		{ bitsPerSample: 24 as const, sampleRate: 48_000 },
		{ bitsPerSample: 16 as const, sampleRate: 192_000 }
	])(
		'decodes an ephemeral $bitsPerSample-bit PCM WAV admitted by policy',
		async ({ bitsPerSample, sampleRate }) => {
			const bytes = createGeneratedPcmWav(bitsPerSample, sampleRate)
			const file = new File([bytes], `generated-${bitsPerSample}.wav`, {
				type: 'audio/wav',
				lastModified: 1
			})
			const decision = await inspectLocalAudioDecodeSafety(file)
			expect(decision.kind).toBe('safe')

			const context = new AudioContext({
				sampleRate: LOCAL_AUDIO_SAMPLE_RATE
			})
			try {
				expect(context.sampleRate).toBe(LOCAL_AUDIO_SAMPLE_RATE)
				const decoded = await context.decodeAudioData(await file.arrayBuffer())
				expect(decoded.numberOfChannels).toBe(2)
				expect(decoded.sampleRate).toBe(LOCAL_AUDIO_SAMPLE_RATE)
				expect(decoded.duration).toBeCloseTo(0.1, 3)
				expect(decoded.getChannelData(0).some((sample) => sample !== 0)).toBe(
					true
				)
			} finally {
				await context.close()
			}
		}
	)
})
