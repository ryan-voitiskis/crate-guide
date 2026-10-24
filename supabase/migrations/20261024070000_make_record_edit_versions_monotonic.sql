-- Metadata editors use the full persisted timestamp as a CAS precondition.
-- Advance it even for repeated writes inside the same transaction.
CREATE FUNCTION public.update_record_updated_at_monotonic()
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

REVOKE ALL ON FUNCTION public.update_record_updated_at_monotonic()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER records_update_updated_at_trigger ON public.records;

CREATE TRIGGER records_update_updated_at_trigger
BEFORE UPDATE ON public.records
FOR EACH ROW
EXECUTE FUNCTION public.update_record_updated_at_monotonic();
