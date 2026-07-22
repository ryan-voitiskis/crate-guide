import type { TrackEnrichmentDraft } from '~/types/trackEnrichmentDraft'
import { RECORD_COVER_STORED_MAX_BYTES } from '~/utils/recordCover'
import {
	decodeTrackEnrichmentDraft,
	encodeTrackEnrichmentDraft
} from '~/utils/trackEnrichmentDraftCodec'
import { containsUnsafeTrackEnrichmentDraftPath } from '~/utils/trackEnrichmentDraftPrivacy'
import type { TrackAudioFeatures } from '~~/shared/types/audioFeatures'
import type {
	BeatportNotFoundMarker,
	BeatportTrackData
} from '~~/shared/types/beatport'
import type { DiscogsArtistDb, DiscogsLabelDb } from '~~/shared/types/discogs'
import type {
	CoverReference,
	LibraryCrate,
	LibraryDataset,
	LibraryPlayedTrackEntry,
	LibraryPreferences,
	LibraryRecord,
	LibrarySavedSet,
	LibraryTrack
} from '~~/shared/types/library'
import { BrowserStorageCodecError } from './browserLibraryErrors'
import {
	BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY,
	BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION,
	BROWSER_LIBRARY_REGISTRY_KEY,
	BROWSER_LIBRARY_SCHEMA_VERSION,
	type BrowserActiveWorkspaceMarker,
	type BrowserCopyReceipt,
	type BrowserManagedCover,
	type BrowserRepositoryChange,
	type BrowserRepositoryRegistry,
	type BrowserStorageHealth,
	type BrowserStoredPreferences,
	type BrowserStoredWorkflowDraft,
	type BrowserWorkflowDraft,
	type BrowserWorkspaceManifest,
	type BrowserWorkspaceOperations
} from './browserLibraryTypes'

export type BrowserStoredRecord = LibraryRecord & { workspaceId: string }
export type BrowserStoredTrack = LibraryTrack & { workspaceId: string }
export type BrowserStoredCrate = LibraryCrate & { workspaceId: string }
export type BrowserStoredSavedSet = LibrarySavedSet & { workspaceId: string }

const MAX_ID_LENGTH = 512
const MAX_SHORT_TEXT_LENGTH = 4_096
const MAX_LONG_TEXT_LENGTH = 65_536
const MAX_COLLECTION_LENGTH = 100_000
const SENSITIVE_URL_QUERY_KEYS = new Set([
	'accesskey',
	'accesskeyid',
	'accesstoken',
	'apikey',
	'auth',
	'authorization',
	'awsaccesskeyid',
	'clientsecret',
	'credential',
	'expires',
	'googleaccessid',
	'jwt',
	'keypairid',
	'oauthtoken',
	'password',
	'policy',
	'sas',
	'secret',
	'session',
	'sig',
	'signature',
	'token'
])

type UnknownRecord = Record<string, unknown>

function fail(path: string, message?: string): never {
	throw new BrowserStorageCodecError(path, message)
}

function plainObject(value: unknown, path: string): UnknownRecord {
	if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path)
	const prototype = Object.getPrototypeOf(value)
	if (prototype !== Object.prototype && prototype !== null) fail(path)
	return value as UnknownRecord
}

function exactKeys(
	value: UnknownRecord,
	allowed: readonly string[],
	path: string
) {
	const allowedKeys = new Set(allowed)
	for (const key of Object.keys(value)) {
		if (!allowedKeys.has(key)) fail(`${path}/${key}`)
	}
}

function stringValue(
	value: unknown,
	path: string,
	options: { allowEmpty?: boolean; maxLength?: number } = {}
): string {
	if (typeof value !== 'string') fail(path)
	if (!options.allowEmpty && value.trim() === '') fail(path)
	if (value.length > (options.maxLength ?? MAX_SHORT_TEXT_LENGTH)) fail(path)
	return value
}

function identifier(value: unknown, path: string): string {
	return stringValue(value, path, { maxLength: MAX_ID_LENGTH })
}

function nullableString(
	value: unknown,
	path: string,
	maxLength = MAX_LONG_TEXT_LENGTH
): string | null {
	return value === null
		? null
		: stringValue(value, path, { allowEmpty: true, maxLength })
}

function finiteNumber(value: unknown, path: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) fail(path)
	return value
}

function nullableFiniteNumber(value: unknown, path: string): number | null {
	return value === null ? null : finiteNumber(value, path)
}

function safeInteger(value: unknown, path: string, minimum = 0): number {
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value < minimum
	) {
		fail(path)
	}
	return value
}

function booleanValue(value: unknown, path: string): boolean {
	if (typeof value !== 'boolean') fail(path)
	return value
}

function timestamp(value: unknown, path: string): string {
	const decoded = stringValue(value, path, { maxLength: 128 })
	if (!Number.isFinite(Date.parse(decoded))) fail(path)
	return decoded
}

function nullableTimestamp(value: unknown, path: string): string | null {
	return value === null ? null : timestamp(value, path)
}

function arrayValue(value: unknown, path: string): unknown[] {
	if (!Array.isArray(value) || value.length > MAX_COLLECTION_LENGTH) fail(path)
	return value
}

function stringArray(value: unknown, path: string): string[] {
	return arrayValue(value, path).map((item, index) =>
		stringValue(item, `${path}/${index}`, {
			allowEmpty: true,
			maxLength: MAX_SHORT_TEXT_LENGTH
		})
	)
}

