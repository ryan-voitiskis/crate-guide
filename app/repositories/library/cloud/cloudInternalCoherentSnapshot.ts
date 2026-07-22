import { z } from 'zod'
import type { DecodeIssue } from '~/utils/supabaseRows'
import type { Database, Json } from '~~/shared/types/database'
import type { LibraryDataset } from '~~/shared/types/library'
import {
	decodeLibraryCrateRow,
	decodeLibraryPreferences,
	decodeLibraryRecordRow,
	decodeLibrarySavedSetRow,
	decodeLibraryTrackRow
} from '../codecs/supabaseLibraryCodecs'
import type {
	LibraryRepositoryBundle,
	RepositoryCommand,
	WorkspaceOperationContext
} from '../contracts'
import type { CloudRepositoryState } from './cloudRepositoryState'

type UnknownRecord = Record<string, unknown>
type RecordRow = Database['public']['Tables']['records']['Row']
type TrackRow = Database['public']['Tables']['tracks']['Row']
type CrateRow = Database['public']['Tables']['crates']['Row']
type SavedSetRow = Database['public']['Tables']['sets']['Row']

const INTERNAL_TRANSPORT_OWNER = 'internal-coherent-snapshot'
const MAX_COLLECTION_LENGTH = 100_000
const MAX_IDENTIFIER_LENGTH = 512
const MAX_TEXT_LENGTH = 65_536
const MAX_URL_OR_PATH_LENGTH = 8_192
const FORBIDDEN_NORMALIZED_KEYS = new Set([
	'accesssecret',
	'accesstoken',
	'authorization',
	'credential',
	'credentials',
	'discogscredentials',
	'idtoken',
	'ownerid',
	'password',
	'refreshtoken',
	'requestsecret',
	'requesttoken',
	'secret',
	'session',
	'signedurl',
	'token',
	'userid'
])

class CloudInternalSnapshotDecodeError extends Error {
	constructor(path: string) {
		super(`Invalid internal cloud snapshot at ${path}`)
		this.name = 'CloudInternalSnapshotDecodeError'
	}
}

function nonemptyString(maximumLength = MAX_TEXT_LENGTH) {
	return z
		.string()
		.max(maximumLength)
		.refine((value) => value.trim().length > 0)
}

const identifierSchema = nonemptyString(MAX_IDENTIFIER_LENGTH)
const textSchema = z.string().max(MAX_TEXT_LENGTH)
const nullableTextSchema = textSchema.nullable()
const nullableUrlOrPathSchema = z
	.string()
	.max(MAX_URL_OR_PATH_LENGTH)
	.nullable()
const nullableFiniteNumberSchema = z.number().finite().nullable()
const nullableTimestampSchema = z
	.string()
	.max(128)
	.refine((value) => Number.isFinite(Date.parse(value)))
	.nullable()
const artistSchema = z
	.object({
		discogs_id: z.number().int().nonnegative().optional(),
		name: nonemptyString(),
		role: textSchema.nullable().optional()
	})
	.strict()
const labelSchema = z
	.object({
		discogs_id: z.number().int().nonnegative().optional(),
		name: textSchema,
		catno: textSchema.optional(),
		entity_type: textSchema.optional(),
		thumbnail_url: z.string().max(MAX_URL_OR_PATH_LENGTH).optional()
	})
	.strict()
const playedTrackSchema = z
	.object({
		track_id: identifierSchema,
		time_added: z.number().finite().nonnegative(),
		adjusted_bpm: nullableFiniteNumberSchema,
		transition_rating: z.number().int().min(1).max(5).nullable(),
		track_title: textSchema.optional(),
		artist_display: textSchema.optional()
	})
	.strict()

const recordDtoSchema = z
	.object({
		id: identifierSchema,
		discogs_id: z.number().int().nonnegative().nullable(),
		discogs_release_url: nullableUrlOrPathSchema,
		title: nonemptyString(),
		artists: z.array(artistSchema).max(MAX_COLLECTION_LENGTH),
		labels: z.array(labelSchema).max(MAX_COLLECTION_LENGTH),
		year: nullableFiniteNumberSchema,
		cover: nullableUrlOrPathSchema,
		cover_storage_path: nullableUrlOrPathSchema,
		created_at: nullableTimestampSchema,
		updated_at: nullableTimestampSchema
	})
	.strict()
