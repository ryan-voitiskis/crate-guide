/**
 * Golden pins for every persisted or hashed enrichment format. These values
 * were captured from the implementation before the wave-4 performance
 * refactors; any change here changes bytes on disk, draft fingerprints,
 * observation IDs, or batch request hashes and must be a deliberate migration.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	decodeBrowserWorkflowDraft,
	encodeBrowserWorkflowDraftRow
} from '~/repositories/library/browser/browserLibraryCodecs'
import type { LocalAudioTrackSource } from '~/types/localAudio'
import type { TrackEnrichmentDraft } from '~/types/trackEnrichmentDraft'
import type { Track } from '~~/shared/types/supabase'
import type { RekordboxXmlTrack } from './rekordboxXml'
import { buildTrackEnrichmentRows } from './trackEnrichment'
import {
	canonicalizeTrackEnrichmentRequest,
	createTrackEnrichmentBatchRequest
} from './trackEnrichmentBatch'
import {
	decodeTrackEnrichmentDraft,
	encodeTrackEnrichmentDraft,
	encodeTrackEnrichmentDraftContentSignature
} from './trackEnrichmentDraftCodec'
import { createTrackEnrichmentCurrentEvidenceFingerprint } from './trackEnrichmentDraftEvidencePrecondition'
import {
	createLocalAudioDraftObservationSet,
	createRekordboxDraftObservationSet,
	createTrackEnrichmentDraftObservationFingerprintCache,
	sha256TrackEnrichmentDraftValue
} from './trackEnrichmentDraftFingerprint'
import {
	type TrackEnrichmentDraftProjectionInput,
	projectTrackEnrichmentDraft,
	projectTrackEnrichmentDraftWithSignature
} from './trackEnrichmentDraftProjection'
import { createTrackEvidenceObservationId } from './trackEvidenceObservationId'

const REVIEWED_AT = '2026-07-23T01:00:00.000Z'

function currentEvidence() {
	return {
		version: 1 as const,
		updatedAt: '2026-07-23T01:00:00.000Z',
		applied: { bpm: null, keyMode: null },
		match: {
			confidence: 'high' as const,
			score: 100,
			reasons: ['title'],
			warnings: []
		},
		sources: {
			rekordboxXml: {
				importedAt: '2026-07-23T01:00:00.000Z',
				fileName: 'collection.xml',
				name: 'Évidence Track',
				artist: 'Artist',
				album: null,
				genre: null,
				locationHint: 'Artist/Track.wav',
				averageBpm: 128,
				tonality: '8A',
				parsedKey: 9,
				parsedMode: 0,
				totalTimeSeconds: 240,
				year: null,
				kind: null,
				sampleRate: null,
				bitRate: null,
				rating: null,
				playCount: null,
				comments: null,
				remixer: null,
				label: null,
				dateAdded: null
			}
		}
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
		album: 'Ålbum',
		genre: 'House',
		kind: 'WAV File',
		totalTimeSeconds: 240,
		year: 2026,
		averageBpm: 128,
		dateAdded: '2026-07-23',
		bitRate: 1411,
		sampleRate: 44_100,
		comments: 'zeta comment',
		playCount: 1,
		rating: 0,
		location: '/Users/alice/private/Track One.wav',
		locationHint: 'Artist/Release/Track One.wav',
		remixer: null,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		label: null,
		warnings: ['Duplicate TrackID'],
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
		locationHint: 'Artist/Release/Track One.wav',
		totalTimeSeconds: 240,
		averageBpm: 128,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		warnings: [],
		fileName: 'Track One.wav',
		fileSize: 4_096,
		lastModified: 1_753_233_600_000,
		tags: {
			title: 'Track One',
			artist: 'Artist',
			album: null,
			genres: ['House', 'Deep'],
			durationSeconds: 240,
			bpm: null,
			key: null
		},
		analysis: {
			analyzerVersion: 'essentia-test',
			configurationVersion: 'config-test',
			bpm: 128,
			bpmConfidence: 0.9,
			bpmEstimates: [127.9, 128.1],
			key: 'A',
			scale: 'minor',
			keyStrength: 0.85,
			sampleRate: 44_100,
			durationSeconds: 240,
			analyzedDurationSeconds: 180,
			analysisOffsetSeconds: 30,
			warnings: []
		},
		bpmSource: 'essentiaBrowser',
		keyModeSource: 'essentiaBrowser',
		requiresManualReview: true,
		...overrides
	} as LocalAudioTrackSource
}

const UI = {
	filter: 'review' as const,
	sortKey: 'source' as const,
	sortDirection: 'desc' as const,
	density: 'comfortable' as const,
	anchorSourceIndex: null
}

function xmlProjectionInput(): TrackEnrichmentDraftProjectionInput {
	const rows = buildTrackEnrichmentRows({
		sources: [
			xmlSource(),
			xmlSource({
				index: 1,
				trackId: 'xml-2',
				name: 'Second Song',
				artist: 'Other Artist',
				averageBpm: 124,
				warnings: []
			}),
			xmlSource({
				index: 2,
				trackId: 'xml-3',
				name: 'Unmatched Song',
				artist: 'Nobody',
				locationHint: null,
				warnings: []
			})
		],
		tracks: [
			track(),
			track({
				id: 'track-2',
				record_id: 'record-2',
				title: 'Second Song',
				artists: [{ name: 'Other Artist', role: null }],
				bpm: 124,
				key: 9,
				mode: 0,
				audio_features: currentEvidence() as unknown as Track['audio_features']
			})
		],
		records: []
	})
	return {
		id: 'draft-xml',
		workspace: {
			workspaceId: 'workspace-1',
			repositoryId: 'repository-1',
			repositoryRevision: 7
		},
		draftRevision: 3,
		createdAt: '2026-07-23T00:30:00.000Z',
		updatedAt: REVIEWED_AT,
		sourceLabel: 'rekordbox.xml',
		rows: rows.map((row) => ({ row, staged: true, reviewedAt: REVIEWED_AT })),
		ui: UI
	}
}

function localProjectionInput(): TrackEnrichmentDraftProjectionInput {
	const rows = buildTrackEnrichmentRows({
		sources: [
			localSource({ index: 4 }),
			localSource({
				index: 1,
				name: 'Second',
				fileName: 'Second.wav',
				locationHint: 'Artist/Release/Second.wav',
				fileSize: 8_192,
				analysis: null,
				bpmSource: null,
				keyModeSource: null,
				averageBpm: null,
				parsedKey: null,
				parsedMode: null,
				tonality: null
			} as Partial<LocalAudioTrackSource>)
		],
		tracks: [track()],
		records: []
	})
	return {
		id: 'draft-local',
		workspace: {
			workspaceId: 'workspace-1',
			repositoryId: 'repository-1',
			repositoryRevision: 2
		},
		draftRevision: 0,
		createdAt: '2026-07-23T00:30:00.000Z',
		updatedAt: REVIEWED_AT,
		sourceLabel: 'Selected music folder',
		rows: rows.map((row) => ({
			row,
			staged: row.defaultStaged,
			reviewedAt: REVIEWED_AT
		})),
		ui: UI
	}
}

async function projectXmlDraft(): Promise<TrackEnrichmentDraft> {
	return await projectTrackEnrichmentDraft(xmlProjectionInput())
}

async function projectLocalDraft(): Promise<TrackEnrichmentDraft> {
	return await projectTrackEnrichmentDraft(localProjectionInput())
}

// The draft session's change signature, verbatim from before the refactor.
function legacyPayloadSignature(draft: TrackEnrichmentDraft): string {
	return encodeTrackEnrichmentDraft({
		...draft,
		draftRevision: 0,
		updatedAt: draft.createdAt,
		workspace: { ...draft.workspace, repositoryRevision: 0 }
	})
}

const sha = sha256TrackEnrichmentDraftValue

describe('persisted enrichment formats (golden)', () => {
	it('pins XML observation, dataset, and source fingerprints', async () => {
		const set = await createRekordboxDraftObservationSet([
			xmlSource(),
			xmlSource({ index: 1, trackId: 'dup', name: 'Duplicate id' }),
			xmlSource({ index: 2, trackId: 'dup', name: 'Duplicate id 2' }),
			xmlSource({ index: 3, trackId: null, name: 'No id' })
		])
		expect({
			datasetFingerprint: set.datasetFingerprint,
			observations: set.observations.map((observation) => [
				observation.sourceSnapshotId,
				observation.sourceFingerprint,
				observation.observationFingerprint
			])
		}).toMatchInlineSnapshot(`
			{
			  "datasetFingerprint": "7aa721c4c890ce8eb1b9855c3e13e59ecb76a74b96f1fa4b89e22dcc9c16f868",
			  "observations": [
			    [
			      "track-id:xml-1",
			      "track-enrichment-fingerprint-v1:rekordboxXml:7aa721c4c890ce8eb1b9855c3e13e59ecb76a74b96f1fa4b89e22dcc9c16f868:track-id%3Axml-1",
			      "c22ab44af5c50c99ff47fce1753e69079e29bdf42e36c7c2d5225092ec51433c",
			    ],
			    [
			      "snapshot-index:000001",
			      "track-enrichment-fingerprint-v1:rekordboxXml:7aa721c4c890ce8eb1b9855c3e13e59ecb76a74b96f1fa4b89e22dcc9c16f868:snapshot-index%3A000001",
			      "0da82e23da2215f07cc043ed904b3acc8116e8d6adb9ce0985d0a16d994320cf",
			    ],
			    [
			      "snapshot-index:000002",
			      "track-enrichment-fingerprint-v1:rekordboxXml:7aa721c4c890ce8eb1b9855c3e13e59ecb76a74b96f1fa4b89e22dcc9c16f868:snapshot-index%3A000002",
			      "e0b0398543a45c710b710bdeebab59d354d7491a2fb36b1a5d0d0a3044fb0f01",
			    ],
			    [
			      "snapshot-index:000003",
			      "track-enrichment-fingerprint-v1:rekordboxXml:7aa721c4c890ce8eb1b9855c3e13e59ecb76a74b96f1fa4b89e22dcc9c16f868:snapshot-index%3A000003",
			      "3e4fd73cf455c2fcafd112a9d1a06cc34850fb8a8f860cbbe66204555b71b81d",
			    ],
			  ],
			}
		`)
	})

	it('pins local-audio observation, dataset, and source fingerprints', async () => {
		const set = await createLocalAudioDraftObservationSet([
			localSource(),
			localSource({
				index: 1,
				fileName: 'Second.wav',
				locationHint: 'Artist/Release/Second.wav',
				analysis: null
			})
		])
		expect({
			datasetFingerprint: set.datasetFingerprint,
			observations: set.observations.map((observation) => [
				observation.sourceSnapshotId,
				observation.sourceFingerprint,
				observation.observationFingerprint
			])
		}).toMatchInlineSnapshot(`
			{
			  "datasetFingerprint": "90455bbd52ef6368cf966eacbc0f743805a3f7eb10885410485f278760ed93f0",
			  "observations": [
			    [
			      "local-file:Artist/Release/Track One.wav",
			      "track-enrichment-fingerprint-v1:localAudio:4096:1753233600000:Artist%2FRelease%2FTrack%20One.wav",
			      "719efaf53a64b3b0343df29f42aaac54b0bbce0fe78af08468ab7b8c60cf0581",
			    ],
			    [
			      "local-file:Artist/Release/Second.wav",
			      "track-enrichment-fingerprint-v1:localAudio:4096:1753233600000:Artist%2FRelease%2FSecond.wav",
			      "8c4a819039afee597bbb066d96b6f179a02967e073039230756aba72f0f1c9e1",
			    ],
			  ],
			}
		`)
	})

	it('pins current-Evidence precondition fingerprints', async () => {
		expect([
			await createTrackEnrichmentCurrentEvidenceFingerprint(currentEvidence()),
			await createTrackEnrichmentCurrentEvidenceFingerprint(null),
			await createTrackEnrichmentCurrentEvidenceFingerprint({ invalid: true })
		]).toMatchInlineSnapshot(`
			[
			  "1dded93b78a742fbd45e6bc66fef54f68630b5b41713b690b68f0b3a5745c230",
			  "0ada8e9d58069fa5b10cb4283c02b80c41c6448106a37b89248c7a4deef22385",
			  null,
			]
		`)
	})

	it('pins projected draft bytes, change signatures, and stored rows', async () => {
		const results: Record<string, unknown> = {}
		for (const [name, draft] of [
			['xml', await projectXmlDraft()],
			['local', await projectLocalDraft()]
		] as const) {
			const encoded = encodeTrackEnrichmentDraft(draft)
			const row = encodeBrowserWorkflowDraftRow(
				{
					workspaceId: draft.workspace.workspaceId,
					repositoryId: draft.workspace.repositoryId
				},
				{
					id: draft.id,
					kind: 'track-enrichment',
					draftRevision: draft.draftRevision,
					updatedAt: draft.updatedAt,
					payload: draft
				}
			)
			expect(row.serializedPayload).toBe(encoded)
			results[name] = {
				decisionKinds: draft.decisions.map((decision) => decision.kind),
				encodedBytes: encoded.length,
				encoded: await sha(encoded),
				signature: await sha(legacyPayloadSignature(draft)),
				storedRow: await sha(JSON.stringify(row))
			}
		}
		expect(results).toMatchInlineSnapshot(`
			{
			  "local": {
			    "decisionKinds": [
			      "fill-empty-fields",
			    ],
			    "encoded": "f1b16e52d2311ffaf7e8af2d9078a5df274876424501862395870bf8cc851a1b",
			    "encodedBytes": 4310,
			    "signature": "a725db321bc2ea6c90f2c8f905f301a12d23f4809b9e2bc9a4a93119b8718567",
			    "storedRow": "e841559066139566077a062fe770b30286563accdc3f840b5e237f22d42af8ab",
			  },
			  "xml": {
			    "decisionKinds": [
			      "fill-empty-fields",
			      "evidence-only",
			    ],
			    "encoded": "d1b1064a4f590215d9f295f82abdd1e32b57b78d890615f87260a0f0a8c9f7a4",
			    "encodedBytes": 4995,
			    "signature": "dcf8a1a253881da09baf82247009d9224ec67cfd4400dbf1a959cba976fda786",
			    "storedRow": "12d5c374b5963833855a82181760df02d43e2644fa90ade1a18a837046d6409d",
			  },
			}
		`)
	})

	it('pins Track Evidence observation IDs', async () => {
		expect(
			await createTrackEvidenceObservationId('embeddedTags', {
				observedAt: '2026-07-30T10:00:00.000Z',
				match: {
					confidence: 'high',
					score: 96,
					reasons: ['Exact title', 'Ünïcode'],
					warnings: [],
					matcherPolicyVersion: 'track-enrichment-draft-matcher-v1'
				},
				data: {
					fileName: 'track.flac',
					bpm: 128.5,
					zero: 0,
					absent: null,
					nested: { b: [1, { y: 'x', a: true }], A: 'upper', a: 'lower' }
				}
			})
		).toMatchInlineSnapshot(
			`"te2:embeddedTags:6092ec3a2db456b1198125ecbd34faeb87e0ea5675f4436f732df56fa703ec3d"`
		)
	})

	it('pins batch request canonical JSON and hashes', async () => {
		expect(
			canonicalizeTrackEnrichmentRequest({
				b: 1,
				a: [{ z: null, y: undefined, x: 'Ünï' }],
				B: true,
				A: { nested: undefined, kept: -0.5 }
			})
		).toMatchInlineSnapshot(
			`"{"A":{"kept":-0.5},"B":true,"a":[{"x":"Ünï","z":null}],"b":1}"`
		)
		const request = await createTrackEnrichmentBatchRequest(
			[
				{
					ordinal: 0,
					update: {
						id: 'track-1',
						expectedUpdatedAt: '2026-07-23T00:00:00.000Z',
						updates: {
							bpm: 128,
							key: 9,
							mode: 0,
							audio_features: currentEvidence()
						},
						preconditions: { bpmMustBeNull: true, keyModeMustBeNull: true }
					} as never
				}
			],
			() => 'operation-1'
		)
		expect({
			operationHash: request.operationHash,
			itemHashes: request.items.map((item) => item.request_hash)
		}).toMatchInlineSnapshot(`
			{
			  "itemHashes": [
			    "a95b9a5b83f133e567b4b98cab5d85d0d1a3884f9c42a800d4526780df6df5b4",
			  ],
			  "operationHash": "b46e6de4ecbba19b0272e0cd19e8b3d3db8cfaed0db1355f699deca2dbf20a85",
			}
		`)
	})
})

describe('autosave caches keep persisted formats identical', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it.each([
		['xml', xmlProjectionInput],
		['local', localProjectionInput]
	] as const)(
		'returns the legacy bytes and signature for a %s projection',
		async (_name, createInput) => {
			const input = createInput()
			const uncached = await projectTrackEnrichmentDraft(input)
			const cache = createTrackEnrichmentDraftObservationFingerprintCache()
			const first = await projectTrackEnrichmentDraftWithSignature({
				...input,
				observationFingerprintCache: cache
			})
			const second = await projectTrackEnrichmentDraftWithSignature({
				...input,
				observationFingerprintCache: cache
			})

			for (const result of [first, second]) {
				expect(result.draft).toEqual(uncached)
				expect(result.serialized).toBe(encodeTrackEnrichmentDraft(uncached))
				expect(result.signature).toBe(legacyPayloadSignature(uncached))
				expect(encodeTrackEnrichmentDraftContentSignature(result.draft)).toBe(
					result.signature
				)
			}

			// The session remembers the projection signature for the payload the
			// repository stored; it must equal a fresh signature of that payload.
			const stored = decodeBrowserWorkflowDraft(
				encodeBrowserWorkflowDraftRow(
					{
						workspaceId: uncached.workspace.workspaceId,
						repositoryId: uncached.workspace.repositoryId
					},
					{
						id: uncached.id,
						kind: 'track-enrichment',
						draftRevision: uncached.draftRevision,
						updatedAt: uncached.updatedAt,
						payload: first.draft
					}
				)
			)
			expect(legacyPayloadSignature(stored.payload)).toBe(first.signature)
			expect(encodeTrackEnrichmentDraft(stored.payload)).toBe(first.serialized)
		}
	)

	it('keeps storage encoding idempotent over decoded drafts', async () => {
		for (const draft of [await projectXmlDraft(), await projectLocalDraft()]) {
			const serialized = encodeTrackEnrichmentDraft(draft)
			const decoded = decodeTrackEnrichmentDraft(serialized)
			if (decoded.status !== 'ok') throw new Error('Expected a valid draft')
			expect(encodeTrackEnrichmentDraft(decoded.draft)).toBe(serialized)
		}
	})

	it('does not re-hash unchanged observations or Evidence on the next save', async () => {
		const input = xmlProjectionInput()
		const cache = createTrackEnrichmentDraftObservationFingerprintCache()
		const digest = vi.spyOn(globalThis.crypto.subtle, 'digest')

		await projectTrackEnrichmentDraftWithSignature({
			...input,
			observationFingerprintCache: cache
		})
		// Three observations, one dataset digest, and one Evidence digest.
		expect(digest).toHaveBeenCalledTimes(5)

		digest.mockClear()
		await projectTrackEnrichmentDraftWithSignature({
			...input,
			rows: input.rows.map((entry) => ({ ...entry, staged: false })),
			observationFingerprintCache: cache
		})
		// Only the dataset digest over the cached observation fingerprints.
		expect(digest).toHaveBeenCalledTimes(1)
	})
})
