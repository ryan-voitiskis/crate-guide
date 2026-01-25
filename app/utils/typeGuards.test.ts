import { describe, expect, it } from 'vitest'

import { isError } from './typeGuards'

describe('isError', () => {
	it('returns true for Error instance', () => {
		expect(isError(new Error('test'))).toBe(true)
	})

	it('returns true for Error subclasses', () => {
		expect(isError(new TypeError('type error'))).toBe(true)
		expect(isError(new RangeError('range error'))).toBe(true)
		expect(isError(new SyntaxError('syntax error'))).toBe(true)
	})

	it('returns true for custom Error subclasses', () => {
		class CustomError extends Error {
			constructor(message: string) {
				super(message)
				this.name = 'CustomError'
			}
		}
		expect(isError(new CustomError('custom'))).toBe(true)
	})

	it('returns false for null', () => {
		expect(isError(null)).toBe(false)
	})

	it('returns false for undefined', () => {
		expect(isError(undefined)).toBe(false)
	})

	it('returns false for strings', () => {
		expect(isError('error message')).toBe(false)
		expect(isError('')).toBe(false)
	})

	it('returns false for numbers', () => {
		expect(isError(0)).toBe(false)
		expect(isError(42)).toBe(false)
		expect(isError(NaN)).toBe(false)
	})

	it('returns false for plain objects', () => {
		expect(isError({})).toBe(false)
		expect(isError({ message: 'error' })).toBe(false)
		expect(isError({ name: 'Error', message: 'test' })).toBe(false)
	})

	it('returns false for arrays', () => {
		expect(isError([])).toBe(false)
		expect(isError([new Error('test')])).toBe(false)
	})

	it('returns false for functions', () => {
		expect(isError(() => {})).toBe(false)
		expect(isError(function () {})).toBe(false)
	})

	it('returns false for booleans', () => {
		expect(isError(true)).toBe(false)
		expect(isError(false)).toBe(false)
	})
})