function safeUrl(value: unknown, path: string): string {
	const decoded = stringValue(value, path, { maxLength: 8_192 })
	let url: URL
	try {
		url = new URL(decoded)
	} catch {
		fail(path)
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') fail(path)
	if (url.username !== '' || url.password !== '') fail(path)
	for (const key of url.searchParams.keys()) {
		const lowerKey = key.toLowerCase()
		const normalizedKey = lowerKey.replace(/[^a-z0-9]/g, '')
		if (
			SENSITIVE_URL_QUERY_KEYS.has(normalizedKey) ||
			lowerKey.startsWith('x-amz-') ||
			lowerKey.startsWith('x-goog-')
		) {
			fail(path)
		}
	}
	return decoded
}

function nullableSafeUrl(value: unknown, path: string): string | null {
	return value === null ? null : safeUrl(value, path)
}

function relativeFileName(value: unknown, path: string): string {
	const decoded = stringValue(value, path, { maxLength: 4_096 })
	if (containsUnsafeTrackEnrichmentDraftPath(decoded)) fail(path)
	return decoded
}

function nullableLocationHint(value: unknown, path: string): string | null {
	if (value === null) return null
	const decoded = stringValue(value, path, {
		allowEmpty: true,
		maxLength: 4_096
	})
	if (containsUnsafeTrackEnrichmentDraftPath(decoded)) fail(path)
	return decoded
}

function decodeArtist(value: unknown, path: string): DiscogsArtistDb {
	const object = plainObject(value, path)
	exactKeys(object, ['discogs_id', 'name', 'role'], path)
	if (object.discogs_id !== undefined)
		safeInteger(object.discogs_id, `${path}/discogs_id`)
	stringValue(object.name, `${path}/name`)
	if (object.role !== undefined && object.role !== null)
		stringValue(object.role, `${path}/role`, { allowEmpty: true })
	return structuredClone(object) as DiscogsArtistDb
}

function decodeLabel(value: unknown, path: string): DiscogsLabelDb {
	const object = plainObject(value, path)
	exactKeys(
		object,
		['discogs_id', 'name', 'catno', 'entity_type', 'thumbnail_url'],
		path
	)
	if (object.discogs_id !== undefined)
		safeInteger(object.discogs_id, `${path}/discogs_id`)
	stringValue(object.name, `${path}/name`)
	for (const field of ['catno', 'entity_type'] as const) {
		if (object[field] !== undefined)
			stringValue(object[field], `${path}/${field}`, { allowEmpty: true })
	}
	if (object.thumbnail_url !== undefined) {
		const thumbnailUrl = stringValue(
			object.thumbnail_url,
			`${path}/thumbnail_url`,
			{ allowEmpty: true, maxLength: 8_192 }
		)
		if (thumbnailUrl !== '') safeUrl(thumbnailUrl, `${path}/thumbnail_url`)
	}
	return structuredClone(object) as DiscogsLabelDb
}

function decodeCover(value: unknown, path: string): CoverReference {
	const object = plainObject(value, path)
	const kind = object.kind
	if (kind === 'none') {
		exactKeys(object, ['kind'], path)
		return { kind }
	}
	if (kind === 'external') {
		exactKeys(object, ['kind', 'url'], path)
		return { kind, url: safeUrl(object.url, `${path}/url`) }
	}
	if (kind === 'browser') {
		exactKeys(object, ['kind', 'assetId', 'fallbackUrl'], path)
		return {
			kind,
			assetId: identifier(object.assetId, `${path}/assetId`),
			fallbackUrl: nullableSafeUrl(object.fallbackUrl, `${path}/fallbackUrl`)
		}
	}
	// Cloud references can contain managed paths or expiring URLs. Plan 072 must
	// copy and remap their bytes before they cross this storage boundary.
	fail(`${path}/kind`)
}

function decodeBeatportData(
	value: unknown,
	path: string
): BeatportTrackData | BeatportNotFoundMarker | null {
	if (value === null) return null
	const object = plainObject(value, path)
	if ('notFound' in object || 'searched' in object) {
		exactKeys(object, ['searched', 'notFound', 'searchedAt'], path)
		return {
			searched: booleanValue(object.searched, `${path}/searched`),
			notFound: booleanValue(object.notFound, `${path}/notFound`),
			searchedAt: finiteNumber(object.searchedAt, `${path}/searchedAt`)
		}
	}
	exactKeys(object, ['accessed', 'url', 'genre', 'bpm', 'key', 'img'], path)
	return {
		accessed: finiteNumber(object.accessed, `${path}/accessed`),
		url: safeUrl(object.url, `${path}/url`),
		genre: stringValue(object.genre, `${path}/genre`, { allowEmpty: true }),
		bpm: nullableFiniteNumber(object.bpm, `${path}/bpm`),
		key: stringValue(object.key, `${path}/key`, { allowEmpty: true }),
		img: safeUrl(object.img, `${path}/img`)
	}
}

const AUDIO_SOURCE_KEYS = [
	'rekordboxXml',
	'embeddedTags',
	'essentiaBrowser'
] as const

function decodeAppliedSource(value: unknown, path: string) {
	if (value === null) return
	const object = plainObject(value, path)
	exactKeys(object, ['source', 'appliedAt'], path)
	if (!AUDIO_SOURCE_KEYS.includes(object.source as never))
		fail(`${path}/source`)
	timestamp(object.appliedAt, `${path}/appliedAt`)
}

function validateNullableStringFields(
	object: UnknownRecord,
	fields: readonly string[],
	path: string
) {
	for (const field of fields) nullableString(object[field], `${path}/${field}`)
}

function validateNullableNumberFields(
	object: UnknownRecord,
	fields: readonly string[],
	path: string
) {
	for (const field of fields)
		nullableFiniteNumber(object[field], `${path}/${field}`)
}

function decodeRekordboxSource(value: unknown, path: string) {
	const object = plainObject(value, path)
	const nullableStrings = [
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
	] as const
	const nullableNumbers = [
		'averageBpm',
		'parsedKey',
		'parsedMode',
		'totalTimeSeconds',
		'year',
		'sampleRate',
		'bitRate',
		'rating',
		'playCount'
	] as const
	exactKeys(
		object,
		['importedAt', 'fileName', ...nullableStrings, ...nullableNumbers],
		path
	)
	timestamp(object.importedAt, `${path}/importedAt`)
	relativeFileName(object.fileName, `${path}/fileName`)
	validateNullableStringFields(object, nullableStrings, path)
	nullableLocationHint(object.locationHint, `${path}/locationHint`)
	validateNullableNumberFields(object, nullableNumbers, path)
}

function decodeEmbeddedTagsSource(value: unknown, path: string) {
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'importedAt',
			'fileName',
			'locationHint',
			'fileSize',
			'lastModified',
			'title',
			'artist',
			'album',
			'genres',
			'durationSeconds',
			'bpm',
			'key'
		],
		path
	)
	timestamp(object.importedAt, `${path}/importedAt`)
	relativeFileName(object.fileName, `${path}/fileName`)
	nullableLocationHint(object.locationHint, `${path}/locationHint`)
	finiteNumber(object.fileSize, `${path}/fileSize`)
	finiteNumber(object.lastModified, `${path}/lastModified`)
	validateNullableStringFields(
		object,
		['title', 'artist', 'album', 'key'],
		path
	)
	stringArray(object.genres, `${path}/genres`)
	validateNullableNumberFields(object, ['durationSeconds', 'bpm'], path)
}