const trackDtoSchema = z
	.object({
		id: identifierSchema,
		record_id: identifierSchema,
		title: nonemptyString(),
		artists: z.array(artistSchema).max(MAX_COLLECTION_LENGTH),
		extraartists: z.array(artistSchema).max(MAX_COLLECTION_LENGTH),
		position: nullableTextSchema,
		duration: nullableFiniteNumberSchema,
		bpm: nullableFiniteNumberSchema,
		rpm: nullableFiniteNumberSchema,
		key: nullableFiniteNumberSchema,
		mode: nullableFiniteNumberSchema,
		genres: z.array(textSchema).max(MAX_COLLECTION_LENGTH),
		time_signature_upper: nullableFiniteNumberSchema,
		time_signature_lower: nullableFiniteNumberSchema,
		playable: z.boolean().nullable(),
		beatport_data: z.unknown().nullable(),
		audio_features: z.unknown().nullable(),
		created_at: nullableTimestampSchema,
		updated_at: nullableTimestampSchema
	})
	.strict()
const crateDtoSchema = z
	.object({
		id: identifierSchema,
		name: nonemptyString(),
		description: nullableTextSchema,
		color: nullableTextSchema,
		records: z.array(identifierSchema).max(MAX_COLLECTION_LENGTH),
		created_at: nullableTimestampSchema,
		updated_at: nullableTimestampSchema
	})
	.strict()
const savedSetDtoSchema = z
	.object({
		id: identifierSchema,
		name: nullableTextSchema,
		played_tracks: z.array(playedTrackSchema).max(MAX_COLLECTION_LENGTH),
		created_at: nullableTimestampSchema,
		updated_at: nullableTimestampSchema
	})
	.strict()
const preferencesDtoSchema = z
	.object({
		ui_theme: z.enum(['light', 'dark', 'auto']),
		key_format: z.enum(['key', 'camelot']),
		list_layout: textSchema,
		selected_crate: z.string().max(MAX_IDENTIFIER_LENGTH),
		turntable_pitch_range: z.number().finite(),
		turntable_theme: z.enum(['silver', 'black'])
	})
	.strict()
const cloudInternalSnapshotDtoSchema = z
	.object({
		contractVersion: z.literal(1),
		preferences: preferencesDtoSchema,
		records: z.array(recordDtoSchema).max(MAX_COLLECTION_LENGTH),
		tracks: z.array(trackDtoSchema).max(MAX_COLLECTION_LENGTH),
		crates: z.array(crateDtoSchema).max(MAX_COLLECTION_LENGTH),
		sets: z.array(savedSetDtoSchema).max(MAX_COLLECTION_LENGTH)
	})
	.strict()

function assertNoForbiddenKeys(
	value: unknown,
	path: string,
	visited = new WeakSet<object>()
): void {
	if (!value || typeof value !== 'object') return
	if (visited.has(value)) throw new CloudInternalSnapshotDecodeError(path)
	visited.add(value)
	if (Array.isArray(value)) {
		value.forEach((item, index) =>
			assertNoForbiddenKeys(item, `${path}/${index}`, visited)
		)
		return
	}
	for (const [key, nested] of Object.entries(value as UnknownRecord)) {
		const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
		if (FORBIDDEN_NORMALIZED_KEYS.has(normalizedKey)) {
			throw new CloudInternalSnapshotDecodeError(`${path}/${key}`)
		}
		assertNoForbiddenKeys(nested, `${path}/${key}`, visited)
	}
}

function rejectDecodeIssues(issues: DecodeIssue[], path: string): void {
	if (issues.length > 0) {
		throw new CloudInternalSnapshotDecodeError(`${path}/${issues[0]!.field}`)
	}
}

function uniqueIds(
	entities: readonly { id: string }[],
	path: string
): Set<string> {
	const ids = new Set<string>()
	for (const [index, entity] of entities.entries()) {
		if (ids.has(entity.id)) {
			throw new CloudInternalSnapshotDecodeError(`${path}/${index}/id`)
		}
		ids.add(entity.id)
	}
	return ids
}

/**
 * Decodes the server-owned coherent read DTO into the internal domain graph.
 * This DTO and its managed-cover paths are operational repository details, not
 * a portable archive contract and must never be serialized directly.
 */
