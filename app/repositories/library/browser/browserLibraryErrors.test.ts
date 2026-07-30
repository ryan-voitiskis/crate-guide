import { describe, expect, it } from 'vitest'
import {
	BrowserStorageCodecError,
	BrowserStorageError,
	classifyBrowserStorageError,
	storageHealthFromError
} from './browserLibraryErrors'

describe('browser library storage errors', () => {
	it.each([
		['QuotaExceededError', 'quota'],
		['SecurityError', 'unavailable'],
		['NotAllowedError', 'unavailable'],
		['VersionError', 'corrupt'],
		['ConstraintError', 'corrupt'],
		['DataError', 'corrupt'],
		['InvalidStateError', 'unavailable'],
		['ReadOnlyError', 'unavailable']
	] as const)('classifies %s as %s', (name, code) => {
		const classified = classifyBrowserStorageError(
			new DOMException('test', name)
		)

		expect(classified).toBeInstanceOf(BrowserStorageError)
		expect(classified.code).toBe(code)
	})

	it('preserves typed storage failures and codec paths', () => {
		const codecError = new BrowserStorageCodecError('/records/0/user_id')

		expect(classifyBrowserStorageError(codecError)).toBe(codecError)
		expect(codecError.code).toBe('corrupt')
		expect(codecError.path).toBe('/records/0/user_id')
	})

	it('turns unknown failures into timestamped health without reflecting data', () => {
		const health = storageHealthFromError(
			new Error('private underlying detail'),
			'2026-07-23T00:00:00.000Z'
		)

		expect(health).toEqual({
			code: 'unknown',
			message: 'The Local library storage operation failed.',
			checkedAt: '2026-07-23T00:00:00.000Z'
		})
	})
})
