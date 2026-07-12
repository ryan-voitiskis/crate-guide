import { describe, expect, it } from 'vitest'
import {
	type TrackEditorFormValues,
	buildTrackEditorPayload,
	createTrackEditorInitialValues,
	hasTrackEditorChanges,
	trackEditorSchema,
	trackToEditorValues
} from './trackEditor'

function createTrack(overrides: Partial<Track> = {}): Track {
	return {
		id: 'track-1',
		record_id: 'record-1',
		title: 'Test Track',
		artists: [{ discogs_id: 1, name: 'Test Artist', role: null }],
		extraartists: [{ name: 'Guest Artist', role: 'Vocals' }],
		position: 'A1',
		duration: 180000,
		bpm: 128,
		rpm: 33,
		key: 0,
		mode: 0,
		genres: ['House'],
		time_signature_upper: 4,
		time_signature_lower: 4,
		playable: true,
		beatport_data: null,
		audio_features: null,
		created_at: null,
		updated_at: null,
		...overrides
	}
}

function createValues(
	overrides: Partial<TrackEditorFormValues> = {}
): TrackEditorFormValues {
	return {
		...trackToEditorValues(createTrack()),
		...overrides
	}
}

describe('track editor values', () => {
	it('creates fresh initial arrays for every form', () => {
		const first = createTrackEditorInitialValues()
		const second = createTrackEditorInitialValues()

		expect(first).toEqual({
			title: '',
			position: '',
			duration: '',
			bpm: '',
			keyComposite: 'none',
			genres: [],
			rpm: null,
			playable: true,
			time_signature_upper: null,
			time_signature_lower: null
		})
		expect(first).not.toBe(second)
		expect(first.genres).not.toBe(second.genres)
	})

	it('hydrates milliseconds and preserves zero-valued key and mode', () => {
		expect(trackToEditorValues(createTrack())).toMatchObject({
			duration: '3:00',
			bpm: '128',
			keyComposite: '000'
		})
	})
})

describe('buildTrackEditorPayload', () => {
	it('uses the existing duration, BPM, and composite-key conversions', () => {
		const payload = buildTrackEditorPayload(
			createValues({ duration: '3:45', bpm: '128.5', keyComposite: '109' }),
			[],
			[]
		)

		expect(payload).toMatchObject({
			duration: 225000,
			bpm: 128.5,
			key: 9,
			mode: 1
		})
	})

	it('trims title and position and normalizes blank optional strings to null', () => {
		const payload = buildTrackEditorPayload(
			createValues({
				title: '  Test Track  ',
				position: '   ',
				duration: '',
				bpm: '',
				keyComposite: 'none'
			}),
			[],
			[]
		)

		expect(payload).toMatchObject({
			title: 'Test Track',
			position: null,
			duration: null,
			bpm: null,
			key: null,
			mode: null
		})
	})

	it('filters invalid artists consistently for both artist collections', () => {
		const validArtist = { discogs_id: 7, name: 'Valid Artist', role: null }
		const invalidArtist = { name: '   ', role: null }
		const payload = buildTrackEditorPayload(
			createValues(),
			[validArtist, invalidArtist],
			[invalidArtist, validArtist]
		)

		expect(payload.artists).toEqual([validArtist])
		expect(payload.extraartists).toEqual([validArtist])
	})
})

