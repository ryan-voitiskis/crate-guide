import {
	type DecodedRow,
	decodeRecordRow,
	decodeSavedSetRow,
	decodeTrackRow
} from '~/utils/supabaseRows'
import type { Database } from '~~/shared/types/database'
import type {
	CoverReference,
	LibraryCrate,
	LibraryPreferences,
	LibraryRecord,
	LibrarySavedSet,
	LibraryTrack
} from '~~/shared/types/library'

type RecordRow = Database['public']['Tables']['records']['Row']
type TrackRow = Database['public']['Tables']['tracks']['Row']
type CrateRow = Database['public']['Tables']['crates']['Row']
type SavedSetRow = Database['public']['Tables']['sets']['Row']
type ProfileRow = Database['public']['Tables']['profiles']['Row']
type ProfilePreferencesRow = Pick<
	ProfileRow,
	| 'key_format'
	| 'list_layout'
	| 'selected_crate'
	| 'turntable_pitch_range'
	| 'turntable_theme'
	| 'ui_theme'
>

function decodeCoverReference(row: RecordRow): CoverReference {
	if (row.cover_storage_path) {
		return {
			kind: 'cloud',
			assetId: row.cover_storage_path,
			fallbackUrl: row.cover
		}
	}
	return row.cover ? { kind: 'external', url: row.cover } : { kind: 'none' }
}

export function decodeLibraryRecordRow(
	row: RecordRow
): DecodedRow<LibraryRecord> {
	const decoded = decodeRecordRow(row)
	const {
		user_id: _transportOwner,
		cover_storage_path: _transportCoverPath,
		cover: _transportCover,
		...record
	} = decoded.row
	return {
		row: { ...record, cover: decodeCoverReference(row) },
		issues: decoded.issues
	}
}

export function decodeLibraryTrackRow(row: TrackRow): DecodedRow<LibraryTrack> {
	return decodeTrackRow(row)
}

export function decodeLibraryCrateRow(row: CrateRow): DecodedRow<LibraryCrate> {
	const { user_id: _transportOwner, ...crate } = row
	return { row: crate, issues: [] }
}

export function decodeLibrarySavedSetRow(
	row: SavedSetRow
): DecodedRow<LibrarySavedSet> {
	const decoded = decodeSavedSetRow(row)
	const { user_id: _transportOwner, ...savedSet } = decoded.row
	return { row: savedSet, issues: decoded.issues }
}

export function decodeLibraryPreferences(
	row: ProfilePreferencesRow
): LibraryPreferences {
	return {
		ui_theme:
			row.ui_theme === 'light' || row.ui_theme === 'dark'
				? row.ui_theme
				: 'auto',
		key_format: row.key_format === 'camelot' ? 'camelot' : 'key',
		list_layout: row.list_layout,
		selected_crate: row.selected_crate,
		turntable_pitch_range: Number.isFinite(row.turntable_pitch_range)
			? row.turntable_pitch_range
			: 8,
		turntable_theme: row.turntable_theme === 'black' ? 'black' : 'silver'
	}
}
