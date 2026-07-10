import { describe, expect, it } from 'vitest'
import type { RekordboxXmlTrack } from './rekordboxXml'
import {
	buildTrackEnrichmentRows,
	buildTrackEnrichmentRowsAsync,
	buildTrackEnrichmentUpdate,
	mergeRekordboxAudioFeatures
} from './trackEnrichment'

function createRecord(overrides: Partial<DatabaseRecord> = {}): DatabaseRecord {
	return {
		id: 'record-1',
		user_id: 'user-1',
		title: 'Synthetic Album',
		artists: [{ name: 'Test Artist', role: null }],
		labels: [],
		year: 2024,
		cover: null,
		discogs_id: 1,
		discogs_release_url: null,
		created_at: null,
		updated_at: null,
		...overrides
	}
}

function createTrack(overrides: Partial<Track> = {}): Track {
	return {
		id: 'track-1',
		record_id: 'record-1',
		title: 'Cafe Track',
		artists: [{ name: 'Test Artist', role: null }],
		extraartists: [],
		position: 'A1',
		duration: 225000,
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
		updated_at: null,
		...overrides
	}
}

function createSource(
	overrides: Partial<RekordboxXmlTrack> = {}
): RekordboxXmlTrack {
	return {
		index: 0,
		trackId: '1',
		name: 'Cafe Track',
		artist: 'Test Artist',
		album: 'Synthetic Album',
		genre: 'House',
		kind: 'WAV File',
		totalTimeSeconds: 225,
		year: 2024,
		averageBpm: 128,
		dateAdded: '2026-07-09',
		bitRate: 1411,
		sampleRate: 44100,
		comments: null,
		playCount: 2,
		rating: 204,
		location: '/Users/example/Music/Collection/Synthetic Album/Cafe Track.wav',
		locationHint: 'Synthetic Album/Cafe Track.wav',
		remixer: null,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		label: 'Example Label',
		warnings: [],
		...overrides
	}
}

describe('buildTrackEnrichmentRows', () => {
	it('marks title, artist, album matches as high confidence and stages blank updates', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [createSource()],
			tracks: [createTrack()],
			records: [createRecord()]
		})

		expect(row).toMatchObject({
			confidence: 'high',
			canFillBpm: true,
			canFillKeyMode: true,
			defaultStaged: true,
			hasConflict: false
		})
	})

	it('uses high confidence when title and artist match and duration corroborates without album', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [
				createSource({ album: null, locationHint: 'Cafe Track.wav' })
			],
			tracks: [createTrack()],
			records: [createRecord({ title: 'Different Album' })]
		})

		expect(row?.confidence).toBe('high')
		expect(row?.defaultStaged).toBe(true)
	})

	it('rejects an exact title match when the artists are unrelated', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [createSource({ artist: 'Different Artist' })],
			tracks: [createTrack()],
			records: [createRecord()]
		})

		expect(row?.track).toBeNull()
		expect(row?.defaultStaged).toBe(false)
	})

	it('keeps featured or contained artist matches for manual confirmation', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [createSource({ artist: 'Test Artist feat. Guest Artist' })],
			tracks: [createTrack()],
			records: [createRecord()]
		})

		expect(row).toMatchObject({
			track: { id: 'track-1' },
			confidence: 'manual',
			defaultStaged: false
		})
		expect(row?.reasons).toContain('Partial artist match')
	})

	it('does not use Discogs extraartist credits as performer identity', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [createSource()],
			tracks: [
				createTrack({
					artists: [{ name: 'Different Artist', role: null }],
					extraartists: [{ name: 'Test Artist', role: 'Producer' }]
				})
			],
			records: [
				createRecord({ artists: [{ name: 'Different Artist', role: null }] })
			]
		})

		expect(row?.track).toBeNull()
	})

	it('does not let release artists override explicit track artists', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [createSource()],
			tracks: [
				createTrack({
					artists: [{ name: 'Different Artist', role: null }]
				})
			],
			records: [createRecord()]
		})

		expect(row?.track).toBeNull()
	})

	it('accepts small title and artist spelling differences with corroboration', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [
				createSource({
					name: 'Cafe Trak',
					artist: 'Test Artst',
					locationHint: 'Synthetic Album/Cafe Trak.wav'
				})
			],
			tracks: [createTrack()],
			records: [createRecord()]
		})

		expect(row).toMatchObject({
			track: { id: 'track-1' },
			confidence: 'high',
			defaultStaged: true
		})
		expect(row?.reasons).toContain('Close title match')
		expect(row?.reasons).toContain('Close artist match')
	})

	it('sends duration conflicts to manual review', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [createSource({ totalTimeSeconds: 400 })],
			tracks: [createTrack()],
			records: [createRecord()]
		})

		expect(row?.confidence).toBe('manual')
		expect(
			row?.warnings.some((warning) => warning.includes('Duration conflict'))
		).toBe(true)
	})

	it('sends existing value conflicts to manual review', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [createSource()],
			tracks: [createTrack({ bpm: 120 })],
			records: [createRecord()]
		})

		expect(row?.confidence).toBe('manual')
		expect(row?.hasConflict).toBe(true)
	})

	it('sends ambiguous matches to manual review', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [createSource()],
			tracks: [
				createTrack({ id: 'track-1' }),
				createTrack({ id: 'track-2', record_id: 'record-2' })
			],
			records: [
				createRecord({ id: 'record-1' }),
				createRecord({ id: 'record-2' })
			]
		})

		expect(row?.confidence).toBe('manual')
	})

	it('blocks equally ranked XML rows from updating the same track', () => {
		const rows = buildTrackEnrichmentRows({
			xmlTracks: [
				createSource({ index: 0, name: 'Untitled' }),
				createSource({ index: 1, name: 'Untitled' })
			],
			tracks: [createTrack({ title: 'Untitled' })],
			records: [createRecord()]
		})

		expect(rows).toHaveLength(2)
		expect(rows.every((row) => row.stagingBlockedReason !== null)).toBe(true)
		expect(rows.every((row) => row.defaultStaged === false)).toBe(true)
		expect(
			rows.every(
				(row) =>
					buildTrackEnrichmentUpdate(
						row,
						'collection.xml',
						'2026-07-09T00:00:00.000Z'
					) === null
			)
		).toBe(true)
	})
})

