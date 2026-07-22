import { describe, expect, it } from 'vitest'
import {
	decodeLibraryCrateRow,
	decodeLibraryPreferences,
	decodeLibraryRecordRow,
	decodeLibrarySavedSetRow,
	decodeLibraryTrackRow
} from '~/repositories/library/codecs/supabaseLibraryCodecs'
import type { Database } from '~~/shared/types/database'

type RecordRow = Database['public']['Tables']['records']['Row']
type TrackRow = Database['public']['Tables']['tracks']['Row']
type CrateRow = Database['public']['Tables']['crates']['Row']
type SavedSetRow = Database['public']['Tables']['sets']['Row']
type ProfileRow = Database['public']['Tables']['profiles']['Row']

const recordRow: RecordRow = {
	id: 'record-1',
	user_id: 'owner-a',
	title: 'Record',
	artists: [],
	labels: [],
	year: null,
	cover: 'https://example.test/fallback.jpg',
	cover_storage_path: 'owner-a/record-1/cover.webp',
	discogs_id: null,
	discogs_release_url: null,
	created_at: null,
	updated_at: null
}

const trackRow: TrackRow = {
	id: 'track-1',
	user_id: 'owner-a',
	record_id: 'record-1',
	title: 'Track',
	artists: [],
	extraartists: [],
	position: null,
	duration: null,
	bpm: null,
	rpm: null,
	key: null,
	mode: null,
	genres: [],
	time_signature_upper: null,
	time_signature_lower: null,
	playable: true,
	beatport_data: null,
	audio_features: null,
	created_at: null,
	updated_at: null
}

describe('Supabase library codecs', () => {
	it('removes record ownership and storage-path fields from the domain row', () => {
		const decoded = decodeLibraryRecordRow(recordRow)

		expect(decoded.row).toMatchObject({
			id: 'record-1',
			cover: {
				kind: 'cloud',
				assetId: 'owner-a/record-1/cover.webp',
				fallbackUrl: 'https://example.test/fallback.jpg'
			}
		})
		expect(decoded.row).not.toHaveProperty('user_id')
		expect(decoded.row).not.toHaveProperty('cover_storage_path')
	})

	it('maps external and absent covers without a managed asset', () => {
		expect(
			decodeLibraryRecordRow({ ...recordRow, cover_storage_path: null }).row
				.cover
		).toEqual({ kind: 'external', url: recordRow.cover })
		expect(
			decodeLibraryRecordRow({
				...recordRow,
				cover: null,
				cover_storage_path: null
			}).row.cover
		).toEqual({ kind: 'none' })
	})

	it('removes ownership from tracks, crates and saved sets', () => {
		const crateRow: CrateRow = {
			id: 'crate-1',
			user_id: 'owner-a',
			name: 'Crate',
			description: null,
			color: null,
			records: ['record-1'],
			created_at: null,
			updated_at: null
		}
		const savedSetRow: SavedSetRow = {
			id: 'set-1',
			user_id: 'owner-a',
			name: null,
			played_tracks: [],
			created_at: null,
			updated_at: null
		}

		const decoded = [
			decodeLibraryTrackRow(trackRow).row,
			decodeLibraryCrateRow(crateRow).row,
			decodeLibrarySavedSetRow(savedSetRow).row
		]
		for (const row of decoded) expect(row).not.toHaveProperty('user_id')
	})

	it('normalizes profile fields into library-owned preferences', () => {
		const row: ProfileRow = {
			id: 'owner-a',
			name: 'DJ',
			discogs_avatar_url: null,
			discogs_uid: null,
			discogs_username: null,
			just_completed_discogs_oauth: false,
			key_format: 'unexpected',
			list_layout: 'cover',
			selected_crate: '',
			turntable_pitch_range: 16,
			turntable_theme: 'unexpected',
			ui_theme: 'dark'
		}

		expect(decodeLibraryPreferences(row)).toEqual({
			ui_theme: 'dark',
			key_format: 'key',
			list_layout: 'cover',
			selected_crate: '',
			turntable_pitch_range: 16,
			turntable_theme: 'silver'
		})
	})
})
