import { createMockRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { describe, expect, it } from 'vitest'
import {
	buildLoadTrackRecordResults,
	getLoadTrackPreview
} from './loadTrackPicker'

function trackFor(recordId: string, overrides: Partial<Track> = {}): Track {
	return createMockTrack({ record_id: recordId, ...overrides })
}

describe('buildLoadTrackRecordResults', () => {
	it('groups playable tracks under their records', () => {
		const record = createMockRecord({ id: 'release' })
		const tracks = [
			trackFor(record.id, { id: 'a1', position: 'A1' }),
			trackFor(record.id, { id: 'a2', position: 'A2' })
		]

		const results = buildLoadTrackRecordResults({
			records: [record],
			tracks,
			query: ''
		})

		expect(results).toHaveLength(1)
		expect(results[0]?.tracks.map((track) => track.id)).toEqual(['a1', 'a2'])
	})

	it('omits records with only non-playable tracks', () => {
		const record = createMockRecord({ id: 'release' })
		const results = buildLoadTrackRecordResults({
			records: [record],
			tracks: [trackFor(record.id, { playable: false })],
			query: ''
		})

		expect(results).toEqual([])
	})

	it('sorts tracks by physical position without mutating inputs', () => {
		const record = createMockRecord({ id: 'release' })
		const tracks = [
			trackFor(record.id, { id: 'b1', position: 'B1' }),
			trackFor(record.id, { id: 'a2', position: 'A2' }),
			trackFor(record.id, { id: 'a1', position: 'A1' })
		]
		const records = [record]

		const results = buildLoadTrackRecordResults({ records, tracks, query: '' })

		expect(results[0]?.tracks.map((track) => track.position)).toEqual([
			'A1',
			'A2',
			'B1'
		])
		expect(tracks.map((track) => track.position)).toEqual(['B1', 'A2', 'A1'])
		expect(records).toEqual([record])
	})

	it.each([
		['record title', 'night signals'],
		['track title', 'hidden path'],
		['record artist', 'shadowax'],
		['track artist', 'guest selector'],
		['label name', 'trip records'],
		['catalogue number', 'trp026'],
		['position', 'b2'],
		['genre', 'broken beat'],
		['year', '2019']
	])('finds a record by %s', (_field, query) => {
		const record = createMockRecord({
			id: 'release',
			title: 'Night Signals',
			artists: [{ name: 'Shadowax' }],
			labels: [{ name: 'Trip Records', catno: 'TRP026' }],
			year: 2019
		})
		const track = trackFor(record.id, {
			title: 'Hidden Path',
			artists: [{ name: 'Guest Selector' }],
			position: 'B2',
			genres: ['Broken Beat']
		})

		const results = buildLoadTrackRecordResults({
			records: [record],
			tracks: [track],
			query
		})

		expect(results.map((result) => result.record.id)).toEqual(['release'])
	})

	it('ranks an exact catalogue number above a weaker substring result', () => {
		const exact = createMockRecord({
			id: 'exact',
			labels: [{ name: 'One', catno: 'TRP026' }]
		})
		const weaker = createMockRecord({
			id: 'weaker',
			labels: [{ name: 'Two', catno: 'XX-TRP026-RE' }]
		})

		const results = buildLoadTrackRecordResults({
			records: [weaker, exact],
			tracks: [trackFor(weaker.id), trackFor(exact.id)],
			query: 'trp026'
		})

		expect(results.map((result) => result.record.id)).toEqual([
			'exact',
			'weaker'
		])
	})

	it('ranks an exact track title above an exact record title', () => {
		const recordTitleMatch = createMockRecord({
			id: 'record-title',
			title: 'Shared Name'
		})
		const trackTitleMatch = createMockRecord({
			id: 'track-title',
			title: 'Different Record'
		})

		const results = buildLoadTrackRecordResults({
			records: [recordTitleMatch, trackTitleMatch],
			tracks: [
				trackFor(recordTitleMatch.id, { title: 'Different Track' }),
				trackFor(trackTitleMatch.id, { title: 'Shared Name' })
			],
			query: 'shared name'
		})

		expect(results.map((result) => result.record.id)).toEqual([
			'track-title',
			'record-title'
		])
	})

	it('matches normalized tokens across record fields', () => {
		const record = createMockRecord({
			id: 'release',
			artists: [{ name: 'Shadowax' }],
			labels: [{ name: 'Trip', catno: 'TRP026' }]
		})
		const weaker = createMockRecord({
			id: 'weaker',
			artists: [{ name: 'The Shadowax Duo' }],
			labels: [{ name: 'Other', catno: 'XX-TRP026-RE' }]
		})

		const results = buildLoadTrackRecordResults({
			records: [weaker, record],
			tracks: [trackFor(weaker.id), trackFor(record.id)],
			query: '  SHADOWAX   trp026 '
		})

		expect(results.map((result) => result.record.id)).toEqual([
			'release',
			'weaker'
		])
	})

	it('filters and orders records using crate order', () => {
		const first = createMockRecord({ id: 'first' })
		const second = createMockRecord({ id: 'second' })
		const omitted = createMockRecord({ id: 'omitted' })

		const results = buildLoadTrackRecordResults({
			records: [first, second, omitted],
			tracks: [trackFor(first.id), trackFor(second.id), trackFor(omitted.id)],
			query: '',
			recordOrder: ['second', 'first']
		})

		expect(results.map((result) => result.record.id)).toEqual([
			'second',
			'first'
		])
	})

	it('does not mark a track for a record-only match', () => {
		const record = createMockRecord({ id: 'release', title: 'Record Match' })
		const results = buildLoadTrackRecordResults({
			records: [record],
			tracks: [trackFor(record.id, { title: 'Different Track' })],
			query: 'record match'
		})

		expect(results[0]?.matchedTrackIds).toEqual([])
	})

	it('marks tracks whose title matches the query', () => {
		const record = createMockRecord({ id: 'release' })
		const track = trackFor(record.id, { id: 'match', title: 'Mortal Talking' })
		const results = buildLoadTrackRecordResults({
			records: [record],
			tracks: [track],
			query: 'mortal talking'
		})

		expect(results[0]?.matchedTrackIds).toEqual(['match'])
	})

	it('treats empty and whitespace-only queries equivalently', () => {
		const record = createMockRecord({ id: 'release' })
		const tracks = [trackFor(record.id)]

		expect(
			buildLoadTrackRecordResults({ records: [record], tracks, query: '   ' })
		).toEqual(
			buildLoadTrackRecordResults({ records: [record], tracks, query: '' })
		)
	})
})

describe('getLoadTrackPreview', () => {
	it('returns a contiguous five-track window containing a deep match', () => {
		const tracks = Array.from({ length: 10 }, (_, index) =>
			createMockTrack({ id: `track-${index}`, position: `A${index + 1}` })
		)

		const preview = getLoadTrackPreview(tracks, ['track-7'])

		expect(preview.map((track) => track.id)).toEqual([
			'track-5',
			'track-6',
			'track-7',
			'track-8',
			'track-9'
		])
	})
})
