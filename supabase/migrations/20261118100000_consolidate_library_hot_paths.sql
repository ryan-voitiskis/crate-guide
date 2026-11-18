-- Library hot-path consolidation (November 2026 audit).
--
-- 1. Evaluate auth.uid() once per statement in the remaining owner policies.
--    A bare auth.uid() in a policy is re-evaluated for every candidate row;
--    the scalar subquery becomes a single initplan. Tracks already use it.
-- 2. Run per-row validation only when the validated column is written.
--    PostgREST sends only changed columns, so ordinary metadata edits on an
--    enriched track no longer re-validate up to 48 KB of Evidence v2 JSON.
--    Every check in protect_track_evidence_generation() is a no-op unless
--    audio_features changes, and no other BEFORE trigger assigns it.
-- 3. Drop indexes made redundant by later composite indexes, and GIN indexes
--    on records.artists/labels that no query, RPC or Edge Function uses.
BEGIN;

ALTER POLICY "users_own_profile_policy" ON public.profiles
	USING ((SELECT auth.uid()) = id)
	WITH CHECK ((SELECT auth.uid()) = id);

ALTER POLICY "users_own_records_policy" ON public.records
	USING ((SELECT auth.uid()) = user_id)
	WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "users_crud_own_crates_policy" ON public.crates
	USING ((SELECT auth.uid()) = user_id)
	WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "users_crud_own_sets_policy" ON public.sets
	USING ((SELECT auth.uid()) = user_id)
	WITH CHECK ((SELECT auth.uid()) = user_id);

DROP TRIGGER tracks_protect_evidence_generation_trigger ON public.tracks;
CREATE TRIGGER tracks_protect_evidence_generation_trigger
BEFORE INSERT OR UPDATE OF audio_features ON public.tracks
FOR EACH ROW
EXECUTE FUNCTION public.protect_track_evidence_generation();

DROP TRIGGER tracks_validate_artists_trigger ON public.tracks;
CREATE TRIGGER tracks_validate_artists_trigger
BEFORE INSERT OR UPDATE OF artists ON public.tracks
FOR EACH ROW
EXECUTE FUNCTION public.validate_track_artists();

DROP TRIGGER tracks_validate_extraartists_trigger ON public.tracks;
CREATE TRIGGER tracks_validate_extraartists_trigger
BEFORE INSERT OR UPDATE OF extraartists ON public.tracks
FOR EACH ROW
EXECUTE FUNCTION public.validate_track_extraartists();

DROP TRIGGER tracks_validate_genres_trigger ON public.tracks;
CREATE TRIGGER tracks_validate_genres_trigger
BEFORE INSERT OR UPDATE OF genres ON public.tracks
FOR EACH ROW
EXECUTE FUNCTION public.validate_genres();

DROP TRIGGER records_validate_artists_trigger ON public.records;
CREATE TRIGGER records_validate_artists_trigger
BEFORE INSERT OR UPDATE OF artists ON public.records
FOR EACH ROW
EXECUTE FUNCTION public.validate_artists();

DROP TRIGGER records_validate_labels_trigger ON public.records;
CREATE TRIGGER records_validate_labels_trigger
BEFORE INSERT OR UPDATE OF labels ON public.records
FOR EACH ROW
EXECUTE FUNCTION public.validate_labels();

DROP TRIGGER sets_validate_played_tracks_trigger ON public.sets;
CREATE TRIGGER sets_validate_played_tracks_trigger
BEFORE INSERT OR UPDATE OF played_tracks ON public.sets
FOR EACH ROW
EXECUTE FUNCTION public.validate_played_tracks();

-- Prefixes of records_user_id_id_key, crates_user_id_id_desc_idx and
-- sets_user_id_id_desc_idx respectively.
DROP INDEX public.idx_records_user_id;
DROP INDEX public.idx_crates_user_id;
DROP INDEX public.idx_sets_user_id;
-- No query filters records by artist or label containment.
DROP INDEX public.idx_records_artists_gin;
DROP INDEX public.idx_records_labels_gin;

COMMIT;