function decodeEssentiaSource(value: unknown, path: string) {
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'importedAt',
			'analyzerVersion',
			'configurationVersion',
			'bpm',
			'bpmConfidence',
			'bpmEstimates',
			'key',
			'scale',
			'keyStrength',
			'sampleRate',
			'durationSeconds',
			'analyzedDurationSeconds',
			'analysisOffsetSeconds',
			'warnings'
		],
		path
	)
	timestamp(object.importedAt, `${path}/importedAt`)
	stringValue(object.analyzerVersion, `${path}/analyzerVersion`)
	stringValue(object.configurationVersion, `${path}/configurationVersion`)
	validateNullableNumberFields(
		object,
		['bpm', 'bpmConfidence', 'keyStrength'],
		path
	)
	arrayValue(object.bpmEstimates, `${path}/bpmEstimates`).forEach(
		(value, index) => finiteNumber(value, `${path}/bpmEstimates/${index}`)
	)
	validateNullableStringFields(object, ['key', 'scale'], path)
	for (const field of [
		'sampleRate',
		'durationSeconds',
		'analyzedDurationSeconds',
		'analysisOffsetSeconds'
	]) {
		finiteNumber(object[field], `${path}/${field}`)
	}
	stringArray(object.warnings, `${path}/warnings`)
}

function decodeAudioFeatures(
	value: unknown,
	path: string
): TrackAudioFeatures | null {
	if (value === null) return null
	const object = plainObject(value, path)
	exactKeys(
		object,
		['version', 'updatedAt', 'applied', 'match', 'sources'],
		path
	)
	if (object.version !== 1) fail(`${path}/version`)
	timestamp(object.updatedAt, `${path}/updatedAt`)

	const applied = plainObject(object.applied, `${path}/applied`)
	exactKeys(applied, ['bpm', 'keyMode'], `${path}/applied`)
	decodeAppliedSource(applied.bpm, `${path}/applied/bpm`)
	decodeAppliedSource(applied.keyMode, `${path}/applied/keyMode`)

	const match = plainObject(object.match, `${path}/match`)
	exactKeys(
		match,
		['confidence', 'score', 'reasons', 'warnings'],
		`${path}/match`
	)
	if (!['high', 'medium', 'manual'].includes(String(match.confidence)))
		fail(`${path}/match/confidence`)
	finiteNumber(match.score, `${path}/match/score`)
	stringArray(match.reasons, `${path}/match/reasons`)
	stringArray(match.warnings, `${path}/match/warnings`)

	const sources = plainObject(object.sources, `${path}/sources`)
	exactKeys(sources, AUDIO_SOURCE_KEYS, `${path}/sources`)
	if (sources.rekordboxXml !== undefined)
		decodeRekordboxSource(sources.rekordboxXml, `${path}/sources/rekordboxXml`)
	if (sources.embeddedTags !== undefined)
		decodeEmbeddedTagsSource(
			sources.embeddedTags,
			`${path}/sources/embeddedTags`
		)
	if (sources.essentiaBrowser !== undefined)
		decodeEssentiaSource(
			sources.essentiaBrowser,
			`${path}/sources/essentiaBrowser`
		)

	return structuredClone(object) as TrackAudioFeatures
}

