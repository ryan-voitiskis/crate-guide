import type { KeyFormat } from '~~/shared/types/supabase'
import {
	createKeyComposite,
	getCamelotString,
	getFormattedKeyString,
	getKeyColour,
	getKeyString,
	parseKeyComposite,
	pitchClassMap
} from './keyFunctions'

export type WheelRing = 'inner' | 'outer'

export type WheelSegment = {
	composite: string
	pitchClass: number
	/** 0 is minor (inner ring, Camelot "A"), 1 is major (outer ring, "B"). */
	mode: 0 | 1
	camelotNumber: number
	ring: WheelRing
	/** Degrees clockwise from twelve o'clock. */
	startAngle: number
	endAngle: number
	colour: string
}

export type WheelDirection = 'left' | 'right' | 'up' | 'down'

export const CAMELOT_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1)
const SEGMENT_ARC = 30

function pitchClassForCamelot(camelotNumber: number, mode: 0 | 1): number {
	const entry = pitchClassMap.find((candidate) =>
		mode === 1
			? candidate.camelotMajor === camelotNumber
			: candidate.camelotMinor === camelotNumber
	)
	if (!entry) throw new Error(`Unknown Camelot number: ${camelotNumber}`)
	return entry.pitchClass
}

function createSegment(camelotNumber: number, mode: 0 | 1): WheelSegment {
	const pitchClass = pitchClassForCamelot(camelotNumber, mode)
	const centre = (camelotNumber - 1) * SEGMENT_ARC
	return {
		composite: createKeyComposite(pitchClass, mode),
		pitchClass,
		mode,
		camelotNumber,
		ring: mode === 1 ? 'outer' : 'inner',
		startAngle: centre - SEGMENT_ARC / 2,
		endAngle: centre + SEGMENT_ARC / 2,
		colour: getKeyColour(pitchClass, mode)
	}
}

/**
 * All 24 keys laid out as a physical Camelot wheel: number 1 at twelve
 * o'clock, ascending clockwise, major on the outer ring and minor inside.
 */
export const CAMELOT_WHEEL_SEGMENTS: readonly WheelSegment[] = [
	...CAMELOT_NUMBERS.map((number) => createSegment(number, 1)),
	...CAMELOT_NUMBERS.map((number) => createSegment(number, 0))
]

const segmentsByComposite = new Map(
	CAMELOT_WHEEL_SEGMENTS.map((segment) => [segment.composite, segment])
)

export function getWheelSegment(composite: string | null): WheelSegment | null {
	if (!composite) return null
	return segmentsByComposite.get(composite) ?? null
}

export function getWheelSegmentLabel(
	segment: WheelSegment,
	keyFormat: KeyFormat
): string {
	return getFormattedKeyString(
		segment.pitchClass,
		segment.mode,
		keyFormat,
		'short'
	)
}

/**
 * The short text drawn inside a wheel segment. Standard notation uses a
 * compact form (C♯m, F♯) so adjacent labels fit at the smallest wheel size;
 * the full name is exposed through `getWheelSegmentAccessibleLabel`.
 */
export function getWheelSegmentVisualLabel(
	segment: WheelSegment,
	keyFormat: KeyFormat
): string {
	if (keyFormat === 'camelot')
		return getCamelotString(segment.pitchClass, segment.mode)
	const tone =
		pitchClassMap
			.find((entry) => entry.pitchClass === segment.pitchClass)
			?.tone.slice(0, 2)
			.trim() ?? ''
	return segment.mode === 0 ? `${tone}m` : tone
}

/** Full accessible name, leading with the user's preferred notation. */
export function getWheelSegmentAccessibleLabel(
	segment: WheelSegment,
	keyFormat: KeyFormat
): string {
	const camelot = getCamelotString(segment.pitchClass, segment.mode)
	const standard = getKeyString(segment.pitchClass, segment.mode)
	return keyFormat === 'camelot'
		? `${camelot}, ${standard}`
		: `${standard}, ${camelot}`
}

