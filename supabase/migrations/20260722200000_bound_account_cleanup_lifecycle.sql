DO $$
DECLARE
	invalid_cover_count BIGINT;
BEGIN
	SELECT count(*)
	INTO invalid_cover_count
	FROM public.records
	WHERE cover_storage_path IS NOT NULL
		AND cover_storage_path !~ (
			'^'
			|| user_id::TEXT
			|| '/'
			|| id::TEXT
			|| '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
		);

	IF invalid_cover_count > 0 THEN
		RAISE EXCEPTION
			'Cannot enforce managed cover ownership: % record(s) have a legacy or mismatched cover_storage_path.',
			invalid_cover_count
			USING
				ERRCODE = 'check_violation',
				HINT = 'Reconcile each mismatched object with its owning user and record using service tooling, set cover_storage_path to NULL, and re-upload through the current application before retrying this migration.';
	END IF;
END;
$$;

ALTER TABLE public.records
ADD CONSTRAINT records_cover_storage_path_ownership_check
CHECK (
	cover_storage_path IS NULL
	OR cover_storage_path ~ (
		'^'
		|| user_id::TEXT
		|| '/'
		|| id::TEXT
		|| '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
	)
);

COMMENT ON CONSTRAINT records_cover_storage_path_ownership_check
ON public.records IS
'Managed cover paths must belong to the row user and record and use the application UUID WebP filename.';

COMMENT ON COLUMN public.records.cover_storage_path IS
'Object path in the private record-covers bucket, constrained to <user UUID>/<record UUID>/<file UUID>.webp. When present, it takes precedence over the external cover URL.';

CREATE FUNCTION public.schedule_record_cover_account_cleanup(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF target_user_id IS NULL THEN
		RAISE EXCEPTION 'target_user_id must not be null';
	END IF;

	INSERT INTO public.record_cover_account_cleanup_jobs (user_id)
	VALUES (target_user_id)
	ON CONFLICT (user_id) DO NOTHING;

	RETURN EXISTS (
		SELECT 1
		FROM public.record_cover_account_cleanup_jobs
		WHERE user_id = target_user_id
	);
END;
$$;

-- Keep the legacy pre-delete RPC fail-closed during a rolling Edge deployment,
-- but never let a repeated invocation rotate or steal an existing claim.
CREATE OR REPLACE FUNCTION public.enqueue_record_cover_account_cleanup(
	target_user_id UUID
)
RETURNS TABLE (claimed_user_id UUID, claim_token UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	new_claim_token UUID := gen_random_uuid();
BEGIN
	RETURN QUERY
	INSERT INTO public.record_cover_account_cleanup_jobs AS jobs (
		user_id,
		locked_until,
		claim_token
	)
	VALUES (
		target_user_id,
		statement_timestamp() + INTERVAL '2 minutes',
		new_claim_token
	)
	ON CONFLICT (user_id) DO NOTHING
	RETURNING jobs.user_id, jobs.claim_token;
END;
$$;

CREATE FUNCTION public.mark_record_cover_cleanup_attempts(
	target_user_id UUID,
	target_job_ids BIGINT[],
	observed_attempt_counts INTEGER[],
	attempted_at TIMESTAMPTZ
)
RETURNS TABLE (changed_job_id BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	job_count INTEGER;
BEGIN
	IF target_user_id IS NULL
		OR target_job_ids IS NULL
		OR observed_attempt_counts IS NULL
		OR attempted_at IS NULL
	THEN
		RAISE EXCEPTION 'cleanup attempt arguments must not be null';
	END IF;

	job_count := cardinality(target_job_ids);
	IF job_count <> cardinality(observed_attempt_counts) THEN
		RAISE EXCEPTION 'cleanup attempt arrays must have equal length';
	END IF;
	IF job_count > 100 THEN
		RAISE EXCEPTION 'cleanup attempt batch exceeds 100 jobs';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM unnest(
			target_job_ids,
			observed_attempt_counts
		) AS observed(job_id, attempt_count)
		WHERE job_id IS NULL
			OR job_id <= 0
			OR attempt_count IS NULL
			OR attempt_count < 0
	) THEN
		RAISE EXCEPTION 'cleanup attempt entries are invalid';
	END IF;
	IF (
		SELECT count(DISTINCT job_id)
		FROM unnest(target_job_ids) AS ids(job_id)
	) <> job_count THEN
		RAISE EXCEPTION 'cleanup attempt job IDs must be unique';
	END IF;

	RETURN QUERY
	WITH observed AS (
		SELECT input.job_id, input.attempt_count
		FROM unnest(
			target_job_ids,
			observed_attempt_counts
		) AS input(job_id, attempt_count)
	), updated AS (
		UPDATE public.record_cover_cleanup_jobs AS jobs
		SET
			attempt_count = jobs.attempt_count + 1,
			last_attempted_at = attempted_at
		FROM observed
		WHERE jobs.user_id = target_user_id
			AND jobs.id = observed.job_id
			AND jobs.attempt_count = observed.attempt_count
			AND jobs.attempt_count < 2147483647
		RETURNING jobs.id
	)
	SELECT updated.id
	FROM updated
	ORDER BY updated.id;
END;
$$;

CREATE FUNCTION public.delete_discogs_user_rate_limit(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF target_user_id IS NULL THEN
		RAISE EXCEPTION 'target_user_id must not be null';
	END IF;

	DELETE FROM public.discogs_request_rate_limits
	WHERE bucket_key = 'discogs:user:' || target_user_id::TEXT;
	RETURN FOUND;
END;
$$;

CREATE FUNCTION public.prune_expired_discogs_user_rate_limits(
	maximum_rows INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	deleted_count INTEGER;
BEGIN
	IF maximum_rows IS NULL OR maximum_rows < 1 OR maximum_rows > 100 THEN
		RAISE EXCEPTION 'maximum_rows must be between 1 and 100';
	END IF;

	WITH candidates AS MATERIALIZED (
		SELECT rate_limits.bucket_key
		FROM public.discogs_request_rate_limits AS rate_limits
		WHERE rate_limits.reset_at <= statement_timestamp()
			AND rate_limits.bucket_key ~ '^discogs:user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		ORDER BY rate_limits.reset_at, rate_limits.bucket_key
		FOR UPDATE SKIP LOCKED
		LIMIT maximum_rows
	), deleted AS (
		DELETE FROM public.discogs_request_rate_limits AS rate_limits
		USING candidates
		WHERE rate_limits.bucket_key = candidates.bucket_key
		RETURNING rate_limits.bucket_key
	)
	SELECT count(*)::INTEGER
	INTO deleted_count
	FROM deleted;

	RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_record_cover_account_cleanup(UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enqueue_record_cover_account_cleanup(UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_record_cover_cleanup_attempts(
	UUID,
	BIGINT[],
	INTEGER[],
	TIMESTAMPTZ
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_discogs_user_rate_limit(UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prune_expired_discogs_user_rate_limits(INTEGER)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.schedule_record_cover_account_cleanup(UUID)
TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_record_cover_account_cleanup(UUID)
TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_record_cover_cleanup_attempts(
	UUID,
	BIGINT[],
	INTEGER[],
	TIMESTAMPTZ
)
TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_discogs_user_rate_limit(UUID)
TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_expired_discogs_user_rate_limits(INTEGER)
TO service_role;