export function decodeLibraryRecord(
	value: unknown,
	path = '/record'
): LibraryRecord {
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'id',
			'title',
			'artists',
			'labels',
			'year',
			'cover',
			'discogs_id',
			'discogs_release_url',
			'created_at',
			'updated_at'
		],
		path
	)
	identifier(object.id, `${path}/id`)
	stringValue(object.title, `${path}/title`, {
		maxLength: MAX_LONG_TEXT_LENGTH
	})
	arrayValue(object.artists, `${path}/artists`).forEach((artist, index) =>
		decodeArtist(artist, `${path}/artists/${index}`)
	)
	arrayValue(object.labels, `${path}/labels`).forEach((label, index) =>
		decodeLabel(label, `${path}/labels/${index}`)
	)
	nullableFiniteNumber(object.year, `${path}/year`)
	decodeCover(object.cover, `${path}/cover`)
	if (object.discogs_id !== null)
		safeInteger(object.discogs_id, `${path}/discogs_id`)
	nullableSafeUrl(object.discogs_release_url, `${path}/discogs_release_url`)
	nullableTimestamp(object.created_at, `${path}/created_at`)
	nullableTimestamp(object.updated_at, `${path}/updated_at`)
	return structuredClone(object) as LibraryRecord
}

export function decodeLibraryTrack(
	value: unknown,
	path = '/track'
): LibraryTrack {
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'id',
			'record_id',
			'title',
			'artists',
			'extraartists',
			'position',
			'duration',
			'bpm',
			'rpm',
			'key',
			'mode',
			'genres',
			'time_signature_upper',
			'time_signature_lower',
			'playable',
			'beatport_data',
			'audio_features',
			'created_at',
			'updated_at'
		],
		path
	)
	identifier(object.id, `${path}/id`)
	identifier(object.record_id, `${path}/record_id`)
	stringValue(object.title, `${path}/title`, {
		maxLength: MAX_LONG_TEXT_LENGTH
	})
	for (const field of ['artists', 'extraartists'] as const) {
		arrayValue(object[field], `${path}/${field}`).forEach((artist, index) =>
			decodeArtist(artist, `${path}/${field}/${index}`)
		)
	}
	nullableString(object.position, `${path}/position`)
	for (const field of [
		'duration',
		'bpm',
		'rpm',
		'key',
		'mode',
		'time_signature_upper',
		'time_signature_lower'
	] as const) {
		nullableFiniteNumber(object[field], `${path}/${field}`)
	}
	stringArray(object.genres, `${path}/genres`)
	if (object.playable !== null)
		booleanValue(object.playable, `${path}/playable`)
	decodeBeatportData(object.beatport_data, `${path}/beatport_data`)
	decodeAudioFeatures(object.audio_features, `${path}/audio_features`)
	nullableTimestamp(object.created_at, `${path}/created_at`)
	nullableTimestamp(object.updated_at, `${path}/updated_at`)
	return structuredClone(object) as LibraryTrack
}

export function decodeLibraryCrate(
	value: unknown,
	path = '/crate'
): LibraryCrate {
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'id',
			'name',
			'description',
			'color',
			'records',
			'created_at',
			'updated_at'
		],
		path
	)
	identifier(object.id, `${path}/id`)
	stringValue(object.name, `${path}/name`)
	nullableString(object.description, `${path}/description`)
	nullableString(object.color, `${path}/color`)
	const records = arrayValue(object.records, `${path}/records`).map(
		(recordId, index) => identifier(recordId, `${path}/records/${index}`)
	)
	if (new Set(records).size !== records.length) fail(`${path}/records`)
	nullableTimestamp(object.created_at, `${path}/created_at`)
	nullableTimestamp(object.updated_at, `${path}/updated_at`)
	return structuredClone(object) as LibraryCrate
}

function decodePlayedTrack(
	value: unknown,
	path: string
): LibraryPlayedTrackEntry {
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'track_id',
			'time_added',
			'adjusted_bpm',
			'transition_rating',
			'track_title',
			'artist_display'
		],
		path
	)
	identifier(object.track_id, `${path}/track_id`)
	const timeAdded = finiteNumber(object.time_added, `${path}/time_added`)
	if (timeAdded < 0) fail(`${path}/time_added`)
	nullableFiniteNumber(object.adjusted_bpm, `${path}/adjusted_bpm`)
	if (object.transition_rating !== null) {
		const rating = safeInteger(
			object.transition_rating,
			`${path}/transition_rating`
		)
		if (rating < 1 || rating > 5) fail(`${path}/transition_rating`)
	}
	for (const field of ['track_title', 'artist_display'] as const) {
		if (object[field] !== undefined)
			stringValue(object[field], `${path}/${field}`, {
				allowEmpty: true,
				maxLength: MAX_LONG_TEXT_LENGTH
			})
	}
	return structuredClone(object) as LibraryPlayedTrackEntry
}

