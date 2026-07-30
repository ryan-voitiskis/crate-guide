import { describe, expect, it } from 'vitest'
import type {
	DeviceAccountFingerprint,
	WorkspaceStartupAuthentication,
	WorkspaceStartupInput,
	WorkspaceStartupLocalManifest,
	WorkspaceStartupMarker
} from './workspaceStartupSelection'
import { decideWorkspaceStartupSelection } from './workspaceStartupSelection'

const fingerprintA = 'device-salted-fingerprint-a' as DeviceAccountFingerprint
const fingerprintB = 'device-salted-fingerprint-b' as DeviceAccountFingerprint

const signedOut = { state: 'signed-out' } as const
const authenticatedA = {
	state: 'authenticated',
	deviceAccountFingerprint: fingerprintA
} as const
const authenticatedB = {
	state: 'authenticated',
	deviceAccountFingerprint: fingerprintB
} as const

const localA = {
	state: 'intact',
	workspaceId: 'local-a',
	name: 'Local library'
} as const
const localB = {
	state: 'intact',
	workspaceId: 'local-b',
	name: 'Second library'
} as const
const corruptA = {
	state: 'corrupt',
	workspaceId: 'local-a'
} as const
const corruptB = {
	state: 'corrupt',
	workspaceId: 'local-b'
} as const

function decide(overrides: Partial<WorkspaceStartupInput> = {}) {
	return decideWorkspaceStartupSelection({
		authentication: signedOut,
		localManifests: [],
		marker: { state: 'missing' },
		prelaunchCloudMigration: 'not-eligible',
		...overrides
	})
}

describe('workspace startup selection matrix', () => {
	it('opens only the intact named workspace selected by a valid Local marker', () => {
		expect(
			decide({
				authentication: authenticatedB,
				localManifests: [localB, localA],
				marker: {
					state: 'valid',
					location: 'local',
					workspaceId: 'local-a'
				},
				prelaunchCloudMigration: 'eligible-once'
			})
		).toEqual({
			action: 'open-local-workspace',
			source: 'durable-marker',
			workspace: { name: 'Local library', workspaceId: 'local-a' }
		})
	})

	it.each([
		{
			label: 'is missing',
			manifests: [localB],
			reason: 'missing-selected-local-workspace'
		},
		{
			label: 'is corrupt',
			manifests: [corruptA, localB],
			reason: 'corrupt-selected-local-workspace'
		},
		{
			label: 'is ambiguous',
			manifests: [localA, { ...localA }, localB],
			reason: 'ambiguous-selected-local-workspace'
		}
	] as const)(
		'never recreates or guesses when the selected Local manifest $label',
		({ manifests, reason }) => {
			const result = decide({
				localManifests: manifests,
				marker: {
					state: 'valid',
					location: 'local',
					workspaceId: 'local-a'
				}
			})
			expect(result).toMatchObject({
				action: 'show-local-recovery',
				intactWorkspaces: [{ name: 'Second library', workspaceId: 'local-b' }],
				reason,
				replacementCreation: 'forbidden',
				unresolvedWorkspaceId: 'local-a'
			})
		}
	)

	it('requires explicit recovery when a marker is missing around intact Local manifests', () => {
		expect(
			decide({
				localManifests: [localA, localB],
				prelaunchCloudMigration: 'eligible-once',
				authentication: authenticatedA
			})
		).toEqual({
			action: 'show-local-recovery',
			intactWorkspaces: [
				{ name: 'Local library', workspaceId: 'local-a' },
				{ name: 'Second library', workspaceId: 'local-b' }
			],
			reason: 'missing-local-marker',
			replacementCreation: 'forbidden',
			unavailableWorkspaceIds: [],
			unresolvedWorkspaceId: null
		})
	})

	it('keeps a corrupt Local marker in explicit recovery even with no intact candidate', () => {
		expect(
			decide({
				localManifests: [corruptA],
				marker: { state: 'corrupt', lastKnownLocation: 'local' }
			})
		).toEqual({
			action: 'show-local-recovery',
			intactWorkspaces: [],
			reason: 'corrupt-local-marker',
			replacementCreation: 'forbidden',
			unavailableWorkspaceIds: ['local-a'],
			unresolvedWorkspaceId: null
		})
	})

	it('opens a valid Cloud marker only for the same authenticated fingerprint', () => {
		expect(
			decide({
				authentication: authenticatedA,
				localManifests: [localA],
				marker: {
					state: 'valid',
					location: 'cloud',
					deviceAccountFingerprint: fingerprintA
				}
			})
		).toEqual({
			action: 'open-cloud-workspace',
			consumePrelaunchCloudMigration: false,
			source: 'durable-marker'
		})
	})

	it.each([
		{
			authentication: signedOut,
			reason: 'cloud-marker-signed-out'
		},
		{
			authentication: authenticatedB,
			reason: 'cloud-marker-account-mismatch'
		}
	] as const)(
		'scrubs Cloud material and shows a chooser for $reason',
		({ authentication, reason }) => {
			expect(
				decide({
					authentication,
					localManifests: [localA],
					marker: {
						state: 'valid',
						location: 'cloud',
						deviceAccountFingerprint: fingerprintA
					}
				})
			).toEqual({
				action: 'show-workspace-chooser',
				automaticLocalOpen: 'forbidden',
				cloudMaterial: 'scrub',
				localWorkspaces: [{ name: 'Local library', workspaceId: 'local-a' }],
				reason
			})
		}
	)

	it('preserves the prelaunch Cloud default once only without marker or workspace evidence', () => {
		expect(
			decide({
				authentication: authenticatedA,
				prelaunchCloudMigration: 'eligible-once'
			})
		).toEqual({
			action: 'open-cloud-workspace',
			consumePrelaunchCloudMigration: true,
			source: 'prelaunch-migration'
		})
	})

	it.each([
		{
			authentication: signedOut,
			prelaunchCloudMigration: 'eligible-once'
		},
		{
			authentication: authenticatedA,
			prelaunchCloudMigration: 'not-eligible'
		}
	] as const)(
		'uses the first-run chooser when no durable selection is usable',
		({ authentication, prelaunchCloudMigration }) => {
			expect(decide({ authentication, prelaunchCloudMigration })).toEqual({
				action: 'show-first-run-chooser',
				reason: 'no-marker-workspace-or-migration'
			})
		}
	)
})

