import { describe, expect, it } from 'vitest'
import {
	CAMELOT_WHEEL_SEGMENTS,
	DEFAULT_WHEEL_SELECTION,
	describeWheelSegmentCentre,
	describeWheelSegmentPath,
	getWheelNeighbours,
	getWheelSegment,
	getWheelSegmentLabel,
	isWheelComposite,
	moveSelection
} from './camelotWheel'
import { createKeyComposite, getCamelotString } from './keyFunctions'

function compositeForCamelot(label: string): string {
	const segment = CAMELOT_WHEEL_SEGMENTS.find(
		(candidate) =>
			getCamelotString(candidate.pitchClass, candidate.mode) === label
	)
	if (!segment) throw new Error(`No segment for ${label}`)
	return segment.composite
}

const geometry = { cx: 100, cy: 100, innerRadius: 40, outerRadius: 90 }

describe('CAMELOT_WHEEL_SEGMENTS', () => {
	it('contains every key exactly once', () => {
		expect(CAMELOT_WHEEL_SEGMENTS).toHaveLength(24)
		const composites = new Set(
			CAMELOT_WHEEL_SEGMENTS.map((segment) => segment.composite)
		)
		expect(composites.size).toBe(24)
		for (let key = 0; key < 12; key++) {
			expect(composites.has(createKeyComposite(key, 0))).toBe(true)
			expect(composites.has(createKeyComposite(key, 1))).toBe(true)
		}
	})

	it('places major on the outer ring and minor on the inner ring', () => {
		for (const segment of CAMELOT_WHEEL_SEGMENTS) {
			expect(segment.ring).toBe(segment.mode === 1 ? 'outer' : 'inner')
		}
	})

	it('uses each Camelot number once per ring with number 1 at twelve o’clock', () => {
		for (const ring of ['inner', 'outer'] as const) {
			const numbers = CAMELOT_WHEEL_SEGMENTS.filter(
				(segment) => segment.ring === ring
			)
				.map((segment) => segment.camelotNumber)
				.sort((a, b) => a - b)
			expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
		}
		const one = CAMELOT_WHEEL_SEGMENTS.find(
			(segment) => segment.camelotNumber === 1 && segment.ring === 'outer'
		)!
		expect(one.startAngle).toBe(-15)
		expect(one.endAngle).toBe(15)
	})

	it('gives adjacent numbers adjacent arcs', () => {
		const outer = CAMELOT_WHEEL_SEGMENTS.filter(
			(segment) => segment.ring === 'outer'
		).sort((a, b) => a.camelotNumber - b.camelotNumber)
		for (let index = 1; index < outer.length; index++) {
			expect(outer[index]!.startAngle).toBe(outer[index - 1]!.endAngle)
		}
		expect(outer.at(-1)!.endAngle - outer[0]!.startAngle).toBe(360)
	})

	it('matches the Camelot notation already used in key functions', () => {
		const eightA = CAMELOT_WHEEL_SEGMENTS.find(
			(segment) => segment.camelotNumber === 8 && segment.mode === 0
		)!
		expect(getCamelotString(eightA.pitchClass, eightA.mode)).toBe('8A')
		expect(eightA.pitchClass).toBe(9)
		const eightB = CAMELOT_WHEEL_SEGMENTS.find(
			(segment) => segment.camelotNumber === 8 && segment.mode === 1
		)!
		expect(eightB.pitchClass).toBe(0)
	})
})

describe('getWheelSegment and labels', () => {
	it('finds segments by composite and rejects unknown values', () => {
		const segment = getWheelSegment(compositeForCamelot('8A'))
		expect(segment?.camelotNumber).toBe(8)
		expect(getWheelSegment(null)).toBeNull()
		expect(getWheelSegment('none')).toBeNull()
		expect(getWheelSegment('999')).toBeNull()
	})

	it('labels segments in the requested notation', () => {
		const segment = getWheelSegment(compositeForCamelot('8B'))!
		expect(getWheelSegmentLabel(segment, 'camelot')).toBe('8B')
		expect(getWheelSegmentLabel(segment, 'key')).toBe('C Maj')
	})

	it('validates composites', () => {
		expect(isWheelComposite(compositeForCamelot('1A'))).toBe(true)
		expect(isWheelComposite('none')).toBe(false)
		expect(isWheelComposite('abc')).toBe(false)
	})
})

describe('getWheelNeighbours', () => {
	it('returns the same number on the other ring and both adjacent numbers', () => {
		expect(getWheelNeighbours(compositeForCamelot('8A'))).toEqual([
			compositeForCamelot('8B'),
			compositeForCamelot('9A'),
			compositeForCamelot('7A')
		])
	})

	it('wraps around twelve and one', () => {
		expect(getWheelNeighbours(compositeForCamelot('12B'))).toEqual([
			compositeForCamelot('12A'),
			compositeForCamelot('1B'),
			compositeForCamelot('11B')
		])
		expect(getWheelNeighbours(compositeForCamelot('1A'))).toContain(
			compositeForCamelot('12A')
		)
	})

	it('returns nothing for an empty selection', () => {
		expect(getWheelNeighbours(null)).toEqual([])
		expect(getWheelNeighbours('none')).toEqual([])
	})
})

describe('moveSelection', () => {
	it('starts at the default key when nothing is selected', () => {
		expect(moveSelection(null, 'right')).toBe(DEFAULT_WHEEL_SELECTION)
		expect(moveSelection('none', 'up')).toBe(DEFAULT_WHEEL_SELECTION)
		expect(DEFAULT_WHEEL_SELECTION).toBe(compositeForCamelot('8A'))
	})

	it('steps around the ring with wrap-around', () => {
		expect(moveSelection(compositeForCamelot('8A'), 'right')).toBe(
			compositeForCamelot('9A')
		)
		expect(moveSelection(compositeForCamelot('8A'), 'left')).toBe(
			compositeForCamelot('7A')
		)
		expect(moveSelection(compositeForCamelot('12A'), 'right')).toBe(
			compositeForCamelot('1A')
		)
		expect(moveSelection(compositeForCamelot('1B'), 'left')).toBe(
			compositeForCamelot('12B')
		)
	})

	it('switches rings at the same number', () => {
		expect(moveSelection(compositeForCamelot('8A'), 'up')).toBe(
			compositeForCamelot('8B')
		)
		expect(moveSelection(compositeForCamelot('8B'), 'down')).toBe(
			compositeForCamelot('8A')
		)
	})
})

describe('segment geometry', () => {
	it('describes a closed annular path with two arcs', () => {
		const path = describeWheelSegmentPath(
			{ startAngle: -15, endAngle: 15 },
			geometry
		)
		expect(path.startsWith('M ')).toBe(true)
		expect(path.endsWith(' Z')).toBe(true)
		expect(path.match(/ A /g)).toHaveLength(2)
	})

	it('places twelve o’clock straight above the centre', () => {
		const centre = describeWheelSegmentCentre(
			{ startAngle: -15, endAngle: 15 },
			geometry
		)
		expect(centre.x).toBeCloseTo(100)
		expect(centre.y).toBeCloseTo(35)
	})

	it('places three o’clock to the right of the centre', () => {
		const centre = describeWheelSegmentCentre(
			{ startAngle: 75, endAngle: 105 },
			geometry
		)
		expect(centre.x).toBeCloseTo(165)
		expect(centre.y).toBeCloseTo(100)
	})
})