export function decodeCloudInternalCoherentSnapshot(
	value: unknown
): LibraryDataset {
	assertNoForbiddenKeys(value, '/snapshot')
	const dto = cloudInternalSnapshotDtoSchema.parse(value)
	const records = dto.records.map((record, index) => {
		const decoded = decodeLibraryRecordRow({
			...record,
			artists: record.artists as Json,
			labels: record.labels as Json,
			user_id: INTERNAL_TRANSPORT_OWNER
		} satisfies RecordRow)
		rejectDecodeIssues(decoded.issues, `/snapshot/records/${index}`)
		return decoded.row
	})
	const tracks = dto.tracks.map((track, index) => {
		const decoded = decodeLibraryTrackRow({
			...track,
			artists: track.artists as Json,
			extraartists: track.extraartists as Json,
			genres: track.genres as Json,
			beatport_data: track.beatport_data as Json | null,
			audio_features: track.audio_features as Json | null,
			user_id: INTERNAL_TRANSPORT_OWNER
		} satisfies TrackRow)
		rejectDecodeIssues(decoded.issues, `/snapshot/tracks/${index}`)
		return decoded.row
	})
	const crates = dto.crates.map(
		(crate) =>
			decodeLibraryCrateRow({
				...crate,
				user_id: INTERNAL_TRANSPORT_OWNER
			} satisfies CrateRow).row
	)
	const savedSets = dto.sets.map((savedSet, index) => {
		const decoded = decodeLibrarySavedSetRow({
			...savedSet,
			played_tracks: savedSet.played_tracks as Json,
			user_id: INTERNAL_TRANSPORT_OWNER
		} satisfies SavedSetRow)
		rejectDecodeIssues(decoded.issues, `/snapshot/sets/${index}`)
		return decoded.row
	})
	const preferences = decodeLibraryPreferences(dto.preferences)

	const recordIds = uniqueIds(records, '/snapshot/records')
	uniqueIds(tracks, '/snapshot/tracks')
	const crateIds = uniqueIds(crates, '/snapshot/crates')
	uniqueIds(savedSets, '/snapshot/sets')
	for (const [index, track] of tracks.entries()) {
		if (!recordIds.has(track.record_id)) {
			throw new CloudInternalSnapshotDecodeError(
				`/snapshot/tracks/${index}/record_id`
			)
		}
	}
	for (const [crateIndex, crate] of crates.entries()) {
		if (new Set(crate.records).size !== crate.records.length) {
			throw new CloudInternalSnapshotDecodeError(
				`/snapshot/crates/${crateIndex}/records`
			)
		}
		for (const [recordIndex, recordId] of crate.records.entries()) {
			if (!recordIds.has(recordId)) {
				throw new CloudInternalSnapshotDecodeError(
					`/snapshot/crates/${crateIndex}/records/${recordIndex}`
				)
			}
		}
	}
	if (preferences.selected_crate && !crateIds.has(preferences.selected_crate)) {
		throw new CloudInternalSnapshotDecodeError(
			'/snapshot/preferences/selected_crate'
		)
	}

	// Historical saved-set references may intentionally outlive live tracks.
	return structuredClone({ records, tracks, crates, savedSets, preferences })
}

/** Cloud-only, internal coherent-read capability. It is not an archive API. */
export interface CloudInternalCoherentSnapshotCapability {
	readInternalCoherentSnapshot(
		context: WorkspaceOperationContext
	): RepositoryCommand<LibraryDataset>
}

export type CloudLibraryRepository = LibraryRepositoryBundle &
	CloudInternalCoherentSnapshotCapability

export function createCloudInternalCoherentSnapshotCapability(
	state: CloudRepositoryState
): CloudInternalCoherentSnapshotCapability {
	return {
		async readInternalCoherentSnapshot(context) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await state.dependencies.supabase.rpc(
					'read_library_snapshot'
				)
				if (!state.isCurrent(captured)) return { status: 'stale' }
				if (state.hasRevisionChanged(captured)) return { status: 'stale' }
				if (error) return state.transportFailure(error)

				let dataset: LibraryDataset
				try {
					dataset = decodeCloudInternalCoherentSnapshot(data)
				} catch {
					return state.isCurrent(captured)
						? { status: 'conflict', reason: 'integrity' }
						: { status: 'stale' }
				}
				return state.complete(captured, dataset, {
					expectedRevision: captured.startedRevision
				})
			} catch (error) {
				return state.isCurrent(captured)
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		}
	}
}
