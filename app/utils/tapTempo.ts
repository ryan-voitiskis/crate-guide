import type { InjectionKey } from 'vue'
import { isBpmInRange } from './formatting'

export type TapTempoOptions = {
	/** Number of most recent accepted intervals kept for the estimate. */
	maxIntervals: number
	/** Intervals shorter than this are treated as bounces and ignored. */
	minIntervalMs: number
	/** Intervals longer than this start a new tap sequence. */
	maxIntervalMs: number
	/** Intervals further than this fraction from the median are excluded. */
	outlierTolerance: number
	/** Accepted intervals required before the estimate can be stable. */
	stableAfterIntervals: number
	/** Maximum spread (max - min) / mean for a stable estimate. */
	stableSpread: number
}

export type TapTempoState = {
	/** Estimate rounded to one decimal, suitable for writing to a track. */
	bpm: number | null
	/** Full-precision estimate for display or further calculation. */
	rawBpm: number | null
	/** Taps in the current sequence, including the first one. */
	tapCount: number
	/** Accepted intervals currently contributing to the estimate. */
	intervalCount: number
	stable: boolean
}

export const DEFAULT_TAP_TEMPO_OPTIONS: TapTempoOptions = {
	maxIntervals: 8,
	minIntervalMs: 200,
	maxIntervalMs: 2000,
	outlierTolerance: 0.25,
	stableAfterIntervals: 4,
	stableSpread: 0.02
}

/** Millisecond clock used for tap timestamps; tests provide a deterministic one. */
export type TapTempoClock = () => number

export const TAP_TEMPO_CLOCK: InjectionKey<TapTempoClock> =
	Symbol('tapTempoClock')

export const defaultTapTempoClock: TapTempoClock = () =>
	typeof performance !== 'undefined' ? performance.now() : Date.now()

export function roundBpm(bpm: number): number {
	return Math.round(bpm * 10) / 10
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 0
		? (sorted[middle - 1]! + sorted[middle]!) / 2
		: sorted[middle]!
}

/**
 * Estimates a tempo from tap intervals in milliseconds. Intervals more than
 * `outlierTolerance` away from the median are dropped before averaging so one
 * missed tap does not drag the estimate.
 */
export function estimateBpmFromIntervals(
	intervals: readonly number[],
	options: Pick<
		TapTempoOptions,
		'outlierTolerance' | 'stableAfterIntervals' | 'stableSpread'
	> = DEFAULT_TAP_TEMPO_OPTIONS
): Pick<TapTempoState, 'bpm' | 'rawBpm' | 'intervalCount' | 'stable'> {
	const empty = { bpm: null, rawBpm: null, intervalCount: 0, stable: false }
	const positive = intervals.filter(
		(value) => Number.isFinite(value) && value > 0
	)
	if (positive.length === 0) return empty

	const centre = median(positive)
	const accepted = positive.filter(
		(value) => Math.abs(value - centre) / centre <= options.outlierTolerance
	)
	// Uneven taps, such as one skipped beat among two intervals, can leave no
	// interval near the median. There is no estimate rather than a NaN one.
	if (accepted.length === 0) return empty

	const mean = accepted.reduce((sum, value) => sum + value, 0) / accepted.length
	const rawBpm = 60000 / mean
	const bpm = roundBpm(rawBpm)
	if (!Number.isFinite(rawBpm) || !isBpmInRange(bpm)) return empty
	const spread = (Math.max(...accepted) - Math.min(...accepted)) / mean

	return {
		bpm,
		rawBpm,
		intervalCount: accepted.length,
		stable:
			accepted.length >= options.stableAfterIntervals &&
			spread <= options.stableSpread
	}
}

export function createTapTempo(overrides: Partial<TapTempoOptions> = {}) {
	const options: TapTempoOptions = {
		...DEFAULT_TAP_TEMPO_OPTIONS,
		...overrides
	}
	let lastTapMs: number | null = null
	let tapCount = 0
	let intervals: number[] = []

	function state(): TapTempoState {
		return { tapCount, ...estimateBpmFromIntervals(intervals, options) }
	}

	function startSequence(timestampMs: number) {
		lastTapMs = timestampMs
		tapCount = 1
		intervals = []
	}

	function tap(timestampMs: number): TapTempoState {
		if (!Number.isFinite(timestampMs)) return state()
		if (lastTapMs === null) {
			startSequence(timestampMs)
			return state()
		}

		const interval = timestampMs - lastTapMs
		// A bounce or an out-of-order timestamp never counts as a beat.
		if (interval < options.minIntervalMs) return state()
		if (interval > options.maxIntervalMs) {
			startSequence(timestampMs)
			return state()
		}

		lastTapMs = timestampMs
		tapCount += 1
		intervals = [...intervals, interval].slice(-options.maxIntervals)
		return state()
	}

	function reset(): TapTempoState {
		lastTapMs = null
		tapCount = 0
		intervals = []
		return state()
	}

	return { tap, reset, getState: state, options }
}

export type TapTempo = ReturnType<typeof createTapTempo>

function scaleBpm(bpm: number | null, factor: number): number | null {
	if (bpm === null || !Number.isFinite(bpm)) return null
	const scaled = roundBpm(bpm * factor)
	return isBpmInRange(scaled) ? scaled : null
}

/** Halves a tempo, or returns null when the result leaves the valid range. */
export function halveBpm(bpm: number | null): number | null {
	return scaleBpm(bpm, 0.5)
}

/** Doubles a tempo, or returns null when the result leaves the valid range. */
export function doubleBpm(bpm: number | null): number | null {
	return scaleBpm(bpm, 2)
}
