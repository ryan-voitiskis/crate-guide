import { describe, expect, it } from 'vitest'
import {
	type KeyAndMode,
	adjustKey,
	createKeyComposite,
	getCamelotMajor,
	getCamelotMinor,
	getCamelotString,
	getFormattedKeyString,
	getKeyColour,
	getKeyOptionsForComposite,
	getKeyString,
	getKeyStringShort,
	getMajorColour,
	getMinorColour,
	getSortableNotation,
	isKeyFormat,
	mod,
	parseBeatportKey,
	parseKeyComposite,
	pitchClassDistance,
	pitchClassMap,
	scoreHarmony
} from './keyFunctions'

describe('mod', () => {
	it('handles positive numbers normally', () => {
		expect(mod(7, 12)).toBe(7)
		expect(mod(15, 12)).toBe(3)
		expect(mod(24, 12)).toBe(0)
	})

	it('handles negative numbers correctly', () => {
		expect(mod(-1, 12)).toBe(11)
		expect(mod(-5, 12)).toBe(7)
		expect(mod(-12, 12)).toBe(0)
		expect(mod(-13, 12)).toBe(11)
	})

	it('handles zero', () => {
		expect(mod(0, 12)).toBe(0)
	})
})

describe('pitchClassDistance', () => {
	it('measures the shortest distance across the pitch-class boundary', () => {
		expect(pitchClassDistance(11.9, 0.1)).toBeCloseTo(0.2)
		expect(pitchClassDistance(0.1, 11.9)).toBeCloseTo(0.2)
	})

	it('normalizes negative and greater-than-octave values', () => {
		expect(pitchClassDistance(-0.1, 0.1)).toBeCloseTo(0.2)
		expect(pitchClassDistance(12.1, 0.1)).toBeCloseTo(0)
		expect(pitchClassDistance(25, 11)).toBeCloseTo(2)
	})

	it('returns six for a tritone in either direction', () => {
		expect(pitchClassDistance(0, 6)).toBe(6)
		expect(pitchClassDistance(6, 0)).toBe(6)
	})

	it('rejects non-finite inputs', () => {
		expect(() => pitchClassDistance(Number.NaN, 0)).toThrow(RangeError)
		expect(() => pitchClassDistance(0, Number.POSITIVE_INFINITY)).toThrow(
			RangeError
		)
		expect(() => pitchClassDistance(Number.NEGATIVE_INFINITY, 0)).toThrow(
			RangeError
		)
	})
})

describe('adjustKey', () => {
	it('returns same key for factor of 1 (no pitch change)', () => {
		expect(adjustKey(0, 1)).toBeCloseTo(0)
		expect(adjustKey(5, 1)).toBeCloseTo(5)
		expect(adjustKey(11, 1)).toBeCloseTo(11)
	})

	it('shifts up one semitone for factor ~1.0595 (12th root of 2)', () => {
		const semitoneUp = Math.pow(2, 1 / 12)
		expect(adjustKey(0, semitoneUp)).toBeCloseTo(1)
		expect(adjustKey(11, semitoneUp)).toBeCloseTo(0) // wraps around
	})

	it('shifts down one semitone for factor ~0.9439', () => {
		const semitoneDown = Math.pow(2, -1 / 12)
		expect(adjustKey(1, semitoneDown)).toBeCloseTo(0)
		expect(adjustKey(0, semitoneDown)).toBeCloseTo(11) // wraps around
	})

	it('shifts up an octave for factor of 2', () => {
		expect(adjustKey(0, 2)).toBeCloseTo(0) // octave = same pitch class
		expect(adjustKey(5, 2)).toBeCloseTo(5)
	})

	it('shifts down an octave for factor of 0.5', () => {
		expect(adjustKey(0, 0.5)).toBeCloseTo(0)
		expect(adjustKey(7, 0.5)).toBeCloseTo(7)
	})

	it('handles typical DJ pitch adjustments (+/- 8%)', () => {
		// +8% pitch = factor of 1.08
		const pitchUp8 = adjustKey(0, 1.08)
		expect(pitchUp8).toBeGreaterThan(0)
		expect(pitchUp8).toBeLessThan(2)

		// -8% pitch = factor of 0.92
		const pitchDown8 = adjustKey(0, 0.92)
		expect(pitchDown8).toBeGreaterThan(10)
		expect(pitchDown8).toBeLessThan(12)
	})
})

