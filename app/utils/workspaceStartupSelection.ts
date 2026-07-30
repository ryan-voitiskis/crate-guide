declare const deviceAccountFingerprintBrand: unique symbol

/**
 * Opaque, device-salted account fingerprint produced outside this decision
 * kernel. Raw account IDs are intentionally not accepted by this contract.
 */
export type DeviceAccountFingerprint = string & {
	readonly [deviceAccountFingerprintBrand]: true
}

export type WorkspaceStartupAuthentication =
	| Readonly<{ state: 'signed-out' }>
	| Readonly<{
			state: 'authenticated'
			deviceAccountFingerprint: DeviceAccountFingerprint
	  }>

export type WorkspaceStartupMarker =
	| Readonly<{ state: 'missing' }>
	| Readonly<{
			state: 'corrupt'
			lastKnownLocation: 'local' | 'cloud' | 'unknown'
	  }>
	| Readonly<{
			state: 'valid'
			location: 'local'
			workspaceId: string
	  }>
	| Readonly<{
			state: 'valid'
			location: 'cloud'
			deviceAccountFingerprint: DeviceAccountFingerprint
	  }>

export type WorkspaceStartupLocalManifest =
	| Readonly<{
			state: 'intact'
			workspaceId: string
			name: string
	  }>
	| Readonly<{
			state: 'corrupt'
			workspaceId: string
	  }>

export type WorkspaceStartupInput = Readonly<{
	authentication: WorkspaceStartupAuthentication
	localManifests: readonly WorkspaceStartupLocalManifest[]
	marker: WorkspaceStartupMarker
	prelaunchCloudMigration: 'not-eligible' | 'eligible-once'
}>

export type WorkspaceStartupLocalChoice = Readonly<{
	workspaceId: string
	name: string
}>

export type WorkspaceStartupDecision =
	| Readonly<{
			action: 'open-local-workspace'
			source: 'durable-marker'
			workspace: WorkspaceStartupLocalChoice
	  }>
	| Readonly<{
			action: 'open-cloud-workspace'
			source: 'durable-marker' | 'prelaunch-migration'
			consumePrelaunchCloudMigration: boolean
	  }>
	| Readonly<{
			action: 'show-workspace-chooser'
			reason:
				| 'cloud-marker-signed-out'
				| 'cloud-marker-account-mismatch'
				| 'corrupt-cloud-marker'
				| 'corrupt-unknown-marker'
			cloudMaterial: 'scrub'
			automaticLocalOpen: 'forbidden'
			localWorkspaces: readonly WorkspaceStartupLocalChoice[]
	  }>
	| Readonly<{
			action: 'show-local-recovery'
			reason:
				| 'missing-local-marker'
				| 'corrupt-local-marker'
				| 'missing-selected-local-workspace'
				| 'corrupt-selected-local-workspace'
				| 'ambiguous-selected-local-workspace'
			intactWorkspaces: readonly WorkspaceStartupLocalChoice[]
			unavailableWorkspaceIds: readonly string[]
			unresolvedWorkspaceId: string | null
			replacementCreation: 'forbidden'
	  }>
	| Readonly<{
			action: 'show-first-run-chooser'
			reason: 'no-marker-workspace-or-migration'
	  }>

type LocalCatalog = Readonly<{
	entriesById: ReadonlyMap<string, readonly WorkspaceStartupLocalManifest[]>
	intactWorkspaces: readonly WorkspaceStartupLocalChoice[]
	unavailableWorkspaceIds: readonly string[]
}>

function isNamedIntactManifest(
	manifest: WorkspaceStartupLocalManifest
): manifest is Extract<WorkspaceStartupLocalManifest, { state: 'intact' }> {
	return manifest.state === 'intact' && manifest.name.trim().length > 0
}

function inspectLocalCatalog(
	manifests: readonly WorkspaceStartupLocalManifest[]
): LocalCatalog {
	const mutableEntriesById = new Map<string, WorkspaceStartupLocalManifest[]>()
	for (const manifest of manifests) {
		const existing = mutableEntriesById.get(manifest.workspaceId) ?? []
		existing.push(manifest)
		mutableEntriesById.set(manifest.workspaceId, existing)
	}

	const intactWorkspaces: WorkspaceStartupLocalChoice[] = []
	const unavailableWorkspaceIds: string[] = []
	for (const [workspaceId, entries] of mutableEntriesById) {
		const onlyEntry = entries.length === 1 ? entries[0] : null
		if (onlyEntry && isNamedIntactManifest(onlyEntry)) {
			intactWorkspaces.push({ name: onlyEntry.name, workspaceId })
		} else {
			unavailableWorkspaceIds.push(workspaceId)
		}
	}

	return {
		entriesById: mutableEntriesById,
		intactWorkspaces,
		unavailableWorkspaceIds
	}
}

