import { describe, expect, it } from 'vitest'
import type { LocalAudioTrackSource } from '~/types/localAudio'
import { TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION } from '~/types/trackEnrichmentDraft'
import type { RekordboxXmlTrack } from './rekordboxXml'
import {
	createLocalAudioDraftObservationSet,
	createRekordboxDraftObservationSet
} from './trackEnrichmentDraftFingerprint'
import {
	type TrackEnrichmentDraftReconnectCandidate,
	type TrackEnrichmentDraftReconnectError,
	classifyTrackEnrichmentDraftReconnect
} from './trackEnrichmentDraftReconnect'

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
		locationHint: '/Users/alice/Music/Artist/Release/Track.flac',
		totalTimeSeconds: 240,
		averageBpm: 128,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		warnings: [],
		fileName: 'Track.flac',
		fileSize: 4_096,
		lastModified: 1_753_233_600_000,
		tags: {
			title: 'Track',
			artist: 'Artist',
			album: 'Release',
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

function xmlSource(): RekordboxXmlTrack {
	return {
		sourceType: 'rekordboxXml',
		index: 0,
		trackId: 'xml-1',
		name: 'Track',
		artist: 'Artist',
		album: 'Release',
		genre: 'House',
		kind: 'WAV File',
		totalTimeSeconds: 240,
		year: 2026,
		averageBpm: 128,
		dateAdded: null,
		bitRate: 1411,
		sampleRate: 44_100,
		comments: null,
		playCount: null,
		rating: null,
		location: null,
		locationHint: 'Artist/Release/Track.wav',
		remixer: null,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		label: null,
		warnings: []
	}
}

describe('classifyTrackEnrichmentDraftReconnect', () => {
	it('classifies unchanged, changed, missing, and new files with sanitized plain identities', async () => {
		const observationSet = await createLocalAudioDraftObservationSet([
			localSource(),
			localSource({
				index: 1,
				name: 'Changed',
				fileName: 'Changed.flac',
				locationHint: '/Users/alice/Music/Artist/Release/Changed.flac',
				fileSize: 8_192
			}),
			localSource({
				index: 2,
				name: 'Missing',
				fileName: 'Missing.flac',
				locationHint: '/Users/alice/Music/Artist/Release/Missing.flac',
				fileSize: 16_384
			})
		])
		const candidates: TrackEnrichmentDraftReconnectCandidate[] = [
			Object.assign(
				{
					relativePath: 'Music/Artist/Release/Track.flac',
					size: 4_096,
					lastModified: 1_753_233_600_000
				},
				{ file: { privateValue: 'must-not-survive' } }
			),
			{
				relativePath: 'Music/Artist/Release/Changed.flac',
				size: 8_193,
				lastModified: 1_753_233_600_000
			},
			{
				relativePath: 'Music/Artist/Release/Zeta.flac',
				size: 32_768,
				lastModified: 1_753_233_600_001
			},
			{
				relativePath: 'Music/Artist/Release/Alpha.flac',
				size: 65_536,
				lastModified: 1_753_233_600_002
			}
		]

		const result = classifyTrackEnrichmentDraftReconnect(
			[
				observationSet.observations[2]!,
				observationSet.observations[0]!,
				observationSet.observations[1]!
			],
			candidates
		)

		expect(result.summary).toEqual({
			unchanged: 1,
			changed: 1,
			missing: 1,
			new: 2
		})
		expect(result.entries.map((entry) => entry.status)).toEqual([
			'unchanged',
			'changed',
			'missing',
			'new',
			'new'
		])
		expect(result.entries[0]).toMatchObject({
			storedIdentity: {
				version: TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION,
				relativePath: 'Music/Artist/Release/Track.flac',
				size: 4_096
			},
			selectedIdentity: {
				relativePath: 'Music/Artist/Release/Track.flac',
				size: 4_096
			}
		})
		expect(JSON.stringify(result)).not.toContain('/Users/alice')
		expect(JSON.stringify(result)).not.toContain('must-not-survive')
		expect(result.entries[0]).not.toHaveProperty('file')
		expect(
			result.entries
				.filter((entry) => entry.status === 'new')
				.map((entry) => entry.selectedIdentity.relativePath)
		).toEqual([
			'Music/Artist/Release/Alpha.flac',
			'Music/Artist/Release/Zeta.flac'
		])
	})

	it.each([
		{
			name: 'an invalid selected path',
			candidates: [
				{ relativePath: '../Private/Track.flac', size: 1, lastModified: 1 }
			],
			code: 'invalid-candidate'
		},
		{
			name: 'a malformed runtime candidate',
			candidates: [null],
			code: 'invalid-candidate'
		},
		{
			name: 'an absolute selected path that could alias a stored identity',
			candidates: [
				{
					relativePath: '/Users/alice/Music/Artist/Track.flac',
					size: 1,
					lastModified: 1
				}
			],
			code: 'invalid-candidate'
		},
		{
			name: 'invalid selected file numbers',
			candidates: [
				{
					relativePath: 'Music/Track.flac',
					size: Number.MAX_SAFE_INTEGER + 1,
					lastModified: 1
				}
			],
			code: 'invalid-candidate'
		},
		{
			name: 'duplicate selected identities',
			candidates: [
				{
					relativePath: 'Music/Artist/Track.flac',
					size: 1,
					lastModified: 1
				},
				{
					relativePath: 'Music/Artist/Track.flac',
					size: 1,
					lastModified: 1
				}
			],
			code: 'duplicate-selected-path'
		}
	])('rejects $name without reflecting it', ({ candidates, code }) => {
		let caught: unknown
		try {
			classifyTrackEnrichmentDraftReconnect(
				[],
				candidates as TrackEnrichmentDraftReconnectCandidate[]
			)
		} catch (error) {
			caught = error
		}
		expect(caught).toEqual(expect.objectContaining({ code }))
		expect(String(caught)).not.toContain('Private')
		expect(String(caught)).not.toContain('alice')
	})

	it('rejects non-local observations and malformed or duplicate stored identities', async () => {
		const xml = await createRekordboxDraftObservationSet([xmlSource()])
		expect(() =>
			classifyTrackEnrichmentDraftReconnect(xml.observations, [])
		).toThrowError(
			expect.objectContaining<Partial<TrackEnrichmentDraftReconnectError>>({
				code: 'non-local-observation'
			})
		)

		const local = await createLocalAudioDraftObservationSet([
			localSource(),
			localSource({
				index: 1,
				fileName: 'Other.flac',
				locationHint: '/Users/alice/Music/Artist/Release/Other.flac'
			})
		])
		const malformed = structuredClone(local.observations)
		if (malformed[0]?.evidence.kind === 'localAudio') {
			malformed[0].evidence.fileIdentity.relativePath =
				'/Users/alice/private/Track.flac'
		}
		expect(() =>
			classifyTrackEnrichmentDraftReconnect(malformed, [])
		).toThrowError(
			expect.objectContaining<Partial<TrackEnrichmentDraftReconnectError>>({
				code: 'invalid-stored-identity'
			})
		)

		const duplicate = structuredClone(local.observations)
		if (
			duplicate[0]?.evidence.kind === 'localAudio' &&
			duplicate[1]?.evidence.kind === 'localAudio'
		) {
			duplicate[1].evidence.fileIdentity.relativePath =
				duplicate[0].evidence.fileIdentity.relativePath
		}
		expect(() =>
			classifyTrackEnrichmentDraftReconnect(duplicate, [])
		).toThrowError(
			expect.objectContaining<Partial<TrackEnrichmentDraftReconnectError>>({
				code: 'duplicate-stored-path'
			})
		)
	})
})