describe('parseKeyComposite', () => {
	it('parses valid minor key composites', () => {
		expect(parseKeyComposite('000')).toEqual({ key: 0, mode: 0 }) // C Minor
		expect(parseKeyComposite('009')).toEqual({ key: 9, mode: 0 }) // A Minor
		expect(parseKeyComposite('011')).toEqual({ key: 11, mode: 0 }) // B Minor
	})

	it('parses valid major key composites', () => {
		expect(parseKeyComposite('100')).toEqual({ key: 0, mode: 1 }) // C Major
		expect(parseKeyComposite('109')).toEqual({ key: 9, mode: 1 }) // A Major
		expect(parseKeyComposite('111')).toEqual({ key: 11, mode: 1 }) // B Major
	})

	it('returns null for "none"', () => {
		expect(parseKeyComposite('none')).toEqual({ key: null, mode: null })
	})

	it('returns null for empty string', () => {
		expect(parseKeyComposite('')).toEqual({ key: null, mode: null })
	})

	it('returns null for invalid length', () => {
		expect(parseKeyComposite('10')).toEqual({ key: null, mode: null })
		expect(parseKeyComposite('1000')).toEqual({ key: null, mode: null })
	})

	it('returns null for invalid mode', () => {
		expect(parseKeyComposite('200')).toEqual({ key: null, mode: null })
		expect(parseKeyComposite('900')).toEqual({ key: null, mode: null })
	})

	it('returns null for invalid key', () => {
		expect(parseKeyComposite('012')).toEqual({ key: null, mode: null })
		expect(parseKeyComposite('099')).toEqual({ key: null, mode: null })
	})
})

describe('createKeyComposite', () => {
	it('creates valid minor key composites', () => {
		expect(createKeyComposite(0, 0)).toBe('000') // C Minor
		expect(createKeyComposite(9, 0)).toBe('009') // A Minor
		expect(createKeyComposite(11, 0)).toBe('011') // B Minor
	})

	it('creates valid major key composites', () => {
		expect(createKeyComposite(0, 1)).toBe('100') // C Major
		expect(createKeyComposite(9, 1)).toBe('109') // A Major
		expect(createKeyComposite(11, 1)).toBe('111') // B Major
	})

	it('returns "none" for null values', () => {
		expect(createKeyComposite(null, null)).toBe('none')
		expect(createKeyComposite(null, 0)).toBe('none')
		expect(createKeyComposite(0, null)).toBe('none')
	})

	it('returns "none" for out of range values', () => {
		expect(createKeyComposite(-1, 0)).toBe('none')
		expect(createKeyComposite(12, 0)).toBe('none')
		expect(createKeyComposite(0, -1)).toBe('none')
		expect(createKeyComposite(0, 2)).toBe('none')
	})
})

describe('parseBeatportKey', () => {
	it('parses natural notes', () => {
		expect(parseBeatportKey('C Major')).toEqual({ key: 0, mode: 1 })
		expect(parseBeatportKey('C Minor')).toEqual({ key: 0, mode: 0 })
		expect(parseBeatportKey('A Major')).toEqual({ key: 9, mode: 1 })
		expect(parseBeatportKey('A Minor')).toEqual({ key: 9, mode: 0 })
		expect(parseBeatportKey('G Major')).toEqual({ key: 7, mode: 1 })
		expect(parseBeatportKey('G Minor')).toEqual({ key: 7, mode: 0 })
	})

	it('parses sharp notes', () => {
		expect(parseBeatportKey('C# Major')).toEqual({ key: 1, mode: 1 })
		expect(parseBeatportKey('C# Minor')).toEqual({ key: 1, mode: 0 })
		expect(parseBeatportKey('F# Major')).toEqual({ key: 6, mode: 1 })
		expect(parseBeatportKey('F# Minor')).toEqual({ key: 6, mode: 0 })
	})

	it('parses flat notes', () => {
		expect(parseBeatportKey('Db Major')).toEqual({ key: 1, mode: 1 })
		expect(parseBeatportKey('Db Minor')).toEqual({ key: 1, mode: 0 })
		expect(parseBeatportKey('Bb Major')).toEqual({ key: 10, mode: 1 })
		expect(parseBeatportKey('Bb Minor')).toEqual({ key: 10, mode: 0 })
	})

	it('handles case insensitivity for mode', () => {
		// Note: The regex is case-insensitive but the noteMap uses uppercase keys
		// So only the Major/Minor part is case-insensitive
		expect(parseBeatportKey('C major')).toEqual({ key: 0, mode: 1 })
		expect(parseBeatportKey('A MINOR')).toEqual({ key: 9, mode: 0 })
		expect(parseBeatportKey('G MaJoR')).toEqual({ key: 7, mode: 1 })
	})

	it('returns null for empty string', () => {
		expect(parseBeatportKey('')).toEqual({ key: null, mode: null })
	})

	it('returns null for invalid format', () => {
		expect(parseBeatportKey('Cm')).toEqual({ key: null, mode: null })
		expect(parseBeatportKey('C Maj')).toEqual({ key: null, mode: null })
		expect(parseBeatportKey('8B')).toEqual({ key: null, mode: null })
	})
})

