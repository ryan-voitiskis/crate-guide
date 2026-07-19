import { describe, expect, it } from 'vitest'
import { createLocalAudioTrackSource } from './localAudio'
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
		...overrides,
		cover_storage_path: overrides.cover_storage_path ?? null
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
		sourceType: 'rekordboxXml',
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

function createLocalSource(input: {
	bpm?: number | null
	key?: string | null
	analysis?: boolean
}) {
	return createLocalAudioTrackSource({
		index: 0,
		fileName: 'Cafe Track.flac',
		relativePath: 'Test Artist/Synthetic Album/Cafe Track.flac',
		fileSize: 1024,
		lastModified: 1,
		tags: {
			title: 'Cafe Track',
			artist: 'Test Artist',
			album: 'Synthetic Album',
			genres: ['House'],
			durationSeconds: 225,
			bpm: input.bpm ?? null,
			key: input.key ?? null
		},
		analysis: input.analysis
			? {
					analyzerVersion: 'essentia.js@0.1.3',
					configurationVersion: 'center-180s-44k1-v1',
					bpm: 128,
					bpmConfidence: 3.2,
					bpmEstimates: [128],
					key: 'A',
					scale: 'minor',
					keyStrength: 0.7,
					sampleRate: 44100,
					durationSeconds: 225,
					analyzedDurationSeconds: 180,
					analysisOffsetSeconds: 22.5,
					warnings: []
				}
			: null
	})
}

