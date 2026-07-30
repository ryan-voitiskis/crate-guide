import { createTrackEnrichmentDraftFixture } from 'test/fixtures/trackEnrichmentDraft'
import { describe, expect, it } from 'vitest'
import type { LibraryDataset } from '~~/shared/types/library'
import {
	decodeBrowserDeviceDraftRepository,
	decodeBrowserDraftLease,
	decodeBrowserDraftLeaseRow,
	decodeBrowserManagedCover,
	decodeBrowserRepositoryChange,
	decodeBrowserRepositoryRegistry,
	decodeBrowserWorkflowDraft,
	decodeBrowserWorkflowDraftReadState,
	decodeBrowserWorkflowDraftRow,
	decodeBrowserWorkspaceManifest,
	decodeLibraryDataset,
	encodeBrowserDraftLeaseRow,
	encodeBrowserDraftLeaseTombstone,
	encodeBrowserManagedCover,
	encodeBrowserRecordRow,
	encodeBrowserWorkflowDraftRow
} from './browserLibraryCodecs'
import { BrowserStorageCodecError } from './browserLibraryErrors'
import {
	BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION,
	BROWSER_LIBRARY_REGISTRY_KEY,
	BROWSER_LIBRARY_SCHEMA_VERSION,
	type BrowserManagedCover,
	type BrowserRepositoryChange,
	type BrowserWorkflowDraft
} from './browserLibraryTypes'

const NOW = '2026-07-23T00:00:00.000Z'

function createDataset(): LibraryDataset {
	return {
		records: [
			{
				id: 'record-a',
				title: 'Release A',
				artists: [{ discogs_id: 1, name: 'Artist A', role: null }],
				labels: [{ name: 'Label A', thumbnail_url: '' }],
				year: 2026,
				cover: {
					kind: 'browser',
					assetId: 'record-a/cover-a',
					fallbackUrl: null
				},
				discogs_id: 10,
				discogs_release_url: 'https://www.discogs.com/release/10',
				created_at: NOW,
				updated_at: NOW
			}
		],
		tracks: [
			{
				id: 'track-a',
				record_id: 'record-a',
				title: 'Track A',
				artists: [{ name: 'Artist A' }],
				extraartists: [],
				position: 'A1',
				duration: 360,
				bpm: 124,
				rpm: 33,
				key: 7,
				mode: 0,
				genres: ['House'],
				time_signature_upper: 4,
				time_signature_lower: 4,
				playable: true,
				beatport_data: null,
				audio_features: null,
				created_at: NOW,
				updated_at: NOW
			}
		],
		crates: [
			{
				id: 'crate-a',
				name: 'Crate A',
				description: null,
				color: null,
				records: ['record-a'],
				created_at: NOW,
				updated_at: NOW
			}
		],
		savedSets: [
			{
				id: 'set-a',
				name: 'Set A',
				played_tracks: [
					{
						track_id: 'track-a',
						time_added: Date.parse(NOW),
						adjusted_bpm: 124,
						transition_rating: 5
					}
				],
				created_at: NOW,
				updated_at: NOW
			}
		],
		preferences: {
			ui_theme: 'dark',
			key_format: 'camelot',
			list_layout: 'compact',
			selected_crate: 'crate-a',
			turntable_pitch_range: 8,
			turntable_theme: 'black'
		}
	}
}

function expectCodecPath(action: () => unknown, path: string) {
	try {
		action()
	} catch (error) {
		expect(error).toBeInstanceOf(BrowserStorageCodecError)
		expect((error as BrowserStorageCodecError).path).toBe(path)
		return
	}
	throw new Error(`Expected codec failure at ${path}.`)
}