export function decodeLibrarySavedSet(
	value: unknown,
	path = '/savedSet'
): LibrarySavedSet {
	const object = plainObject(value, path)
	exactKeys(
		object,
		['id', 'name', 'played_tracks', 'created_at', 'updated_at'],
		path
	)
	identifier(object.id, `${path}/id`)
	nullableString(object.name, `${path}/name`)
	arrayValue(object.played_tracks, `${path}/played_tracks`).forEach(
		(entry, index) => decodePlayedTrack(entry, `${path}/played_tracks/${index}`)
	)
	nullableTimestamp(object.created_at, `${path}/created_at`)
	nullableTimestamp(object.updated_at, `${path}/updated_at`)
	return structuredClone(object) as LibrarySavedSet
}

export function decodeLibraryPreferences(
	value: unknown,
	path = '/preferences'
): LibraryPreferences {
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'ui_theme',
			'key_format',
			'list_layout',
			'selected_crate',
			'turntable_pitch_range',
			'turntable_theme'
		],
		path
	)
	if (!['light', 'dark', 'auto'].includes(String(object.ui_theme)))
		fail(`${path}/ui_theme`)
	if (!['key', 'camelot'].includes(String(object.key_format)))
		fail(`${path}/key_format`)
	stringValue(object.list_layout, `${path}/list_layout`, { allowEmpty: true })
	stringValue(object.selected_crate, `${path}/selected_crate`, {
		allowEmpty: true,
		maxLength: MAX_ID_LENGTH
	})
	const pitchRange = finiteNumber(
		object.turntable_pitch_range,
		`${path}/turntable_pitch_range`
	)
	if (pitchRange <= 0 || pitchRange > 100) fail(`${path}/turntable_pitch_range`)
	if (!['silver', 'black'].includes(String(object.turntable_theme)))
		fail(`${path}/turntable_theme`)
	return structuredClone(object) as LibraryPreferences
}

function uniqueEntityIds(
	entities: readonly { id: string }[],
	path: string
): Set<string> {
	const ids = new Set<string>()
	for (const [index, entity] of entities.entries()) {
		if (ids.has(entity.id)) fail(`${path}/${index}/id`)
		ids.add(entity.id)
	}
	return ids
}

export function decodeLibraryDataset(
	value: unknown,
	path = '/snapshot'
): LibraryDataset {
	const object = plainObject(value, path)
	exactKeys(
		object,
		['records', 'tracks', 'crates', 'savedSets', 'preferences'],
		path
	)
	const records = arrayValue(object.records, `${path}/records`).map(
		(record, index) => decodeLibraryRecord(record, `${path}/records/${index}`)
	)
	const tracks = arrayValue(object.tracks, `${path}/tracks`).map(
		(track, index) => decodeLibraryTrack(track, `${path}/tracks/${index}`)
	)
	const crates = arrayValue(object.crates, `${path}/crates`).map(
		(crate, index) => decodeLibraryCrate(crate, `${path}/crates/${index}`)
	)
	const savedSets = arrayValue(object.savedSets, `${path}/savedSets`).map(
		(savedSet, index) =>
			decodeLibrarySavedSet(savedSet, `${path}/savedSets/${index}`)
	)
	const preferences = decodeLibraryPreferences(
		object.preferences,
		`${path}/preferences`
	)
	const recordIds = uniqueEntityIds(records, `${path}/records`)
	uniqueEntityIds(tracks, `${path}/tracks`)
	const crateIds = uniqueEntityIds(crates, `${path}/crates`)
	uniqueEntityIds(savedSets, `${path}/savedSets`)
	const coverAssetIds = new Set<string>()

	for (const [index, record] of records.entries()) {
		if (record.cover.kind !== 'browser') continue
		if (coverAssetIds.has(record.cover.assetId)) {
			fail(`${path}/records/${index}/cover/assetId`)
		}
		coverAssetIds.add(record.cover.assetId)
	}
	for (const [index, track] of tracks.entries()) {
		if (!recordIds.has(track.record_id))
			fail(`${path}/tracks/${index}/record_id`)
	}
	for (const [crateIndex, crate] of crates.entries()) {
		for (const [recordIndex, recordId] of crate.records.entries()) {
			if (!recordIds.has(recordId))
				fail(`${path}/crates/${crateIndex}/records/${recordIndex}`)
		}
	}
	if (
		preferences.selected_crate !== '' &&
		!crateIds.has(preferences.selected_crate)
	) {
		fail(`${path}/preferences/selected_crate`)
	}

	return { records, tracks, crates, savedSets, preferences }
}

function withWorkspace<T extends object>(
	workspaceId: string,
	value: T
): T & { workspaceId: string } {
	return { workspaceId: identifier(workspaceId, '/workspaceId'), ...value }
}

function decodeWorkspaceEntity<T extends object>(
	value: unknown,
	expectedWorkspaceId: string,
	path: string,
	entityKeys: readonly string[],
	decode: (entity: unknown, entityPath: string) => T
): T & { workspaceId: string } {
	const object = plainObject(value, path)
	exactKeys(object, ['workspaceId', ...entityKeys], path)
	const workspaceId = identifier(object.workspaceId, `${path}/workspaceId`)
	if (workspaceId !== expectedWorkspaceId) fail(`${path}/workspaceId`)
	const { workspaceId: _workspaceId, ...entity } = object
	return withWorkspace(workspaceId, decode(entity, path))
}

