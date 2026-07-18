import { describe, expect, it } from 'vitest'
import type { Database } from '../../shared/types/database'
import {
	decodeRecordRow,
	decodeSavedSetRow,
	decodeTrackRow
} from './supabaseRows'

type RecordRow = Database['public']['Tables']['records']['Row']
type TrackRow = Database['public']['Tables']['tracks']['Row']
type SavedSetRow = Database['public']['Tables']['sets']['Row']

function createRecordRow(overrides: Partial<RecordRow> = {}): RecordRow {
	return {
		id: 'record-synthetic',
		user_id: 'user-synthetic',
		title: 'Synthetic record',
		artists: [{ discogs_id: 1, name: 'Synthetic artist', role: null }],
		labels: [{ discogs_id: 2, name: 'Synthetic label', catno: 'SYN-1' }],
		year: 2026,
		cover: null,
		discogs_id: 3,
		discogs_release_url: null,
		created_at: '2026-07-12T00:00:00.000Z',
		updated_at: '2026-07-12T00:00:00.000Z',
		...overrides,
		cover_storage_path: overrides.cover_storage_path ?? null
	}
}

const validAudioFeatures = {
	version: 1,
	updatedAt: '2026-07-12T00:00:00.000Z',
	applied: {
		bpm: {
			source: 'rekordboxXml',
			appliedAt: '2026-07-12T00:00:00.000Z'
		},
		keyMode: {
			source: 'embeddedTags',
			appliedAt: '2026-07-12T00:00:00.000Z'
		}
	},
	match: {
		confidence: 'high',
		score: 0,
		reasons: ['Synthetic reason'],
		warnings: []
	},
	sources: {
		rekordboxXml: {
			importedAt: '2026-07-12T00:00:00.000Z',
			fileName: 'synthetic.xml',
			name: null,
			artist: null,
			album: null,
			genre: null,
			locationHint: null,
			averageBpm: 0,
			tonality: null,
			parsedKey: 0,
			parsedMode: 0,
			totalTimeSeconds: 0,
			year: 0,
			kind: null,
			sampleRate: 0,
			bitRate: 0,
			rating: 0,
			playCount: 0,
			comments: null,
			remixer: null,
			label: null,
			dateAdded: null
		},
		embeddedTags: {
			importedAt: '2026-07-12T00:00:00.000Z',
			fileName: 'synthetic.wav',
			locationHint: null,
			fileSize: 0,
			lastModified: 0,
			title: null,
			artist: null,
			album: null,
			genres: [],
			durationSeconds: 0,
			bpm: 0,
			key: null
		},
		essentiaBrowser: {
			importedAt: '2026-07-12T00:00:00.000Z',
			analyzerVersion: 'synthetic',
			configurationVersion: 'synthetic',
			bpm: 0,
			bpmConfidence: 0,
			bpmEstimates: [0, 1],
			key: null,
			scale: null,
			keyStrength: 0,
			sampleRate: 0,
			durationSeconds: 0,
			analyzedDurationSeconds: 0,
			analysisOffsetSeconds: 0,
			warnings: [],
			futureConfiguration: { enabled: true }
		},
		futureAnalyzer: {
			analyzerVersion: 'future',
			scores: [0, 1]
		}
	},
	futureRootField: 'preserved'
}

type AudioMutation = {
	description: string
	path: string[]
	invalidValue: unknown
}

function mutationsFor(
	parentPath: string[],
	fields: string[],
	invalidValue: unknown
): AudioMutation[] {
	return fields.map((field) => {
		const path = [...parentPath, field]
		return { description: path.join('.'), path, invalidValue }
	})
}

function setNestedValue(
	root: Record<string, unknown>,
	path: string[],
	value: unknown
): void {
	let target = root
	for (const segment of path.slice(0, -1)) {
		const child = target[segment]
		if (typeof child !== 'object' || child === null || Array.isArray(child)) {
			throw new Error(`Invalid fixture path: ${path.join('.')}`)
		}
		target = child as Record<string, unknown>
	}

	const field = path.at(-1)
	if (!field) throw new Error('Audio mutation path must not be empty')
	target[field] = value
}

