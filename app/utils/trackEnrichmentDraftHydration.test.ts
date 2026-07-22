import { describe, expect, it } from 'vitest'
import type { LocalAudioTrackSource } from '~/types/localAudio'
import type {
	TrackEnrichmentDraft,
	TrackEnrichmentDraftObservation,
	TrackEnrichmentDraftPartialOutcome
} from '~/types/trackEnrichmentDraft'
import { TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION } from '~/types/trackEnrichmentDraft'
import type { Track } from '~~/shared/types/supabase'
import type { RekordboxXmlTrack } from './rekordboxXml'
import { buildTrackEnrichmentRows } from './trackEnrichment'
import { getCurrentTrackEnrichmentDraftVersions } from './trackEnrichmentDraftCodec'
import { createTrackEnrichmentCurrentEvidenceFingerprint } from './trackEnrichmentDraftEvidencePrecondition'
import { createRekordboxDraftObservationSet } from './trackEnrichmentDraftFingerprint'
import {
	type TrackEnrichmentDraftHydrationError,
	hydrateTrackEnrichmentDraft
} from './trackEnrichmentDraftHydration'
import { projectTrackEnrichmentDraft } from './trackEnrichmentDraftProjection'
import type { EnrichmentSource } from './trackEnrichmentTypes'

const REVIEWED_AT = '2026-07-23T01:00:00.000Z'
const OUTCOME_ATTEMPTED_AT = '2026-07-23T01:30:00.000Z'

function appliedAudioFeatures(
	overrides: Partial<NonNullable<Track['audio_features']>['applied']> = {}
): NonNullable<Track['audio_features']> {
	return {
		version: 1,
		updatedAt: OUTCOME_ATTEMPTED_AT,
		applied: {
			bpm: { source: 'rekordboxXml', appliedAt: OUTCOME_ATTEMPTED_AT },
			keyMode: { source: 'rekordboxXml', appliedAt: OUTCOME_ATTEMPTED_AT },
			...overrides
		},
		match: {
			confidence: 'high',
			score: 100,
			reasons: [],
			warnings: []
		},
		sources: {}
	}
}

function track(overrides: Partial<Track> = {}): Track {
	return {
		id: 'track-1',
		record_id: 'record-1',
		title: 'Track One',
		artists: [{ name: 'Artist', role: null }],
		extraartists: [],
		position: 'A1',
		duration: 240_000,
		bpm: null,
		rpm: null,
		key: null,
		mode: null,
		genres: [],
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true,
		beatport_data: null,
		audio_features: null,
		created_at: null,
		updated_at: '2026-07-23T00:00:00.000Z',
		...overrides
	}
}

function xmlSource(
	overrides: Partial<RekordboxXmlTrack> = {}
): RekordboxXmlTrack {
	return {
		sourceType: 'rekordboxXml',
		index: 0,
		trackId: 'xml-1',
		name: 'Track One',
		artist: 'Artist',
		album: null,
		genre: 'House',
		kind: 'WAV File',
		totalTimeSeconds: 240,
		year: 2026,
		averageBpm: 128,
		dateAdded: '2026-07-23',
		bitRate: 1_411,
		sampleRate: 44_100,
		comments: 'private parser comment',
		playCount: 1,
		rating: 0,
		location: '/Users/alice/Music/Track One.wav',
		locationHint: 'Artist/Release/Track One.wav',
		remixer: null,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		label: null,
		warnings: [],
		...overrides
	}
}

function localSource(
	overrides: Partial<LocalAudioTrackSource> = {}
): LocalAudioTrackSource {
	return {
		sourceType: 'localAudio',
		index: 0,
		name: 'Track One',
		artist: 'Artist',
		album: null,
		genre: 'House',
		locationHint: 'Artist/Release/Track One.flac',
		totalTimeSeconds: 240,
		averageBpm: 128,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		warnings: [],
		fileName: 'Track One.flac',
		fileSize: 4_096,
		lastModified: 1_753_233_600_000,
		tags: {
			title: 'Track One',
			artist: 'Artist',
			album: null,
			genres: ['House'],
			durationSeconds: 240,
			bpm: 128,
			key: '8A'
		},
		analysis: null,
		bpmSource: 'embeddedTags',
		keyModeSource: 'embeddedTags',
		requiresManualReview: false,
		...overrides
	}
}

