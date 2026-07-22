import { describe, expect, it } from 'vitest'
import type { LocalAudioTrackSource } from '~/types/localAudio'
import type { TrackEnrichmentDraftPartialOutcome } from '~/types/trackEnrichmentDraft'
import type { Track } from '~~/shared/types/supabase'
import type { RekordboxXmlTrack } from './rekordboxXml'
import { buildTrackEnrichmentRows } from './trackEnrichment'
import {
	type TrackEnrichmentDraftProjectionInput,
	projectTrackEnrichmentDraft
} from './trackEnrichmentDraftProjection'

const REVIEWED_AT = '2026-07-23T01:00:00.000Z'

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
		genres: ['database-only-secret'],
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
		bitRate: 1411,
		sampleRate: 44_100,
		comments: 'parser-only-comment-secret',
		playCount: 1,
		rating: 0,
		location: '/Users/alice/private-parser-only/Track One.wav',
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

function projectionInput(
	rows: TrackEnrichmentDraftProjectionInput['rows'],
	overrides: Partial<TrackEnrichmentDraftProjectionInput> = {}
): TrackEnrichmentDraftProjectionInput {
	return {
		id: 'draft-1',
		workspace: {
			workspaceId: 'workspace-1',
			repositoryId: 'repository-1',
			repositoryRevision: 7
		},
		draftRevision: 3,
		createdAt: '2026-07-23T00:30:00.000Z',
		updatedAt: REVIEWED_AT,
		sourceLabel: '/Users/alice/Music/rekordbox.xml',
		rows,
		ui: {
			filter: 'ready',
			sortKey: 'confidence',
			sortDirection: 'desc',
			density: 'compact',
			anchorSourceIndex: null
		},
		...overrides
	}
}

