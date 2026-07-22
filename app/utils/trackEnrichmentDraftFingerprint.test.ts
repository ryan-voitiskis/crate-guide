import { describe, expect, it } from 'vitest'
import type { LocalAudioTrackSource } from '~/types/localAudio'
import type { RekordboxXmlTrack } from './rekordboxXml'
import {
	createLocalAudioDraftObservationSet,
	createRekordboxDraftObservationSet,
	sha256TrackEnrichmentDraftValue
} from './trackEnrichmentDraftFingerprint'

function xmlTrack(
	overrides: Partial<RekordboxXmlTrack> = {}
): RekordboxXmlTrack {
	return {
		sourceType: 'rekordboxXml',
		index: 0,
		trackId: '42',
		name: 'Track',
		artist: 'Artist',
		album: 'Release',
		genre: 'House',
		kind: 'MP3 File',
		totalTimeSeconds: 360,
		year: 2026,
		averageBpm: 124,
		dateAdded: '2026-07-22',
		bitRate: 320,
		sampleRate: 44_100,
		comments: null,
		playCount: 2,
		rating: 0,
		location: '/Users/alice/Music/Artist/Release/Track.mp3',
		locationHint: '/Users/alice/Music/Artist/Release/Track.mp3',
		remixer: null,
		tonality: '8A',
		parsedKey: 7,
		parsedMode: 0,
		label: 'Label',
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
		name: 'Track',
		artist: 'Artist',
		album: 'Release',
		genre: 'House',
		locationHint: 'Artist/Release/Track.mp3',
		totalTimeSeconds: 360,
		averageBpm: 124,
		tonality: 'G minor',
		parsedKey: 7,
		parsedMode: 0,
		warnings: [],
		fileName: 'Track.mp3',
		fileSize: 123_456,
		lastModified: 1_753_146_000_000,
		tags: {
			title: 'Track',
			artist: 'Artist',
			album: 'Release',
			genres: ['House'],
			durationSeconds: 360,
			bpm: 124,
			key: null
		},
		analysis: {
			analyzerVersion: 'essentia-browser-v1',
			configurationVersion: 'local-audio-analysis-v1',
			bpm: 124,
			bpmConfidence: 0.94,
			bpmEstimates: [124, 124.1],
			key: 'G',
			scale: 'minor',
			keyStrength: 0.8,
			sampleRate: 22_050,
			durationSeconds: 360,
			analyzedDurationSeconds: 120,
			analysisOffsetSeconds: 120,
			warnings: []
		},
		bpmSource: 'embeddedTags',
		keyModeSource: 'essentiaBrowser',
		requiresManualReview: false,
		...overrides
	}
}

describe('track enrichment draft fingerprints', () => {
	it('uses the platform SHA-256 implementation with a known vector', async () => {
		await expect(sha256TrackEnrichmentDraftValue('abc')).resolves.toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		)
	})

	it('creates deterministic XML dataset, source, and observation identities', async () => {
		const tracks = [
			xmlTrack({
				warnings: [
					'Safe parser warning',
					'Failed to read /Users/alice/Music/private.mp3',
					'Failed to read /private/var/folders/private.mp3'
				]
			}),
			xmlTrack({ trackId: '84', index: 1 })
		]

		const first = await createRekordboxDraftObservationSet(tracks)
		const second = await createRekordboxDraftObservationSet(
			structuredClone(tracks)
		)

		expect(second).toEqual(first)
		expect(first.datasetFingerprint).toMatch(/^[a-f0-9]{64}$/)
		expect(first.observations.map((item) => item.sourceSnapshotId)).toEqual([
			'track-id:42',
			'track-id:84'
		])
		expect(first.observations[0]?.locationHint).toBe(
			'Music/Artist/Release/Track.mp3'
		)
		expect(first.observations[0]).not.toHaveProperty('location')
		expect(first.observations[0]?.warnings).toEqual(['Safe parser warning'])
		expect(JSON.stringify(first)).not.toContain('/Users/alice')
	})

	it('falls back to deterministic snapshot-local IDs for missing or duplicate TrackIDs', async () => {
		const result = await createRekordboxDraftObservationSet([
			xmlTrack({ trackId: 'duplicate' }),
			xmlTrack({ trackId: 'duplicate', index: 1 }),
			xmlTrack({ trackId: null, index: 2 })
		])

		expect(result.observations.map((item) => item.sourceSnapshotId)).toEqual([
			'snapshot-index:000000',
			'snapshot-index:000001',
			'snapshot-index:000002'
		])
	})

	it('changes XML bindings conservatively when any sanitized observation changes', async () => {
		const original = await createRekordboxDraftObservationSet([
			xmlTrack(),
			xmlTrack({ trackId: '84', index: 1 })
		])
		const changed = await createRekordboxDraftObservationSet([
			xmlTrack(),
			xmlTrack({ trackId: '84', index: 1, name: 'Changed title' })
		])

		expect(changed.datasetFingerprint).not.toBe(original.datasetFingerprint)
		expect(changed.observations[0]?.observationFingerprint).toBe(
			original.observations[0]?.observationFingerprint
		)
		expect(changed.observations[1]?.observationFingerprint).not.toBe(
			original.observations[1]?.observationFingerprint
		)
		expect(changed.observations[0]?.sourceFingerprint).not.toBe(
			original.observations[0]?.sourceFingerprint
		)
	})

	it('keeps local file identity stable across traversal order while binding changed evidence separately', async () => {
		const sourceA = localSource()
		const sourceB = localSource({
			index: 1,
			name: 'Other',
			fileName: 'Other.mp3',
			locationHint: 'Artist/Release/Other.mp3',
			fileSize: 654_321
		})
		const first = await createLocalAudioDraftObservationSet([sourceA, sourceB])
		const reordered = await createLocalAudioDraftObservationSet([
			sourceB,
			sourceA
		])

		expect(reordered.datasetFingerprint).toBe(first.datasetFingerprint)
		const byPath = (result: typeof first) =>
			new Map(
				result.observations.map((item) => [
					item.locationHint,
					{
						source: item.sourceFingerprint,
						observation: item.observationFingerprint
					}
				])
			)
		expect(byPath(reordered)).toEqual(byPath(first))

		const changedEvidence = await createLocalAudioDraftObservationSet([
			localSource({ averageBpm: 125 })
		])
		expect(changedEvidence.observations[0]?.sourceFingerprint).toBe(
			first.observations[0]?.sourceFingerprint
		)
		expect(changedEvidence.observations[0]?.observationFingerprint).not.toBe(
			first.observations[0]?.observationFingerprint
		)
	})

	it('rejects invalid and duplicate local file identities', async () => {
		await expect(
			createLocalAudioDraftObservationSet([
				localSource({ locationHint: '../Private/Track.mp3' })
			])
		).rejects.toMatchObject({
			code: 'invalid-local-identity'
		})
		await expect(
			createLocalAudioDraftObservationSet([localSource(), localSource()])
		).rejects.toMatchObject({
			code: 'duplicate-local-identity'
		})
	})
})