describe('browser library domain codecs', () => {
	it('strictly round-trips a coherent library graph', () => {
		const dataset = createDataset()

		expect(decodeLibraryDataset(structuredClone(dataset))).toEqual(dataset)
		expect(encodeBrowserRecordRow('workspace-a', dataset.records[0]!)).toEqual({
			workspaceId: 'workspace-a',
			...dataset.records[0]
		})
	})

	it('rejects identity fields and cloud-only cover references', () => {
		const datasetWithIdentity = {
			...createDataset(),
			user_id: 'account-a'
		}
		expectCodecPath(
			() => decodeLibraryDataset(datasetWithIdentity),
			'/snapshot/user_id'
		)

		const datasetWithCloudCover = createDataset()
		datasetWithCloudCover.records[0]!.cover = {
			kind: 'cloud',
			assetId: 'account-a/cover.webp',
			fallbackUrl: null
		}
		expectCodecPath(
			() => decodeLibraryDataset(datasetWithCloudCover),
			'/snapshot/records/0/cover/kind'
		)
	})

	it('rejects signed URLs and fields outside the exact domain schema', () => {
		const signed = createDataset()
		signed.records[0]!.cover = {
			kind: 'external',
			url: 'https://cdn.example.test/cover.webp?X-Amz-Signature=secret'
		}
		expectCodecPath(
			() => decodeLibraryDataset(signed),
			'/snapshot/records/0/cover/url'
		)
		for (const url of [
			'https://user:password@cdn.example.test/cover.webp',
			'https://cdn.example.test/cover.webp?access_token=secret',
			'https://cdn.example.test/cover.webp?api_key=secret',
			'https://cdn.example.test/cover.webp#access_token=secret'
		]) {
			const credentialed = createDataset()
			credentialed.records[0]!.cover = { kind: 'external', url }
			expectCodecPath(
				() => decodeLibraryDataset(credentialed),
				'/snapshot/records/0/cover/url'
			)
		}

		const ordinaryQuery = createDataset()
		ordinaryQuery.records[0]!.cover = {
			kind: 'external',
			url: 'https://cdn.example.test/cover.webp?page=1&sort=title'
		}
		expect(decodeLibraryDataset(ordinaryQuery)).toEqual(ordinaryQuery)

		const rawAudio = createDataset() as LibraryDataset & { rawAudio: Blob }
		rawAudio.rawAudio = new Blob(['private audio'])
		expectCodecPath(() => decodeLibraryDataset(rawAudio), '/snapshot/rawAudio')

		const fragmentCases: Array<{
			mutate(dataset: LibraryDataset): void
			path: string
		}> = [
			{
				mutate(dataset) {
					dataset.records[0]!.cover = {
						kind: 'browser',
						assetId: 'record-a/cover.webp',
						fallbackUrl:
							'https://cdn.example.test/fallback.webp#access_token=secret'
					}
				},
				path: '/snapshot/records/0/cover/fallbackUrl'
			},
			{
				mutate(dataset) {
					dataset.records[0]!.discogs_release_url =
						'https://www.discogs.com/release/10#access_token=secret'
				},
				path: '/snapshot/records/0/discogs_release_url'
			},
			{
				mutate(dataset) {
					dataset.records[0]!.labels[0]!.thumbnail_url =
						'https://images.discogs.com/label.jpg#access_token=secret'
				},
				path: '/snapshot/records/0/labels/0/thumbnail_url'
			},
			{
				mutate(dataset) {
					dataset.tracks[0]!.beatport_data = {
						accessed: Date.parse(NOW),
						url: 'https://www.beatport.com/track/example/1#access_token=secret',
						genre: 'House',
						bpm: 124,
						key: 'A Minor',
						img: 'https://geo-media.beatport.com/image.jpg'
					}
				},
				path: '/snapshot/tracks/0/beatport_data/url'
			},
			{
				mutate(dataset) {
					dataset.tracks[0]!.beatport_data = {
						accessed: Date.parse(NOW),
						url: 'https://www.beatport.com/track/example/1',
						genre: 'House',
						bpm: 124,
						key: 'A Minor',
						img: 'https://geo-media.beatport.com/image.jpg#access_token=secret'
					}
				},
				path: '/snapshot/tracks/0/beatport_data/img'
			}
		]
		for (const fragmentCase of fragmentCases) {
			const dataset = createDataset()
			fragmentCase.mutate(dataset)
			expectCodecPath(() => decodeLibraryDataset(dataset), fragmentCase.path)
		}
	})

	it('accepts logical cover asset IDs but rejects paths, URIs, and raw files', () => {
		const logical = createDataset()
		logical.records[0]!.cover = {
			kind: 'browser',
			assetId: 'record-a/550e8400-e29b-41d4-a716-446655440000.webp',
			fallbackUrl: null
		}
		expect(decodeLibraryDataset(logical)).toEqual(logical)

		for (const assetId of [
			'/Users/alice/Music/cover.webp',
			'\\\\server\\private\\cover.webp',
			'C:\\Users\\alice\\cover.webp',
			'file:///Users/alice/cover.webp',
			'https://private.example.test/cover.webp?signature=secret',
			'../private/cover.webp',
			'record-a/../private.webp',
			'record-a%2F..%2Fprivate.webp',
			'record-a%252F..%252Fprivate.webp',
			'record-a/%252e%252e/private.webp'
		]) {
			const pathLike = createDataset()
			pathLike.records[0]!.cover = {
				kind: 'browser',
				assetId,
				fallbackUrl: null
			}
			expectCodecPath(
				() => decodeLibraryDataset(pathLike),
				'/snapshot/records/0/cover/assetId'
			)
		}

		const signedFallback = createDataset()
		signedFallback.records[0]!.cover = {
			kind: 'browser',
			assetId: 'record-a/cover.webp',
			fallbackUrl:
				'https://private.example.test/cover.webp?X-Amz-Signature=secret'
		}
		expectCodecPath(
			() => decodeLibraryDataset(signedFallback),
			'/snapshot/records/0/cover/fallbackUrl'
		)

		const relabeledCloudPath = createDataset()
		relabeledCloudPath.records[0]!.cover = {
			kind: 'browser',
			assetId: 'account-id/file.webp',
			fallbackUrl: null
		}
		expectCodecPath(
			() => decodeLibraryDataset(relabeledCloudPath),
			'/snapshot/records/0/cover/assetId'
		)

		const rawFile = createDataset()
		rawFile.records[0]!.cover = {
			kind: 'browser',
			assetId: 'record-a/cover.webp',
			fallbackUrl: null,
			file: new File(['raw'], 'cover.webp', { type: 'image/webp' })
		} as never
		expectCodecPath(
			() => decodeLibraryDataset(rawFile),
			'/snapshot/records/0/cover/file'
		)
	})

	it('rejects broken and duplicate graph references', () => {
		const missingRecord = createDataset()
		missingRecord.tracks[0]!.record_id = 'missing-record'
		expectCodecPath(
			() => decodeLibraryDataset(missingRecord),
			'/snapshot/tracks/0/record_id'
		)

		const duplicateRecord = createDataset()
		duplicateRecord.records.push(structuredClone(duplicateRecord.records[0]!))
		expectCodecPath(
			() => decodeLibraryDataset(duplicateRecord),
			'/snapshot/records/1/id'
		)

		const missingSelectedCrate = createDataset()
		missingSelectedCrate.preferences.selected_crate = 'missing-crate'
		expectCodecPath(
			() => decodeLibraryDataset(missingSelectedCrate),
			'/snapshot/preferences/selected_crate'
		)
	})
})