function wrapCamelot(number: number): number {
	return ((((number - 1) % 12) + 12) % 12) + 1
}

function compositeFor(camelotNumber: number, mode: 0 | 1): string {
	return createKeyComposite(pitchClassForCamelot(camelotNumber, mode), mode)
}

/**
 * The three harmonically compatible neighbours of a key on the wheel: the
 * same number on the other ring and the adjacent numbers on the same ring.
 */
export function getWheelNeighbours(composite: string | null): string[] {
	const segment = getWheelSegment(composite)
	if (!segment) return []
	const otherMode = segment.mode === 1 ? 0 : 1
	return [
		compositeFor(segment.camelotNumber, otherMode),
		compositeFor(wrapCamelot(segment.camelotNumber + 1), segment.mode),
		compositeFor(wrapCamelot(segment.camelotNumber - 1), segment.mode)
	]
}

/** The key a keyboard user lands on when nothing is selected yet. */
export const DEFAULT_WHEEL_SELECTION = compositeFor(8, 0)

/**
 * Moves a wheel selection with the arrow keys. Left and right step around the
 * current ring with wrap-around; up and down switch rings at the same number.
 */
export function moveSelection(
	composite: string | null,
	direction: WheelDirection
): string {
	const segment = getWheelSegment(composite)
	if (!segment) return DEFAULT_WHEEL_SELECTION

	switch (direction) {
		case 'right':
			return compositeFor(wrapCamelot(segment.camelotNumber + 1), segment.mode)
		case 'left':
			return compositeFor(wrapCamelot(segment.camelotNumber - 1), segment.mode)
		case 'up':
		case 'down':
			return compositeFor(segment.camelotNumber, segment.mode === 1 ? 0 : 1)
	}
}

export function isWheelComposite(composite: string): boolean {
	const parsed = parseKeyComposite(composite)
	return parsed.key !== null && parsed.mode !== null
}

export type WheelGeometry = {
	cx: number
	cy: number
	innerRadius: number
	outerRadius: number
}

function polarToCartesian(
	cx: number,
	cy: number,
	radius: number,
	angleDegrees: number
): { x: number; y: number } {
	const radians = (angleDegrees * Math.PI) / 180
	return {
		x: cx + radius * Math.sin(radians),
		y: cy - radius * Math.cos(radians)
	}
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000
}

/**
 * SVG path data for one annular segment between two radii, drawn clockwise
 * from `startAngle` to `endAngle` measured from twelve o'clock.
 */
export function describeWheelSegmentPath(
	segment: Pick<WheelSegment, 'startAngle' | 'endAngle'>,
	geometry: WheelGeometry
): string {
	const { cx, cy, innerRadius, outerRadius } = geometry
	const outerStart = polarToCartesian(cx, cy, outerRadius, segment.startAngle)
	const outerEnd = polarToCartesian(cx, cy, outerRadius, segment.endAngle)
	const innerEnd = polarToCartesian(cx, cy, innerRadius, segment.endAngle)
	const innerStart = polarToCartesian(cx, cy, innerRadius, segment.startAngle)

	return [
		`M ${round(outerStart.x)} ${round(outerStart.y)}`,
		`A ${outerRadius} ${outerRadius} 0 0 1 ${round(outerEnd.x)} ${round(outerEnd.y)}`,
		`L ${round(innerEnd.x)} ${round(innerEnd.y)}`,
		`A ${innerRadius} ${innerRadius} 0 0 0 ${round(innerStart.x)} ${round(innerStart.y)}`,
		'Z'
	].join(' ')
}

/** Centre point of a segment, for placing its label. */
export function describeWheelSegmentCentre(
	segment: Pick<WheelSegment, 'startAngle' | 'endAngle'>,
	geometry: WheelGeometry
): { x: number; y: number } {
	const midAngle = (segment.startAngle + segment.endAngle) / 2
	const midRadius = (geometry.innerRadius + geometry.outerRadius) / 2
	const point = polarToCartesian(geometry.cx, geometry.cy, midRadius, midAngle)
	return { x: round(point.x), y: round(point.y) }
}
