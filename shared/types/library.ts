import type { TrackAudioFeatures } from './audioFeatures.ts'
import type { BeatportNotFoundMarker, BeatportTrackData } from './beatport.ts'
import type { DiscogsArtistDb, DiscogsLabelDb } from './discogs.ts'
import type { ThemeOptions, TurntableThemeOptions } from './options.ts'

export type LibraryKeyFormat = 'key' | 'camelot'

export type CoverReference =
	| { kind: 'none' }
	| { kind: 'external'; url: string }
	| { kind: 'cloud'; assetId: string; fallbackUrl: string | null }
	| { kind: 'browser'; assetId: string; fallbackUrl: string | null }

export type LibraryCoverCrop = {
	positionX: number
	positionY: number
}

export type LibraryCoverChange =
	| { type: 'keep' }
	| { type: 'remove' }
	| { type: 'upload'; file: File; crop: LibraryCoverCrop }

export type LibraryRecord = {
	id: string
	title: string
	artists: DiscogsArtistDb[]
	labels: DiscogsLabelDb[]
	year: number | null
	cover: CoverReference
	discogs_id: number | null
	discogs_release_url: string | null
	created_at: string | null
	updated_at: string | null
}

export type LibraryTrack = {
	id: string
	record_id: string
	title: string
	artists: DiscogsArtistDb[]
	extraartists: DiscogsArtistDb[]
	position: string | null
	duration: number | null
	bpm: number | null
	rpm: number | null
	key: number | null
	mode: number | null
	genres: string[]
	time_signature_upper: number | null
	time_signature_lower: number | null
	playable: boolean | null
	beatport_data: BeatportTrackData | BeatportNotFoundMarker | null
	audio_features: TrackAudioFeatures | null
	created_at: string | null
	updated_at: string | null
}

export type LibraryCrate = {
	id: string
	name: string
	description: string | null
	color: string | null
	records: string[]
	created_at: string | null
	updated_at: string | null
}

export type LibraryPlayedTrackEntry = {
	track_id: string
	time_added: number
	adjusted_bpm: number | null
	transition_rating: number | null
	track_title?: string
	artist_display?: string
}

export type LibrarySavedSet = {
	id: string
	name: string | null
	played_tracks: LibraryPlayedTrackEntry[]
	created_at: string | null
	updated_at: string | null
}

export type LibraryPreferences = {
	ui_theme: ThemeOptions
	key_format: LibraryKeyFormat
	list_layout: string
	selected_crate: string
	turntable_pitch_range: number
	turntable_theme: TurntableThemeOptions
}

export type LibraryDataset = {
	records: LibraryRecord[]
	tracks: LibraryTrack[]
	crates: LibraryCrate[]
	savedSets: LibrarySavedSet[]
	preferences: LibraryPreferences
}

/**
 * A best-effort adapter observation. Its entity groups are not guaranteed to
 * come from one storage transaction and must never be used as an archive or
 * backup snapshot.
 */
export type LibraryObservedView = LibraryDataset & {
	consistency: 'non-atomic-observation'
}

export type ManualRecordTrackInput = {
	title: string
	artistName?: string | null
	position?: string | null
	duration?: number | null
	bpm?: number | null
	rpm?: number | null
	key?: number | null
	mode?: number | null
	genres?: string[]
	playable?: boolean
}

export type ManualRecordWithTracksInput = {
	title: string
	artistName?: string | null
	labelName?: string | null
	catno?: string | null
	year?: number | null
	cover?: string | null
	defaultGenres?: string[]
	defaultRpm?: number | null
	tracks: ManualRecordTrackInput[]
}

export type ExternalRecordInput = Omit<
	LibraryRecord,
	'id' | 'cover' | 'created_at' | 'updated_at'
> & {
	cover: Extract<CoverReference, { kind: 'none' | 'external' }>
}

export type ExternalTrackInput = Omit<
	LibraryTrack,
	| 'id'
	| 'record_id'
	| 'beatport_data'
	| 'audio_features'
	| 'created_at'
	| 'updated_at'
>

/**
 * Account-neutral metadata ready for one atomic repository import. Identity,
 * entity IDs, timestamps, duplicate handling, and persistence belong to the
 * selected repository rather than the external provider integration.
 */
export type ExternalRecordWithTracksInput = {
	record: ExternalRecordInput
	tracks: ExternalTrackInput[]
}

export type ExternalRecordImportResult = {
	recordId: string
	inserted: boolean
}

export type RecordUpdateInput = Partial<
	Omit<LibraryRecord, 'id' | 'created_at' | 'updated_at'>
>

export type TrackCreateInput = Omit<
	LibraryTrack,
	'id' | 'created_at' | 'updated_at' | 'audio_features'
> & {
	audio_features?: TrackAudioFeatures | null
}

export type LibraryTrackUpdateInput = Partial<
	Omit<LibraryTrack, 'id' | 'record_id' | 'created_at' | 'updated_at'>
>

export type CrateCreateInput = Pick<
	LibraryCrate,
	'name' | 'description' | 'color'
>

export type CrateMetadataUpdate = Partial<CrateCreateInput>