describe('buildTrackEnrichmentRowsAsync', () => {
	it('yields matching progress without changing the result', async () => {
		const xmlTracks = [
			createSource({ index: 0 }),
			createSource({
				index: 1,
				name: 'Different',
				locationHint: 'Different.wav'
			})
		]
		const options = {
			xmlTracks,
			tracks: [createTrack()],
			records: [createRecord()]
		}
		const progress: number[] = []

		const asyncRows = await buildTrackEnrichmentRowsAsync({
			...options,
			yieldEvery: 1,
			onProgress: (completed) => progress.push(completed)
		})

		expect(asyncRows).toEqual(buildTrackEnrichmentRows(options))
		expect(progress).toEqual([1, 2])
	})
})

describe('buildTrackEnrichmentUpdate', () => {
	it('fills only blank top-level values and writes audio feature provenance', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [createSource()],
			tracks: [createTrack()],
			records: [createRecord()]
		})

		const update = buildTrackEnrichmentUpdate(
			row!,
			'collection.xml',
			'2026-07-09T00:00:00.000Z'
		)

		expect(update?.updates).toMatchObject({
			bpm: 128,
			key: 9,
			mode: 0,
			audio_features: {
				version: 1,
				applied: {
					bpm: {
						source: 'rekordboxXml',
						appliedAt: '2026-07-09T00:00:00.000Z'
					},
					keyMode: {
						source: 'rekordboxXml',
						appliedAt: '2026-07-09T00:00:00.000Z'
					}
				},
				sources: {
					rekordboxXml: {
						fileName: 'collection.xml',
						locationHint: 'Synthetic Album/Cafe Track.wav'
					}
				}
			}
		})
		expect(update?.preconditions).toEqual({
			bpmMustBeNull: true,
			keyModeMustBeNull: true
		})
	})

	it('does not treat key 0 as blank', () => {
		const [row] = buildTrackEnrichmentRows({
			xmlTracks: [createSource({ parsedKey: 9, parsedMode: 0 })],
			tracks: [createTrack({ bpm: null, key: 0, mode: 1 })],
			records: [createRecord()]
		})

		const update = buildTrackEnrichmentUpdate(
			row!,
			'collection.xml',
			'2026-07-09T00:00:00.000Z'
		)

		expect(update?.updates.bpm).toBe(128)
		expect(update?.updates.key).toBeUndefined()
		expect(update?.updates.mode).toBeUndefined()
	})
})

describe('mergeRekordboxAudioFeatures', () => {
	it('preserves other source keys while replacing the Rekordbox XML source', () => {
		const merged = mergeRekordboxAudioFeatures(
			{
				version: 1,
				updatedAt: '2026-07-08T00:00:00.000Z',
				applied: {
					bpm: null,
					keyMode: null
				},
				match: {
					confidence: 'manual',
					score: 0,
					reasons: [],
					warnings: []
				},
				sources: {
					embeddedTags: {
						importedAt: '2026-07-08T00:00:00.000Z',
						raw: { bpm: 127 }
					}
				}
			},
			{
				importedAt: '2026-07-09T00:00:00.000Z',
				fileName: 'collection.xml',
				name: 'Cafe Track',
				artist: 'Test Artist',
				album: 'Synthetic Album',
				genre: null,
				locationHint: null,
				averageBpm: 128,
				tonality: '8A',
				parsedKey: 9,
				parsedMode: 0,
				totalTimeSeconds: 225,
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
			},
			{
				confidence: 'high',
				score: 100,
				reasons: ['Title match'],
				warnings: []
			},
			{
				bpm: false,
				keyMode: true
			},
			'2026-07-09T00:00:00.000Z'
		)

		expect(merged.sources.embeddedTags?.raw).toEqual({ bpm: 127 })
		expect(merged.sources.rekordboxXml?.fileName).toBe('collection.xml')
		expect(merged.applied.bpm).toBeNull()
		expect(merged.applied.keyMode?.source).toBe('rekordboxXml')
	})
})
