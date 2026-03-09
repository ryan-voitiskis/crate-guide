import type { ThemeOptions } from '~/utils/setTheme'
import type { BeatportNotFoundMarker, BeatportTrackData } from './beatport.ts'
import type { Database } from './database.ts'
import type { DiscogsArtistDb, DiscogsLabelDb } from './discogs.ts'
import type { TurntableThemeOptions } from './options.ts'

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
	'artists' | 'extraartists' | 'genres' | 'beatport_data'
> & {
	artists: DiscogsArtistDb[]
	extraartists: DiscogsArtistDb[]
	genres: string[]
	beatport_data: BeatportTrackData | BeatportNotFoundMarker | null
}

export type Crate = Database['public']['Tables']['crates']['Row']
