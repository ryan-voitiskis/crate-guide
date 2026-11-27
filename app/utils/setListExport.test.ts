import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { describe, expect, it } from 'vitest'
import type {
	LibraryPlayedTrackEntry,
	LibraryTrack
} from '~~/shared/types/library'
import {
	type SetListRow,
	buildSetListRows,
	createSetListFilename,
	escapeCsvField,
	escapeMarkdownText,
	formatSetList,
	formatSetListCsv,
	formatSetListMarkdown,
	formatSetListText
} from './setListExport'

function entry(
	trackId: string,
	overrides: Partial<LibraryPlayedTrackEntry> = {}
): LibraryPlayedTrackEntry {
	return {
		track_id: trackId,
		time_added: 1,
		adjusted_bpm: null,
		transition_rating: null,
		...overrides
	}
}

const rows: SetListRow[] = [
	{
		position: 1,
		artist: 'Floorplan',
		title: 'Never Grow Old',
		bpm: 124,
		key: '8A'
	},
	{ position: 2, artist: 'Mr. G', title: "U Can't Hide", bpm: null, key: null },
	{
		position: 3,
		artist: 'Moodymann, Andrés',
		title: 'Shades of "Jae"',
		bpm: 118.46,
		key: null
	}
]

describe('buildSetListRows', () => {
	const tracks = new Map<string, LibraryTrack>([
		[
			'amin',
			createMockTrack({
				id: 'amin',
				title: 'Library title',
				artists: [
					{ discogs_id: 1, name: 'One', role: null },
					{ discogs_id: 2, name: 'Two', role: null }
				],
				bpm: 120,
				key: 9,
				mode: 0
			})
		]
	])
	const getTrack = (id: string) => tracks.get(id)

	it('uses the key format, the played BPM and the snapshot names', () => {
		const [camelot] = buildSetListRows(
			[
				entry('amin', {
					adjusted_bpm: 122.5,
					track_title: 'Played title',
					artist_display: 'Played artist'
				})
			],
			getTrack,
			'camelot'
		)
		const [musical] = buildSetListRows([entry('amin')], getTrack, 'key')

		expect(camelot).toEqual({
			position: 1,
			artist: 'Played artist',
			title: 'Played title',
			bpm: 122.5,
			key: '8A'
		})
		expect(musical).toEqual({
			position: 1,
			artist: 'One, Two',
			title: 'Library title',
			bpm: 120,
			key: 'A Min'
		})
	})

	it('keeps tracks that left the library with placeholders', () => {
		expect(buildSetListRows([entry('gone')], getTrack, 'camelot')).toEqual([
			{
				position: 1,
				artist: 'Unknown artist',
				title: 'Unknown track',
				bpm: null,
				key: null
			}
		])
	})
})

describe('formatSetListText', () => {
	it('numbers lines and omits empty details', () => {
		expect(formatSetListText(rows)).toBe(
			[
				'01. Floorplan - Never Grow Old [124.0 BPM, 8A]',
				"02. Mr. G - U Can't Hide",
				'03. Moodymann, Andrés - Shades of "Jae" [118.5 BPM]'
			].join('\n')
		)
	})

	it('flattens line breaks inside names', () => {
		expect(
			formatSetListText([
				{ position: 1, artist: 'A\nB', title: 'C\r\n D', bpm: null, key: null }
			])
		).toBe('01. A B - C D')
	})
})

describe('formatSetListMarkdown', () => {
	it('renders a numbered list with escaped inline formatting', () => {
		expect(
			formatSetListMarkdown([
				{
					position: 1,
					artist: '*NSYNC_',
					title: 'Track [Edit] <b>|~`',
					bpm: 124,
					key: '8A'
				}
			])
		).toBe('1. \\*NSYNC\\_ – Track \\[Edit\\] \\<b\\>\\|\\~\\` (124.0 BPM, 8A)')
	})

	it.each([
		['# Artist', '\\# Artist'],
		['> Quote', '\\> Quote'],
		['- Dash', '\\- Dash'],
		['+ Plus', '\\+ Plus'],
		['= Equals', '\\= Equals'],
		['1. Intro', '1\\. Intro'],
		['2) Outro', '2\\) Outro'],
		['Fish &copy; Chips', 'Fish \\&copy; Chips']
	])('escapes the block marker or entity in %j', (value, expected) => {
		expect(escapeMarkdownText(value)).toBe(expected)
	})

	it('keeps a leading block marker from changing the list item', () => {
		expect(
			formatSetListMarkdown([
				{
					position: 1,
					artist: '# Artist',
					title: 'Title',
					bpm: null,
					key: null
				}
			])
		).toBe('1. \\# Artist – Title')
	})

	it('leaves ordinary punctuation alone', () => {
		expect(escapeMarkdownText("Mr. G - U Can't Hide (Remix)!")).toBe(
			"Mr. G - U Can't Hide (Remix)!"
		)
	})
})

describe('CSV export', () => {
	it('writes a header and RFC 4180 rows with CRLF endings', () => {
		expect(formatSetListCsv(rows)).toBe(
			[
				'Position,Artist,Title,BPM,Key',
				'1,Floorplan,Never Grow Old,124.0,8A',
				"2,Mr. G,U Can't Hide,,",
				'3,"Moodymann, Andrés","Shades of ""Jae""",118.5,',
				''
			].join('\r\n')
		)
	})

	it.each([
		['plain', 'plain'],
		['a,b', '"a,b"'],
		['say "hi"', '"say ""hi"""'],
		['line\nbreak', '"line\nbreak"'],
		['cr\rhere', '"cr\rhere"'],
		['=HYPERLINK("x")', '"\'=HYPERLINK(""x"")"'],
		['+1', "'+1"],
		['-cmd', "'-cmd"],
		['@SUM(A1)', "'@SUM(A1)"],
		['\tTab', "'\tTab"],
		['', '']
	])('escapes %j', (value, expected) => {
		expect(escapeCsvField(value)).toBe(expected)
	})

	it('writes numbers and empty values without quotes', () => {
		expect(escapeCsvField(12)).toBe('12')
		expect(escapeCsvField(null)).toBe('')
	})
})

describe('formatSetList', () => {
	it('dispatches on the format', () => {
		expect(formatSetList(rows, 'text')).toBe(formatSetListText(rows))
		expect(formatSetList(rows, 'markdown')).toBe(formatSetListMarkdown(rows))
		expect(formatSetList(rows, 'csv')).toBe(formatSetListCsv(rows))
	})
})

describe('createSetListFilename', () => {
	const date = new Date(2026, 10, 5, 23, 30)

	it('slugs the set name and appends the local date', () => {
		expect(createSetListFilename('Friday Warm-up @ Café', 'csv', date)).toBe(
			'friday-warm-up-cafe-2026-11-05.csv'
		)
	})

	it('falls back to "set" for empty or symbol-only names', () => {
		expect(createSetListFilename(null, 'markdown', date)).toBe(
			'set-2026-11-05.md'
		)
		expect(createSetListFilename('../../', 'text', date)).toBe(
			'set-2026-11-05.txt'
		)
	})
})
