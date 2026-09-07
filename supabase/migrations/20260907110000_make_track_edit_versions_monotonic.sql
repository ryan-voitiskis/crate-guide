-- Track editors and enrichment use updated_at as a persisted CAS token.
-- NOW() is fixed for a transaction, so repeated writes must advance explicitly.
CREATE FUNCTION public.update_track_updated_at_monotonic()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	NEW.updated_at := greatest(
		clock_timestamp(),
		coalesce(OLD.updated_at, '-infinity'::TIMESTAMPTZ)
			+ INTERVAL '1 microsecond'
	);
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_track_updated_at_monotonic()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER tracks_update_updated_at_trigger ON public.tracks;

CREATE TRIGGER tracks_update_updated_at_trigger
BEFORE UPDATE ON public.tracks
FOR EACH ROW
EXECUTE FUNCTION public.update_track_updated_at_monotonic();
