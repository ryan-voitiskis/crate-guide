// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { generateRekordboxXmlScaleFixture } from '../../test/fixtures/rekordboxXmlScale'
import { parseRekordboxXml } from '../utils/rekordboxXml'
import {
	IncrementalRekordboxXmlParser,
	REKORDBOX_XML_PARSER_LIMITS,
	RekordboxXmlParserError
} from './rekordboxXmlParserCore'

function parseIncrementally(
	xml: string,
	chunkSizes: number[] = [1, 2, 7, 31, 257],
	limits = REKORDBOX_XML_PARSER_LIMITS
) {
	const parser = new IncrementalRekordboxXmlParser(limits)
	let offset = 0
	let chunkIndex = 0
	while (offset < xml.length) {
		const size = chunkSizes[chunkIndex % chunkSizes.length]!
		parser.write(xml.slice(offset, offset + size))
		offset += size
		chunkIndex += 1
	}
	return parser.finish()
}

function expectParserError(
	action: () => unknown,
	code: RekordboxXmlParserError['code']
) {
	try {
		action()
		throw new Error('Expected the parser to reject the XML.')
	} catch (error) {
		expect(error).toBeInstanceOf(RekordboxXmlParserError)
		expect((error as RekordboxXmlParserError).code).toBe(code)
	}
}

const GOLDEN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
	<COLLECTION Entries="3">
		<TRACK TrackID="1" Name="Cafe&#769; &amp; One" Artist="Artist &quot;A&quot;" Album="Album One" AverageBpm="128.04" Location="file://localhost/Users/private-user/Music/Collection/Album%20One/Track%20One.wav" Tonality="8A"><TEMPO Bpm="128.04"/></TRACK>
		<TRACK TrackID="2" Name="Two" Artist="Artist B" Album="Album Two" AverageBpm="0.00" Location="C:\\Users\\private-user\\Music\\Collection\\Album Two\\Track Two.flac" Tonality="C Major"/>
		<TRACK TrackID="3" Name="Three" Artist="Artist C" Location="/home/private-user/Music/Collection/Album Three/Bad%ZZName.mp3" Tonality="F#"/>
	</COLLECTION>
