import {
	TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION,
	TRACK_ENRICHMENT_DRAFT_LOCAL_SNAPSHOT_VERSION,
	TRACK_ENRICHMENT_DRAFT_MATCHER_POLICY_VERSION,
	TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION,
	type TrackEnrichmentDraft,
	type TrackEnrichmentDraftSourceKind
} from '../../app/types/trackEnrichmentDraft'

export const DRAFT_DATASET_FINGERPRINT = 'a'.repeat(64)
export const DRAFT_OBSERVATION_FINGERPRINT = 'b'.repeat(64)
export const DRAFT_SOURCE_FINGERPRINT = 'source-fingerprint-a'

export function createTrackEnrichmentDraftFixture(
	sourceKind: TrackEnrichmentDraftSourceKind = 'rekordboxXml'
): TrackEnrichmentDraft {
	const isLocal = sourceKind === 'localAudio'
	const proposal = {
		bpm: {
			value: 124,
			source: isLocal ? ('embeddedTags' as const) : ('rekordboxXml' as const)
		},
		keyMode: {
			key: 7,
			mode: 0 as const,
			source: isLocal ? ('essentiaBrowser' as const) : ('rekordboxXml' as const)
		}
	}
	return {
		schemaVersion: TRACK_ENRICHMENT_DRAFT_SCHEMA_VERSION,
		id: 'draft-a',
		workspace: {
			workspaceId: 'workspace-a',
			repositoryId: 'repository-a',
			repositoryRevision: 7
		},
		draftRevision: 3,
		createdAt: '2026-07-22T01:00:00.000Z',
		updatedAt: '2026-07-22T01:05:00.000Z',
		versions: {
			matcherPolicyVersion: TRACK_ENRICHMENT_DRAFT_MATCHER_POLICY_VERSION,
			parserPolicyVersion: isLocal ? null : 'rekordbox-xml-stream-v1',
			sanitizedSourceSnapshotVersion: isLocal
				? TRACK_ENRICHMENT_DRAFT_LOCAL_SNAPSHOT_VERSION
				: 'rekordbox-xml-sanitized-v1'
		},
		source: {
			kind: sourceKind,
			label: isLocal ? 'Selected music folder' : 'collection.xml',
			datasetFingerprint: DRAFT_DATASET_FINGERPRINT,
			requiresReconnect: isLocal
		},
		observations: [
			{
				sourceSnapshotId: isLocal
					? 'local-file:Artist/Release/Track.mp3'
					: 'track-id:42',
				sourceFingerprint: DRAFT_SOURCE_FINGERPRINT,
				observationFingerprint: DRAFT_OBSERVATION_FINGERPRINT,
				ordinal: 0,
				name: 'Track',
				artist: 'Artist',
				album: 'Release',
				genre: 'House',
				locationHint: 'Artist/Release/Track.mp3',
				totalTimeSeconds: 360,
				proposal,
				warnings: [],
				evidence: isLocal
					? {
							kind: 'localAudio',
							fileIdentity: {
								version: TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION,
								relativePath: 'Artist/Release/Track.mp3',
								size: 123_456,
								lastModified: 1_753_146_000_000
							},
							metadataVersion: 'native-tags-v3',
							analyzerVersion: 'essentia-browser-v1',
							configurationVersion: 'local-audio-analysis-v1',
							bpmConfidence: 0.94,
							keyStrength: 0.8,
							requiresManualReview: false
						}
					: { kind: 'rekordboxXml', trackId: '42' }
			}
		],
		decisions: [
			{
				kind: 'fill-empty-fields',
				intentVersion: 1,
				sourceBinding: {
					sourceFingerprint: DRAFT_SOURCE_FINGERPRINT,
					observationFingerprint: DRAFT_OBSERVATION_FINGERPRINT
				},
				targetBinding: { trackId: 'track-a' },
				proposalBinding: proposal,
				preconditionBinding: {
					expectedTargetUpdatedAt: null,
					bpmMustBeNull: true,
					keyModeMustBeNull: true
				},
				staged: true,
				reviewedAt: '2026-07-22T01:04:00.000Z'
			}
		],
		partialOutcomes: [
			{
				intentKind: 'fill-empty-fields',
				sourceFingerprint: DRAFT_SOURCE_FINGERPRINT,
				targetTrackId: 'track-a',
				status: 'succeeded',
				applied: { bpm: true, keyMode: true },
				attemptedAt: '2026-07-22T01:05:00.000Z',
				failureCode: null
			}
		],
		ui: {
			filter: 'staged',
			sortKey: 'confidence',
			sortDirection: 'desc',
			density: 'compact',
			anchorSourceFingerprint: DRAFT_SOURCE_FINGERPRINT
		}
	}
}
