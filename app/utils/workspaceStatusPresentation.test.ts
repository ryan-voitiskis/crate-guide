import { describe, expect, it } from 'vitest'
import type {
	WorkspaceConnectivity,
	WorkspaceStatusInput,
	WorkspaceStatusLocation
} from './workspaceStatusPresentation'
import { buildWorkspaceStatusPresentation } from './workspaceStatusPresentation'

const matrix = [
	{
		location: 'browser',
		connectivity: 'online',
		locationSignal: { state: 'browser', label: 'This browser' },
		backupSignal: { state: 'not-backed-up', label: 'Not backed up' },
		connectivitySignal: { state: 'online', label: 'Online' },
		behavior: {
			availability: 'usable',
			writes: 'local',
			queuedWrites: false
		}
	},
	{
		location: 'browser',
		connectivity: 'offline',
		locationSignal: { state: 'browser', label: 'This browser' },
		backupSignal: { state: 'not-backed-up', label: 'Not backed up' },
		connectivitySignal: { state: 'offline', label: 'Offline' },
		behavior: {
			availability: 'usable',
			writes: 'local',
			queuedWrites: false
		}
	},
	{
		location: 'cloud',
		connectivity: 'online',
		locationSignal: { state: 'cloud', label: 'Cloud library' },
		backupSignal: {
			state: 'export-recommended',
			label: 'Export recommended'
		},
		connectivitySignal: { state: 'online', label: 'Online' },
		behavior: {
			availability: 'usable',
			writes: 'cloud',
			queuedWrites: false
		}
	},
	{
		location: 'cloud',
		connectivity: 'offline',
		locationSignal: { state: 'cloud', label: 'Cloud library' },
		backupSignal: {
			state: 'export-recommended',
			label: 'Export recommended'
		},
		connectivitySignal: {
			state: 'offline-unavailable',
			label: 'Offline — unavailable'
		},
		behavior: {
			availability: 'unavailable',
			writes: 'unavailable',
			queuedWrites: false
		}
	},
	{
		location: 'demo',
		connectivity: 'online',
		locationSignal: { state: 'demo', label: 'Demo' },
		backupSignal: { state: 'read-only', label: 'Read-only' },
		connectivitySignal: { state: 'online', label: 'Online' },
		behavior: {
			availability: 'usable',
			writes: 'read-only',
			queuedWrites: false
		}
	},
	{
		location: 'demo',
		connectivity: 'offline',
		locationSignal: { state: 'demo', label: 'Demo' },
		backupSignal: { state: 'read-only', label: 'Read-only' },
		connectivitySignal: { state: 'offline', label: 'Offline' },
		behavior: {
			availability: 'usable',
			writes: 'read-only',
			queuedWrites: false
		}
	}
] as const satisfies readonly {
	location: WorkspaceStatusLocation
	connectivity: WorkspaceConnectivity
	locationSignal: { state: string; label: string }
	backupSignal: { state: string; label: string }
	connectivitySignal: { state: string; label: string }
	behavior: {
		availability: string
		writes: string
		queuedWrites: false
	}
}[]

describe('workspace status presentation', () => {
	it.each(matrix)(
		'presents $location + $connectivity as three independent signals',
		({
			backupSignal,
			behavior,
			connectivity,
			connectivitySignal,
			location,
			locationSignal
		}) => {
			expect(
				buildWorkspaceStatusPresentation({ location, connectivity })
			).toEqual({
				status: 'known',
				location: locationSignal,
				backup: backupSignal,
				connectivity: connectivitySignal,
				behavior
			})
		}
	)

	it('covers the complete location and connectivity product', () => {
		const combinations = new Set(
			matrix.map(({ connectivity, location }) => `${location}:${connectivity}`)
		)
		expect(combinations).toEqual(
			new Set([
				'browser:online',
				'browser:offline',
				'cloud:online',
				'cloud:offline',
				'demo:online',
				'demo:offline'
			])
		)
	})

	it('keeps the browser backup warning visible while offline writes remain usable', () => {
		expect(
			buildWorkspaceStatusPresentation({
				location: 'browser',
				connectivity: 'offline'
			})
		).toMatchObject({
			location: { label: 'This browser' },
			backup: { label: 'Not backed up' },
			connectivity: { label: 'Offline' },
			behavior: {
				availability: 'usable',
				writes: 'local',
				queuedWrites: false
			}
		})
	})

	it('marks offline Cloud unavailable and explicitly forbids queued writes', () => {
		expect(
			buildWorkspaceStatusPresentation({
				location: 'cloud',
				connectivity: 'offline'
			})
		).toMatchObject({
			location: { label: 'Cloud library' },
			backup: { label: 'Export recommended' },
			connectivity: { label: 'Offline — unavailable' },
			behavior: {
				availability: 'unavailable',
				writes: 'unavailable',
				queuedWrites: false
			}
		})
	})

	it.each([
		{
			input: { location: 'device', connectivity: 'online' },
			issues: ['invalid-location']
		},
		{
			input: { location: 'browser', connectivity: 'degraded' },
			issues: ['invalid-connectivity']
		},
		{
			input: { location: 'device', connectivity: 'degraded' },
			issues: ['invalid-location', 'invalid-connectivity']
		},
		{
			input: {},
			issues: ['invalid-location', 'invalid-connectivity']
		}
	] as unknown as readonly {
		input: WorkspaceStatusInput
		issues: readonly string[]
	}[])(
		'fails closed without a presentation for invalid or future state %#',
		({ input, issues }) => {
			expect(buildWorkspaceStatusPresentation(input)).toEqual({
				status: 'invalid',
				presentation: null,
				issues,
				behavior: {
					availability: 'unavailable',
					writes: 'unavailable',
					queuedWrites: false
				}
			})
		}
	)

	it.each([
		null,
		undefined,
		'browser:online',
		[]
	] as unknown as WorkspaceStatusInput[])(
		'fails closed for a non-object input %#',
		(input) => {
			expect(buildWorkspaceStatusPresentation(input)).toEqual({
				status: 'invalid',
				presentation: null,
				issues: ['invalid-input'],
				behavior: {
					availability: 'unavailable',
					writes: 'unavailable',
					queuedWrites: false
				}
			})
		}
	)
})
