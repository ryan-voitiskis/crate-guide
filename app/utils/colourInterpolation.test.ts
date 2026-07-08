import { describe, expect, it } from 'vitest'
import {
	clampNumber,
	getPitchDeltaColour,
	getPitchDeltaHighContrastColour,
	getSuggestionScoreColour,
	hexToRgba,
	interpolateHexColour,
	pitchDeltaColourStops,
	pitchDeltaHighContrastColourStops
} from './colourInterpolation'

describe('clampNumber', () => {
	it('keeps values inside the requested range', () => {
		expect(clampNumber(5, 0, 10)).toBe(5)
		expect(clampNumber(-1, 0, 10)).toBe(0)
		expect(clampNumber(11, 0, 10)).toBe(10)
	})
})

describe('interpolateHexColour', () => {
	it('interpolates between two hex colours', () => {
		expect(interpolateHexColour('#000000', '#ffffff', 0.5)).toBe('#808080')
	})

	it('clamps interpolation amount', () => {
		expect(interpolateHexColour('#000000', '#ffffff', -1)).toBe('#000000')
		expect(interpolateHexColour('#000000', '#ffffff', 2)).toBe('#ffffff')
	})
})

describe('hexToRgba', () => {
	it('converts a hex colour to rgba syntax', () => {
		expect(hexToRgba('#a7f3d0', 0.2)).toBe('rgba(167,243,208,0.2)')
	})
})

describe('getPitchDeltaColour', () => {
	it('returns semantic pitch colours at the ends and centre', () => {
		expect(getPitchDeltaColour(-1)).toBe(pitchDeltaColourStops.slower)
		expect(getPitchDeltaColour(0)).toBe(pitchDeltaColourStops.neutral)
		expect(getPitchDeltaColour(1)).toBe(pitchDeltaColourStops.faster)
	})
})

describe('getPitchDeltaHighContrastColour', () => {
	it('returns darker semantic pitch colours at the ends and centre', () => {
		expect(getPitchDeltaHighContrastColour(-1)).toBe(
			pitchDeltaHighContrastColourStops.slower
		)
		expect(getPitchDeltaHighContrastColour(0)).toBe(
			pitchDeltaHighContrastColourStops.neutral
		)
		expect(getPitchDeltaHighContrastColour(1)).toBe(
			pitchDeltaHighContrastColourStops.faster
		)
	})
})

describe('getSuggestionScoreColour', () => {
	it('moves from muted through amber to mint', () => {
		expect(getSuggestionScoreColour(0)).toBe('#a1a1aa')
		expect(getSuggestionScoreColour(0.5)).toBe('#fcd34d')
		expect(getSuggestionScoreColour(1)).toBe('#a7f3d0')
	})
})