describe('buildTrackEnrichmentRows', () => {
	it('characterizes exact, fuzzy-boundary, normalized-variant, and stable-tie matching', () => {
		const cases = [
			{
				name: 'exact title',
				sourceTitle: 'Nova',
				candidateTitle: 'Nova',
				matched: true
			},
			{
				name: 'short title typo',
				sourceTitle: 'Nove',
				candidateTitle: 'Nova',
				matched: false
			},
			{
				name: 'seven-character typo below the similarity boundary',
				sourceTitle: 'abcxefg',
				candidateTitle: 'abcdefg',
				matched: false
			},
			{
				name: 'eight-character typo at the similarity boundary',
				sourceTitle: 'abcxefgh',
				candidateTitle: 'abcdefgh',
				matched: true
			},
			{
				name: 'long title first-character mismatch',
				sourceTitle: 'xbcdefgh',
				candidateTitle: 'abcdefgh',
				matched: false
			},
			{
				name: 'eligible long-title length difference',
				sourceTitle: 'abcdefghij',
				candidateTitle: 'abcdefghijk',
				matched: true
			}
		]

		for (const testCase of cases) {
			const [row] = buildTrackEnrichmentRows({
				sources: [
					createSource({
						name: testCase.sourceTitle,
						artist: null,
						album: null,
						locationHint: null,
						totalTimeSeconds: null
					})
				],
				tracks: [
					createTrack({
						title: testCase.candidateTitle,
						artists: [],
						duration: null
					})
				],
				records: []
			})

			expect(!!row?.track, testCase.name).toBe(testCase.matched)
		}

		const [variantRow] = buildTrackEnrichmentRows({
			sources: [
				createSource({
					name: 'Unrelated metadata title',
					artist: null,
					album: null,
					locationHint: 'Album/01 - Cafe Track.wav',
					totalTimeSeconds: null
				})
			],
			tracks: [
				createTrack({ id: 'variant', title: 'Café Track', artists: [] }),
				createTrack({ id: 'tie', title: 'Cafe Track (2024)', artists: [] })
			],
			records: []
		})

		expect(variantRow).toMatchObject({
			track: { id: 'variant' },
			score: 53,
			reasons: ['Title match'],
			warnings: ['Multiple Crate Guide tracks have similar match scores'],
			confidence: 'manual'
		})
	})

	it('keeps deterministic exhaustive-corpus enrichment output', () => {
		const tracks = [
			createTrack({ id: 'track-exact', title: 'Cafe Track' }),
			createTrack({
				id: 'track-fuzzy',
				title: 'Midnight Signals',
				duration: 240000
			}),
			createTrack({ id: 'track-short', title: 'Nova', duration: null })
		]
		const sources = [
			createSource({ index: 0 }),
			createSource({
				index: 1,
				name: 'Midnight Signal',
				locationHint: null,
				totalTimeSeconds: 240,
				album: null
			}),
			createSource({
				index: 2,
				name: 'Nove',
				artist: null,
				album: null,
				locationHint: null,
				totalTimeSeconds: null
			}),
			createSource({
				index: 3,
				name: null,
				artist: null,
				album: null,
				locationHint: null,
				totalTimeSeconds: null
			})
		]

		const rows = buildTrackEnrichmentRows({ sources, tracks, records: [] })

		expect(
			rows.map((row) => ({
				id: row.id,
				trackId: row.track?.id ?? null,
				confidence: row.confidence,
				score: row.score,
				reasons: row.reasons,
				warnings: row.warnings,
				canFillBpm: row.canFillBpm,
				canFillKeyMode: row.canFillKeyMode,
				defaultStaged: row.defaultStaged,
				stagingBlockedReason: row.stagingBlockedReason
			}))
		).toEqual([
			{
				id: 'rekordboxXml-0-track-exact',
				trackId: 'track-exact',
				confidence: 'high',
				score: 90,
				reasons: ['Title match', 'Artist match', 'Duration corroborates'],
				warnings: [],
				canFillBpm: true,
				canFillKeyMode: true,
				defaultStaged: true,
				stagingBlockedReason: null
			},
			{
				id: 'rekordboxXml-1-track-fuzzy',
				trackId: 'track-fuzzy',
				confidence: 'high',
				score: 89,
				reasons: ['Close title match', 'Artist match', 'Duration corroborates'],
				warnings: [],
				canFillBpm: true,
				canFillKeyMode: true,
				defaultStaged: true,
				stagingBlockedReason: null
			},
			{
				id: 'source-rekordboxXml-2',
				trackId: null,
				confidence: 'manual',
				score: 0,
				reasons: [],
				warnings: ['No matching Crate Guide track found'],
				canFillBpm: false,
				canFillKeyMode: false,
				defaultStaged: false,
				stagingBlockedReason: null
			},
			{
				id: 'source-rekordboxXml-3',
				trackId: null,
				confidence: 'manual',
				score: 0,
				reasons: [],
				warnings: ['No matching Crate Guide track found'],
				canFillBpm: false,
				canFillKeyMode: false,
				defaultStaged: false,
				stagingBlockedReason: null
			}
		])
	})

	it('auto-stages strong local matches backed by embedded tags', () => {
		const [row] = buildTrackEnrichmentRows({
			sources: [createLocalSource({ bpm: 128, key: 'A minor' })],
			tracks: [createTrack()],
			records: [createRecord()]
		})

		expect(row).toMatchObject({
			confidence: 'high',
			defaultStaged: true,
			proposedBpmSource: 'embeddedTags',
			proposedKeyModeSource: 'embeddedTags'
		})
	})

	it('requires manual staging for Essentia-derived values', () => {
		const [row] = buildTrackEnrichmentRows({
			sources: [createLocalSource({ analysis: true })],
			tracks: [createTrack()],
			records: [createRecord()]
		})

		expect(row).toMatchObject({
			confidence: 'high',
			defaultStaged: false,
			proposedBpmSource: 'essentiaBrowser',
			proposedKeyModeSource: null,
			canFillKeyMode: false
		})
	})

	it('marks title, artist, album matches as high confidence and stages blank updates', () => {
		const [row] = buildTrackEnrichmentRows({
			sources: [createSource()],
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
			sources: [createSource({ album: null, locationHint: 'Cafe Track.wav' })],
			tracks: [createTrack()],
			records: [createRecord({ title: 'Different Album' })]
		})

		expect(row?.confidence).toBe('high')
		expect(row?.defaultStaged).toBe(true)
	})

	it('rejects an exact title match when the artists are unrelated', () => {
		const [row] = buildTrackEnrichmentRows({
			sources: [createSource({ artist: 'Different Artist' })],
			tracks: [createTrack()],
			records: [createRecord()]
		})

		expect(row?.track).toBeNull()
		expect(row?.defaultStaged).toBe(false)
	})

	it('keeps featured or contained artist matches for manual confirmation', () => {
		const [row] = buildTrackEnrichmentRows({
			sources: [createSource({ artist: 'Test Artist feat. Guest Artist' })],
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
			sources: [createSource()],
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
			sources: [createSource()],
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
			sources: [
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
			sources: [createSource({ totalTimeSeconds: 400 })],
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
			sources: [createSource()],
			tracks: [createTrack({ bpm: 120 })],
			records: [createRecord()]
		})

		expect(row?.confidence).toBe('manual')
		expect(row?.hasConflict).toBe(true)
	})

	it('sends ambiguous matches to manual review', () => {
		const [row] = buildTrackEnrichmentRows({
			sources: [createSource()],
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
			sources: [
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
		const sources = [
			createSource({ index: 0 }),
			createSource({
				index: 1,
				name: 'Different',
				locationHint: 'Different.wav'
			})
		]
		const options = {
			sources,
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
	it('stores sanitized local metadata and exact applied provenance', () => {
		const [row] = buildTrackEnrichmentRows({
			sources: [createLocalSource({ analysis: true })],
			tracks: [createTrack()],
			records: [createRecord()]
		})
		const update = buildTrackEnrichmentUpdate(
			row!,
			'Local audio',
			'2026-07-10T00:00:00.000Z'
		)

		expect(update?.updates.audio_features).toMatchObject({
			applied: {
				bpm: { source: 'essentiaBrowser' },
				keyMode: null
			},
			sources: {
				embeddedTags: {
					fileName: 'Cafe Track.flac',
					locationHint: 'Test Artist/Synthetic Album/Cafe Track.flac'
				},
				essentiaBrowser: {
					configurationVersion: 'center-180s-44k1-v1',
					bpm: 128
				}
			}
		})
		expect(JSON.stringify(update?.updates.audio_features)).not.toContain(
			'/Users/'
		)
	})

	it('fills only blank top-level values and writes audio feature provenance', () => {
		const [row] = buildTrackEnrichmentRows({
			sources: [createSource()],
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
			sources: [createSource({ parsedKey: 9, parsedMode: 0 })],
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
						fileName: 'track.flac',
						locationHint: 'Album/track.flac',
						fileSize: 1024,
						lastModified: 0,
						title: 'Cafe Track',
						artist: 'Test Artist',
						album: 'Synthetic Album',
						genres: ['House'],
						durationSeconds: 225,
						bpm: 127,
						key: null
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

		expect(merged.sources.embeddedTags?.bpm).toBe(127)
		expect(merged.sources.rekordboxXml?.fileName).toBe('collection.xml')
		expect(merged.applied.bpm).toBeNull()
		expect(merged.applied.keyMode?.source).toBe('rekordboxXml')
	})
})