function invalidAudioFeaturesFor(
	mutation: AudioMutation
): TrackRow['audio_features'] {
	const audioFeatures = structuredClone(
		validAudioFeatures
	) as unknown as Record<string, unknown>
	setNestedValue(audioFeatures, mutation.path, mutation.invalidValue)
	return audioFeatures as TrackRow['audio_features']
}

const audioMutations: AudioMutation[] = [
	{ description: 'version', path: ['version'], invalidValue: 2 },
	...mutationsFor([], ['updatedAt'], 7),
	{ description: 'applied object', path: ['applied'], invalidValue: null },
	...mutationsFor(['applied'], ['bpm', 'keyMode'], 'invalid'),
	...mutationsFor(['applied', 'bpm'], ['source'], 'futureSource'),
	...mutationsFor(['applied', 'bpm'], ['appliedAt'], 7),
	...mutationsFor(['applied', 'keyMode'], ['source'], 'futureSource'),
	...mutationsFor(['applied', 'keyMode'], ['appliedAt'], 7),
	{ description: 'match object', path: ['match'], invalidValue: null },
	...mutationsFor(['match'], ['confidence'], 'futureConfidence'),
	...mutationsFor(['match'], ['score'], Infinity),
	...mutationsFor(['match'], ['reasons', 'warnings'], ['valid', 7]),
	{ description: 'sources object', path: ['sources'], invalidValue: null },
	...mutationsFor(
		['sources'],
		['rekordboxXml', 'embeddedTags', 'essentiaBrowser'],
		null
	),
	...mutationsFor(['sources', 'rekordboxXml'], ['importedAt', 'fileName'], 7),
	...mutationsFor(
		['sources', 'rekordboxXml'],
		[
			'name',
			'artist',
			'album',
			'genre',
			'locationHint',
			'tonality',
			'kind',
			'comments',
			'remixer',
			'label',
			'dateAdded'
		],
		7
	),
	...mutationsFor(
		['sources', 'rekordboxXml'],
		[
			'averageBpm',
			'parsedKey',
			'parsedMode',
			'totalTimeSeconds',
			'year',
			'sampleRate',
			'bitRate',
			'rating',
			'playCount'
		],
		Infinity
	),
	...mutationsFor(['sources', 'embeddedTags'], ['importedAt', 'fileName'], 7),
	...mutationsFor(
		['sources', 'embeddedTags'],
		['locationHint', 'title', 'artist', 'album', 'key'],
		7
	),
	...mutationsFor(
		['sources', 'embeddedTags'],
		['fileSize', 'lastModified'],
		Infinity
	),
	...mutationsFor(
		['sources', 'embeddedTags'],
		['durationSeconds', 'bpm'],
		Infinity
	),
	...mutationsFor(['sources', 'embeddedTags'], ['genres'], ['valid', 7]),
	...mutationsFor(
		['sources', 'essentiaBrowser'],
		['importedAt', 'analyzerVersion', 'configurationVersion'],
		7
	),
	...mutationsFor(['sources', 'essentiaBrowser'], ['key', 'scale'], 7),
	...mutationsFor(
		['sources', 'essentiaBrowser'],
		['bpm', 'bpmConfidence', 'keyStrength'],
		Infinity
	),
	...mutationsFor(
		['sources', 'essentiaBrowser'],
		[
			'sampleRate',
			'durationSeconds',
			'analyzedDurationSeconds',
			'analysisOffsetSeconds'
		],
		Infinity
	),
	...mutationsFor(
		['sources', 'essentiaBrowser'],
		['bpmEstimates'],
		[0, Infinity]
	),
	...mutationsFor(['sources', 'essentiaBrowser'], ['warnings'], ['valid', 7])
]

function createTrackRow(overrides: Partial<TrackRow> = {}): TrackRow {
	return {
		id: 'track-synthetic',
		record_id: 'record-synthetic',
		title: 'Synthetic track',
		artists: [{ discogs_id: 1, name: 'Synthetic artist', role: null }],
		extraartists: [],
		genres: ['Synthetic genre'],
		beatport_data: null,
		audio_features: null,
		position: 'A1',
		duration: 0,
		bpm: 0,
		rpm: 0,
		key: 0,
		mode: 0,
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true,
		created_at: '2026-07-12T00:00:00.000Z',
		updated_at: '2026-07-12T00:00:00.000Z',
		...overrides
	}
}