async function createDraft(
	source: EnrichmentSource = xmlSource(),
	target: Track = track()
): Promise<TrackEnrichmentDraft> {
	const [row] = buildTrackEnrichmentRows({
		sources: [source],
		tracks: [target],
		records: []
	})
	if (!row) throw new Error('Expected a review row')
	return projectTrackEnrichmentDraft({
		id: 'draft-1',
		workspace: {
			workspaceId: 'workspace-1',
			repositoryId: 'repository-1',
			repositoryRevision: 7
		},
		draftRevision: 3,
		createdAt: '2026-07-23T00:30:00.000Z',
		updatedAt: REVIEWED_AT,
		sourceLabel:
			source.sourceType === 'rekordboxXml'
				? '/Users/alice/Music/rekordbox.xml'
				: 'Selected music folder',
		rows: [{ row, staged: true, reviewedAt: REVIEWED_AT }],
		ui: {
			filter: 'staged',
			sortKey: 'confidence',
			sortDirection: 'desc',
			density: 'compact',
			anchorSourceIndex: 0
		}
	})
}

async function createEvidenceOnlyDraft(
	source: EnrichmentSource = xmlSource(),
	target: Track = track()
): Promise<TrackEnrichmentDraft> {
	const draft = await createDraft(source, target)
	const observation = draft.observations[0]
	if (!observation) throw new Error('Expected an observation')
	const currentEvidenceFingerprint =
		await createTrackEnrichmentCurrentEvidenceFingerprint(target.audio_features)
	if (!currentEvidenceFingerprint) {
		throw new Error('Expected valid current Evidence')
	}
	draft.decisions = [
		{
			kind: 'evidence-only',
			intentVersion: 1,
			sourceBinding: {
				sourceSnapshotId: observation.sourceSnapshotId,
				sourceFingerprint: observation.sourceFingerprint,
				observationFingerprint: observation.observationFingerprint
			},
			targetBinding: { trackId: target.id },
			preconditionBinding: {
				expectedTargetUpdatedAt: target.updated_at,
				currentEvidenceFingerprint: {
					version: TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION,
					digest: currentEvidenceFingerprint
				}
			},
			staged: true,
			reviewedAt: REVIEWED_AT
		}
	]
	draft.partialOutcomes = []
	return draft
}

function setOutcome(
	draft: TrackEnrichmentDraft,
	overrides: Partial<TrackEnrichmentDraftPartialOutcome> = {}
) {
	const decision = draft.decisions[0]
	if (decision?.kind !== 'fill-empty-fields') {
		throw new Error('Expected a fill-empty-fields decision')
	}
	draft.partialOutcomes = [
		{
			intentKind: 'fill-empty-fields',
			sourceFingerprint: decision.sourceBinding.sourceFingerprint,
			targetTrackId: decision.targetBinding.trackId,
			status: 'succeeded',
			applied: { bpm: true, keyMode: true },
			attemptedAt: OUTCOME_ATTEMPTED_AT,
			failureCode: null,
			...overrides
		}
	]
}

