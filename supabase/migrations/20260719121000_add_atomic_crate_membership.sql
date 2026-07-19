CREATE FUNCTION public.update_crate_updated_at_monotonic()
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

REVOKE ALL ON FUNCTION public.update_crate_updated_at_monotonic()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER crates_update_updated_at_trigger ON public.crates;

CREATE TRIGGER crates_update_updated_at_trigger
BEFORE UPDATE ON public.crates
FOR EACH ROW
EXECUTE FUNCTION public.update_crate_updated_at_monotonic();

CREATE FUNCTION public.add_record_to_crate(
	target_crate_id UUID,
	target_record_id UUID
)
RETURNS public.crates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	caller_user_id UUID;
	crate_row public.crates%ROWTYPE;
BEGIN
	caller_user_id := auth.uid();

	IF caller_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
	END IF;

	SELECT crate.*
	INTO crate_row
	FROM public.crates AS crate
	WHERE crate.id = target_crate_id
		AND crate.user_id = caller_user_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Crate not found' USING ERRCODE = 'P0002';
	END IF;

	PERFORM 1
	FROM public.records AS record
	WHERE record.id = target_record_id
		AND record.user_id = caller_user_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Record not found' USING ERRCODE = 'P0002';
	END IF;

	UPDATE public.crates
	SET records = CASE
		WHEN target_record_id = ANY (crate_row.records) THEN crate_row.records
		ELSE array_append(crate_row.records, target_record_id)
		END
	WHERE id = target_crate_id
	RETURNING * INTO crate_row;

	RETURN crate_row;
END;
$$;

CREATE FUNCTION public.remove_record_from_crate(
	target_crate_id UUID,
	target_record_id UUID
)
RETURNS public.crates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	caller_user_id UUID;
	crate_row public.crates%ROWTYPE;
BEGIN
	caller_user_id := auth.uid();

	IF caller_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
	END IF;

	SELECT crate.*
	INTO crate_row
	FROM public.crates AS crate
	WHERE crate.id = target_crate_id
		AND crate.user_id = caller_user_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Crate not found' USING ERRCODE = 'P0002';
	END IF;

	UPDATE public.crates
	SET records = array_remove(crate_row.records, target_record_id)
	WHERE id = target_crate_id
	RETURNING * INTO crate_row;

	RETURN crate_row;
END;
$$;

REVOKE ALL ON FUNCTION public.add_record_to_crate(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.remove_record_from_crate(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.add_record_to_crate(UUID, UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_record_from_crate(UUID, UUID)
TO authenticated;
