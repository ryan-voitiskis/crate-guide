import type { ThemeOptions } from '~/utils/setTheme'
import type { Database } from './database.ts'
import type { DiscogsArtistDb, DiscogsLabelDb } from './discogs.ts'

export type Profile = Omit<
	Database['public']['Tables']['profiles']['Row'],
	'ui_theme'
> & {
	ui_theme: ThemeOptions
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
	'artists' | 'extraartists' | 'genres'
> & {
	artists: DiscogsArtistDb[]
	extraartists: DiscogsArtistDb[]
	genres: string[]
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	beatport_data: any | null
}

export type Crate = Database['public']['Tables']['crates']['Row']