describe('hydrateTrackEnrichmentDraft', () => {
	it('rematches current XML rows, restores only exact staging, and disables matcher defaults', async () => {
		const draft = await createDraft()

		const result = await hydrateTrackEnrichmentDraft({
			draft,
			tracks: [track()],
			records: []
		})

		expect(result.status).toBe('ready')
		if (result.status !== 'ready') throw new Error('Expected a ready draft')
		expect(result.compatibility).toMatchObject({
			action: 'rematch',
			canRetainStaging: true
		})
		expect(result.rows).toHaveLength(1)
		expect(result.rows[0]).toMatchObject({
			id: 'rekordboxXml-0-track-1',
			defaultStaged: false
		})
		expect(result.stagedRowIds).toEqual(['rekordboxXml-0-track-1'])
		expect(result.doneRowIds).toEqual([])
		expect(result.changedRowIds).toEqual([])
		expect(result.dropped).toEqual([])
		expect(result.outcomes).toEqual([])
		expect(result.decisions).toEqual([
			{
				sourceFingerprint: draft.observations[0]!.sourceFingerprint,
				targetTrackId: 'track-1',
				rowId: 'rekordboxXml-0-track-1',
				classification: 'retained',
				staged: true,
				outcomeDisposition: null
			}
		])
		expect(result.summary).toEqual({
			total: 1,
			retained: 1,
			unchangedUnstaged: 0,
			changed: 0,
			dropped: 0
		})
		expect(result.ui).toEqual(draft.ui)
		expect(result.ui).not.toBe(draft.ui)
	})

	it('hydrates an exact evidence-only review as unsupported and never mutates top-level values or Evidence', async () => {
		const target = track({
			bpm: 126,
			key: 8,
			mode: 1,
			audio_features: appliedAudioFeatures({ bpm: null, keyMode: null })
		})
		const before = structuredClone(target)
		const draft = await createEvidenceOnlyDraft(xmlSource(), target)

		const result = await hydrateTrackEnrichmentDraft({
			draft,
			tracks: [target],
			records: []
		})

		expect(result.status).toBe('ready')
		if (result.status !== 'ready') throw new Error('Expected a ready draft')
		expect(result.stagedRowIds).toEqual([])
		expect(result.doneRowIds).toEqual([])
		expect(result.outcomes).toEqual([])
		expect(result.decisions).toEqual([
			{
				sourceFingerprint: draft.observations[0]!.sourceFingerprint,
				targetTrackId: target.id,
				rowId: 'rekordboxXml-0-track-1',
				classification: 'unsupported-intent',
				staged: false,
				outcomeDisposition: null
			}
		])
		expect(result.changedRowIds).toEqual(['rekordboxXml-0-track-1'])
		expect(result.summary).toEqual({
			total: 1,
			retained: 0,
			unchangedUnstaged: 0,
			changed: 1,
			dropped: 0
		})
		expect(target).toEqual(before)
		expect(target.bpm).toBe(126)
		expect(target.key).toBe(8)
		expect(target.mode).toBe(1)
	})

	it.each([
		['future decision kind', 'future-evidence', 9],
		['future evidence-only version', 'evidence-only', 2]
	] as const)(
		'normalizes a %s to inert unknown provenance before hydration',
		async (_name, kind, intentVersion) => {
			const target = track({ bpm: 126, key: 8, mode: 1 })
			const before = structuredClone(target)
			const draft = await createDraft(xmlSource(), target)
			const binding = draft.decisions[0]!.sourceBinding
			;(draft.decisions as unknown[]) = [
				{
					kind,
					intentVersion,
					sourceBinding: binding,
					targetBinding: { trackId: target.id },
					proposalBinding: {
						bpm: { value: 140, source: 'rekordboxXml' },
						keyMode: null
					},
					staged: true,
					reviewedAt: REVIEWED_AT
				}
			]
			draft.partialOutcomes = []

			const result = await hydrateTrackEnrichmentDraft({
				draft,
				tracks: [target],
				records: []
			})

			expect(result.status).toBe('ready')
			if (result.status !== 'ready') throw new Error('Expected a ready draft')
			expect(result.stagedRowIds).toEqual([])
			expect(result.doneRowIds).toEqual([])
			expect(result.outcomes).toEqual([])
			expect(result.decisions[0]).toMatchObject({
				targetTrackId: null,
				classification: 'unknown-intent',
				staged: false
			})
			expect(target).toEqual(before)
		}
	)

	it.each([
		{
			name: 'a deleted target',
			currentTracks: [] as Track[],
			classification: 'target-deleted',
			rowId: 'source-rekordboxXml-0'
		},
		{
			name: 'a rematch to a different target identity',
			currentTracks: [
				track({ title: 'Different Track' }),
				track({ id: 'track-2' })
			],
			classification: 'no-longer-matching',
			rowId: 'rekordboxXml-0-track-2'
		},
		{
			name: 'a target update',
			currentTracks: [track({ updated_at: '2026-07-23T02:00:00.000Z' })],
			classification: 'target-changed',
			rowId: 'rekordboxXml-0-track-1'
		}
	] as const)(
		'keeps evidence-only inert and classifies $name',
		async ({ currentTracks, classification, rowId }) => {
			const draft = await createEvidenceOnlyDraft()

			const result = await hydrateTrackEnrichmentDraft({
				draft,
				tracks: currentTracks,
				records: []
			})

			expect(result.status).toBe('ready')
			if (result.status !== 'ready') throw new Error('Expected a ready draft')
			expect(result.stagedRowIds).toEqual([])
			expect(result.decisions[0]).toMatchObject({
				classification,
				rowId,
				staged: false
			})
		}
	)

	it('unstages evidence-only on an exact Evidence digest change even when target updatedAt is unchanged', async () => {
		const target = track({
			audio_features: appliedAudioFeatures({ bpm: null, keyMode: null })
		})
		const draft = await createEvidenceOnlyDraft(xmlSource(), target)
		const changedTarget = structuredClone(target)
		if (!changedTarget.audio_features) throw new Error('Expected Evidence')
		changedTarget.audio_features.match.score = 99

		const result = await hydrateTrackEnrichmentDraft({
			draft,
			tracks: [changedTarget],
			records: []
		})

		expect(result.status).toBe('ready')
		if (result.status !== 'ready') throw new Error('Expected a ready draft')
		expect(result.stagedRowIds).toEqual([])
		expect(result.decisions[0]).toMatchObject({
			classification: 'evidence-changed',
			staged: false
		})
	})

	it('fails evidence-only resume closed when current Evidence is malformed', async () => {
		const draft = await createEvidenceOnlyDraft()
		const malformed = track({
			audio_features: { version: 1 } as unknown as Track['audio_features']
		})

		const result = await hydrateTrackEnrichmentDraft({
			draft,
			tracks: [malformed],
			records: []
		})

		expect(result.status).toBe('ready')
		if (result.status !== 'ready') throw new Error('Expected a ready draft')
		expect(result.stagedRowIds).toEqual([])
		expect(result.decisions[0]).toMatchObject({
			classification: 'evidence-changed',
			staged: false
		})
	})

	it('keeps evidence-only inert after matcher policy drift', async () => {
		const draft = await createEvidenceOnlyDraft()
		draft.versions.matcherPolicyVersion = 'track-enrichment-match-old'

		const result = await hydrateTrackEnrichmentDraft({
			draft,
			tracks: [track()],
			records: []
		})

		expect(result.status).toBe('ready')
		if (result.status !== 'ready') throw new Error('Expected a ready draft')
		expect(result.stagedRowIds).toEqual([])
		expect(result.decisions[0]).toMatchObject({
			classification: 'policy-changed',
			staged: false
		})
	})

	it.each([
		{
			name: 'source fingerprint and observation drift',
			migratedSource: xmlSource({ averageBpm: 129 }),
			classification: 'source-changed'
		},
		{
			name: 'source snapshot identity drift',
			migratedSource: xmlSource({ trackId: 'xml-2' }),
			classification: 'source-missing'
		}
	] as const)(
		'keeps evidence-only inert after $name',
		async ({ migratedSource, classification }) => {
			const draft = await createEvidenceOnlyDraft()
			draft.versions.sanitizedSourceSnapshotVersion = 'xml-snapshot-old'
			const migrated = await createRekordboxDraftObservationSet([
				migratedSource
			])
			const currentVersions =
				getCurrentTrackEnrichmentDraftVersions('rekordboxXml')

			const result = await hydrateTrackEnrichmentDraft({
				draft,
				tracks: [track()],
				records: [],
				migrators: [
					{
						sourceKind: 'rekordboxXml',
						fromVersion: 'xml-snapshot-old',
						toVersion: currentVersions.sanitizedSourceSnapshotVersion,
						migrate: () => structuredClone(migrated)
					}
				]
			})

			expect(result.status).toBe('ready')
			if (result.status !== 'ready') throw new Error('Expected a ready draft')
			expect(result.stagedRowIds).toEqual([])
			expect(result.decisions[0]).toMatchObject({
				classification,
				staged: false
			})
		}
	)

	it('marks a confirmed success Done only when current source, target, proposal, and applied fields still prove it', async () => {
		const draft = await createDraft()
		setOutcome(draft)

		const result = await hydrateTrackEnrichmentDraft({
			draft,
			tracks: [
				track({
					bpm: 128,
					key: 9,
					mode: 0,
					updated_at: OUTCOME_ATTEMPTED_AT,
					audio_features: appliedAudioFeatures()
				})
			],
			records: []
		})

		expect(result.status).toBe('ready')
		if (result.status !== 'ready') throw new Error('Expected a ready draft')
		expect(result.rows[0]?.applied).toBe(true)
		expect(result.doneRowIds).toEqual(['rekordboxXml-0-track-1'])
		expect(result.stagedRowIds).toEqual([])
		expect(result.changedRowIds).toEqual([])
		expect(result.outcomes).toEqual([
			{
				sourceFingerprint: draft.observations[0]!.sourceFingerprint,
				targetTrackId: 'track-1',
				rowId: 'rekordboxXml-0-track-1',
				storedStatus: 'succeeded',
				failureCode: null,
				applied: { bpm: true, keyMode: true },
				disposition: 'done'
			}
		])
		expect(result.decisions[0]).toMatchObject({
			staged: false,
			outcomeDisposition: 'done'
		})
		expect(result.summary).toMatchObject({
			retained: 0,
			unchangedUnstaged: 1,
			changed: 0,
			dropped: 0
		})
	})

	it.each([
		{
			name: 'no audio feature provenance',
			audioFeatures: null
		},
		{
			name: 'a legacy audio feature shape',
			audioFeatures: { version: 0 } as unknown as Track['audio_features']
		},
		{
			name: 'a different applied source',
			audioFeatures: appliedAudioFeatures({
				bpm: { source: 'embeddedTags', appliedAt: OUTCOME_ATTEMPTED_AT }
			})
		},
		{
			name: 'a different apply timestamp',
			audioFeatures: appliedAudioFeatures({
				bpm: {
					source: 'rekordboxXml',
					appliedAt: '2026-07-23T01:29:59.000Z'
				}
			})
		},
		{
			name: 'a missing key marker',
			audioFeatures: appliedAudioFeatures({ keyMode: null })
		}
	])(
		'keeps a success in Review when it has $name',
		async ({ audioFeatures }) => {
			const draft = await createDraft()
			setOutcome(draft)

			const result = await hydrateTrackEnrichmentDraft({
				draft,
				tracks: [
					track({
						bpm: 128,
						key: 9,
						mode: 0,
						updated_at: OUTCOME_ATTEMPTED_AT,
						audio_features: audioFeatures
					})
				],
				records: []
			})

			expect(result.status).toBe('ready')
			if (result.status !== 'ready') throw new Error('Expected a ready draft')
			expect(result.doneRowIds).toEqual([])
			expect(result.rows[0]?.applied).toBe(false)
			expect(result.outcomes[0]?.disposition).toBe('review')
		}
	)

	it.each([
		{
			name: 'review',
			outcome: {
				status: 'unknown' as const,
				failureCode: 'request-unknown' as const,
				applied: { bpm: false, keyMode: false }
			}
		},
		{
			name: 'rematch',
			outcome: {
				status: 'failed' as const,
				failureCode: 'conflict' as const,
				applied: { bpm: false, keyMode: false }
			}
		}
	])(
		'preserves every dropped classification in the summary before a $name outcome overlay',
		async ({ name, outcome }) => {
			const deletedDraft = await createDraft()
			setOutcome(deletedDraft, outcome)
			const deleted = await hydrateTrackEnrichmentDraft({
				draft: deletedDraft,
				tracks: [],
				records: []
			})

			const unmatchedDraft = await createDraft()
			setOutcome(unmatchedDraft, outcome)
			const unmatched = await hydrateTrackEnrichmentDraft({
				draft: unmatchedDraft,
				tracks: [track({ title: 'Different Track' })],
				records: []
			})

			const missingDraft = await createDraft()
			setOutcome(missingDraft, outcome)
			missingDraft.versions.sanitizedSourceSnapshotVersion = 'xml-snapshot-old'
			const emptySnapshot = await createRekordboxDraftObservationSet([])
			const currentVersions =
				getCurrentTrackEnrichmentDraftVersions('rekordboxXml')
			const missing = await hydrateTrackEnrichmentDraft({
				draft: missingDraft,
				tracks: [track()],
				records: [],
				migrators: [
					{
						sourceKind: 'rekordboxXml',
						fromVersion: 'xml-snapshot-old',
						toVersion: currentVersions.sanitizedSourceSnapshotVersion,
						migrate: () => structuredClone(emptySnapshot)
					}
				]
			})

			for (const [result, classification] of [
				[deleted, 'target-deleted'],
				[unmatched, 'no-longer-matching'],
				[missing, 'source-missing']
			] as const) {
				expect(result.status).toBe('ready')
				if (result.status !== 'ready') throw new Error('Expected ready')
				expect(result.decisions[0]).toMatchObject({
					classification,
					staged: false,
					outcomeDisposition: name
				})
				expect(result.summary).toMatchObject({
					retained: 0,
					changed: 0,
					dropped: 1
				})
				expect(result.dropped).toHaveLength(1)
			}
		}
	)

	it('does not trust a successful outcome when current values do not prove the apply', async () => {
		const draft = await createDraft()
		setOutcome(draft)

		const result = await hydrateTrackEnrichmentDraft({
			draft,
			tracks: [track()],
			records: []
		})

		expect(result.status).toBe('ready')
		if (result.status !== 'ready') throw new Error('Expected a ready draft')
		expect(result.rows[0]?.applied).toBe(false)
		expect(result.doneRowIds).toEqual([])
		expect(result.stagedRowIds).toEqual([])
		expect(result.changedRowIds).toEqual(['rekordboxXml-0-track-1'])
		expect(result.outcomes[0]?.disposition).toBe('review')
		expect(result.decisions[0]).toMatchObject({
			classification: 'retained',
			staged: false,
			outcomeDisposition: 'review'
		})
	})

	it.each([
		{
			name: 'an uncertain request',
			outcome: {
				status: 'unknown' as const,
				failureCode: 'request-unknown' as const,
				applied: { bpm: false, keyMode: false }
			},
			disposition: 'review',
			staged: false,
			changed: true
		},
		{
			name: 'a definite transport failure',
			outcome: {
				status: 'failed' as const,
				failureCode: 'transport' as const,
				applied: { bpm: false, keyMode: false }
			},
			disposition: 'retry',
			staged: true,
			changed: false
		},
		{
			name: 'a stale target failure',
			outcome: {
				status: 'failed' as const,
				failureCode: 'conflict' as const,
				applied: { bpm: false, keyMode: false }
			},
			disposition: 'rematch',
			staged: false,
			changed: true
		}
	])(
		'keeps $name distinct while restoring staging',
		async ({ outcome, disposition, staged, changed }) => {
			const draft = await createDraft()
			setOutcome(draft, outcome)

			const result = await hydrateTrackEnrichmentDraft({
				draft,
				tracks: [track()],
				records: []
			})

			expect(result.status).toBe('ready')
			if (result.status !== 'ready') throw new Error('Expected a ready draft')
			expect(result.outcomes[0]?.disposition).toBe(disposition)
			expect(result.decisions[0]).toMatchObject({
				staged,
				outcomeDisposition: disposition
			})
			expect(result.stagedRowIds).toEqual(
				staged ? ['rekordboxXml-0-track-1'] : []
			)
			expect(result.changedRowIds).toEqual(
				changed ? ['rekordboxXml-0-track-1'] : []
			)
		}
	)

	it.each([
		{
			name: 'a deleted target',
			tracks: [] as Track[],
			classification: 'target-deleted',
			bucket: 'dropped'
		},
		{
			name: 'a target that no longer matches',
			tracks: [track({ title: 'Different Track' })],
			classification: 'no-longer-matching',
			bucket: 'dropped'
		},
		{
			name: 'fields filled since review',
			tracks: [track({ bpm: 128, key: 9, mode: 0 })],
			classification: 'already-filled',
			bucket: 'changed'
		},
		{
			name: 'a target revision changed since review',
			tracks: [track({ updated_at: '2026-07-23T02:00:00.000Z' })],
			classification: 'target-changed',
			bucket: 'changed'
		}
	])(
		'fails staging closed for $name',
		async ({ tracks, classification, bucket }) => {
			const draft = await createDraft()

			const result = await hydrateTrackEnrichmentDraft({
				draft,
				tracks,
				records: []
			})

			expect(result.status).toBe('ready')
			if (result.status !== 'ready') throw new Error('Expected a ready draft')
			expect(result.stagedRowIds).toEqual([])
			expect(result.decisions[0]?.classification).toBe(classification)
			if (bucket === 'dropped') {
				expect(result.dropped).toHaveLength(1)
				expect(result.changedRowIds).toEqual([])
				expect(result.summary.dropped).toBe(1)
			} else {
				expect(result.dropped).toEqual([])
				expect(result.changedRowIds).toHaveLength(1)
				expect(result.summary.changed).toBe(1)
			}
		}
	)

	it('invalidates staging when the matcher policy changes without losing the row', async () => {
		const draft = await createDraft()
		draft.versions.matcherPolicyVersion = 'track-enrichment-match-old'

		const result = await hydrateTrackEnrichmentDraft({
			draft,
			tracks: [track()],
			records: []
		})

		expect(result.status).toBe('ready')
		if (result.status !== 'ready') throw new Error('Expected a ready draft')
		expect(result.compatibility.canRetainStaging).toBe(false)
		expect(result.stagedRowIds).toEqual([])
		expect(result.changedRowIds).toEqual(['rekordboxXml-0-track-1'])
		expect(result.decisions[0]?.classification).toBe('policy-changed')
	})

	it('validates an exact snapshot migration and exposes source changes for review', async () => {
		const draft = await createDraft()
		draft.versions.sanitizedSourceSnapshotVersion = 'xml-snapshot-old'
		const migrated = await createRekordboxDraftObservationSet([
			xmlSource({ averageBpm: 129 })
		])
		const currentVersions =
			getCurrentTrackEnrichmentDraftVersions('rekordboxXml')

		const result = await hydrateTrackEnrichmentDraft({
			draft,
			tracks: [track()],
			records: [],
			migrators: [
				{
					sourceKind: 'rekordboxXml',
					fromVersion: 'xml-snapshot-old',
					toVersion: currentVersions.sanitizedSourceSnapshotVersion,
					migrate: () => structuredClone(migrated)
				}
			]
		})

		expect(result.status).toBe('ready')
		if (result.status !== 'ready') throw new Error('Expected a ready draft')
		expect(result.compatibility.action).toBe('migrate-and-rematch')
		expect(result.rows[0]?.proposedBpm).toBe(129)
		expect(result.stagedRowIds).toEqual([])
		expect(result.changedRowIds).toEqual(['rekordboxXml-0-track-1'])
		expect(result.decisions[0]?.classification).toBe('source-changed')
	})

	it.each([
		['rekordboxXml', 'reimport'],
		['localAudio', 'reconnect']
	] as const)(
		'requires %s recovery when sanitized evidence is incompatible',
		async (sourceKind, expectedStatus) => {
			const draft = await createDraft(
				sourceKind === 'rekordboxXml' ? xmlSource() : localSource()
			)
			draft.versions.sanitizedSourceSnapshotVersion = 'unsupported-old-snapshot'

			const result = await hydrateTrackEnrichmentDraft({
				draft,
				tracks: [track()],
				records: []
			})

			expect(result.status).toBe(expectedStatus)
			expect(result.ui).toEqual(draft.ui)
		}
	)

	it('hydrates local evidence without retaining live files or absolute paths', async () => {
		const draft = await createDraft(localSource())

		const result = await hydrateTrackEnrichmentDraft({
			draft,
			tracks: [track()],
			records: []
		})

		expect(result.status).toBe('ready')
		if (result.status !== 'ready') throw new Error('Expected a ready draft')
		expect(result.stagedRowIds).toEqual(['localAudio-0-track-1'])
		expect(result.rows[0]?.defaultStaged).toBe(false)
		const serialized = JSON.stringify(result)
		expect(serialized).not.toContain('/Users/alice')
		expect(serialized).not.toContain('private parser comment')
		expect(result.rows[0]?.source).not.toHaveProperty('file')
	})

	it('rejects private runtime fields even when a caller bypasses decoding', async () => {
		const draft = await createDraft()
		;(
			draft.observations[0] as TrackEnrichmentDraftObservation & {
				rawXml?: string
			}
		).rawXml = '<DJ_PLAYLISTS />'

		await expect(
			hydrateTrackEnrichmentDraft({
				draft,
				tracks: [track()],
				records: []
			})
		).rejects.toMatchObject({
			name: 'TrackEnrichmentDraftCodecError',
			issues: expect.arrayContaining([
				{ code: 'forbidden-field', path: '/observations/0/rawXml' }
			])
		})
	})

	it('rejects a migrator that returns private or structurally invalid evidence', async () => {
		const draft = await createDraft()
		draft.versions.sanitizedSourceSnapshotVersion = 'xml-snapshot-old'
		const migrated = await createRekordboxDraftObservationSet([xmlSource()])
		const unsafeObservations = structuredClone(migrated.observations) as Array<
			TrackEnrichmentDraftObservation & { rawXml?: string }
		>
		unsafeObservations[0]!.rawXml = '<DJ_PLAYLISTS />'
		const currentVersions =
			getCurrentTrackEnrichmentDraftVersions('rekordboxXml')

		await expect(
			hydrateTrackEnrichmentDraft({
				draft,
				tracks: [track()],
				records: [],
				migrators: [
					{
						sourceKind: 'rekordboxXml',
						fromVersion: 'xml-snapshot-old',
						toVersion: currentVersions.sanitizedSourceSnapshotVersion,
						migrate: () => ({
							datasetFingerprint: migrated.datasetFingerprint,
							observations: unsafeObservations
						})
					}
				]
			})
		).rejects.toEqual(
			expect.objectContaining<Partial<TrackEnrichmentDraftHydrationError>>({
				code: 'invalid-migrated-snapshot'
			})
		)
	})
})