</DJ_PLAYLISTS>`

describe('IncrementalRekordboxXmlParser', () => {
	it('matches the DOM oracle while removing raw locations from the snapshot', () => {
		const oracle = parseRekordboxXml(GOLDEN_XML)
		const streamed = parseIncrementally(GOLDEN_XML)

		expect(streamed.entriesDeclared).toBe(oracle.entriesDeclared)
		expect(streamed.warnings).toEqual(oracle.warnings)
		expect(streamed.errors).toEqual(oracle.errors)
		expect(streamed.tracks).toEqual(
			oracle.tracks.map((track) => ({ ...track, location: null }))
		)
		expect(streamed.tracks.every((track) => track.location === null)).toBe(true)
		expect(streamed.parserPolicyVersion).not.toBe(
			streamed.sanitizedSnapshotVersion
		)
	})

	it('matches the compatibility oracle for the generated 1k corpus', () => {
		const xml = generateRekordboxXmlScaleFixture(1_000)
		const oracle = parseRekordboxXml(xml)
		const streamed = parseIncrementally(xml, [65_537, 3, 262_141])

		expect(streamed.tracks).toEqual(
			oracle.tracks.map((track) => ({ ...track, location: null }))
		)
		expect(streamed.entriesDeclared).toBe(1_000)
		expect(streamed.warnings).toEqual([])
	})

	it('preserves declared-count warnings and missing COLLECTION errors', () => {
		const mismatch = parseIncrementally(
			'<DJ_PLAYLISTS><COLLECTION Entries="2"><TRACK Name="One" Artist="A"/></COLLECTION></DJ_PLAYLISTS>'
		)
		expect(mismatch.warnings).toEqual([
			'COLLECTION Entries declares 2 tracks, parsed 1'
		])

		expectParserError(
			() => parseIncrementally('<DJ_PLAYLISTS/>'),
			'missing_collection'
		)
	})

	it('rejects malformed XML, unknown entities, and all DTD declarations', () => {
		expectParserError(
			() =>
				parseIncrementally(
					'<DJ_PLAYLISTS><COLLECTION><TRACK></COLLECTION></DJ_PLAYLISTS>'
				),
			'malformed_xml'
		)
		expectParserError(
			() =>
				parseIncrementally(
					'<DJ_PLAYLISTS><COLLECTION><TRACK Name="&external;"/></COLLECTION></DJ_PLAYLISTS>'
				),
			'malformed_xml'
		)
		expectParserError(
			() =>
				parseIncrementally(
					'<!DOCTYPE DJ_PLAYLISTS [<!ENTITY external SYSTEM "file:///etc/passwd">]><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>'
				),
			'doctype_forbidden'
		)
		expectParserError(
			() =>
				parseIncrementally(
					'<!--invalid---><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>'
				),
			'malformed_xml'
		)
	})

	it.each([
		'<!--bad\u0001comment--><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
		'<?probe value="bad\u0001pi"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
		'<DJ_PLAYLISTS><COLLECTION><![CDATA[bad\u0001data]]></COLLECTION></DJ_PLAYLISTS>'
	])('rejects invalid XML code points in skipped markup %#', (xml) => {
		expectParserError(() => parseIncrementally(xml), 'malformed_xml')
	})

	it('enforces a complete one-chunk markup limit before parsing attributes', () => {
		const limits = { ...REKORDBOX_XML_PARSER_LIMITS, maxMarkupBytes: 64 }
		const oversized = `<DJ_PLAYLISTS><COLLECTION><TRACK A="${'x'.repeat(60)}" B="y"/></COLLECTION></DJ_PLAYLISTS>`

		expectParserError(
			() => parseIncrementally(oversized, [oversized.length], limits),
			'resource_limit_exceeded'
		)
	})

	it('enforces declaration, actual track, attribute, and path bounds', () => {
		expectParserError(
			() =>
				parseIncrementally(
					'<DJ_PLAYLISTS><COLLECTION Entries="2"/></DJ_PLAYLISTS>',
					[100],
					{ ...REKORDBOX_XML_PARSER_LIMITS, maxTracks: 1 }
				),
			'declared_count_exceeded'
		)
		expectParserError(
			() =>
				parseIncrementally(
					'<DJ_PLAYLISTS><COLLECTION Entries="-1"/></DJ_PLAYLISTS>'
				),
			'declared_count_exceeded'
		)
		expectParserError(
			() =>
				parseIncrementally(
					'<DJ_PLAYLISTS><COLLECTION><TRACK/><TRACK/></COLLECTION></DJ_PLAYLISTS>',
					[100],
					{ ...REKORDBOX_XML_PARSER_LIMITS, maxTracks: 1 }
				),
			'track_limit_exceeded'
		)
		expectParserError(
			() =>
				parseIncrementally(
					'<DJ_PLAYLISTS><COLLECTION><TRACK Name="too long"/></COLLECTION></DJ_PLAYLISTS>',
					[100],
					{ ...REKORDBOX_XML_PARSER_LIMITS, maxAttributeBytes: 4 }
				),
			'resource_limit_exceeded'
		)
		expectParserError(
			() =>
				parseIncrementally(
					`<DJ_PLAYLISTS><COLLECTION><TRACK Name="${'&amp;'.repeat(5)}"/></COLLECTION></DJ_PLAYLISTS>`,
					[100],
					{ ...REKORDBOX_XML_PARSER_LIMITS, maxAttributeBytes: 8 }
				),
			'resource_limit_exceeded'
		)
		expectParserError(
			() =>
				parseIncrementally(
					'<DJ_PLAYLISTS><COLLECTION><TRACK Location="/a/b/c/d/file.wav"/></COLLECTION></DJ_PLAYLISTS>',
					[100],
					{ ...REKORDBOX_XML_PARSER_LIMITS, maxPathSegments: 3 }
				),
			'resource_limit_exceeded'
		)
	})

	it('bounds accumulated per-track warnings', () => {
		const result = parseIncrementally(
			'<DJ_PLAYLISTS><COLLECTION Entries="2"><TRACK Tonality="unsupported"/><TRACK Tonality="unsupported"/></COLLECTION></DJ_PLAYLISTS>',
			[13],
			{ ...REKORDBOX_XML_PARSER_LIMITS, maxWarnings: 2 }
		)

		expect(result.tracks.flatMap((track) => track.warnings)).toHaveLength(1)
		expect(result.warnings).toEqual([
			'Additional track warnings were omitted after 2 warnings.'
		])
	})

	it('rejects non-UTF-8 declarations before track parsing', () => {
		expectParserError(
			() =>
				parseIncrementally(
					'<?xml version="1.0" encoding="ISO-8859-1"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>'
				),
			'invalid_encoding'
		)
	})

	it.each([
		'<?xml version="1.0"?><?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
		' \n<?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
		'<!--before--><?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
		'<?probe value="before"?><?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
		'<?xml encoding="UTF-8" version="1.0"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
		'<?xml version="1.0" standalone="yes" encoding="UTF-8"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>'
	])('rejects XML declarations misplaced under browser XML rules %#', (xml) => {
		expectParserError(() => parseIncrementally(xml), 'malformed_xml')
	})

	it('allows one UTF-8 BOM before a single XML declaration', () => {
		const xml =
			'\ufeff<?xml version="1.0" encoding="UTF-8"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>'
		expect(parseRekordboxXml(xml).errors).toEqual([])
		expect(parseIncrementally(xml).errors).toEqual([])
	})

	it('accepts generic processing-instruction data and normalizes literal attribute whitespace', () => {
		const xml = `<?probe arbitrary processing instruction data?>
<DJ_PLAYLISTS><COLLECTION Entries="1"><TRACK Name="one\ttwo
three\r\nfour&#xA;five"/></COLLECTION></DJ_PLAYLISTS>`
		const streamed = parseIncrementally(xml)

		expect(streamed.tracks[0]?.name).toBe('one two three four\nfive')
	})
})
