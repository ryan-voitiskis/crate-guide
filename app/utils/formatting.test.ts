import { describe, expect, it } from 'vitest'

import { mmssToMs, msToMMSS, parseBPM } from './formatting'

describe('msToMMSS', () => {
	it('converts milliseconds to MM:SS format', () => {
		expect(msToMMSS(180000)).toBe('3:00')
		expect(msToMMSS(225000)).toBe('3:45')
		expect(msToMMSS(61000)).toBe('1:01')
		expect(msToMMSS(9000)).toBe('0:09')
	})

	it('pads single digit seconds with zero', () => {
		expect(msToMMSS(65000)).toBe('1:05')
		expect(msToMMSS(3000)).toBe('0:03')
	})

	it('handles large values', () => {
		expect(msToMMSS(3600000)).toBe('60:00')
		expect(msToMMSS(7200000)).toBe('120:00')
	})

	it('returns empty string for null', () => {
		expect(msToMMSS(null)).toBe('')
	})

	it('returns empty string for zero', () => {
		expect(msToMMSS(0)).toBe('')
	})

	it('floors fractional milliseconds', () => {
		expect(msToMMSS(180500)).toBe('3:00')
		expect(msToMMSS(180999)).toBe('3:00')
	})
})

describe('mmssToMs', () => {
	it('converts MM:SS format to milliseconds', () => {
		expect(mmssToMs('3:00')).toBe(180000)
		expect(mmssToMs('3:45')).toBe(225000)
		expect(mmssToMs('1:01')).toBe(61000)
		expect(mmssToMs('0:09')).toBe(9000)
	})

	it('handles single digit minutes', () => {
		expect(mmssToMs('1:05')).toBe(65000)
		expect(mmssToMs('0:03')).toBe(3000)
	})

	it('handles double digit minutes', () => {
		expect(mmssToMs('60:00')).toBe(3600000)
		expect(mmssToMs('120:00')).toBe(7200000)
	})

	it('handles seconds only (no colon)', () => {
		expect(mmssToMs('45')).toBe(45000)
		expect(mmssToMs('90')).toBe(90000)
	})

	it('returns null for empty string', () => {
		expect(mmssToMs('')).toBe(null)
	})

	it('returns null for invalid format', () => {
		expect(mmssToMs('abc')).toBe(null)
		expect(mmssToMs('1:ab')).toBe(null)
		expect(mmssToMs('ab:30')).toBe(null)
	})
})

describe('parseBPM', () => {
	it('parses integer BPM', () => {
		expect(parseBPM('120')).toBe(120)
		expect(parseBPM('90')).toBe(90)
		expect(parseBPM('180')).toBe(180)
	})

	it('parses decimal BPM', () => {
		expect(parseBPM('120.5')).toBe(120.5)
		expect(parseBPM('128.00')).toBe(128)
		expect(parseBPM('133.33')).toBe(133.33)
	})

	it('handles whitespace', () => {
		expect(parseBPM('  120  ')).toBe(120)
		expect(parseBPM('\t90\n')).toBe(90)
	})

	it('returns null for empty string', () => {
		expect(parseBPM('')).toBe(null)
	})

	it('returns null for whitespace only', () => {
		expect(parseBPM('   ')).toBe(null)
		expect(parseBPM('\t\n')).toBe(null)
	})

	it('returns null for non-numeric input', () => {
		expect(parseBPM('abc')).toBe(null)
		expect(parseBPM('fast')).toBe(null)
	})
})
