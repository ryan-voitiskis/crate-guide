BEGIN;

-- Every operation that needs both row types locks owned records before crates.
-- This lets record deletion establish a boundary that no later membership add
-- can cross, while an add already holding the record lock completes first.
CREATE OR REPLACE FUNCTION public.add_record_to_crate(
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
	locked_record_id UUID;
	crate_row public.crates%ROWTYPE;
BEGIN
	caller_user_id := auth.uid();

	IF caller_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
	END IF;

	SELECT library_record.id
	INTO locked_record_id
	FROM public.records AS library_record
	WHERE library_record.id = target_record_id
		AND library_record.user_id = caller_user_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Record not found' USING ERRCODE = 'P0002';
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
	SET records = CASE
		WHEN locked_record_id = ANY (crate_row.records) THEN crate_row.records
		ELSE array_append(crate_row.records, locked_record_id)
		END
	WHERE id = crate_row.id
		AND user_id = caller_user_id
	RETURNING * INTO crate_row;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Crate not found' USING ERRCODE = 'P0002';
	END IF;

	RETURN crate_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_record_from_collection(
	target_record_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	caller_user_id UUID;
	locked_record_id UUID;
	affected_crate_id UUID;
	deleted_record_id UUID;
BEGIN
	caller_user_id := auth.uid();

	IF caller_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
	END IF;

	SELECT library_record.id
	INTO locked_record_id
	FROM public.records AS library_record
	WHERE library_record.id = target_record_id
		AND library_record.user_id = caller_user_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Record not found' USING ERRCODE = 'P0002';
	END IF;

	-- Lock every affected crate in a stable order before changing any array.
	FOR affected_crate_id IN
		SELECT crate.id
		FROM public.crates AS crate
		WHERE crate.user_id = caller_user_id
			AND locked_record_id = ANY (crate.records)
		ORDER BY crate.id
		FOR UPDATE
	LOOP
		NULL;
	END LOOP;

	UPDATE public.crates
	SET records = array_remove(records, locked_record_id)
	WHERE user_id = caller_user_id
		AND locked_record_id = ANY (records);

	DELETE FROM public.records
	WHERE id = locked_record_id
		AND user_id = caller_user_id
	RETURNING id INTO deleted_record_id;

	IF deleted_record_id IS NULL THEN
		RAISE EXCEPTION 'Record delete failed';
	END IF;

	RETURN jsonb_build_object(
		'success', true,
		'record_id', deleted_record_id
	);
END;
$$;

-- Account-wide cleanup uses the same record-before-crate order. Delete the
-- locked record set before taking crate locks so a record created concurrently
-- is ordered after this cleanup instead of forming a dynamic-set deadlock.
CREATE OR REPLACE FUNCTION public.delete_all_user_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	caller_user_id UUID;
	locked_record_id UUID;
	locked_crate_id UUID;
BEGIN
	caller_user_id := auth.uid();

	IF caller_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
	END IF;

	FOR locked_record_id IN
		SELECT library_record.id
		FROM public.records AS library_record
		WHERE library_record.user_id = caller_user_id
		ORDER BY library_record.id
		FOR UPDATE
	LOOP
		NULL;
	END LOOP;

	DELETE FROM public.records
	WHERE user_id = caller_user_id;

	FOR locked_crate_id IN
		SELECT crate.id
		FROM public.crates AS crate
		WHERE crate.user_id = caller_user_id
		ORDER BY crate.id
		FOR UPDATE
	LOOP
		NULL;
	END LOOP;

	UPDATE public.crates
	SET records = '{}'::UUID[]
	WHERE user_id = caller_user_id;

	UPDATE public.sets
	SET
		played_tracks = '[]'::JSONB,
		updated_at = NOW()
	WHERE user_id = caller_user_id;

	RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.add_record_to_crate(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.remove_record_from_collection(UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_all_user_data()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.add_record_to_crate(UUID, UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_record_from_collection(UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_user_data()
TO authenticated;

-- Rolling compatibility: the pre-repository application explicitly inserts
-- records = '{}'. Keep that empty insert working while rejecting any attempt to
-- create membership outside the RPC boundary. This trigger can be removed in a
-- later contract migration after old clients are no longer supported.
CREATE OR REPLACE FUNCTION public.enforce_empty_crate_membership_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	IF current_user IN ('anon', 'authenticated')
		AND cardinality(NEW.records) <> 0
	THEN
		RAISE EXCEPTION 'Crate membership must be added through the membership RPC'
			USING ERRCODE = '42501';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_empty_crate_membership_on_insert_trigger
ON public.crates;
CREATE TRIGGER enforce_empty_crate_membership_on_insert_trigger
BEFORE INSERT ON public.crates
FOR EACH ROW
EXECUTE FUNCTION public.enforce_empty_crate_membership_on_insert();

REVOKE ALL ON FUNCTION public.enforce_empty_crate_membership_on_insert()
FROM PUBLIC, anon, authenticated, service_role;

-- Record deletion must pass through remove_record_from_collection so crate
-- references and the record row commit atomically.
REVOKE DELETE ON TABLE public.records FROM authenticated;

-- The browser may edit crate metadata, but membership updates are RPC-owned.
-- Insert access to records remains temporarily available only because the
-- trigger above proves the supplied array is empty.
REVOKE UPDATE, INSERT ON TABLE public.crates FROM authenticated;
GRANT UPDATE (name, description, color) ON TABLE public.crates
TO authenticated;
GRANT INSERT (user_id, name, description, color, records) ON TABLE public.crates
TO authenticated;

DO $$
BEGIN
	IF has_table_privilege('authenticated', 'public.records', 'DELETE') THEN
		RAISE EXCEPTION 'authenticated must not delete records directly';
	END IF;

	IF has_column_privilege(
		'authenticated',
		'public.crates',
		'records',
		'UPDATE'
	) THEN
		RAISE EXCEPTION 'authenticated must not update crate membership directly';
	END IF;

	IF NOT has_column_privilege(
		'authenticated',
		'public.crates',
		'records',
		'INSERT'
	) THEN
		RAISE EXCEPTION 'authenticated empty-membership insert compatibility is missing';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_trigger
		WHERE tgrelid = 'public.crates'::REGCLASS
			AND tgname = 'enforce_empty_crate_membership_on_insert_trigger'
			AND NOT tgisinternal
	) THEN
		RAISE EXCEPTION 'empty crate membership insert trigger is missing';
	END IF;

	IF NOT has_column_privilege(
		'authenticated',
		'public.crates',
		'name',
		'UPDATE'
	) OR NOT has_column_privilege(
		'authenticated',
		'public.crates',
		'description',
		'UPDATE'
	) OR NOT has_column_privilege(
		'authenticated',
		'public.crates',
		'color',
		'UPDATE'
	) THEN
		RAISE EXCEPTION 'authenticated crate metadata updates must remain available';
	END IF;
END;
$$;

COMMIT;
