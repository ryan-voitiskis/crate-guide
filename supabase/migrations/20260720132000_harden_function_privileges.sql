-- Trigger and validation helpers should not resolve caller-controlled schemas.
ALTER FUNCTION public.update_updated_at_column()
	SET search_path = pg_catalog, public;
ALTER FUNCTION public.validate_played_tracks()
	SET search_path = pg_catalog, public;
ALTER FUNCTION public.validate_artists()
	SET search_path = pg_catalog, public;
ALTER FUNCTION public.validate_labels()
	SET search_path = pg_catalog, public;
ALTER FUNCTION public.validate_track_artists()
	SET search_path = pg_catalog, public;
ALTER FUNCTION public.validate_track_extraartists()
	SET search_path = pg_catalog, public;
ALTER FUNCTION public.validate_genres()
	SET search_path = pg_catalog, public;

-- Supabase's historical function defaults granted EXECUTE directly to API
-- roles. Revoke every browser role before restoring only the authenticated RPC
-- surface used by the application.
REVOKE ALL ON FUNCTION public.delete_all_user_data()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.disconnect_discogs()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.import_record_with_tracks(JSONB, JSONB)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.remove_record_from_collection(UUID)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.delete_all_user_data()
TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_discogs()
TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_record_with_tracks(JSONB, JSONB)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_record_from_collection(UUID)
TO authenticated;

-- This function is invoked only by the auth.users trigger. No API role needs
-- permission to call it directly.
REVOKE ALL ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated, service_role;
