import { describe, expect, it } from 'vitest'
import {
	DEFAULT_TAP_TEMPO_OPTIONS,
	createTapTempo,
	doubleBpm,
	estimateBpmFromIntervals,
	halveBpm,
	roundBpm
} from './tapTempo'

function tapSequence(intervalMs: number, taps: number, start = 1000) {
	const tempo = createTapTempo()
	let state = tempo.getState()
	for (let index = 0; index < taps; index++) {
		state = tempo.tap(start + index * intervalMs)
	}
	return { tempo, state }
}

describe('estimateBpmFromIntervals', () => {
	it('returns an empty estimate without intervals', () => {
		expect(estimateBpmFromIntervals([])).toEqual({
			bpm: null,
			rawBpm: null,
			intervalCount: 0,
			stable: false
		})
	})

	it('converts a steady interval into a tempo', () => {
		const estimate = estimateBpmFromIntervals([500, 500, 500, 500])
		expect(estimate.bpm).toBe(120)
		expect(estimate.rawBpm).toBeCloseTo(120)
		expect(estimate.intervalCount).toBe(4)
		expect(estimate.stable).toBe(true)
	})

	it('drops intervals far from the median before averaging', () => {
		const estimate = estimateBpmFromIntervals([469, 469, 469, 938, 469])
		expect(estimate.intervalCount).toBe(4)
		expect(estimate.bpm).toBeCloseTo(roundBpm(60000 / 469), 1)
	})

	it('ignores non-positive intervals', () => {
		const estimate = estimateBpmFromIntervals([0, -5, 600])
		expect(estimate.bpm).toBe(100)
		expect(estimate.intervalCount).toBe(1)
	})

	it('is not stable until enough intervals agree', () => {
		expect(estimateBpmFromIntervals([500, 500, 500]).stable).toBe(false)
		expect(estimateBpmFromIntervals([500, 500, 500, 500]).stable).toBe(true)
		expect(estimateBpmFromIntervals([500, 500, 500, 530]).stable).toBe(false)
	})
})

describe('createTapTempo', () => {
	it('needs two taps before it has an estimate', () => {
		const { state } = tapSequence(500, 1)
		expect(state).toEqual({
			bpm: null,
			rawBpm: null,
			tapCount: 1,
			intervalCount: 0,
			stable: false
		})
	})

	it('estimates 120 BPM from taps every 500 ms and becomes stable', () => {
		const { state } = tapSequence(500, 5)
		expect(state.bpm).toBe(120)
		expect(state.tapCount).toBe(5)
		expect(state.intervalCount).toBe(4)
		expect(state.stable).toBe(true)
	})

	it('reports one decimal and keeps the raw estimate', () => {
		const { state } = tapSequence(469, 5)
		expect(state.bpm).toBe(127.9)
		expect(state.rawBpm).toBeCloseTo(60000 / 469)
	})

	it('ignores bounces shorter than the minimum interval', () => {
		const tempo = createTapTempo()
		tempo.tap(0)
		tempo.tap(500)
		const bounced = tempo.tap(560)
		expect(bounced.tapCount).toBe(2)
		expect(bounced.intervalCount).toBe(1)
		const next = tempo.tap(1000)
		expect(next.tapCount).toBe(3)
		expect(next.bpm).toBe(120)
	})

	it('ignores out-of-order timestamps', () => {
		const tempo = createTapTempo()
		tempo.tap(1000)
		const state = tempo.tap(400)
		expect(state.tapCount).toBe(1)
		expect(state.intervalCount).toBe(0)
	})

	it('starts a new sequence after a long pause', () => {
		const tempo = createTapTempo()
		for (let index = 0; index < 5; index++) tempo.tap(index * 500)
		const restarted = tempo.tap(10000)
		expect(restarted.tapCount).toBe(1)
		expect(restarted.bpm).toBeNull()
		const resumed = tempo.tap(10400)
		expect(resumed.bpm).toBe(150)
	})

	it('keeps only the most recent intervals', () => {
		const tempo = createTapTempo({ maxIntervals: 4 })
		let time = 0
		tempo.tap(time)
		for (let index = 0; index < 6; index++) {
			time += 600
			tempo.tap(time)
		}
		for (let index = 0; index < 4; index++) {
			time += 500
			tempo.tap(time)
		}
		const state = tempo.getState()
		expect(state.intervalCount).toBe(4)
		expect(state.bpm).toBe(120)
		expect(state.tapCount).toBe(11)
	})

	it('resets to the empty state', () => {
		const { tempo } = tapSequence(500, 5)
		expect(tempo.reset()).toEqual({
			bpm: null,
			rawBpm: null,
			tapCount: 0,
			intervalCount: 0,
			stable: false
		})
		expect(tempo.tap(100).tapCount).toBe(1)
	})

	it('exposes merged options', () => {
		const tempo = createTapTempo({ minIntervalMs: 250 })
		expect(tempo.options).toEqual({
			...DEFAULT_TAP_TEMPO_OPTIONS,
			minIntervalMs: 250
		})
	})

	it('ignores non-finite timestamps', () => {
		const tempo = createTapTempo()
		expect(tempo.tap(Number.NaN).tapCount).toBe(0)
		expect(tempo.tap(Number.POSITIVE_INFINITY).tapCount).toBe(0)
	})
})

describe('halveBpm and doubleBpm', () => {
	it('scale within the valid range', () => {
		expect(halveBpm(128)).toBe(64)
		expect(doubleBpm(64)).toBe(128)
		expect(doubleBpm(70.25)).toBe(140.5)
	})

	it('return null when the result leaves the range', () => {
		expect(halveBpm(59)).toBeNull()
		expect(doubleBpm(151)).toBeNull()
		expect(halveBpm(null)).toBeNull()
		expect(doubleBpm(Number.NaN)).toBeNull()
	})

	it('round to one decimal', () => {
		expect(halveBpm(127.9)).toBe(64)
		expect(halveBpm(127.3)).toBe(63.7)
	})
})
