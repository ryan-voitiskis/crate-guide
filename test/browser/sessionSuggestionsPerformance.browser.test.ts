import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cdp } from 'vitest/browser'
import { getTrackSuggestions } from '../../app/utils/trackSuggestions'
import type { Track } from '../../shared/types/supabase'

const CORPUS_SIZE = 10_000
const CPU_THROTTLE_RATE = 4
const WARM_UP_GESTURES = 10
const MEASURED_GESTURES = 40
const RECOMPUTATION_P95_BUDGET_MS = 16.7
const FRAME_INTERVAL_P95_BUDGET_MS = 20
const FADER_POSITIONS = [
	-100, -75, -50, -25, 0, 25, 50, 75, 100, 75, 50, 25, 0, -25, -50, -75, -100
] as const

type CpuThrottlingSession = {
	send: (
		method: 'Emulation.setCPUThrottlingRate',
		params: { rate: number }
	) => Promise<unknown>
}

type TimingInterval = {
	start: number
	end: number
}

type GestureResult = {
	frameIntervalsMs: number[]
	recomputationDurationsMs: number[]
	resultChecksum: number
}

function createDeterministicCorpus(): Track[] {
	return Array.from({ length: CORPUS_SIZE }, (_, index) => ({
		id: `track-${String(index).padStart(5, '0')}`,
		record_id: `record-${String(Math.floor(index / 2)).padStart(5, '0')}`,
		title: `Generated Track ${index}`,
		artists: [
			{
				discogs_id: index % 997,
				name: `Generated Artist ${index % 211}`,
				role: null
			}
		],
		extraartists: [],
		position: `${String.fromCharCode(65 + (index % 4))}${(index % 5) + 1}`,
		duration: 150_000 + (index % 180) * 1_000,
		bpm: 112 + (index % 400) / 10,
		rpm: index % 5 === 0 ? 45 : 33,
		key: index % 12,
		mode: index % 2,
		genres: [`Genre ${index % 12}`],
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true,
		beatport_data: null,
		audio_features: null,
		created_at: '2026-07-22T00:00:00.000Z',
		updated_at: '2026-07-22T00:00:00.000Z'
	}))
}

function percentile95(samples: number[]): number {
	if (samples.length === 0) throw new Error('Cannot measure an empty sample')
	const sorted = [...samples].sort((a, b) => a - b)
	return sorted[Math.ceil(sorted.length * 0.95) - 1]!
}

function rounded(samples: number[]): number[] {
	return samples.map((sample) => Math.round(sample * 1_000) / 1_000)
}

function nextAnimationFrame(): Promise<number> {
	return new Promise((resolve) => requestAnimationFrame(resolve))
}

async function runSyntheticFaderGesture(
	fader: HTMLInputElement,
	onFrame: (frameStartedAt: number, previousFrameAt: number | null) => void
): Promise<void> {
	let previousFrameAt: number | null = null
	for (const pitch of FADER_POSITIONS) {
		const frameStartedAt = await nextAnimationFrame()
		onFrame(frameStartedAt, previousFrameAt)
		previousFrameAt = frameStartedAt
		fader.value = String(pitch)
		fader.dispatchEvent(new InputEvent('input', { bubbles: true }))
	}
}

