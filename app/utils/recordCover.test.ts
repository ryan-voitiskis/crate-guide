import { describe, expect, it } from 'vitest'
import {
	RECORD_COVER_SOURCE_MAX_BYTES,
	calculateSquareCrop,
	validateRecordCoverDimensions,
	validateRecordCoverFile
} from './recordCover'

describe('record cover validation', () => {
	it('accepts supported images within the source limit', () => {
		expect(
			validateRecordCoverFile({ type: 'image/jpeg', size: 2_000_000 })
		).toBeNull()
		expect(
			validateRecordCoverFile({ type: 'image/png', size: 2_000_000 })
		).toBeNull()
		expect(
			validateRecordCoverFile({ type: 'image/webp', size: 2_000_000 })
		).toBeNull()
	})

	it('rejects unsafe or unsupported formats', () => {
		expect(validateRecordCoverFile({ type: 'image/svg+xml', size: 10 })).toBe(
			'Choose a JPG, PNG or WebP image.'
		)
		expect(validateRecordCoverFile({ type: 'image/gif', size: 10 })).toBe(
			'Choose a JPG, PNG or WebP image.'
		)
	})

	it('rejects source files above 10 MB', () => {
		expect(
			validateRecordCoverFile({
				type: 'image/jpeg',
				size: RECORD_COVER_SOURCE_MAX_BYTES + 1
			})
		).toBe('Cover images must be 10 MB or smaller.')
	})

	it('enforces decoded dimension limits', () => {
		expect(validateRecordCoverDimensions(1200, 1200)).toBeNull()
		expect(validateRecordCoverDimensions(299, 1200)).toContain('at least')
		expect(validateRecordCoverDimensions(5000, 5000)).toBe(
			'Cover images must be 20 megapixels or smaller.'
		)
	})
})

describe('calculateSquareCrop', () => {
	it('moves a landscape crop horizontally', () => {
		expect(
			calculateSquareCrop(1600, 1200, { positionX: 25, positionY: 90 })
		).toEqual({ sourceX: 100, sourceY: 0, sourceSize: 1200 })
	})

	it('moves a portrait crop vertically', () => {
		expect(
			calculateSquareCrop(1200, 1600, { positionX: 90, positionY: 75 })
		).toEqual({ sourceX: 0, sourceY: 300, sourceSize: 1200 })
	})

	it('clamps crop positions to the image bounds', () => {
		expect(
			calculateSquareCrop(2000, 1000, { positionX: 120, positionY: -20 })
		).toEqual({ sourceX: 1000, sourceY: 0, sourceSize: 1000 })
	})
})
