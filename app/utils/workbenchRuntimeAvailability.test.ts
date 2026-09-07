import { describe, expect, it } from 'vitest'
import { requiresCloudWorkbenchRuntime } from './workbenchRuntimeAvailability'

describe('workbench runtime availability', () => {
	it.each([
		'/',
		'/records',
		'/tracks',
		'/crates',
		'/settings',
		'/enrichment',
		'/tracks/',
		'/TRACKS/',
		'/Records/'
	])('loads the Cloud runtime for %s', (path) => {
		expect(requiresCloudWorkbenchRuntime(path)).toBe(true)
	})

	it.each([
		'/demo',
		'/demo/records',
		'/login',
		'/privacy',
		'/PRIVACY/',
		'/Demo/records/',
		'/login/',
		'/local',
		'/local/records'
	])('does not load the Cloud runtime for %s', (path) => {
		expect(requiresCloudWorkbenchRuntime(path)).toBe(false)
	})
})