const RECORD_KEYS = [
	'id',
	'title',
	'artists',
	'labels',
	'year',
	'cover',
	'discogs_id',
	'discogs_release_url',
	'created_at',
	'updated_at'
] as const
const TRACK_KEYS = [
	'id',
	'record_id',
	'title',
	'artists',
	'extraartists',
	'position',
	'duration',
	'bpm',
	'rpm',
	'key',
	'mode',
	'genres',
	'time_signature_upper',
	'time_signature_lower',
	'playable',
	'beatport_data',
	'audio_features',
	'created_at',
	'updated_at'
] as const
const CRATE_KEYS = [
	'id',
	'name',
	'description',
	'color',
	'records',
	'created_at',
	'updated_at'
] as const
const SAVED_SET_KEYS = [
	'id',
	'name',
	'played_tracks',
	'created_at',
	'updated_at'
] as const

export function encodeBrowserRecordRow(
	workspaceId: string,
	record: LibraryRecord
): BrowserStoredRecord {
	return withWorkspace(workspaceId, decodeLibraryRecord(record))
}

export function decodeBrowserRecordRow(
	value: unknown,
	expectedWorkspaceId: string
): BrowserStoredRecord {
	return decodeWorkspaceEntity(
		value,
		expectedWorkspaceId,
		'/record',
		RECORD_KEYS,
		decodeLibraryRecord
	)
}

export function encodeBrowserTrackRow(
	workspaceId: string,
	track: LibraryTrack
): BrowserStoredTrack {
	return withWorkspace(workspaceId, decodeLibraryTrack(track))
}

export function decodeBrowserTrackRow(
	value: unknown,
	expectedWorkspaceId: string
): BrowserStoredTrack {
	return decodeWorkspaceEntity(
		value,
		expectedWorkspaceId,
		'/track',
		TRACK_KEYS,
		decodeLibraryTrack
	)
}

export function encodeBrowserCrateRow(
	workspaceId: string,
	crate: LibraryCrate
): BrowserStoredCrate {
	return withWorkspace(workspaceId, decodeLibraryCrate(crate))
}

export function decodeBrowserCrateRow(
	value: unknown,
	expectedWorkspaceId: string
): BrowserStoredCrate {
	return decodeWorkspaceEntity(
		value,
		expectedWorkspaceId,
		'/crate',
		CRATE_KEYS,
		decodeLibraryCrate
	)
}

export function encodeBrowserSavedSetRow(
	workspaceId: string,
	savedSet: LibrarySavedSet
): BrowserStoredSavedSet {
	return withWorkspace(workspaceId, decodeLibrarySavedSet(savedSet))
}

export function decodeBrowserSavedSetRow(
	value: unknown,
	expectedWorkspaceId: string
): BrowserStoredSavedSet {
	return decodeWorkspaceEntity(
		value,
		expectedWorkspaceId,
		'/savedSet',
		SAVED_SET_KEYS,
		decodeLibrarySavedSet
	)
}

export function encodeBrowserPreferencesRow(
	workspaceId: string,
	preferences: LibraryPreferences
): BrowserStoredPreferences {
	return {
		workspaceId: identifier(workspaceId, '/preferences/workspaceId'),
		value: decodeLibraryPreferences(preferences)
	}
}

export function decodeBrowserPreferencesRow(
	value: unknown,
	expectedWorkspaceId: string
): BrowserStoredPreferences {
	const object = plainObject(value, '/preferences')
	exactKeys(object, ['workspaceId', 'value'], '/preferences')
	const workspaceId = identifier(object.workspaceId, '/preferences/workspaceId')
	if (workspaceId !== expectedWorkspaceId) fail('/preferences/workspaceId')
	return {
		workspaceId,
		value: decodeLibraryPreferences(object.value, '/preferences/value')
	}
}

export function decodeBrowserWorkspaceManifest(
	value: unknown
): BrowserWorkspaceManifest {
	const path = '/workspace'
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'id',
			'name',
			'schemaVersion',
			'createdAt',
			'updatedAt',
			'contentRevision',
			'repositoryRevision',
			'lastSuccessfulContentWriteAt',
			'coverCompleteness'
		],
		path
	)
	identifier(object.id, `${path}/id`)
	stringValue(object.name, `${path}/name`)
	if (
		safeInteger(object.schemaVersion, `${path}/schemaVersion`, 1) !==
		BROWSER_LIBRARY_SCHEMA_VERSION
	) {
		fail(`${path}/schemaVersion`)
	}
	timestamp(object.createdAt, `${path}/createdAt`)
	timestamp(object.updatedAt, `${path}/updatedAt`)
	safeInteger(object.contentRevision, `${path}/contentRevision`)
	safeInteger(object.repositoryRevision, `${path}/repositoryRevision`)
	if (Number(object.repositoryRevision) < Number(object.contentRevision))
		fail(`${path}/repositoryRevision`)
	nullableTimestamp(
		object.lastSuccessfulContentWriteAt,
		`${path}/lastSuccessfulContentWriteAt`
	)
	if (
		object.coverCompleteness !== 'complete' &&
		object.coverCompleteness !== 'missing'
	)
		fail(`${path}/coverCompleteness`)
	return structuredClone(object) as BrowserWorkspaceManifest
}