function showLocalRecovery(
	catalog: LocalCatalog,
	reason: Extract<
		WorkspaceStartupDecision,
		{ action: 'show-local-recovery' }
	>['reason'],
	unresolvedWorkspaceId: string | null
): WorkspaceStartupDecision {
	return {
		action: 'show-local-recovery',
		intactWorkspaces: catalog.intactWorkspaces,
		reason,
		replacementCreation: 'forbidden',
		unavailableWorkspaceIds: catalog.unavailableWorkspaceIds,
		unresolvedWorkspaceId
	}
}

function showWorkspaceChooser(
	catalog: LocalCatalog,
	reason: Extract<
		WorkspaceStartupDecision,
		{ action: 'show-workspace-chooser' }
	>['reason']
): WorkspaceStartupDecision {
	return {
		action: 'show-workspace-chooser',
		automaticLocalOpen: 'forbidden',
		cloudMaterial: 'scrub',
		localWorkspaces: catalog.intactWorkspaces,
		reason
	}
}

function decideValidLocalMarker(
	marker: Extract<
		WorkspaceStartupMarker,
		{ state: 'valid'; location: 'local' }
	>,
	catalog: LocalCatalog
): WorkspaceStartupDecision {
	const selectedEntries = catalog.entriesById.get(marker.workspaceId) ?? []
	if (selectedEntries.length === 0) {
		return showLocalRecovery(
			catalog,
			'missing-selected-local-workspace',
			marker.workspaceId
		)
	}
	if (selectedEntries.length > 1) {
		return showLocalRecovery(
			catalog,
			'ambiguous-selected-local-workspace',
			marker.workspaceId
		)
	}
	const selected = selectedEntries[0]
	if (!selected || !isNamedIntactManifest(selected)) {
		return showLocalRecovery(
			catalog,
			'corrupt-selected-local-workspace',
			marker.workspaceId
		)
	}
	return {
		action: 'open-local-workspace',
		source: 'durable-marker',
		workspace: { name: selected.name, workspaceId: selected.workspaceId }
	}
}

function fingerprintsMatch(
	left: DeviceAccountFingerprint,
	right: DeviceAccountFingerprint
): boolean {
	return left === right
}

/**
 * Decide the startup location without reading storage, mutating auth state,
 * routing, opening a repository, or publishing UI. Callers must perform any
 * requested scrub/migration consumption only after handling this result.
 */
export function decideWorkspaceStartupSelection(
	input: WorkspaceStartupInput
): WorkspaceStartupDecision {
	const catalog = inspectLocalCatalog(input.localManifests)
	const marker = input.marker

	if (marker.state === 'valid' && marker.location === 'local') {
		return decideValidLocalMarker(marker, catalog)
	}

	if (marker.state === 'valid' && marker.location === 'cloud') {
		if (input.authentication.state === 'signed-out') {
			return showWorkspaceChooser(catalog, 'cloud-marker-signed-out')
		}
		if (
			fingerprintsMatch(
				marker.deviceAccountFingerprint,
				input.authentication.deviceAccountFingerprint
			)
		) {
			return {
				action: 'open-cloud-workspace',
				consumePrelaunchCloudMigration: false,
				source: 'durable-marker'
			}
		}
		return showWorkspaceChooser(catalog, 'cloud-marker-account-mismatch')
	}

	if (marker.state === 'corrupt') {
		if (marker.lastKnownLocation === 'local') {
			return showLocalRecovery(catalog, 'corrupt-local-marker', null)
		}
		return showWorkspaceChooser(
			catalog,
			marker.lastKnownLocation === 'cloud'
				? 'corrupt-cloud-marker'
				: 'corrupt-unknown-marker'
		)
	}

	if (input.localManifests.length > 0) {
		return showLocalRecovery(catalog, 'missing-local-marker', null)
	}

	if (
		input.prelaunchCloudMigration === 'eligible-once' &&
		input.authentication.state === 'authenticated'
	) {
		return {
			action: 'open-cloud-workspace',
			consumePrelaunchCloudMigration: true,
			source: 'prelaunch-migration'
		}
	}

	return {
		action: 'show-first-run-chooser',
		reason: 'no-marker-workspace-or-migration'
	}
}
