import type { TrackAudioFeatures } from './audioFeatures.ts'
import type { BeatportNotFoundMarker, BeatportTrackData } from './beatport.ts'
import type { Database } from './database.ts'
import type { DiscogsArtistDb, DiscogsLabelDb } from './discogs.ts'
import type { ThemeOptions, TurntableThemeOptions } from './options.ts'

export type KeyFormat = 'key' | 'camelot'

export type Profile = Omit<
	Database['public']['Tables']['profiles']['Row'],
	'ui_theme' | 'key_format' | 'turntable_theme'
> & {
	ui_theme: ThemeOptions
	key_format: KeyFormat
	turntable_theme: TurntableThemeOptions
}

export type DatabaseRecord = Omit<
	Database['public']['Tables']['records']['Row'],
	'artists' | 'labels'
> & {
	artists: DiscogsArtistDb[]
	labels: DiscogsLabelDb[]
}

export type Track = Omit<
	Database['public']['Tables']['tracks']['Row'],
	| 'user_id'
	| 'artists'
	| 'extraartists'
	| 'genres'
	| 'beatport_data'
	| 'audio_features'
> & {
	artists: DiscogsArtistDb[]
	extraartists: DiscogsArtistDb[]
	genres: string[]
	beatport_data: BeatportTrackData | BeatportNotFoundMarker | null
	audio_features: TrackAudioFeatures | null
}

export type PlayedTrackEntry = {
	track_id: string
	time_added: number
	adjusted_bpm: number | null
	transition_rating: number | null
}

export type SavedSet = Omit<
	Database['public']['Tables']['sets']['Row'],
	'played_tracks'
> & {
	played_tracks: PlayedTrackEntry[]
}

export type Crate = Database['public']['Tables']['crates']['Row']