describe('scoreHarmony', () => {
	it('returns perfect score for same key', () => {
		const a: KeyAndMode = { key: 0, mode: 0 }
		const b: KeyAndMode = { key: 0, mode: 0 }
		const result = scoreHarmony(a, b)
		expect(result.harmonicAffinity).toBe(1)
		expect(result.keyCombination).toBe(0) // Same key
	})

	it('scores up a fifth (same mode)', () => {
		// C to G (up a fifth = +7 semitones, but on Camelot = +5 on wheel)
		const a: KeyAndMode = { key: 0, mode: 0 } // C Minor
		const b: KeyAndMode = { key: 7, mode: 0 } // G Minor (up 5 on wheel from C)
		const result = scoreHarmony(a, b)
		expect(result.harmonicAffinity).toBeCloseTo(1, 1)
		expect(result.keyCombination).toBe(1) // Up a fifth
	})

	it('scores down a fifth (same mode)', () => {
		// G to C (down a fifth)
		const a: KeyAndMode = { key: 7, mode: 0 } // G Minor
		const b: KeyAndMode = { key: 0, mode: 0 } // C Minor
		const result = scoreHarmony(a, b)
		expect(result.harmonicAffinity).toBeCloseTo(1, 1)
		expect(result.keyCombination).toBe(2) // Down a fifth
	})

	it('scores minor to major (same pitch class)', () => {
		const a: KeyAndMode = { key: 0, mode: 0 } // C Minor
		const b: KeyAndMode = { key: 0, mode: 1 } // C Major
		const result = scoreHarmony(a, b)
		expect(result.harmonicAffinity).toBe(1)
		expect(result.keyCombination).toBe(3) // Minor to Major
	})

	it('scores major to minor (same pitch class)', () => {
		const a: KeyAndMode = { key: 0, mode: 1 } // C Major
		const b: KeyAndMode = { key: 0, mode: 0 } // C Minor
		const result = scoreHarmony(a, b)
		expect(result.harmonicAffinity).toBe(1)
		expect(result.keyCombination).toBe(4) // Major to Minor
	})

	it('returns zero affinity for incompatible keys', () => {
		const a: KeyAndMode = { key: 0, mode: 0 } // C Minor
		const b: KeyAndMode = { key: 6, mode: 0 } // F# Minor (tritone away)
		const result = scoreHarmony(a, b)
		expect(result.harmonicAffinity).toBe(0)
		expect(result.keyCombination).toBe(-1)
	})

	it('handles fractional keys (from pitch adjustment)', () => {
		const a: KeyAndMode = { key: 0.2, mode: 0 }
		const b: KeyAndMode = { key: 0.1, mode: 0 }
		const result = scoreHarmony(a, b)
		expect(result.harmonicAffinity).toBeCloseTo(0.9, 1)
		expect(result.keyCombination).toBe(0) // Still same key
	})

	it('scores same-mode fractional keys across the pitch-class boundary', () => {
		const forward = scoreHarmony({ key: 11.9, mode: 0 }, { key: 0.1, mode: 0 })
		const reverse = scoreHarmony({ key: 0.1, mode: 0 }, { key: 11.9, mode: 0 })

		expect(forward.harmonicAffinity).toBeCloseTo(0.8)
		expect(forward.keyCombination).toBe(0)
		expect(reverse.harmonicAffinity).toBeCloseTo(
			forward.harmonicAffinity ?? Number.NaN
		)
		expect(reverse.keyCombination).toBe(0)
	})

	it('preserves mode-change direction across the pitch-class boundary', () => {
		const minorToMajor = scoreHarmony(
			{ key: 11.9, mode: 0 },
			{ key: 0.1, mode: 1 }
		)
		const majorToMinor = scoreHarmony(
			{ key: 0.1, mode: 1 },
			{ key: 11.9, mode: 0 }
		)

		expect(minorToMajor.harmonicAffinity).toBeCloseTo(0.8)
		expect(minorToMajor.keyCombination).toBe(3)
		expect(majorToMinor.harmonicAffinity).toBeCloseTo(0.8)
		expect(majorToMinor.keyCombination).toBe(4)
	})

	it('scores both fifth directions across the pitch-class boundary', () => {
		const downAFifth = scoreHarmony(
			{ key: 6.9, mode: 0 },
			{ key: 0.1, mode: 0 }
		)
		const upAFifth = scoreHarmony({ key: 5.1, mode: 0 }, { key: 11.9, mode: 0 })

		expect(downAFifth.harmonicAffinity).toBeCloseTo(0.8)
		expect(downAFifth.keyCombination).toBe(2)
		expect(upAFifth.harmonicAffinity).toBeCloseTo(0.8)
		expect(upAFifth.keyCombination).toBe(1)
	})

	it('keeps every returned affinity within the documented range', () => {
		const scores = [
			scoreHarmony({ key: 11.9, mode: 0 }, { key: 0.1, mode: 0 }),
			scoreHarmony({ key: 11.9, mode: 0 }, { key: 0.1, mode: 1 }),
			scoreHarmony({ key: 6.9, mode: 0 }, { key: 0.1, mode: 0 }),
			scoreHarmony({ key: 5.1, mode: 0 }, { key: 11.9, mode: 0 }),
			scoreHarmony({ key: 0, mode: 0 }, { key: 6, mode: 0 })
		]

		for (const { harmonicAffinity } of scores) {
			expect(harmonicAffinity).not.toBeNull()
			expect(harmonicAffinity).toBeGreaterThanOrEqual(0)
			expect(harmonicAffinity).toBeLessThanOrEqual(1)
		}
	})
})

