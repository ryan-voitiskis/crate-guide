export const REKORDBOX_XML_SCALE_FIXTURE_COUNTS = [
	1_000, 10_000, 100_000
] as const

export type RekordboxXmlScaleFixtureCount =
	(typeof REKORDBOX_XML_SCALE_FIXTURE_COUNTS)[number]

function padded(index: number): string {
	return String(index + 1).padStart(6, '0')
}

function trackXml(index: number): string {
	const sequence = padded(index)
	const album = `Album ${String(index % 251).padStart(3, '0')}`
	const bpm = (120 + (index % 80) / 10).toFixed(2)
	const tonality = ['8A', 'C Major', 'F#'][index % 3]
	const attributes = [
		`TrackID="${index + 1}"`,
		`Name="Track ${sequence} &amp; Cafe&#769;"`,
		`Artist="Artist &quot;${index % 97}&quot;"`,
		`Album="${album}"`,
		`Genre="House &amp; Techno"`,
		'Kind="WAV File"',
		`TotalTime="${180 + (index % 181)}"`,
		`Year="${2000 + (index % 27)}"`,
		`AverageBpm="${bpm}"`,
		'DateAdded="2026-07-22"',
		'BitRate="1411"',
		'SampleRate="44100"',
		'Comments="Generated &apos;fixture&apos;"',
		`PlayCount="${index % 1000}"`,
		`Rating="${(index % 6) * 51}"`,
		`Location="file://localhost/Users/generated-user/Music/Collection/${album.replaceAll(' ', '%20')}/Track%20${sequence}%20%26%20Cafe%CC%81.wav"`,
		`Tonality="${tonality}"`,
		`Label="Label ${index % 43}"`,
		'Unknown="ignored"'
	].join(' ')

	if (index % 1_000 === 0) {
		return `\t\t<TRACK ${attributes}><TEMPO Inizio="0" Bpm="${bpm}"/><POSITION_MARK Name="Cue"/></TRACK>\n`
	}
	return `\t\t<TRACK ${attributes}/>\n`
}

export function* iterateRekordboxXmlScaleFixture(
	trackCount: RekordboxXmlScaleFixtureCount | number
): Generator<string> {
	if (!Number.isSafeInteger(trackCount) || trackCount < 0) {
		throw new Error('Fixture track count must be a non-negative integer.')
	}
	yield '<?xml version="1.0" encoding="UTF-8"?>\n'
	yield '<DJ_PLAYLISTS Version="1.0.0">\n'
	yield '\t<PRODUCT Name="rekordbox" Version="7.0.0"/>\n'
	yield `\t<COLLECTION Entries="${trackCount}">\n`
	for (let index = 0; index < trackCount; index += 1) {
		yield trackXml(index)
	}
	yield '\t</COLLECTION>\n'
	yield '</DJ_PLAYLISTS>\n'
}

export function generateRekordboxXmlScaleFixture(
	trackCount: RekordboxXmlScaleFixtureCount | number
): string {
	return [...iterateRekordboxXmlScaleFixture(trackCount)].join('')
}
