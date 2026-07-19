BEGIN;

ALTER TABLE public.tracks
ADD COLUMN user_id UUID;

ALTER TABLE public.tracks
DISABLE TRIGGER tracks_update_updated_at_trigger;

UPDATE public.tracks AS track
SET user_id = record.user_id
FROM public.records AS record
WHERE record.id = track.record_id;

ALTER TABLE public.tracks
ENABLE TRIGGER tracks_update_updated_at_trigger;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.tracks
		WHERE user_id IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot backfill track owners: unmatched records exist';
	END IF;
END;
$$;

ALTER TABLE public.tracks
ALTER COLUMN user_id SET DEFAULT auth.uid(),
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.records
ADD CONSTRAINT records_user_id_id_key UNIQUE (user_id, id);

ALTER TABLE public.tracks
DROP CONSTRAINT tracks_record_id_fkey;

ALTER TABLE public.tracks
ADD CONSTRAINT tracks_user_id_record_id_fkey
	FOREIGN KEY (user_id, record_id)
	REFERENCES public.records (user_id, id)
	ON UPDATE RESTRICT
	ON DELETE CASCADE;

DROP POLICY "users_crud_own_record_tracks_policy" ON public.tracks;

CREATE POLICY "users_crud_own_tracks_policy"
ON public.tracks
FOR ALL
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.prevent_library_key_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR (
			TG_TABLE_NAME = 'tracks'
			AND NEW.user_id IS DISTINCT FROM OLD.user_id
		)
	THEN
		RAISE EXCEPTION
			USING
				ERRCODE = '23514',
				MESSAGE = 'Library row key is immutable.';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_library_key_update()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER records_prevent_key_update_trigger
BEFORE UPDATE OF id ON public.records
FOR EACH ROW
EXECUTE FUNCTION public.prevent_library_key_update();

CREATE TRIGGER tracks_prevent_key_update_trigger
BEFORE UPDATE OF id, user_id ON public.tracks
FOR EACH ROW
EXECUTE FUNCTION public.prevent_library_key_update();

CREATE TRIGGER crates_prevent_key_update_trigger
BEFORE UPDATE OF id ON public.crates
FOR EACH ROW
EXECUTE FUNCTION public.prevent_library_key_update();

CREATE TRIGGER sets_prevent_key_update_trigger
BEFORE UPDATE OF id ON public.sets
FOR EACH ROW
EXECUTE FUNCTION public.prevent_library_key_update();

CREATE INDEX tracks_user_id_id_desc_idx
ON public.tracks (user_id, id DESC);

CREATE INDEX crates_user_id_id_desc_idx
ON public.crates (user_id, id DESC);

CREATE INDEX sets_user_id_id_desc_idx
ON public.sets (user_id, id DESC);

COMMIT;