export function decodeBrowserRepositoryRegistry(
	value: unknown
): BrowserRepositoryRegistry {
	const path = '/registry'
	const object = plainObject(value, path)
	exactKeys(
		object,
		['key', 'schemaVersion', 'catalogRevision', 'createdAt', 'updatedAt'],
		path
	)
	if (object.key !== BROWSER_LIBRARY_REGISTRY_KEY) fail(`${path}/key`)
	if (
		safeInteger(object.schemaVersion, `${path}/schemaVersion`, 1) !==
		BROWSER_LIBRARY_SCHEMA_VERSION
	) {
		fail(`${path}/schemaVersion`)
	}
	safeInteger(object.catalogRevision, `${path}/catalogRevision`)
	timestamp(object.createdAt, `${path}/createdAt`)
	timestamp(object.updatedAt, `${path}/updatedAt`)
	return structuredClone(object) as BrowserRepositoryRegistry
}

export function decodeBrowserActiveWorkspaceMarker(
	value: unknown
): BrowserActiveWorkspaceMarker {
	const path = '/activeWorkspace'
	const object = plainObject(value, path)
	exactKeys(
		object,
		['key', 'workspaceId', 'catalogRevision', 'updatedAt'],
		path
	)
	if (object.key !== BROWSER_LIBRARY_ACTIVE_WORKSPACE_KEY) fail(`${path}/key`)
	identifier(object.workspaceId, `${path}/workspaceId`)
	safeInteger(object.catalogRevision, `${path}/catalogRevision`)
	timestamp(object.updatedAt, `${path}/updatedAt`)
	return structuredClone(object) as BrowserActiveWorkspaceMarker
}

export function decodeBrowserStorageHealth(
	value: unknown,
	path = '/storageHealth'
): BrowserStorageHealth {
	const object = plainObject(value, path)
	exactKeys(object, ['code', 'message', 'checkedAt'], path)
	if (
		![
			'healthy',
			'unavailable',
			'quota',
			'blocked-upgrade',
			'corrupt',
			'unknown'
		].includes(String(object.code))
	) {
		fail(`${path}/code`)
	}
	stringValue(object.message, `${path}/message`, { allowEmpty: true })
	timestamp(object.checkedAt, `${path}/checkedAt`)
	return structuredClone(object) as BrowserStorageHealth
}

export function decodeBrowserCopyReceipt(
	value: unknown,
	path = '/copyReceipt'
): BrowserCopyReceipt {
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'migrationId',
			'sourceContentRevision',
			'phase',
			'status',
			'createdAt',
			'updatedAt'
		],
		path
	)
	identifier(object.migrationId, `${path}/migrationId`)
	safeInteger(object.sourceContentRevision, `${path}/sourceContentRevision`)
	if (
		!['preparing', 'metadata', 'covers', 'verification', 'complete'].includes(
			String(object.phase)
		)
	)
		fail(`${path}/phase`)
	if (
		!['pending', 'in-progress', 'paused', 'failed', 'complete'].includes(
			String(object.status)
		)
	)
		fail(`${path}/status`)
	timestamp(object.createdAt, `${path}/createdAt`)
	timestamp(object.updatedAt, `${path}/updatedAt`)
	return structuredClone(object) as BrowserCopyReceipt
}

export function decodeBrowserWorkspaceOperations(
	value: unknown,
	expectedWorkspaceId: string
): BrowserWorkspaceOperations {
	const path = '/operations'
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'workspaceId',
			'lastExportedContentRevision',
			'lastExportedAt',
			'storageHealth',
			'copyReceipt'
		],
		path
	)
	const workspaceId = identifier(object.workspaceId, `${path}/workspaceId`)
	if (workspaceId !== expectedWorkspaceId) fail(`${path}/workspaceId`)
	if (object.lastExportedContentRevision !== null)
		safeInteger(
			object.lastExportedContentRevision,
			`${path}/lastExportedContentRevision`
		)
	nullableTimestamp(object.lastExportedAt, `${path}/lastExportedAt`)
	decodeBrowserStorageHealth(object.storageHealth, `${path}/storageHealth`)
	if (object.copyReceipt !== null)
		decodeBrowserCopyReceipt(object.copyReceipt, `${path}/copyReceipt`)
	return structuredClone(object) as BrowserWorkspaceOperations
}

export function encodeBrowserManagedCover(
	value: BrowserManagedCover
): BrowserManagedCover {
	return decodeBrowserManagedCover(value, value.workspaceId)
}

export function decodeBrowserManagedCover(
	value: unknown,
	expectedWorkspaceId: string
): BrowserManagedCover {
	const path = '/cover'
	const object = plainObject(value, path)
	exactKeys(
		object,
		['workspaceId', 'assetId', 'recordId', 'blob', 'createdAt', 'updatedAt'],
		path
	)
	const workspaceId = identifier(object.workspaceId, `${path}/workspaceId`)
	if (workspaceId !== expectedWorkspaceId) fail(`${path}/workspaceId`)
	identifier(object.assetId, `${path}/assetId`)
	identifier(object.recordId, `${path}/recordId`)
	if (
		!(object.blob instanceof Blob) ||
		object.blob.type !== 'image/webp' ||
		object.blob.size <= 0 ||
		object.blob.size > RECORD_COVER_STORED_MAX_BYTES
	) {
		fail(`${path}/blob`)
	}
	timestamp(object.createdAt, `${path}/createdAt`)
	timestamp(object.updatedAt, `${path}/updatedAt`)
	return structuredClone(object) as BrowserManagedCover
}

