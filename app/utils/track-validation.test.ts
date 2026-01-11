import { describe, expect, it } from 'vitest'

import {
	isValidBPM,
	isValidDurationFormat,
	isValidKeyComposite,
	isValidTrackPosition
} from './track-validation'

describe('isValidTrackPosition', () => {
	it('returns true for empty string', () => {
		expect(isValidTrackPosition('')).toBe(true)
	})

	it('returns true for valid single positions', () => {
		expect(isValidTrackPosition('A1')).toBe(true)
		expect(isValidTrackPosition('B2')).toBe(true)
		expect(isValidTrackPosition('C3')).toBe(true)
		expect(isValidTrackPosition('D10')).toBe(true)
	})

	it('returns true for lowercase positions', () => {
		expect(isValidTrackPosition('a1')).toBe(true)
		expect(isValidTrackPosition('b2')).toBe(true)
	})

	it('returns true for range positions', () => {
		expect(isValidTrackPosition('A1-A2')).toBe(true)
		expect(isValidTrackPosition('B1-B3')).toBe(true)
		expect(isValidTrackPosition('a1-b2')).toBe(true)
	})

	it('handles whitespace', () => {
		expect(isValidTrackPosition(' A1 ')).toBe(true)
		expect(isValidTrackPosition('  B2  ')).toBe(true)
	})

	it('returns false for invalid formats', () => {
		expect(isValidTrackPosition('1A')).toBe(false)
		expect(isValidTrackPosition('AA')).toBe(false)
		expect(isValidTrackPosition('11')).toBe(false)
		expect(isValidTrackPosition('A')).toBe(false)
		expect(isValidTrackPosition('1')).toBe(false)
		expect(isValidTrackPosition('A1-')).toBe(false)
		expect(isValidTrackPosition('-A1')).toBe(false)
	})
})

describe('isValidDurationFormat', () => {
	it('returns true for empty string', () => {
		expect(isValidDurationFormat('')).toBe(true)
	})

	it('returns true for valid MM:SS format', () => {
		expect(isValidDurationFormat('3:45')).toBe(true)
		expect(isValidDurationFormat('0:00')).toBe(true)
		expect(isValidDurationFormat('9:59')).toBe(true)
		expect(isValidDurationFormat('59:59')).toBe(true)
	})

	it('returns true for single digit minutes', () => {
		expect(isValidDurationFormat('1:00')).toBe(true)
		expect(isValidDurationFormat('5:30')).toBe(true)
	})

	it('returns true for double digit minutes', () => {
		expect(isValidDurationFormat('10:00')).toBe(true)
		expect(isValidDurationFormat('99:59')).toBe(true)
	})

	it('returns false for invalid seconds', () => {
		expect(isValidDurationFormat('3:60')).toBe(false)
		expect(isValidDurationFormat('3:99')).toBe(false)
	})

	it('returns false for missing leading zero on seconds', () => {
		expect(isValidDurationFormat('3:5')).toBe(false)
	})

	it('returns false for invalid formats', () => {
		expect(isValidDurationFormat('345')).toBe(false)
		expect(isValidDurationFormat('3:45:00')).toBe(false)
		expect(isValidDurationFormat('abc')).toBe(false)
		expect(isValidDurationFormat(':45')).toBe(false)
		expect(isValidDurationFormat('3:')).toBe(false)
	})
})

describe('isValidBPM', () => {
	it('returns true for empty string', () => {
		expect(isValidBPM('')).toBe(true)
	})

	it('returns true for valid BPM values', () => {
		expect(isValidBPM('120')).toBe(true)
		expect(isValidBPM('90')).toBe(true)
		expect(isValidBPM('180')).toBe(true)
		expect(isValidBPM('128.5')).toBe(true)
	})

	it('returns true for boundary values', () => {
		expect(isValidBPM('30')).toBe(true)
		expect(isValidBPM('300')).toBe(true)
	})

	it('returns false for values below 30', () => {
		expect(isValidBPM('29')).toBe(false)
		expect(isValidBPM('0')).toBe(false)
		expect(isValidBPM('10')).toBe(false)
	})

	it('returns false for values above 300', () => {
		expect(isValidBPM('301')).toBe(false)
		expect(isValidBPM('400')).toBe(false)
	})

	it('returns false for non-numeric input', () => {
		expect(isValidBPM('fast')).toBe(false)
		expect(isValidBPM('abc')).toBe(false)
	})
})

describe('isValidKeyComposite', () => {
	it('returns true for "none"', () => {
		expect(isValidKeyComposite('none')).toBe(true)
	})

	it('returns true for valid key composites', () => {
		// Minor keys (mode 0)
		expect(isValidKeyComposite('000')).toBe(true) // C Minor
		expect(isValidKeyComposite('009')).toBe(true) // A Minor
		expect(isValidKeyComposite('011')).toBe(true) // B Minor

		// Major keys (mode 1)
		expect(isValidKeyComposite('100')).toBe(true) // C Major
		expect(isValidKeyComposite('109')).toBe(true) // A Major
		expect(isValidKeyComposite('111')).toBe(true) // B Major
	})

	it('returns false for invalid key composites', () => {
		expect(isValidKeyComposite('')).toBe(false)
		expect(isValidKeyComposite('abc')).toBe(false)
		expect(isValidKeyComposite('200')).toBe(false) // mode > 1
		expect(isValidKeyComposite('012')).toBe(false) // key > 11
		expect(isValidKeyComposite('1234')).toBe(false) // too long
		expect(isValidKeyComposite('10')).toBe(false) // too short
	})
})