const markerCases: readonly WorkspaceStartupMarker[] = [
	{ state: 'missing' },
	{ state: 'corrupt', lastKnownLocation: 'local' },
	{ state: 'corrupt', lastKnownLocation: 'cloud' },
	{ state: 'corrupt', lastKnownLocation: 'unknown' },
	{ state: 'valid', location: 'local', workspaceId: 'local-a' },
	{
		state: 'valid',
		location: 'cloud',
		deviceAccountFingerprint: fingerprintA
	}
]

const authenticationCases: readonly WorkspaceStartupAuthentication[] = [
	signedOut,
	authenticatedA,
	authenticatedB
]

const catalogCases: readonly (readonly WorkspaceStartupLocalManifest[])[] = [
	[],
	[localA],
	[localB],
	[localA, localB],
	[corruptA],
	[corruptB],
	[localA, { ...localA }],
	[{ ...localA, name: ' ' }],
	[localA, corruptB],
	[corruptA, localB]
]

const migrationCases = ['not-eligible', 'eligible-once'] as const

function matchingNamedLocalCount(
	marker: WorkspaceStartupMarker,
	manifests: readonly WorkspaceStartupLocalManifest[]
): number {
	if (marker.state !== 'valid' || marker.location !== 'local') return 0
	return manifests.filter(
		(manifest) =>
			manifest.workspaceId === marker.workspaceId &&
			manifest.state === 'intact' &&
			manifest.name.trim().length > 0
	).length
}

function expectedAction(input: WorkspaceStartupInput) {
	const marker = input.marker
	if (marker.state === 'valid' && marker.location === 'local') {
		const matchingEntries = input.localManifests.filter(
			(manifest) => manifest.workspaceId === marker.workspaceId
		)
		return matchingEntries.length === 1 &&
			matchingNamedLocalCount(marker, input.localManifests) === 1
			? 'open-local-workspace'
			: 'show-local-recovery'
	}
	if (marker.state === 'valid' && marker.location === 'cloud') {
		return input.authentication.state === 'authenticated' &&
			input.authentication.deviceAccountFingerprint ===
				marker.deviceAccountFingerprint
			? 'open-cloud-workspace'
			: 'show-workspace-chooser'
	}
	if (marker.state === 'corrupt') {
		return marker.lastKnownLocation === 'local'
			? 'show-local-recovery'
			: 'show-workspace-chooser'
	}
	if (input.localManifests.length > 0) return 'show-local-recovery'
	return input.authentication.state === 'authenticated' &&
		input.prelaunchCloudMigration === 'eligible-once'
		? 'open-cloud-workspace'
		: 'show-first-run-chooser'
}

describe('workspace startup selection exhaustive permutations', () => {
	it('matches every marker, auth, Local catalog, and migration permutation', () => {
		let permutationCount = 0
		for (const marker of markerCases) {
			for (const authentication of authenticationCases) {
				for (const localManifests of catalogCases) {
					for (const prelaunchCloudMigration of migrationCases) {
						permutationCount += 1
						const input: WorkspaceStartupInput = {
							authentication,
							localManifests,
							marker,
							prelaunchCloudMigration
						}
						const result = decideWorkspaceStartupSelection(input)
						const context = JSON.stringify({
							authentication,
							localManifests,
							marker,
							prelaunchCloudMigration
						})
						expect(result.action, context).toBe(expectedAction(input))

						if (result.action === 'show-workspace-chooser') {
							expect(result.cloudMaterial, context).toBe('scrub')
							expect(result.automaticLocalOpen, context).toBe('forbidden')
						}
						if (result.action === 'show-local-recovery') {
							expect(result.replacementCreation, context).toBe('forbidden')
						}
						if (result.action === 'open-local-workspace') {
							expect(
								matchingNamedLocalCount(marker, localManifests),
								context
							).toBe(1)
						}
						if (
							result.action === 'open-cloud-workspace' &&
							result.source === 'prelaunch-migration'
						) {
							expect(result.consumePrelaunchCloudMigration, context).toBe(true)
							expect(marker.state, context).toBe('missing')
							expect(localManifests, context).toHaveLength(0)
						}
					}
				}
			}
		}
		expect(permutationCount).toBe(360)
	})
})