function createSavedSetRow(overrides: Partial<SavedSetRow> = {}): SavedSetRow {
	return {
		id: 'set-synthetic',
		user_id: 'user-synthetic',
		name: 'Synthetic set',
		played_tracks: [],
		created_at: '2026-07-12T00:00:00.000Z',
		updated_at: '2026-07-12T00:00:00.000Z',
		...overrides
	}
}

describe('decodeRecordRow', () => {
	it('round-trips valid artist and label arrays', () => {
		const row = createRecordRow()

		const decoded = decodeRecordRow(row)

		expect(decoded.row).toEqual(row)
		expect(decoded.row.artists).toBe(row.artists)
		expect(decoded.row.labels).toBe(row.labels)
		expect(decoded.issues).toEqual([])
	})

	const invalidRecordFields: Array<{
		field: 'artists' | 'labels'
		overrides: Partial<RecordRow>
	}> = [
		{
			field: 'artists',
			overrides: { artists: [{ name: 'Invalid', discogs_id: Infinity }] }
		},
		{
			field: 'labels',
			overrides: { labels: [{ name: 'Invalid', discogs_id: Number.NaN }] }
		}
	]

	it.each(invalidRecordFields)(
		'resets invalid $field arrays',
		({ field, overrides }) => {
			const decoded = decodeRecordRow(createRecordRow(overrides))

			expect(decoded.row[field]).toEqual([])
			expect(decoded.issues).toEqual([
				{ entity: 'record', id: 'record-synthetic', field }
			])
		}
	)
})

describe('decodeTrackRow', () => {
	it('round-trips valid JSON fields, zero values, and unknown v1 metadata', () => {
		const beatportData = {
			accessed: 0,
			url: 'https://synthetic.invalid/track',
			genre: 'Synthetic genre',
			bpm: null,
			key: 'Synthetic key',
			img: 'https://synthetic.invalid/image'
		}
		const row = createTrackRow({
			beatport_data: beatportData,
			audio_features: validAudioFeatures
		})

		const decoded = decodeTrackRow(row)

		expect(decoded.row).toEqual(row)
		expect(decoded.row.beatport_data).toBe(beatportData)
		expect(decoded.row.audio_features).toBe(validAudioFeatures)
		expect(decoded.row.audio_features).toHaveProperty(
			'sources.futureAnalyzer',
			validAudioFeatures.sources.futureAnalyzer
		)
		expect(decoded.issues).toEqual([])
	})

	it('round-trips a valid historical Beatport not-found marker', () => {
		const marker = { searched: true, notFound: true, searchedAt: 0 }
		const decoded = decodeTrackRow(createTrackRow({ beatport_data: marker }))

		expect(decoded.row.beatport_data).toBe(marker)
		expect(decoded.issues).toEqual([])
	})

	const invalidTrackArrayFields: Array<{
		field: 'artists' | 'extraartists' | 'genres'
		overrides: Partial<TrackRow>
	}> = [
		{ field: 'artists', overrides: { artists: [{ name: '' }] } },
		{
			field: 'extraartists',
			overrides: { extraartists: ['not-an-artist'] }
		},
		{ field: 'genres', overrides: { genres: ['valid', 7] } }
	]

	it.each(invalidTrackArrayFields)(
		'resets an invalid $field array',
		({ field, overrides }) => {
			const decoded = decodeTrackRow(createTrackRow(overrides))

			expect(decoded.row[field]).toEqual([])
			expect(decoded.issues).toEqual([
				{ entity: 'track', id: 'track-synthetic', field }
			])
		}
	)

	it.each([
		{ searched: false, notFound: true, searchedAt: 0 },
		{
			accessed: Infinity,
			url: 'https://synthetic.invalid',
			genre: 'Synthetic',
			bpm: 0,
			key: 'Synthetic',
			img: 'https://synthetic.invalid/image'
		},
		{
			accessed: 0,
			url: 'https://synthetic.invalid',
			genre: 'Synthetic',
			bpm: Number.NaN,
			key: 'Synthetic',
			img: 'https://synthetic.invalid/image'
		}
	])('resets invalid Beatport data to null', (beatportData) => {
		const decoded = decodeTrackRow(
			createTrackRow({ beatport_data: beatportData })
		)

		expect(decoded.row.beatport_data).toBeNull()
		expect(decoded.issues).toEqual([
			{
				entity: 'track',
				id: 'track-synthetic',
				field: 'beatport_data'
			}
		])
	})

	it.each(audioMutations)(
		'resets audio features with invalid $description',
		(mutation) => {
			const decoded = decodeTrackRow(
				createTrackRow({
					audio_features: invalidAudioFeaturesFor(mutation)
				})
			)

			expect(decoded.row.audio_features).toBeNull()
			expect(decoded.issues).toEqual([
				{
					entity: 'track',
					id: 'track-synthetic',
					field: 'audio_features'
				}
			])
		}
	)

	it('reports only redacted identity and field metadata', () => {
		const sensitivePayload = 'SYNTHETIC_PRIVATE_VALUE'
		const decoded = decodeTrackRow(
			createTrackRow({
				artists: [{ name: sensitivePayload, discogs_id: Infinity }],
				genres: [sensitivePayload, 7]
			})
		)

		expect(decoded.issues).toEqual([
			{ entity: 'track', id: 'track-synthetic', field: 'artists' },
			{ entity: 'track', id: 'track-synthetic', field: 'genres' }
		])
		expect(JSON.stringify(decoded.issues)).not.toContain(sensitivePayload)
	})
})