export function encodeBrowserWorkflowDraftRow(
	workspaceId: string,
	draft: BrowserWorkflowDraft
): BrowserStoredWorkflowDraft {
	const payload = decodeTrackEnrichmentDraftPayload(draft.payload)
	if (draft.kind !== 'track-enrichment') fail('/draft/kind')
	if (
		draft.id !== payload.id ||
		draft.draftRevision !== payload.draftRevision ||
		draft.updatedAt !== payload.updatedAt ||
		payload.workspace.workspaceId !== workspaceId
	) {
		fail('/draft/payload')
	}
	return decodeBrowserWorkflowDraftRow(
		{
			workspaceId,
			id: draft.id,
			kind: draft.kind,
			draftRevision: draft.draftRevision,
			updatedAt: draft.updatedAt,
			serializedPayload: encodeTrackEnrichmentDraft(payload)
		},
		workspaceId
	)
}

export function decodeBrowserWorkflowDraftRow(
	value: unknown,
	expectedWorkspaceId: string
): BrowserStoredWorkflowDraft {
	const path = '/draft'
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'workspaceId',
			'id',
			'kind',
			'draftRevision',
			'updatedAt',
			'serializedPayload'
		],
		path
	)
	const workspaceId = identifier(object.workspaceId, `${path}/workspaceId`)
	if (workspaceId !== expectedWorkspaceId) fail(`${path}/workspaceId`)
	const id = identifier(object.id, `${path}/id`)
	if (object.kind !== 'track-enrichment') fail(`${path}/kind`)
	const draftRevision = safeInteger(
		object.draftRevision,
		`${path}/draftRevision`
	)
	const updatedAt = timestamp(object.updatedAt, `${path}/updatedAt`)
	const serializedPayload = stringValue(
		object.serializedPayload,
		`${path}/serializedPayload`,
		{ maxLength: 8 * 1024 * 1024 }
	)
	const decoded = decodeTrackEnrichmentDraft(serializedPayload)
	if (
		decoded.status !== 'ok' ||
		decoded.draft.id !== id ||
		decoded.draft.draftRevision !== draftRevision ||
		decoded.draft.updatedAt !== updatedAt ||
		decoded.draft.workspace.workspaceId !== workspaceId
	) {
		fail(`${path}/serializedPayload`)
	}
	return {
		workspaceId,
		id,
		kind: 'track-enrichment',
		draftRevision,
		updatedAt,
		serializedPayload
	}
}

export function decodeBrowserWorkflowDraft(
	row: BrowserStoredWorkflowDraft
): BrowserWorkflowDraft {
	const decoded = decodeTrackEnrichmentDraft(row.serializedPayload)
	if (decoded.status !== 'ok') fail('/draft/serializedPayload')
	return {
		id: row.id,
		kind: row.kind,
		draftRevision: row.draftRevision,
		updatedAt: row.updatedAt,
		payload: decoded.draft
	}
}

export function decodeTrackEnrichmentDraftPayload(
	value: unknown,
	path = '/draft/payload'
): TrackEnrichmentDraft {
	let serialized: string
	try {
		serialized = encodeTrackEnrichmentDraft(value as TrackEnrichmentDraft)
	} catch {
		fail(path, undefined)
	}
	const decoded = decodeTrackEnrichmentDraft(serialized)
	if (decoded.status !== 'ok') fail(path)
	return decoded.draft
}

export function decodeBrowserRepositoryChange(
	value: unknown
): BrowserRepositoryChange {
	const path = '/broadcast'
	const object = plainObject(value, path)
	exactKeys(
		object,
		[
			'protocolVersion',
			'eventId',
			'senderId',
			'type',
			'workspaceId',
			'catalogRevision',
			'repositoryRevision',
			'contentRevision',
			'committedAt',
			'invalidations'
		],
		path
	)
	if (object.protocolVersion !== BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION)
		fail(`${path}/protocolVersion`)
	identifier(object.eventId, `${path}/eventId`)
	identifier(object.senderId, `${path}/senderId`)
	if (!['commit', 'delete', 'reset'].includes(String(object.type)))
		fail(`${path}/type`)
	identifier(object.workspaceId, `${path}/workspaceId`)
	for (const field of [
		'catalogRevision',
		'repositoryRevision',
		'contentRevision'
	] as const) {
		if (object[field] !== null) safeInteger(object[field], `${path}/${field}`)
	}
	timestamp(object.committedAt, `${path}/committedAt`)
	arrayValue(object.invalidations, `${path}/invalidations`).forEach(
		(invalidation, index) => {
			const invalidationPath = `${path}/invalidations/${index}`
			const candidate = plainObject(invalidation, invalidationPath)
			exactKeys(candidate, ['entity', 'ids'], invalidationPath)
			if (
				![
					'workspace',
					'operations',
					'preferences',
					'records',
					'tracks',
					'crates',
					'saved-sets',
					'covers',
					'drafts'
				].includes(String(candidate.entity))
			) {
				fail(`${invalidationPath}/entity`)
			}
			arrayValue(candidate.ids, `${invalidationPath}/ids`).forEach(
				(id, idIndex) => identifier(id, `${invalidationPath}/ids/${idIndex}`)
			)
		}
	)
	return structuredClone(object) as BrowserRepositoryChange
}
