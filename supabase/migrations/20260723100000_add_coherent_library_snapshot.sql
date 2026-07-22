BEGIN;

-- Internal cloud snapshot DTO for coherent repository reads. This is not the
-- portable archive schema: cover_storage_path is operational input for reading
-- an owned managed cover and must be remapped or omitted by archive serializers.
CREATE FUNCTION public.read_library_snapshot()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
SET timezone = 'UTC'
AS $$
	WITH caller AS MATERIALIZED (
		SELECT auth.uid() AS user_id
	)
	SELECT jsonb_build_object(
		'contractVersion', 1,
		'preferences', (
			SELECT jsonb_build_object(
				'ui_theme', profile.ui_theme,
				'key_format', profile.key_format,
				'list_layout', profile.list_layout,
				'selected_crate', profile.selected_crate,
				'turntable_pitch_range', profile.turntable_pitch_range,
				'turntable_theme', profile.turntable_theme
			)
			FROM public.profiles AS profile
			WHERE profile.id = caller.user_id
		),
		'records', COALESCE((
			SELECT jsonb_agg(
				jsonb_build_object(
					'id', library_record.id,
					'discogs_id', library_record.discogs_id,
					'discogs_release_url', library_record.discogs_release_url,
					'title', library_record.title,
					'artists', library_record.artists,
					'labels', library_record.labels,
					'year', library_record.year,
					'cover', library_record.cover,
					'cover_storage_path', library_record.cover_storage_path,
					'created_at', library_record.created_at,
					'updated_at', library_record.updated_at
				)
				ORDER BY library_record.id
			)
			FROM public.records AS library_record
			WHERE library_record.user_id = caller.user_id
		), '[]'::JSONB),
		'tracks', COALESCE((
			SELECT jsonb_agg(
				jsonb_build_object(
					'id', track.id,
					'record_id', track.record_id,
					'title', track.title,
					'artists', track.artists,
					'extraartists', track.extraartists,
					'position', track.position,
					'duration', track.duration,
					'bpm', track.bpm,
					'rpm', track.rpm,
					'key', track.key,
					'mode', track.mode,
					'genres', track.genres,
					'time_signature_upper', track.time_signature_upper,
					'time_signature_lower', track.time_signature_lower,
					'playable', track.playable,
					'beatport_data', track.beatport_data,
					'audio_features', track.audio_features,
					'created_at', track.created_at,
					'updated_at', track.updated_at
				)
				ORDER BY track.id
			)
			FROM public.tracks AS track
			WHERE track.user_id = caller.user_id
		), '[]'::JSONB),
		'crates', COALESCE((
			SELECT jsonb_agg(
				jsonb_build_object(
					'id', crate.id,
					'name', crate.name,
					'description', crate.description,
					'color', crate.color,
					'records', crate.records,
					'created_at', crate.created_at,
					'updated_at', crate.updated_at
				)
				ORDER BY crate.id
			)
			FROM public.crates AS crate
			WHERE crate.user_id = caller.user_id
		), '[]'::JSONB),
		'sets', COALESCE((
			SELECT jsonb_agg(
				jsonb_build_object(
					'id', saved_set.id,
					'name', saved_set.name,
					'played_tracks', saved_set.played_tracks,
					'created_at', saved_set.created_at,
					'updated_at', saved_set.updated_at
				)
				ORDER BY saved_set.id
			)
			FROM public.sets AS saved_set
			WHERE saved_set.user_id = caller.user_id
		), '[]'::JSONB)
	)
	FROM caller;
$$;

COMMENT ON FUNCTION public.read_library_snapshot() IS
'Internal coherent cloud snapshot contract v1. cover_storage_path is operational managed-cover resolver input, not portable archive data; archive serializers must remap or omit it.';

REVOKE ALL ON FUNCTION public.read_library_snapshot()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.read_library_snapshot()
TO authenticated;

COMMIT;