describe('hasTrackEditorChanges', () => {
	it('treats an unchanged non-zero duration and zero key/mode as unchanged', () => {
		const track = createTrack()
		const values = trackToEditorValues(track)

		expect(
			hasTrackEditorChanges(track, values, track.artists, track.extraartists)
		).toBe(false)
	})

	it.each([
		['zero duration', { duration: 0 }],
		['non-whole-second duration', { duration: 180999 }],
		[
			'padded title and position',
			{ title: '  Test Track  ', position: '  A1  ' }
		],
		['whitespace-only optional position', { position: '   ' }],
		[
			'invalid artist and extra-artist entries',
			{
				artists: [
					{ discogs_id: 1, name: 'Test Artist', role: null },
					{ name: '   ', role: null }
				],
				extraartists: [
					{ name: 'Guest Artist', role: 'Vocals' },
					{ name: '', role: null }
				]
			}
		],
		['key without mode', { key: 0, mode: null }],
		['mode without key', { key: null, mode: 0 }]
	] satisfies Array<[string, Partial<Track>]>)(
		'normalizes an unchanged legacy %s',
		(_label, overrides) => {
			const track = createTrack(overrides)
			const values = trackToEditorValues(track)

			expect(
				hasTrackEditorChanges(track, values, track.artists, track.extraartists)
			).toBe(false)
		}
	)

	it('still detects a semantic edit from a normalized legacy baseline', () => {
		const track = createTrack({
			title: '  Test Track  ',
			position: '   ',
			duration: 180999,
			key: 0,
			mode: null,
			artists: [
				{ discogs_id: 1, name: 'Test Artist', role: null },
				{ name: '   ', role: null }
			]
		})
		const values = trackToEditorValues(track)

		expect(
			hasTrackEditorChanges(
				track,
				{ ...values, duration: '3:01' },
				track.artists,
				track.extraartists
			)
		).toBe(true)
	})

	it.each([
		['title', { title: 'Changed' }],
		['position', { position: 'B1' }],
		['duration', { duration: '3:01' }],
		['BPM', { bpm: '129' }],
		['RPM', { rpm: 45 }],
		['key', { keyComposite: '001' }],
		['mode', { keyComposite: '100' }],
		['genres', { genres: ['Techno'] }],
		['upper time signature', { time_signature_upper: 3 }],
		['lower time signature', { time_signature_lower: 8 }],
		['playable state', { playable: false }]
	])('detects a change to %s', (_label, change) => {
		const track = createTrack()

		expect(
			hasTrackEditorChanges(
				track,
				createValues(change),
				track.artists,
				track.extraartists
			)
		).toBe(true)
	})

	it('detects artist and extra-artist changes independently', () => {
		const track = createTrack()
		const values = trackToEditorValues(track)

		expect(
			hasTrackEditorChanges(
				track,
				values,
				[{ name: 'Different Artist' }],
				track.extraartists
			)
		).toBe(true)
		expect(
			hasTrackEditorChanges(track, values, track.artists, [
				{ name: 'Different Guest' }
			])
		).toBe(true)
	})

	it('keeps equal arrays unchanged and treats their order as significant', () => {
		const artists = [
			{ name: 'Artist One' },
			{ name: 'Artist Two', role: 'Remix' }
		]
		const track = createTrack({
			artists,
			extraartists: [],
			genres: ['House', 'Disco']
		})
		const values = trackToEditorValues(track)

		expect(hasTrackEditorChanges(track, values, [...artists], [])).toBe(false)
		expect(
			hasTrackEditorChanges(
				track,
				{ ...values, genres: ['Disco', 'House'] },
				[...artists],
				[]
			)
		).toBe(true)
		expect(
			hasTrackEditorChanges(track, values, [...artists].reverse(), [])
		).toBe(true)
	})
})

describe('trackEditorSchema', () => {
	it('accepts the existing optional formats and zero composite key', () => {
		expect(
			trackEditorSchema.safeParse({
				...createTrackEditorInitialValues(),
				title: 'Test Track',
				position: 'A1-A2',
				duration: '99:59',
				bpm: '300',
				keyComposite: '000'
			}).success
		).toBe(true)
	})

	it.each([
		['title', '', 'Title is required'],
		['position', 'side one', 'Position must be empty or like A1, B2, or A1-A2'],
		['duration', '3:60', 'Duration must be empty or MM:SS format (e.g., 3:45)'],
		['bpm', '301', 'BPM must be empty or a number between 30-300'],
		['keyComposite', 'bad', 'Please select a valid key or leave unspecified']
	])('preserves the validation message for %s', (field, value, message) => {
		const result = trackEditorSchema.safeParse({
			...createTrackEditorInitialValues(),
			title: 'Test Track',
			[field]: value
		})

		expect(result.success).toBe(false)
		if (result.success) return
		expect(result.error.issues).toContainEqual(
			expect.objectContaining({ path: [field], message })
		)
	})
})
