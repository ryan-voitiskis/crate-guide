import { describe, expect, it } from 'vitest'
import {
	type ImportRecordResult,
	isValidImportResult,
	validateImportResult
} from './discogs-validation'

describe('isValidImportResult', () => {
	it('returns true for valid success result', () => {
		const result: ImportRecordResult = {
			success: true,
			record_id: '123',
			tracks_inserted: 5
		}
		expect(isValidImportResult(result)).toBe(true)
	})

	it('returns true for valid failure result', () => {
		const result: ImportRecordResult = {
			success: false,
			error: 'Import failed'
		}
		expect(isValidImportResult(result)).toBe(true)
	})

	it('returns true for minimal valid result', () => {
		expect(isValidImportResult({ success: true })).toBe(true)
		expect(isValidImportResult({ success: false })).toBe(true)
	})

	it('returns false for null', () => {
		expect(isValidImportResult(null)).toBe(false)
	})

	it('returns false for undefined', () => {
		expect(isValidImportResult(undefined)).toBe(false)
	})

	it('returns false for primitives', () => {
		expect(isValidImportResult('string')).toBe(false)
		expect(isValidImportResult(123)).toBe(false)
		expect(isValidImportResult(true)).toBe(false)
	})

	it('returns false for empty object', () => {
		expect(isValidImportResult({})).toBe(false)
	})

	it('returns false for object without success property', () => {
		expect(isValidImportResult({ record_id: '123' })).toBe(false)
		expect(isValidImportResult({ error: 'failed' })).toBe(false)
	})

	it('returns false for object with non-boolean success', () => {
		expect(isValidImportResult({ success: 'true' })).toBe(false)
		expect(isValidImportResult({ success: 1 })).toBe(false)
		expect(isValidImportResult({ success: null })).toBe(false)
	})

	it('returns false for arrays', () => {
		expect(isValidImportResult([])).toBe(false)
		expect(isValidImportResult([{ success: true }])).toBe(false)
	})
})

describe('validateImportResult', () => {
	it('returns the result for valid success', () => {
		const result: ImportRecordResult = {
			success: true,
			record_id: '123',
			tracks_inserted: 5
		}
		expect(validateImportResult(result)).toEqual(result)
	})

	it('throws for invalid result structure', () => {
		expect(() => validateImportResult(null)).toThrow(
			'Invalid response from import function'
		)
		expect(() => validateImportResult(undefined)).toThrow(
			'Invalid response from import function'
		)
		expect(() => validateImportResult({})).toThrow(
			'Invalid response from import function'
		)
		expect(() => validateImportResult({ record_id: '123' })).toThrow(
			'Invalid response from import function'
		)
	})

	it('throws with error message for failed import', () => {
		const result = { success: false, error: 'Rate limit exceeded' }
		expect(() => validateImportResult(result)).toThrow('Rate limit exceeded')
	})

	it('throws generic message for failed import without error', () => {
		const result = { success: false }
		expect(() => validateImportResult(result)).toThrow('Import failed')
	})

	it('throws for success !== true', () => {
		expect(() => validateImportResult({ success: false })).toThrow()
	})
})
