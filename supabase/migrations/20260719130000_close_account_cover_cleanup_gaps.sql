DROP POLICY "users_insert_own_record_covers" ON storage.objects;

CREATE POLICY "users_insert_own_record_covers"
	ON storage.objects
	FOR INSERT
	TO authenticated
	WITH CHECK (
		bucket_id = 'record-covers'
		AND array_length(storage.foldername(name), 1) = 2
		AND (storage.foldername(name))[1] = (SELECT auth.uid()::TEXT)
		AND lower(storage.extension(name)) = 'webp'
		AND EXISTS (
			SELECT 1
			FROM public.records
			WHERE records.user_id = (SELECT auth.uid())
				AND records.id::TEXT = (storage.foldername(name))[2]
		)
	);

CREATE FUNCTION public.list_record_cover_account_cleanup_objects(
	target_user_id UUID
)
RETURNS TABLE (object_name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT objects.name
	FROM storage.objects AS objects
	WHERE objects.bucket_id = 'record-covers'
		AND left(
			objects.name,
			length(target_user_id::TEXT) + 1
		) = target_user_id::TEXT || '/'
	ORDER BY objects.name, objects.id
	LIMIT 101;
$$;

REVOKE ALL ON FUNCTION public.list_record_cover_account_cleanup_objects(UUID)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_record_cover_account_cleanup_objects(UUID)
TO service_role;

DROP INDEX public.record_cover_account_cleanup_jobs_available_idx;

CREATE INDEX record_cover_account_cleanup_jobs_fair_available_idx
ON public.record_cover_account_cleanup_jobs (
	(COALESCE(last_attempted_at, created_at)),
	created_at,
	user_id
)
INCLUDE (locked_until);

CREATE OR REPLACE FUNCTION public.claim_record_cover_account_cleanup()
RETURNS TABLE (claimed_user_id UUID, claim_token UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	WITH candidate AS MATERIALIZED (
		SELECT jobs.user_id
		FROM public.record_cover_account_cleanup_jobs AS jobs
		WHERE
			jobs.locked_until IS NULL
			OR jobs.locked_until <= statement_timestamp()
		ORDER BY
			COALESCE(jobs.last_attempted_at, jobs.created_at),
			jobs.created_at,
			jobs.user_id
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	), claimed AS (
		UPDATE public.record_cover_account_cleanup_jobs AS jobs
		SET
			last_attempted_at = statement_timestamp(),
			locked_until = statement_timestamp() + INTERVAL '2 minutes',
			claim_token = gen_random_uuid()
		FROM candidate
		WHERE jobs.user_id = candidate.user_id
		RETURNING jobs.user_id, jobs.claim_token
	)
	SELECT claimed.user_id, claimed.claim_token
	FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.claim_record_cover_account_cleanup()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_record_cover_account_cleanup()
TO service_role;