describe('session suggestion interaction budget', () => {
	const throttleSession = cdp() as unknown as CpuThrottlingSession

	beforeAll(async () => {
		await throttleSession.send('Emulation.setCPUThrottlingRate', {
			rate: CPU_THROTTLE_RATE
		})
	})

	afterAll(async () => {
		await throttleSession.send('Emulation.setCPUThrottlingRate', { rate: 1 })
	})

	it('keeps a 10k-track synthetic fader gesture within the supported budget', async () => {
		expect(PerformanceObserver.supportedEntryTypes).toContain('longtask')
		expect(navigator.userAgent).toContain('HeadlessChrome')

		const candidates = createDeterministicCorpus()
		const playedIds = new Set(
			candidates.filter((_, index) => index % 97 === 0).map((track) => track.id)
		)
		const sourceTrack = candidates[0]!
		const measuredRecomputations: TimingInterval[] = []
		const longTasks: TimingInterval[] = []
		const longTaskObserver = new PerformanceObserver((entries) => {
			for (const entry of entries.getEntries()) {
				longTasks.push({
					start: entry.startTime,
					end: entry.startTime + entry.duration
				})
			}
		})
		longTaskObserver.observe({ entryTypes: ['longtask'] })

		const fader = document.createElement('input')
		fader.type = 'range'
		fader.min = '-100'
		fader.max = '100'
		document.body.append(fader)

		let activeResult: GestureResult | null = null
		const handleInput = () => {
			const pitch = fader.valueAsNumber
			const targetBpm = 128 * (1 + (pitch / 100) * 0.08)
			const startedAt = performance.now()
			const suggestions = getTrackSuggestions(candidates, {
				targetBpm,
				targetKey: 9,
				sourceMode: 0,
				sourceRecordId: sourceTrack.record_id,
				sourceTrackId: sourceTrack.id,
				playedIds,
				pitchRange: 8
			})
			const finishedAt = performance.now()
			if (!activeResult) return
			activeResult.recomputationDurationsMs.push(finishedAt - startedAt)
			activeResult.resultChecksum += suggestions.reduce(
				(sum, suggestion, index) =>
					sum + (suggestion.score ?? -1) * (index + 1),
				0
			)
			measuredRecomputations.push({ start: startedAt, end: finishedAt })
		}
		fader.addEventListener('input', handleInput)

		try {
			for (let index = 0; index < WARM_UP_GESTURES; index += 1) {
				await runSyntheticFaderGesture(fader, () => undefined)
			}

			const gestures: GestureResult[] = []
			for (let index = 0; index < MEASURED_GESTURES; index += 1) {
				const gesture: GestureResult = {
					frameIntervalsMs: [],
					recomputationDurationsMs: [],
					resultChecksum: 0
				}
				activeResult = gesture
				await runSyntheticFaderGesture(
					fader,
					(frameStartedAt, previousFrameAt) => {
						if (previousFrameAt !== null) {
							activeResult?.frameIntervalsMs.push(
								frameStartedAt - previousFrameAt
							)
						}
					}
				)
				gestures.push(gesture)
			}
			activeResult = null

			await nextAnimationFrame()
			await nextAnimationFrame()
			longTaskObserver.takeRecords().forEach((entry) => {
				longTasks.push({
					start: entry.startTime,
					end: entry.startTime + entry.duration
				})
			})

			const recomputationDurationsMs = gestures.flatMap(
				(gesture) => gesture.recomputationDurationsMs
			)
			const frameIntervalsMs = gestures.flatMap(
				(gesture) => gesture.frameIntervalsMs
			)
			const attributableLongTasks = longTasks.filter((longTask) =>
				measuredRecomputations.some(
					(recomputation) =>
						longTask.start < recomputation.end &&
						longTask.end > recomputation.start
				)
			)
			const result = {
				kind: 'session-suggestion-performance',
				corpusSize: candidates.length,
				cpuThrottleRate: CPU_THROTTLE_RATE,
				warmUpGestures: WARM_UP_GESTURES,
				measuredGestures: gestures.length,
				recomputations: recomputationDurationsMs.length,
				frameIntervals: frameIntervalsMs.length,
				recomputationP95Ms:
					Math.round(percentile95(recomputationDurationsMs) * 1_000) / 1_000,
				frameIntervalP95Ms:
					Math.round(percentile95(frameIntervalsMs) * 1_000) / 1_000,
				attributableLongTasks: attributableLongTasks.length,
				resultChecksums: rounded(
					gestures.map((gesture) => gesture.resultChecksum)
				),
				recomputationDurationsMs: rounded(recomputationDurationsMs),
				frameIntervalsMs: rounded(frameIntervalsMs)
			}

			console.info(JSON.stringify(result))
			expect(result.recomputationP95Ms).toBeLessThanOrEqual(
				RECOMPUTATION_P95_BUDGET_MS
			)
			expect(result.frameIntervalP95Ms).toBeLessThanOrEqual(
				FRAME_INTERVAL_P95_BUDGET_MS
			)
			expect(result.attributableLongTasks).toBe(0)
			expect(new Set(result.resultChecksums).size).toBe(1)
		} finally {
			longTaskObserver.disconnect()
			fader.removeEventListener('input', handleInput)
			fader.remove()
		}
	}, 120_000)
})