describe('projectTrackEnrichmentDraft', () => {
	it('projects matched and unmatched XML rows without trusting live row IDs or parser snapshots', async () => {
		const rows = buildTrackEnrichmentRows({
			sources: [
				xmlSource(),
				xmlSource({
					index: 1,
					trackId: 'xml-2',
					name: 'Definitely Unmatched',
					artist: 'Someone Else',
					location: '/Users/alice/private-parser-only/Unmatched.wav',
					locationHint: 'Other/Unmatched.wav'
				})
			],
			tracks: [track()],
			records: []
		})
		rows[0]!.id = 'misleading-live-row-id'
		rows[1]!.id = 'misleading-live-row-id'
		rows[0]!.reasons = ['live-row-only-secret']

		const draft = await projectTrackEnrichmentDraft(
			projectionInput(
				rows.map((row) => ({ row, staged: true, reviewedAt: REVIEWED_AT })),
				{
					ui: {
						filter: 'ready',
						sortKey: 'confidence',
						sortDirection: 'desc',
						density: 'compact',
						anchorSourceIndex: 0
					}
				}
			)
		)

		expect(draft.source).toMatchObject({
			kind: 'rekordboxXml',
			label: 'rekordbox.xml',
			requiresReconnect: false
		})
		expect(draft.observations).toHaveLength(2)
		expect(draft.decisions).toHaveLength(1)
		expect(draft.decisions[0]).toMatchObject({
			targetBinding: { trackId: 'track-1' },
			preconditionBinding: {
				expectedTargetUpdatedAt: '2026-07-23T00:00:00.000Z',
				bpmMustBeNull: true,
				keyModeMustBeNull: true
			},
			staged: true
		})
		expect(draft.ui.anchorSourceFingerprint).toBe(
			draft.observations[0]!.sourceFingerprint
		)

		const serialized = JSON.stringify(draft)
		expect(serialized).not.toContain('misleading-live-row-id')
		expect(serialized).not.toContain('live-row-only-secret')
		expect(serialized).not.toContain('database-only-secret')
		expect(serialized).not.toContain('parser-only-comment-secret')
		expect(serialized).not.toContain('/Users/alice')
		expect(draft.observations[0]).not.toHaveProperty('location')
		expect(draft.observations[0]).not.toHaveProperty('sourceType')
	})

	it('canonicalizes local rows by source index and fails staged state closed', async () => {
		const sources = [
			localSource({
				index: 8,
				name: 'Track Eight',
				fileName: 'Track Eight.flac',
				locationHint: 'Artist/Release/Track Eight.flac'
			}),
			localSource({
				index: 2,
				name: 'Track Two',
				fileName: 'Track Two.flac',
				locationHint: 'Artist/Release/Track Two.flac',
				fileSize: 8_192
			})
		]
		const rows = buildTrackEnrichmentRows({
			sources,
			tracks: [
				track({ id: 'track-8', title: 'Track Eight' }),
				track({ id: 'track-2', title: 'Track Two' })
			],
			records: []
		})
		rows[0]!.id = 'shared-untrusted-id'
		rows[1]!.id = 'shared-untrusted-id'
		rows[1]!.stagingBlockedReason = 'Needs explicit review'
		Object.assign(rows[0]!.source, {
			file: { privateValue: 'live-file-must-not-survive' }
		})

		const draft = await projectTrackEnrichmentDraft(
			projectionInput(
				rows.map((row) => ({ row, staged: true, reviewedAt: REVIEWED_AT })),
				{
					sourceLabel: 'Selected music folder',
					ui: {
						filter: 'review',
						sortKey: 'source',
						sortDirection: 'asc',
						density: 'comfortable',
						anchorSourceIndex: 8
					}
				}
			)
		)

		expect(draft.source).toMatchObject({
			kind: 'localAudio',
			label: 'Selected music folder',
			requiresReconnect: true
		})
		expect(draft.observations.map((observation) => observation.name)).toEqual([
			'Track Two',
			'Track Eight'
		])
		expect(
			draft.decisions.map((decision) =>
				decision.kind === 'fill-empty-fields'
					? decision.targetBinding.trackId
					: null
			)
		).toEqual(['track-2', 'track-8'])
		expect(draft.decisions.map((decision) => decision.staged)).toEqual([
			false,
			true
		])
		expect(draft.ui.anchorSourceFingerprint).toBe(
			draft.observations[1]!.sourceFingerprint
		)
		const serialized = JSON.stringify(draft)
		expect(serialized).not.toContain('shared-untrusted-id')
		expect(serialized).not.toContain('live-file-must-not-survive')
	})

	it('whitelists partial-outcome fields instead of copying runtime properties', async () => {
		const [row] = buildTrackEnrichmentRows({
			sources: [xmlSource()],
			tracks: [track()],
			records: []
		})
		const initial = await projectTrackEnrichmentDraft(
			projectionInput([{ row: row!, staged: false, reviewedAt: REVIEWED_AT }])
		)
		const outcome: TrackEnrichmentDraftPartialOutcome = {
			intentKind: 'fill-empty-fields',
			sourceFingerprint: initial.observations[0]!.sourceFingerprint,
			targetTrackId: 'track-1',
			status: 'succeeded',
			applied: { bpm: true, keyMode: false },
			attemptedAt: REVIEWED_AT,
			failureCode: null
		}
		const expectedOutcome = structuredClone(outcome)
		const runtimeOutcome = Object.assign(outcome, {
			file: { privateValue: 'must-not-survive' }
		})

		const draft = await projectTrackEnrichmentDraft(
			projectionInput([{ row: row!, staged: false, reviewedAt: REVIEWED_AT }], {
				partialOutcomes: [runtimeOutcome]
			})
		)

		expect(draft.partialOutcomes).toEqual([expectedOutcome])
		expect(draft.partialOutcomes[0]).not.toHaveProperty('file')
		expect(JSON.stringify(draft)).not.toContain('must-not-survive')
	})

	it.each([
		{
			name: 'an empty review',
			prepare: () => projectionInput([]),
			code: 'empty-review'
		},
		{
			name: 'mixed source kinds',
			prepare: () => {
				const rows = buildTrackEnrichmentRows({
					sources: [xmlSource(), localSource({ index: 1 })],
					tracks: [track()],
					records: []
				})
				return projectionInput(
					rows.map((row) => ({ row, staged: false, reviewedAt: REVIEWED_AT }))
				)
			},
			code: 'mixed-source-kind'
		},
		{
			name: 'duplicate source indexes',
			prepare: () => {
				const rows = buildTrackEnrichmentRows({
					sources: [xmlSource(), xmlSource({ trackId: 'xml-2' })],
					tracks: [track()],
					records: []
				})
				rows[0]!.id = 'first-row-id'
				rows[1]!.id = 'second-row-id'
				return projectionInput(
					rows.map((row) => ({ row, staged: false, reviewedAt: REVIEWED_AT }))
				)
			},
			code: 'duplicate-source-identity'
		},
		{
			name: 'an invalid source index',
			prepare: () => {
				const [row] = buildTrackEnrichmentRows({
					sources: [xmlSource()],
					tracks: [track()],
					records: []
				})
				row!.source.index = -1
				return projectionInput([
					{ row: row!, staged: false, reviewedAt: REVIEWED_AT }
				])
			},
			code: 'invalid-source-identity'
		},
		{
			name: 'an unsafe source label',
			prepare: () => {
				const [row] = buildTrackEnrichmentRows({
					sources: [xmlSource()],
					tracks: [track()],
					records: []
				})
				return projectionInput(
					[{ row: row!, staged: false, reviewedAt: REVIEWED_AT }],
					{ sourceLabel: '../Private/rekordbox.xml' }
				)
			},
			code: 'invalid-source-label'
		},
		{
			name: 'a proposal that drifted from its source',
			prepare: () => {
				const [row] = buildTrackEnrichmentRows({
					sources: [xmlSource()],
					tracks: [track()],
					records: []
				})
				row!.proposedBpm = 129
				return projectionInput([
					{ row: row!, staged: true, reviewedAt: REVIEWED_AT }
				])
			},
			code: 'proposal-mismatch'
		},
		{
			name: 'fill eligibility that drifted from its target',
			prepare: () => {
				const [row] = buildTrackEnrichmentRows({
					sources: [xmlSource()],
					tracks: [track()],
					records: []
				})
				row!.canFillBpm = false
				return projectionInput([
					{ row: row!, staged: true, reviewedAt: REVIEWED_AT }
				])
			},
			code: 'review-state-mismatch'
		},
		{
			name: 'an anchor outside the projected sources',
			prepare: () => {
				const [row] = buildTrackEnrichmentRows({
					sources: [xmlSource()],
					tracks: [track()],
					records: []
				})
				return projectionInput(
					[{ row: row!, staged: false, reviewedAt: REVIEWED_AT }],
					{
						ui: {
							filter: 'ready',
							sortKey: null,
							sortDirection: 'asc',
							density: 'compact',
							anchorSourceIndex: 99
						}
					}
				)
			},
			code: 'invalid-anchor'
		}
	])('rejects $name', async ({ prepare, code }) => {
		await expect(projectTrackEnrichmentDraft(prepare())).rejects.toEqual(
			expect.objectContaining({ code })
		)
	})
})
