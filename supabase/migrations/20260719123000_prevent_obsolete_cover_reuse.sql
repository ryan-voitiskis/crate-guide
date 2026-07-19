CREATE FUNCTION public.prevent_obsolete_record_cover_reuse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF NEW.cover_storage_path IS NULL THEN
		RETURN NEW;
	END IF;

	IF
		TG_OP = 'UPDATE'
		AND OLD.cover_storage_path IS NOT DISTINCT FROM NEW.cover_storage_path
	THEN
		RETURN NEW;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.record_cover_cleanup_jobs
		WHERE object_path = NEW.cover_storage_path
	) THEN
		RAISE EXCEPTION
			USING
				ERRCODE = 'check_violation',
				MESSAGE = 'Cover path cannot be reused.';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_obsolete_record_cover_reuse()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER records_prevent_obsolete_cover_reuse_trigger
BEFORE INSERT OR UPDATE OF cover_storage_path ON public.records
FOR EACH ROW
EXECUTE FUNCTION public.prevent_obsolete_record_cover_reuse();