describe('pitchClassMap helpers', () => {
	it('getCamelotMajor returns correct values', () => {
		expect(getCamelotMajor(0)).toBe(8) // C Major = 8B
		expect(getCamelotMajor(9)).toBe(11) // A Major = 11B
	})

	it('getCamelotMinor returns correct values', () => {
		expect(getCamelotMinor(0)).toBe(5) // C Minor = 5A
		expect(getCamelotMinor(9)).toBe(8) // A Minor = 8A
	})

	it('getMajorColour returns hex color', () => {
		const color = getMajorColour(0)
		expect(color).toMatch(/^#[0-9A-F]{6}$/i)
	})

	it('getMinorColour returns hex color', () => {
		const color = getMinorColour(0)
		expect(color).toMatch(/^#[0-9A-F]{6}$/i)
	})

	it('getKeyString formats correctly', () => {
		expect(getKeyString(0, 0)).toBe('C Minor')
		expect(getKeyString(0, 1)).toBe('C Major')
		expect(getKeyString(9, 0)).toBe('A Minor')
	})

	it('getKeyStringShort abbreviates correctly', () => {
		expect(getKeyStringShort(0, 0)).toBe('C Min')
		expect(getKeyStringShort(0, 1)).toBe('C Maj')
	})

	it('getCamelotString formats correctly', () => {
		expect(getCamelotString(0, 0)).toBe('5A') // C Minor
		expect(getCamelotString(0, 1)).toBe('8B') // C Major
	})

	it('getFormattedKeyString supports long and short styles for key notation', () => {
		expect(getFormattedKeyString(0, 0, 'key')).toBe('C Minor')
		expect(getFormattedKeyString(0, 0, 'key', 'long')).toBe('C Minor')
		expect(getFormattedKeyString(0, 0, 'key', 'short')).toBe('C Min')
		expect(getFormattedKeyString(0, 1, 'key')).toBe('C Major')
		expect(getFormattedKeyString(0, 1, 'key', 'short')).toBe('C Maj')
	})

	it('getFormattedKeyString returns camelot output regardless of style', () => {
		expect(getFormattedKeyString(0, 0, 'camelot')).toBe('5A')
		expect(getFormattedKeyString(0, 0, 'camelot', 'short')).toBe('5A')
		expect(getFormattedKeyString(0, 1, 'camelot', 'long')).toBe('8B')
	})

	it('getKeyColour returns minor color for mode 0', () => {
		expect(getKeyColour(0, 0)).toBe(getMinorColour(0))
	})

	it('getKeyColour returns major color for mode 1', () => {
		expect(getKeyColour(0, 1)).toBe(getMajorColour(0))
	})

	it('getSortableNotation returns camelot number', () => {
		// Major keys return camelotMajor directly
		expect(getSortableNotation(0, 1)).toBe(8)
		// Minor keys return camelotMinor + 100
		expect(getSortableNotation(0, 0)).toBe(105)
	})

	it('getKeyOptionsForComposite includes key labels in pitch-class order', () => {
		const options = getKeyOptionsForComposite('key')
		expect(options).toHaveLength(25)
		expect(options[0]).toEqual({
			id: 'none',
			name: 'Not specified'
		})
		expect(options[1]).toEqual({ id: '000', name: 'C Minor' })
		expect(options[12]).toEqual({ id: '011', name: 'B Minor' })
		expect(options[13]).toEqual({ id: '100', name: 'C Major' })
		expect(options[24]).toEqual({ id: '111', name: 'B Major' })
	})

	it('getKeyOptionsForComposite includes camelot labels in camelot order', () => {
		const options = getKeyOptionsForComposite('camelot')
		expect(options).toHaveLength(25)
		expect(options[0]).toEqual({
			id: 'none',
			name: 'Not specified'
		})
		expect(options[1]).toEqual({ id: '008', name: '1A' })
		expect(options[12]).toEqual({ id: '001', name: '12A' })
		expect(options[13]).toEqual({ id: '111', name: '1B' })
		expect(options[24]).toEqual({ id: '104', name: '12B' })
	})

	it('does not mutate pitchClassMap order when building sorted camelot options', () => {
		const pitchClassOrderBefore = pitchClassMap.map(({ pitchClass, tone }) => ({
			pitchClass,
			tone
		}))

		getKeyOptionsForComposite('camelot')
		getKeyOptionsForComposite('camelot')

		const pitchClassOrderAfter = pitchClassMap.map(({ pitchClass, tone }) => ({
			pitchClass,
			tone
		}))
		expect(pitchClassOrderAfter).toEqual(pitchClassOrderBefore)
		expect(getKeyOptionsForComposite('key')[1]).toEqual({
			id: '000',
			name: 'C Minor'
		})
	})
})

describe('key format guards', () => {
	it('isKeyFormat validates known values', () => {
		expect(isKeyFormat('key')).toBe(true)
		expect(isKeyFormat('camelot')).toBe(true)
		expect(isKeyFormat('invalid')).toBe(false)
		expect(isKeyFormat(null)).toBe(false)
		expect(isKeyFormat(undefined)).toBe(false)
	})
})

describe('pitchClassMap data integrity', () => {
	it('has 12 pitch classes', () => {
		expect(pitchClassMap).toHaveLength(12)
	})

	it('has sequential pitch classes 0-11', () => {
		pitchClassMap.forEach((key, index) => {
			expect(key.pitchClass).toBe(index)
		})
	})

	it('has valid camelot values 1-12', () => {
		pitchClassMap.forEach((key) => {
			expect(key.camelotMajor).toBeGreaterThanOrEqual(1)
			expect(key.camelotMajor).toBeLessThanOrEqual(12)
			expect(key.camelotMinor).toBeGreaterThanOrEqual(1)
			expect(key.camelotMinor).toBeLessThanOrEqual(12)
		})
	})

	it('has valid hex colors', () => {
		pitchClassMap.forEach((key) => {
			expect(key.majorColour).toMatch(/^#[0-9A-F]{6}$/i)
			expect(key.minorColour).toMatch(/^#[0-9A-F]{6}$/i)
		})
	})
})