describe('browser library metadata codecs', () => {
	it('requires the exact supported schema version and revision invariants', () => {
		const manifest = {
			id: 'workspace-a',
			repositoryId: 'repository-a',
			name: 'Local library',
			schemaVersion: BROWSER_LIBRARY_SCHEMA_VERSION,
			createdAt: NOW,
			updatedAt: NOW,
			contentRevision: 2,
			repositoryRevision: 3,
			lastSuccessfulContentWriteAt: NOW,
			coverCompleteness: 'complete'
		}

		expect(decodeBrowserWorkspaceManifest(manifest)).toEqual(manifest)
		expectCodecPath(
			() =>
				decodeBrowserWorkspaceManifest({
					...manifest,
					schemaVersion: BROWSER_LIBRARY_SCHEMA_VERSION + 1
				}),
			'/workspace/schemaVersion'
		)
		expectCodecPath(
			() =>
				decodeBrowserWorkspaceManifest({
					...manifest,
					repositoryRevision: 1
				}),
			'/workspace/repositoryRevision'
		)

		const registry = {
			key: BROWSER_LIBRARY_REGISTRY_KEY,
			schemaVersion: BROWSER_LIBRARY_SCHEMA_VERSION,
			catalogRevision: 1,
			createdAt: NOW,
			updatedAt: NOW
		}
		expect(decodeBrowserRepositoryRegistry(registry)).toEqual(registry)
	})

	it('bounds managed WebP cover bytes and verifies workspace ownership', () => {
		const cover: BrowserManagedCover = {
			workspaceId: 'workspace-a',
			assetId: 'record-a/cover-a',
			recordId: 'record-a',
			blob: new Blob([new Uint8Array(2 * 1024 * 1024)], {
				type: 'image/webp'
			}),
			createdAt: NOW,
			updatedAt: NOW
		}

		expect(encodeBrowserManagedCover(cover).blob.size).toBe(2 * 1024 * 1024)
		expectCodecPath(
			() => decodeBrowserManagedCover(cover, 'workspace-b'),
			'/cover/workspaceId'
		)
		expectCodecPath(
			() =>
				decodeBrowserManagedCover(
					{ ...cover, assetId: '/Users/alice/private-cover.webp' },
					'workspace-a'
				),
			'/cover/assetId'
		)
		expectCodecPath(
			() =>
				decodeBrowserManagedCover(
					{
						...cover,
						blob: new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], {
							type: 'image/webp'
						})
					},
					'workspace-a'
				),
			'/cover/blob'
		)
	})

	it('separates strict draft envelopes from isolated payload read states', () => {
		const identity = {
			workspaceId: 'workspace-a',
			repositoryId: 'repository-a'
		}
		const payload = createTrackEnrichmentDraftFixture()
		const draft: BrowserWorkflowDraft = {
			id: payload.id,
			kind: 'track-enrichment',
			draftRevision: payload.draftRevision,
			updatedAt: payload.updatedAt,
			payload
		}
		const row = encodeBrowserWorkflowDraftRow(identity, draft)

		expect(row.draftRevision).toBe(3)
		expect(row).toMatchObject({
			envelopeVersion: 1,
			workspaceId: identity.workspaceId,
			repositoryId: identity.repositoryId
		})
		expect(
			decodeBrowserWorkflowDraft(
				decodeBrowserWorkflowDraftRow(
					row,
					identity.workspaceId,
					identity.repositoryId
				)
			)
		).toEqual(draft)
		const driftedRow = decodeBrowserWorkflowDraftRow(
			{ ...row, draftRevision: row.draftRevision + 1 },
			identity.workspaceId,
			identity.repositoryId
		)
		expect(decodeBrowserWorkflowDraftReadState(driftedRow)).toMatchObject({
			status: 'invalid',
			metadata: { draftRevision: row.draftRevision + 1 }
		})
		expectCodecPath(
			() => decodeBrowserWorkflowDraft(driftedRow),
			'/draft/serializedPayload'
		)
		const incompatibleRow = decodeBrowserWorkflowDraftRow(
			{
				...row,
				serializedPayload: JSON.stringify({
					...payload,
					schemaVersion: 999
				})
			},
			identity.workspaceId,
			identity.repositoryId
		)
		expect(decodeBrowserWorkflowDraftReadState(incompatibleRow)).toMatchObject({
			status: 'incompatible',
			schemaVersion: 999,
			reason: 'future-schema',
			metadata: { id: draft.id }
		})
		expect(
			decodeBrowserWorkflowDraftReadState({
				...row,
				serializedPayload: '{'
			})
		).toMatchObject({ status: 'invalid', metadata: { id: draft.id } })

		const unsafePayload = structuredClone(payload)
		unsafePayload.observations[0]!.locationHint = '/Users/example/Music/a.wav'
		expectCodecPath(
			() =>
				encodeBrowserWorkflowDraftRow(identity, {
					...draft,
					payload: unsafePayload
				}),
			'/draft/payload'
		)
	})

	it('strictly binds lease rows while redacting owner capabilities', () => {
		const identity = {
			workspaceId: 'workspace-a',
			repositoryId: 'repository-a'
		}
		const ownerToken = 'owner-capability-secret'
		const row = encodeBrowserDraftLeaseRow(identity, 'draft-a', ownerToken, {
			leaseRevision: 2,
			acquiredAt: NOW,
			renewedAt: '2026-07-23T00:00:20.000Z',
			expiresAt: '2026-07-23T00:01:20.000Z'
		})
		expect(row.ownerToken).toBe(ownerToken)
		expect(decodeBrowserDraftLease(row)).toEqual({
			leaseRevision: 2,
			acquiredAt: NOW,
			renewedAt: '2026-07-23T00:00:20.000Z',
			expiresAt: '2026-07-23T00:01:20.000Z'
		})
		expect(decodeBrowserDraftLease(row)).not.toHaveProperty('ownerToken')
		expect(encodeBrowserDraftLeaseTombstone(identity, 'draft-a', 3)).toEqual({
			workspaceId: identity.workspaceId,
			repositoryId: identity.repositoryId,
			draftId: 'draft-a',
			ownerToken: null,
			leaseRevision: 3,
			acquiredAt: null,
			renewedAt: null,
			expiresAt: null
		})
		expectCodecPath(
			() =>
				decodeBrowserDraftLeaseRow(
					{ ...row, repositoryId: 'repository-b' },
					identity,
					'draft-a'
				),
			'/draftLease/identity'
		)
		expectCodecPath(
			() =>
				decodeBrowserDraftLeaseRow(
					{ ...row, expiresAt: row.renewedAt },
					identity,
					'draft-a'
				),
			'/draftLease/expiresAt'
		)
	})

	it('strictly binds device-draft revisions independently of library revisions', () => {
		const identity = {
			workspaceId: 'cloud-workspace-a',
			repositoryId: 'cloud-repository-a'
		}
		const state = {
			...identity,
			deviceRevision: 4,
			createdAt: NOW,
			updatedAt: '2026-07-23T00:01:00.000Z'
		}
		expect(decodeBrowserDeviceDraftRepository(state, identity)).toEqual(state)
		expectCodecPath(
			() =>
				decodeBrowserDeviceDraftRepository(
					{ ...state, repositoryId: 'other-repository' },
					identity
				),
			'/deviceDraftRepository/identity'
		)
		expectCodecPath(
			() =>
				decodeBrowserDeviceDraftRepository(
					{ ...state, createdAt: '2026-07-23T00:02:00.000Z' },
					identity
				),
			'/deviceDraftRepository/updatedAt'
		)
	})

	it('strictly decodes versioned commit invalidations', () => {
		const message: BrowserRepositoryChange = {
			protocolVersion: BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION,
			eventId: 'event-a',
			senderId: 'sender-a',
			type: 'commit',
			workspaceId: 'workspace-a',
			repositoryId: 'repository-a',
			catalogRevision: 1,
			repositoryRevision: 3,
			contentRevision: 2,
			committedAt: NOW,
			invalidations: [{ entity: 'records', ids: ['record-a'] }]
		}

		expect(decodeBrowserRepositoryChange(message)).toEqual(message)
		expect(
			decodeBrowserRepositoryChange({
				...message,
				workspaceId: null,
				repositoryId: null
			})
		).toEqual({ ...message, workspaceId: null, repositoryId: null })
		expectCodecPath(
			() =>
				decodeBrowserRepositoryChange({
					...message,
					workspaceId: null
				}),
			'/broadcast/repositoryId'
		)
		expectCodecPath(
			() =>
				decodeBrowserRepositoryChange({
					...message,
					protocolVersion: 1
				}),
			'/broadcast/protocolVersion'
		)
		expectCodecPath(
			() =>
				decodeBrowserRepositoryChange({
					...message,
					protocolVersion: BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION + 1
				}),
			'/broadcast/protocolVersion'
		)
	})
})
