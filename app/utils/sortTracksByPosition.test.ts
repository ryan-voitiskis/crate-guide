import {
	createMockTrack,
	resetTrackIdCounter
} from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it } from 'vitest'
import { sortTracksByPosition } from './sortTracksByPosition'

describe('sortTracksByPosition', () => {
	beforeEach(() => {
		resetTrackIdCounter()
	})

	it('sorts tracks in alphanumeric order', () => {
		const tracks = [
			createMockTrack({ position: 'B1' }),
			createMockTrack({ position: 'A2' }),
			createMockTrack({ position: 'A1' }),
			createMockTrack({ position: 'B2' })
		]

		const result = sortTracksByPosition(tracks)

		expect(result.map((t) => t.position)).toEqual(['A1', 'A2', 'B1', 'B2'])
	})

	it('handles numeric sorting correctly (A1 before A10)', () => {
		const tracks = [
			createMockTrack({ position: 'A10' }),
			createMockTrack({ position: 'A2' }),
			createMockTrack({ position: 'A1' })
		]

		const result = sortTracksByPosition(tracks)

		expect(result.map((t) => t.position)).toEqual(['A1', 'A2', 'A10'])
	})

	it('handles case-insensitive sorting', () => {
		const tracks = [
			createMockTrack({ position: 'b1' }),
			createMockTrack({ position: 'A1' }),
			createMockTrack({ position: 'B2' }),
			createMockTrack({ position: 'a2' })
		]

		const result = sortTracksByPosition(tracks)

		// All A's come before B's regardless of case
		expect(result[0]?.position?.toUpperCase()).toBe('A1')
		expect(result[1]?.position?.toUpperCase()).toBe('A2')
		expect(result[2]?.position?.toUpperCase()).toBe('B1')
		expect(result[3]?.position?.toUpperCase()).toBe('B2')
	})

	it('puts null positions at the end', () => {
		const tracks = [
			createMockTrack({ position: null }),
			createMockTrack({ position: 'A1' }),
			createMockTrack({ position: null }),
			createMockTrack({ position: 'B1' })
		]

		const result = sortTracksByPosition(tracks)

		expect(result[0]?.position).toBe('A1')
		expect(result[1]?.position).toBe('B1')
		expect(result[2]?.position).toBeNull()
		expect(result[3]?.position).toBeNull()
	})

	it('handles all null positions', () => {
		const tracks = [
			createMockTrack({ position: null }),
			createMockTrack({ position: null }),
			createMockTrack({ position: null })
		]

		const result = sortTracksByPosition(tracks)

		expect(result).toHaveLength(3)
		expect(result.every((t) => t.position === null)).toBe(true)
	})

	it('handles empty array', () => {
		const result = sortTracksByPosition([])

		expect(result).toEqual([])
	})

	it('handles single track', () => {
		const tracks = [createMockTrack({ position: 'A1' })]

		const result = sortTracksByPosition(tracks)

		expect(result).toHaveLength(1)
		expect(result[0]?.position).toBe('A1')
	})

	it('preserves relative order for same positions', () => {
		const track1 = createMockTrack({ id: 'first', position: 'A1' })
		const track2 = createMockTrack({ id: 'second', position: 'A1' })

		const tracks = [track1, track2]
		const result = sortTracksByPosition(tracks)

		// Sort is stable - first should remain first
		expect(result[0]?.id).toBe('first')
		expect(result[1]?.id).toBe('second')
	})

	it('handles mixed letter positions (A, B, C, D sides)', () => {
		const tracks = [
			createMockTrack({ position: 'D1' }),
			createMockTrack({ position: 'C1' }),
			createMockTrack({ position: 'B1' }),
			createMockTrack({ position: 'A1' })
		]

		const result = sortTracksByPosition(tracks)

		expect(result.map((t) => t.position)).toEqual(['A1', 'B1', 'C1', 'D1'])
	})
})
