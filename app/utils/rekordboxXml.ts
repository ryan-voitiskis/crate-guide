import type { RekordboxXmlSource } from '~~/shared/types/audioFeatures'
import { parseBeatportKey, pitchClassMap } from './keyFunctions'

export type RekordboxXmlTrack = {
	index: number
	trackId: string | null
	name: string | null
	artist: string | null
	album: string | null
	genre: string | null
	kind: string | null
	totalTimeSeconds: number | null
	year: number | null
	averageBpm: number | null
	dateAdded: string | null
	bitRate: number | null
	sampleRate: number | null
	comments: string | null
	playCount: number | null
	rating: number | null
	location: string | null
	locationHint: string | null
	remixer: string | null
	tonality: string | null
	parsedKey: number | null
	parsedMode: number | null
	label: string | null
	warnings: string[]
}

export type RekordboxXmlParseResult = {
	tracks: RekordboxXmlTrack[]
	entriesDeclared: number | null
	warnings: string[]
	errors: string[]
}

const INVISIBLE_CHARACTERS = /[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g
const QUOTES_AND_APOSTROPHES =
	/[\u2018\u2019\u201a\u201b\u201c\u201d\u201e\u201f]/g
const DASHES = /[\u2010-\u2015\u2212]/g

const NOTE_MAP: Record<string, number> = {
	C: 0,
	'C#': 1,
	Db: 1,
	D: 2,
	'D#': 3,
	Eb: 3,
	E: 4,
	F: 5,
	'F#': 6,
	Gb: 6,
	G: 7,
	'G#': 8,
	Ab: 8,
	A: 9,
	'A#': 10,
	Bb: 10,
	B: 11
}

export function stripInvisibleCharacters(input: string): string {
	return input.replace(INVISIBLE_CHARACTERS, '')
}

function cleanXmlString(value: string | null): string | null {
	if (value === null) return null
	const cleaned = stripInvisibleCharacters(value).normalize('NFKC').trim()
	return cleaned || null
}

export function normalizeForTrackMatch(
	value: string | null | undefined
): string {
	if (!value) return ''

	return stripInvisibleCharacters(value)
		.normalize('NFKC')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(QUOTES_AND_APOSTROPHES, "'")
		.replace(DASHES, '-')
		.toLowerCase()
		.replace(/\s*(?:\(|\[)\s*(?:19|20)\d{2}\s*(?:\)|\])\s*$/g, '')
		.replace(/^\s*(?:\d{2}|[a-z]\d{1,2})\s*(?:[-_.)]\s*)/i, '')
		.replace(/[^\p{Letter}\p{Number}&+\s]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

export function normalizeFilenameTitle(fileName: string | null | undefined) {
	if (!fileName) return ''
	const withoutExtension = fileName.replace(/\.[^.]+$/, '')
	return normalizeForTrackMatch(withoutExtension)
}

function parseNullableInteger(value: string | null): number | null {
	const cleaned = cleanXmlString(value)
	if (!cleaned) return null

	const parsed = Number.parseInt(cleaned, 10)
	return Number.isFinite(parsed) ? parsed : null
}

function parseAverageBpm(value: string | null): number | null {
	const cleaned = cleanXmlString(value)
	if (!cleaned) return null

	const parsed = Number.parseFloat(cleaned)
	if (!Number.isFinite(parsed) || parsed <= 0) return null

	return Math.round(parsed * 10) / 10
}

function canonicalNote(note: string, accidental: string | undefined): string {
	const base = note.toUpperCase()
	const normalizedAccidental = accidental
		?.replace('\u266f', '#')
		.replace('\u266d', 'b')
	if (!normalizedAccidental) return base
	return normalizedAccidental === '#'
		? `${base}#`
		: `${base}${normalizedAccidental.toLowerCase()}`
}

export function parseRekordboxTonality(tonality: string | null): {
	key: number | null
	mode: number | null
	warning: string | null
} {
	const cleaned = cleanXmlString(tonality)
	if (!cleaned) return { key: null, mode: null, warning: null }

	const camelotMatch = cleaned.match(/^([1-9]|1[0-2])\s*([ab])$/i)
	if (camelotMatch) {
		const camelotNumber = Number.parseInt(camelotMatch[1]!, 10)
		const mode = camelotMatch[2]!.toLowerCase() === 'b' ? 1 : 0
		const match = pitchClassMap.find((key) =>
			mode === 1
				? key.camelotMajor === camelotNumber
				: key.camelotMinor === camelotNumber
		)

		return match
			? { key: match.pitchClass, mode, warning: null }
			: {
					key: null,
					mode: null,
					warning: `Unsupported tonality "${cleaned}"`
				}
	}

	const longForm = parseBeatportKey(cleaned)
	if (longForm.key !== null && longForm.mode !== null) {
		return { ...longForm, warning: null }
	}

	const shortNoteMatch = cleaned.match(/^([a-g])([#b\u266f\u266d]?)(m?)$/i)
	if (shortNoteMatch) {
		const note = canonicalNote(shortNoteMatch[1]!, shortNoteMatch[2])
		const key = NOTE_MAP[note]
		const mode = shortNoteMatch[3] ? 0 : 1

		return key === undefined
			? {
					key: null,
					mode: null,
					warning: `Unsupported tonality "${cleaned}"`
				}
			: { key, mode, warning: null }
	}

	return {
		key: null,
		mode: null,
		warning: `Unsupported tonality "${cleaned}"`
	}
}

function getAttribute(element: Element, name: string): string | null {
	return cleanXmlString(element.getAttribute(name))
}

function decodeLocation(location: string | null): string | null {
	if (!location) return null

	try {
		const url = new URL(location)
		if (url.protocol === 'file:') return decodeURIComponent(url.pathname)
	} catch {
		// Fall through to best-effort cleanup below.
	}

	const withoutProtocol = location
		.replace(/^file:\/\/localhost/i, '')
		.replace(/^file:\/\//i, '')
	return cleanXmlString(decodeURIComponent(withoutProtocol))
}

function getPathSegments(path: string): string[] {
	return path.replace(/\\/g, '/').split('/').filter(Boolean)
}

function getCommonDirectory(paths: string[]): string[] {
	const directorySegments = paths
		.map((path) => getPathSegments(path).slice(0, -1))
		.filter((segments) => segments.length > 0)

	if (directorySegments.length < 2) return []

	const [firstSegments, ...otherSegments] = directorySegments
	const common: string[] = []

	for (let index = 0; index < firstSegments!.length; index++) {
		const segment = firstSegments![index]
		if (otherSegments.every((segments) => segments[index] === segment)) {
			common.push(segment!)
		} else {
			break
		}
	}

	return common
}

function toRelativeLocationHint(
	decodedLocation: string | null,
	commonDirectory: string[]
): string | null {
	if (!decodedLocation) return null

	const segments = getPathSegments(decodedLocation)
	if (segments.length === 0) return null

	const canUseCommonDirectory =
		commonDirectory.length > 1 &&
		commonDirectory.every((segment, index) => segments[index] === segment)

	const relativeSegments = canUseCommonDirectory
		? segments.slice(commonDirectory.length)
		: segments.slice(Math.max(0, segments.length - 3))

	return relativeSegments.join('/') || null
}

function parseTrackElement(element: Element, index: number): RekordboxXmlTrack {
	const warnings: string[] = []
	const tonality = getAttribute(element, 'Tonality')
	const parsedTonality = parseRekordboxTonality(tonality)
	const name = getAttribute(element, 'Name')
	const artist = getAttribute(element, 'Artist')

	if (!name) warnings.push('Missing track name')
	if (!artist) warnings.push('Missing artist')
	if (parsedTonality.warning) warnings.push(parsedTonality.warning)

	return {
		index,
		trackId: getAttribute(element, 'TrackID'),
		name,
		artist,
		album: getAttribute(element, 'Album'),
		genre: getAttribute(element, 'Genre'),
		kind: getAttribute(element, 'Kind'),
		totalTimeSeconds: parseNullableInteger(element.getAttribute('TotalTime')),
		year: parseNullableInteger(element.getAttribute('Year')),
		averageBpm: parseAverageBpm(element.getAttribute('AverageBpm')),
		dateAdded: getAttribute(element, 'DateAdded'),
		bitRate: parseNullableInteger(element.getAttribute('BitRate')),
		sampleRate: parseNullableInteger(element.getAttribute('SampleRate')),
		comments: getAttribute(element, 'Comments'),
		playCount: parseNullableInteger(element.getAttribute('PlayCount')),
		rating: parseNullableInteger(element.getAttribute('Rating')),
		location: decodeLocation(getAttribute(element, 'Location')),
		locationHint: null,
		remixer: getAttribute(element, 'Remixer'),
		tonality,
		parsedKey: parsedTonality.key,
		parsedMode: parsedTonality.mode,
		label: getAttribute(element, 'Label'),
		warnings
	}
}

export function parseRekordboxXml(xmlText: string): RekordboxXmlParseResult {
	const warnings: string[] = []
	const errors: string[] = []

	if (typeof DOMParser === 'undefined') {
		return {
			tracks: [],
			entriesDeclared: null,
			warnings,
			errors: ['DOMParser is unavailable in this browser context']
		}
	}

	const document = new DOMParser().parseFromString(xmlText, 'application/xml')
	const parserError = document.querySelector('parsererror')

	if (parserError) {
		return {
			tracks: [],
			entriesDeclared: null,
			warnings,
			errors: ['Unable to parse Rekordbox XML']
		}
	}

	const collection = document.querySelector('COLLECTION')
	if (!collection) {
		return {
			tracks: [],
			entriesDeclared: null,
			warnings,
			errors: ['Missing COLLECTION element']
		}
	}

	const entriesDeclared = parseNullableInteger(
		collection.getAttribute('Entries')
	)
	const trackElements = Array.from(collection.getElementsByTagName('TRACK'))
	const tracks = trackElements.map((element, index) =>
		parseTrackElement(element, index)
	)

	if (entriesDeclared !== null && entriesDeclared !== tracks.length) {
		warnings.push(
			`COLLECTION Entries declares ${entriesDeclared} tracks, parsed ${tracks.length}`
		)
	}

	const commonDirectory = getCommonDirectory(
		tracks
			.map((track) => track.location)
			.filter((path): path is string => path !== null)
	)

	return {
		tracks: tracks.map((track) => ({
			...track,
			locationHint: toRelativeLocationHint(track.location, commonDirectory)
		})),
		entriesDeclared,
		warnings,
		errors
	}
}

export function getLocationFileName(
	locationHint: string | null
): string | null {
	if (!locationHint) return null
	const segments = getPathSegments(locationHint)
	return segments.at(-1) ?? null
}

export function getLocationAlbumHint(locationHint: string | null): string {
	if (!locationHint) return ''
	const segments = getPathSegments(locationHint)
	if (segments.length < 2) return ''
	return normalizeForTrackMatch(segments.at(-2))
}

export function toRekordboxXmlSource(
	track: RekordboxXmlTrack,
	fileName: string,
	importedAt: string
): RekordboxXmlSource {
	return {
		importedAt,
		fileName,
		name: track.name,
		artist: track.artist,
		album: track.album,
		genre: track.genre,
		locationHint: track.locationHint,
		averageBpm: track.averageBpm,
		tonality: track.tonality,
		parsedKey: track.parsedKey,
		parsedMode: track.parsedMode,
		totalTimeSeconds: track.totalTimeSeconds,
		year: track.year,
		kind: track.kind,
		sampleRate: track.sampleRate,
		bitRate: track.bitRate,
		rating: track.rating,
		playCount: track.playCount,
		comments: track.comments,
		remixer: track.remixer,
		label: track.label,
		dateAdded: track.dateAdded
	}
}
