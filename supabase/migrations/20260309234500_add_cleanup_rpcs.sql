CREATE OR REPLACE FUNCTION public.remove_record_from_collection(
	target_record_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
	caller_user_id UUID;
	deleted_record_id UUID;
BEGIN
	caller_user_id := auth.uid();

	IF caller_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM public.records
		WHERE id = target_record_id
			AND user_id = caller_user_id
	) THEN
		RAISE EXCEPTION 'Record not found';
	END IF;

	UPDATE public.crates
	SET
		records = array_remove(records, target_record_id),
		updated_at = NOW()
	WHERE user_id = caller_user_id
		AND target_record_id = ANY(records);

	DELETE FROM public.records
	WHERE id = target_record_id
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

REVOKE ALL ON FUNCTION public.remove_record_from_collection(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_record_from_collection(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_all_user_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
	caller_user_id UUID;
BEGIN
	caller_user_id := auth.uid();

	IF caller_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	UPDATE public.crates
	SET
		records = '{}'::UUID[],
		updated_at = NOW()
	WHERE user_id = caller_user_id;

	UPDATE public.sets
	SET
		played_tracks = '[]'::JSONB,
		updated_at = NOW()
	WHERE user_id = caller_user_id;

	DELETE FROM public.records
	WHERE user_id = caller_user_id;

	RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_all_user_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_all_user_data() TO authenticated;
