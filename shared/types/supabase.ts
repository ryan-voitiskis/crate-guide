import type { ThemeOptions } from '~/utils/setTheme'
import type { Database } from './database.ts'

export type Profile = Omit<
	Database['public']['Tables']['profiles']['Row'],
	'ui_theme'
> & {
	ui_theme: ThemeOptions
}
