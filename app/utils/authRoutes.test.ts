import { describe, expect, it } from 'vitest'
import {
	buildCheckInboxPath,
	buildLoginRedirectPath,
	buildSignupRedirectPath,
	isPublicRoute,
	isSignedOutOnlyRoute,
	sanitizeAuthReturnPath
} from './authRoutes'

describe('auth route policy', () => {
	it.each([
		'/login',
		'/signup',
		'/reset-password',
		'/update-password',
		'/auth/check-inbox',
		'/auth/confirm',
		'/auth/finalising',
		'/privacy',
		'/terms',
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

	it.each([
		'/update-password',
		'/auth/check-inbox',
		'/auth/confirm',
		'/auth/finalising',
		'/privacy',
		'/terms',
		'/demo'
	])('does not classify %s as signed-out only', (path) => {
		expect(isSignedOutOnlyRoute(path)).toBe(false)
	})
})

describe('auth return paths', () => {
	it.each([
		'/',
		'/records',
		'/privacy',
		'/terms',
		'/records?crate=house&sort=year#release-1',
		'/demo/records?crate=house'
	])('preserves safe internal path %s', (path) => {
		expect(sanitizeAuthReturnPath(path)).toBe(path)
	})

	it.each([
		undefined,
		null,
		42,
		true,
		[],
		['/records'],
		{},
		'',
		'records',
		'https://evil.example/records',
		'javascript:alert(1)',
		'//evil.example/records',
		'///evil.example/records',
		'\\\\evil.example\\records',
		'/\\evil.example/records',
		'/%5Cevil.example/records',
		'/records\nsettings',
		'/records%0Asettings',
		'/records?filter=%',
		'/login',
		'/login?redirect=/records',
		'/login#retry',
		'/signup?redirect=/records',
		'/reset-password#form',
		'/update-password?redirect=/records',
		'/auth/check-inbox?source=signup',
		'/auth/confirm#callback',
		'/auth/finalising?redirect=/records'
	])('falls back to home for unsafe return value %#', (value) => {
		expect(sanitizeAuthReturnPath(value)).toBe('/')
	})

	it('builds an encoded login destination from the shared policy', () => {
		expect(buildLoginRedirectPath('/records?crate=house#release-1')).toBe(
			'/login?redirect=%2Frecords%3Fcrate%3Dhouse%23release-1'
		)
		expect(buildLoginRedirectPath('https://evil.example')).toBe(
			'/login?redirect=%2F'
		)
	})

	it('builds encoded signup and confirmation destinations', () => {
		expect(buildSignupRedirectPath('/tracks?genre=House')).toBe(
			'/signup?redirect=%2Ftracks%3Fgenre%3DHouse'
		)
		expect(buildCheckInboxPath('/records#release-1')).toBe(
			'/auth/check-inbox?redirect=%2Frecords%23release-1'
		)
	})
})