describe('decodeSavedSetRow', () => {
	const firstValidEntry = {
		track_id: 'track-first',
		time_added: 0,
		adjusted_bpm: 0,
		transition_rating: 1
	}
	const secondValidEntry = {
		track_id: 'track-second',
		time_added: 1,
		adjusted_bpm: null,
		transition_rating: null
	}

	it('round-trips a valid played-track array', () => {
		const row = createSavedSetRow({
			played_tracks: [firstValidEntry, secondValidEntry]
		})

		const decoded = decodeSavedSetRow(row)

		expect(decoded.row).toEqual(row)
		expect(decoded.issues).toEqual([])
	})

	it('resets a non-array played_tracks value', () => {
		const decoded = decodeSavedSetRow(
			createSavedSetRow({ played_tracks: { invalid: true } })
		)

		expect(decoded.row.played_tracks).toEqual([])
		expect(decoded.issues).toEqual([
			{
				entity: 'saved-set',
				id: 'set-synthetic',
				field: 'played_tracks'
			}
		])
	})

	it.each([
		{ track_id: '', time_added: 0, adjusted_bpm: 0, transition_rating: 1 },
		{
			track_id: 'track',
			time_added: -1,
			adjusted_bpm: 0,
			transition_rating: 1
		},
		{
			track_id: 'track',
			time_added: 0,
			adjusted_bpm: Infinity,
			transition_rating: 1
		},
		{
			track_id: 'track',
			time_added: 0,
			adjusted_bpm: 0,
			transition_rating: 2.5
		},
		{
			track_id: 'track',
			time_added: 0,
			adjusted_bpm: 0,
			transition_rating: 6
		}
	])('omits an invalid played-track entry', (invalidEntry) => {
		const decoded = decodeSavedSetRow(
			createSavedSetRow({ played_tracks: [invalidEntry] })
		)

		expect(decoded.row.played_tracks).toEqual([])
		expect(decoded.issues).toHaveLength(1)
	})

	it('retains valid mixed-array entries in their original order', () => {
		const decoded = decodeSavedSetRow(
			createSavedSetRow({
				played_tracks: [
					firstValidEntry,
					{
						track_id: '',
						time_added: 2,
						adjusted_bpm: null,
						transition_rating: null
					},
					secondValidEntry
				]
			})
		)

		expect(decoded.row.played_tracks).toEqual([
			firstValidEntry,
			secondValidEntry
		])
		expect(decoded.issues).toEqual([
			{
				entity: 'saved-set',
				id: 'set-synthetic',
				field: 'played_tracks'
			}
		])
	})
})
