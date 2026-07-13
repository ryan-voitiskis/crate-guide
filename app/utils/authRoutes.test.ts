import { describe, expect, it } from 'vitest'
import { isPublicRoute, isSignedOutOnlyRoute } from './authRoutes'

describe('auth route policy', () => {
	it.each([
		'/login',
		'/signup',
		'/reset-password',
		'/auth/check-inbox',
		'/auth/confirm',
		'/auth/finalising',
		'/demo',
		'/demo/',
		'/demo/records'
	])('classifies %s as public', (path) => {
		expect(isPublicRoute(path)).toBe(true)
	})

	it.each([
		'/',
		'/settings',
		'/auth/discogs/capture-verifier',
		'/auth/future-callback',
		'/auth/confirm/extra',
		'/login/',
		'/signup-extra',
		'/demo-private',
		'/demonstration'
	])('classifies %s as protected', (path) => {
		expect(isPublicRoute(path)).toBe(false)
	})

	it.each(['/login', '/signup', '/reset-password'])(
		'classifies %s as signed-out only',
		(path) => {
			expect(isSignedOutOnlyRoute(path)).toBe(true)
		}
	)

	it.each(['/auth/check-inbox', '/auth/confirm', '/auth/finalising', '/demo'])(
		'does not classify %s as signed-out only',
		(path) => {
			expect(isSignedOutOnlyRoute(path)).toBe(false)
		}
	)
})
