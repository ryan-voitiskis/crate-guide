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
import { decodeTrackEvidence } from './trackEvidenceCodec'

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

function isTrackAudioFeatures(value: unknown): value is TrackAudioFeatures {
	return decodeTrackEvidence(value).ok
}

type DecodedPlayedTrackEntry = {
	entry: PlayedTrackEntry | null
	hasInvalidSnapshot: boolean
}

function decodePlayedTrackEntry(value: unknown): DecodedPlayedTrackEntry {
	if (
		!isObject(value) ||
		typeof value.track_id !== 'string' ||
		value.track_id.trim() === '' ||
		!isFiniteNumber(value.time_added) ||
		value.time_added < 0 ||
		!isNullableFiniteNumber(value.adjusted_bpm) ||
		(value.transition_rating !== null &&
			(!isFiniteNumber(value.transition_rating) ||
				!Number.isInteger(value.transition_rating) ||
				value.transition_rating < 1 ||
				value.transition_rating > 5))
	) {
		return { entry: null, hasInvalidSnapshot: false }
	}

	const entry: PlayedTrackEntry = {
		track_id: value.track_id,
		time_added: value.time_added,
		adjusted_bpm: value.adjusted_bpm,
		transition_rating: value.transition_rating
	}
	let hasInvalidSnapshot = false

	for (const field of ['track_title', 'artist_display'] as const) {
		const snapshotValue = value[field]
		if (snapshotValue === undefined) continue
		if (typeof snapshotValue === 'string') {
			entry[field] = snapshotValue
		} else {
			hasInvalidSnapshot = true
		}
	}

	return { entry, hasInvalidSnapshot }
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
	const { user_id: _transportUserId, ...domainRow } = row
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
			...domainRow,
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
	const playedTracks: PlayedTrackEntry[] = []
	let hasInvalidPlayedTrack = !Array.isArray(row.played_tracks)

	if (Array.isArray(row.played_tracks)) {
		for (const value of row.played_tracks) {
			const decoded = decodePlayedTrackEntry(value)
			if (decoded.entry) playedTracks.push(decoded.entry)
			if (!decoded.entry || decoded.hasInvalidSnapshot) {
				hasInvalidPlayedTrack = true
			}
		}
	}

	if (hasInvalidPlayedTrack) {
		issues.push(issue('saved-set', row.id, 'played_tracks'))
	}

	return { row: { ...row, played_tracks: playedTracks }, issues }
}
