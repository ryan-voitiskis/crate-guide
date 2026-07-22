import type { BrowserWorkspaceIdentity } from '~/repositories/library/browser/browserLibraryTypes'
import type { LibraryLocation } from '~/repositories/library/contracts'
import { sha256TrackEnrichmentDraftValue } from '~/utils/trackEnrichmentDraftFingerprint'
import { CLOUD_ACCOUNT_WORKSPACE_PREFIX } from '../../shared/constants/theme'

const CLOUD_DRAFT_WORKSPACE_ALIAS_PREFIX = 'device-draft:cloud:v1:'
const CLOUD_DRAFT_WORKSPACE_HASH_DOMAIN =
	'crate-guide/track-enrichment-draft/cloud-workspace-routing/v1\u0000'

/**
 * Keeps a cloud account identifier out of device-local draft keys and payloads.
 *
 * This is a stable pseudonymous routing alias, not encryption or anonymization.
 * Browser-library workspace identifiers are already device-local and remain
 * byte-identical so accountless drafts keep their normal workspace binding.
 */
export async function createTrackEnrichmentDraftWorkspaceIdentity(
	identity: BrowserWorkspaceIdentity,
	location: LibraryLocation
): Promise<BrowserWorkspaceIdentity> {
	if (
		location !== 'cloud' ||
		!identity.workspaceId.startsWith(CLOUD_ACCOUNT_WORKSPACE_PREFIX)
	) {
		return identity
	}

	const digest = await sha256TrackEnrichmentDraftValue(
		`${CLOUD_DRAFT_WORKSPACE_HASH_DOMAIN}${identity.workspaceId}\u0000${identity.repositoryId}`
	)
	return {
		workspaceId: `${CLOUD_DRAFT_WORKSPACE_ALIAS_PREFIX}${digest}`,
		repositoryId: identity.repositoryId
	}
}
