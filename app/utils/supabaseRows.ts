import type { TrackAudioFeatures } from '../../shared/types/audioFeatures'
import type {
	BeatportNotFoundMarker,
	BeatportTrackData
} from '../../shared/types/beatport'
import type { Database } from '../../shared/types/database'
import { isDiscogsArtistDb, isDiscogsLabelDb } from '../../shared/types/discogs'
import type {
	DatabaseRecord,
	PlayedTrackEntry,
	SavedSet,
	Track
} from '../../shared/types/supabase'

export type DecodeIssue = {
	entity: 'record' | 'track' | 'saved-set'
	id: string
	field: string
}

export type DecodedRow<T> = {
	row: T
	issues: DecodeIssue[]
}

export function reportDecodeIssues(
	issues: DecodeIssue[],
	warnUser: (message: string) => void
): void {
	if (issues.length === 0) return

	console.warn('Invalid saved data was reset to safe defaults', issues)
	warnUser('Some saved data was reset to safe defaults.')
}

type UnknownRecord = Record<string, unknown>

function isObject(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value)
}

function isNullableFiniteNumber(value: unknown): value is number | null {
	return value === null || isFiniteNumber(value)
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string'
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isDiscogsArtistArray(value: unknown): value is Track['artists'] {
	return Array.isArray(value) && value.every(isDiscogsArtistDb)
}

function isDiscogsLabelArray(
	value: unknown
): value is DatabaseRecord['labels'] {
	return Array.isArray(value) && value.every(isDiscogsLabelDb)
}

function isBeatportNotFoundMarker(
	value: UnknownRecord
): value is UnknownRecord & BeatportNotFoundMarker {
	return (
		value.searched === true &&
		value.notFound === true &&
		isFiniteNumber(value.searchedAt)
	)
}

function isBeatportTrackData(
	value: UnknownRecord
): value is UnknownRecord & BeatportTrackData {
	return (
		isFiniteNumber(value.accessed) &&
		typeof value.url === 'string' &&
		typeof value.genre === 'string' &&
		isNullableFiniteNumber(value.bpm) &&
		typeof value.key === 'string' &&
		typeof value.img === 'string'
	)
}

function isBeatportData(
	value: unknown
): value is BeatportTrackData | BeatportNotFoundMarker {
	if (!isObject(value)) return false
	return isBeatportNotFoundMarker(value) || isBeatportTrackData(value)
}

const AUDIO_SOURCE_KEYS = [
	'rekordboxXml',
	'embeddedTags',
	'essentiaBrowser'
] as const

function isAudioSourceKey(
	value: unknown
): value is (typeof AUDIO_SOURCE_KEYS)[number] {
	return (
		typeof value === 'string' &&
		AUDIO_SOURCE_KEYS.some((source) => source === value)
	)
}

function isAppliedSource(value: unknown): boolean {
	return (
		value === null ||
		(isObject(value) &&
			isAudioSourceKey(value.source) &&
			typeof value.appliedAt === 'string')
	)
}

function hasNullableStrings(
	value: UnknownRecord,
	fields: readonly string[]
): boolean {
	return fields.every((field) => isNullableString(value[field]))
}

function hasNullableFiniteNumbers(
	value: UnknownRecord,
	fields: readonly string[]
): boolean {
	return fields.every((field) => isNullableFiniteNumber(value[field]))
}

function isRekordboxXmlSource(value: unknown): boolean {
	if (!isObject(value)) return false

	return (
		typeof value.importedAt === 'string' &&
		typeof value.fileName === 'string' &&
		hasNullableStrings(value, [
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
		]) &&
		hasNullableFiniteNumbers(value, [
			'averageBpm',
			'parsedKey',
			'parsedMode',
			'totalTimeSeconds',
			'year',
			'sampleRate',
			'bitRate',
			'rating',
			'playCount'
		])
	)
}

function isEmbeddedTagsSource(value: unknown): boolean {
	if (!isObject(value)) return false

	return (
		typeof value.importedAt === 'string' &&
		typeof value.fileName === 'string' &&
		isNullableString(value.locationHint) &&
		isFiniteNumber(value.fileSize) &&
		isFiniteNumber(value.lastModified) &&
		hasNullableStrings(value, ['title', 'artist', 'album', 'key']) &&
		isStringArray(value.genres) &&
		isNullableFiniteNumber(value.durationSeconds) &&
		isNullableFiniteNumber(value.bpm)
	)
}

function isEssentiaBrowserSource(value: unknown): boolean {
	if (!isObject(value)) return false

	return (
		typeof value.importedAt === 'string' &&
		typeof value.analyzerVersion === 'string' &&
		typeof value.configurationVersion === 'string' &&
		isNullableFiniteNumber(value.bpm) &&
		isNullableFiniteNumber(value.bpmConfidence) &&
		Array.isArray(value.bpmEstimates) &&
		value.bpmEstimates.every(isFiniteNumber) &&
		isNullableString(value.key) &&
		isNullableString(value.scale) &&
		isNullableFiniteNumber(value.keyStrength) &&
		isFiniteNumber(value.sampleRate) &&
		isFiniteNumber(value.durationSeconds) &&
		isFiniteNumber(value.analyzedDurationSeconds) &&
		isFiniteNumber(value.analysisOffsetSeconds) &&
		isStringArray(value.warnings)
	)
}

function isTrackAudioFeatures(value: unknown): value is TrackAudioFeatures {
	if (!isObject(value)) return false
	if (value.version !== 1 || typeof value.updatedAt !== 'string') return false
	if (!isObject(value.applied) || !isObject(value.match)) return false
	if (!isObject(value.sources)) return false

	const confidence = value.match.confidence
	const validMatch =
		(confidence === 'high' ||
			confidence === 'medium' ||
			confidence === 'manual') &&
		isFiniteNumber(value.match.score) &&
		isStringArray(value.match.reasons) &&
		isStringArray(value.match.warnings)

	return (
		isAppliedSource(value.applied.bpm) &&
		isAppliedSource(value.applied.keyMode) &&
		validMatch &&
		(value.sources.rekordboxXml === undefined ||
			isRekordboxXmlSource(value.sources.rekordboxXml)) &&
		(value.sources.embeddedTags === undefined ||
			isEmbeddedTagsSource(value.sources.embeddedTags)) &&
		(value.sources.essentiaBrowser === undefined ||
			isEssentiaBrowserSource(value.sources.essentiaBrowser))
	)
}

function isPlayedTrackEntry(value: unknown): value is PlayedTrackEntry {
	if (!isObject(value)) return false

	return (
		typeof value.track_id === 'string' &&
		value.track_id.trim() !== '' &&
		isFiniteNumber(value.time_added) &&
		value.time_added >= 0 &&
		isNullableFiniteNumber(value.adjusted_bpm) &&
		(value.transition_rating === null ||
			(isFiniteNumber(value.transition_rating) &&
				Number.isInteger(value.transition_rating) &&
				value.transition_rating >= 1 &&
				value.transition_rating <= 5))
	)
}

function issue(
	entity: DecodeIssue['entity'],
	id: string,
	field: string
): DecodeIssue {
	return { entity, id, field }
}

export function decodeRecordRow(
	row: Database['public']['Tables']['records']['Row']
): DecodedRow<DatabaseRecord> {
	const issues: DecodeIssue[] = []
	const artists = isDiscogsArtistArray(row.artists) ? row.artists : []
	const labels = isDiscogsLabelArray(row.labels) ? row.labels : []

	if (artists !== row.artists) issues.push(issue('record', row.id, 'artists'))
	if (labels !== row.labels) issues.push(issue('record', row.id, 'labels'))

	return { row: { ...row, artists, labels }, issues }
}

export function decodeTrackRow(
	row: Database['public']['Tables']['tracks']['Row']
): DecodedRow<Track> {
	const issues: DecodeIssue[] = []
	const artists = isDiscogsArtistArray(row.artists) ? row.artists : []
	const extraartists = isDiscogsArtistArray(row.extraartists)
		? row.extraartists
		: []
	const genres = isStringArray(row.genres) ? row.genres : []
	const beatportData =
		row.beatport_data === null || isBeatportData(row.beatport_data)
			? row.beatport_data
			: null
	const audioFeatures =
		row.audio_features === null || isTrackAudioFeatures(row.audio_features)
			? row.audio_features
			: null

	if (artists !== row.artists) issues.push(issue('track', row.id, 'artists'))
	if (extraartists !== row.extraartists)
		issues.push(issue('track', row.id, 'extraartists'))
	if (genres !== row.genres) issues.push(issue('track', row.id, 'genres'))
	if (beatportData !== row.beatport_data)
		issues.push(issue('track', row.id, 'beatport_data'))
	if (audioFeatures !== row.audio_features)
		issues.push(issue('track', row.id, 'audio_features'))

	return {
		row: {
			...row,
			artists,
			extraartists,
			genres,
			beatport_data: beatportData,
			audio_features: audioFeatures
		},
		issues
	}
}

export function decodeSavedSetRow(
	row: Database['public']['Tables']['sets']['Row']
): DecodedRow<SavedSet> {
	const issues: DecodeIssue[] = []
	const playedTracks = Array.isArray(row.played_tracks)
		? row.played_tracks.filter(isPlayedTrackEntry)
		: []

	if (
		!Array.isArray(row.played_tracks) ||
		playedTracks.length !== row.played_tracks.length
	) {
		issues.push(issue('saved-set', row.id, 'played_tracks'))
	}

	return { row: { ...row, played_tracks: playedTracks }, issues }
}
