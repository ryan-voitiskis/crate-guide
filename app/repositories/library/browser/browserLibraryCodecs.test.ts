import { createTrackEnrichmentDraftFixture } from 'test/fixtures/trackEnrichmentDraft'
import { describe, expect, it } from 'vitest'
import type { LibraryDataset } from '~~/shared/types/library'
import {
	decodeBrowserManagedCover,
	decodeBrowserRepositoryChange,
	decodeBrowserRepositoryRegistry,
	decodeBrowserWorkflowDraft,
	decodeBrowserWorkflowDraftRow,
	decodeBrowserWorkspaceManifest,
	decodeLibraryDataset,
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
					assetId: 'cover-a',
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
			'https://cdn.example.test/cover.webp?api_key=secret'
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
			assetId: 'cover-a',
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

	it('round-trips drafts with an explicit revision and rejects payload drift', () => {
		const payload = createTrackEnrichmentDraftFixture()
		const draft: BrowserWorkflowDraft = {
			id: payload.id,
			kind: 'track-enrichment',
			draftRevision: payload.draftRevision,
			updatedAt: payload.updatedAt,
			payload
		}
		const row = encodeBrowserWorkflowDraftRow('workspace-a', draft)

		expect(row.draftRevision).toBe(3)
		expect(
			decodeBrowserWorkflowDraft(
				decodeBrowserWorkflowDraftRow(row, 'workspace-a')
			)
		).toEqual(draft)
		expectCodecPath(
			() =>
				decodeBrowserWorkflowDraftRow(
					{ ...row, draftRevision: row.draftRevision + 1 },
					'workspace-a'
				),
			'/draft/serializedPayload'
		)

		const unsafePayload = structuredClone(payload)
		unsafePayload.observations[0]!.locationHint = '/Users/example/Music/a.wav'
		expectCodecPath(
			() =>
				encodeBrowserWorkflowDraftRow('workspace-a', {
					...draft,
					payload: unsafePayload
				}),
			'/draft/payload'
		)
	})

	it('strictly decodes versioned commit invalidations', () => {
		const message: BrowserRepositoryChange = {
			protocolVersion: BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION,
			eventId: 'event-a',
			senderId: 'sender-a',
			type: 'commit',
			workspaceId: 'workspace-a',
			catalogRevision: 1,
			repositoryRevision: 3,
			contentRevision: 2,
			committedAt: NOW,
			invalidations: [{ entity: 'records', ids: ['record-a'] }]
		}

		expect(decodeBrowserRepositoryChange(message)).toEqual(message)
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
