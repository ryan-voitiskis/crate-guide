CREATE TABLE public.record_cover_account_cleanup_jobs (
	user_id UUID PRIMARY KEY,
	created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
	attempt_count INTEGER NOT NULL DEFAULT 0,
	last_attempted_at TIMESTAMPTZ,
	locked_until TIMESTAMPTZ,
	claim_token UUID,
	CONSTRAINT record_cover_account_cleanup_jobs_attempt_count_check
		CHECK (attempt_count >= 0),
	CONSTRAINT record_cover_account_cleanup_jobs_lease_check
		CHECK ((locked_until IS NULL) = (claim_token IS NULL))
);

CREATE INDEX record_cover_account_cleanup_jobs_available_idx
ON public.record_cover_account_cleanup_jobs (
	locked_until,
	created_at,
	user_id
);

ALTER TABLE public.record_cover_account_cleanup_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.record_cover_account_cleanup_jobs
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.enqueue_record_cover_account_cleanup(target_user_id UUID)
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
	ON CONFLICT (user_id) DO UPDATE
	SET
		locked_until = EXCLUDED.locked_until,
		claim_token = EXCLUDED.claim_token
	RETURNING jobs.user_id, jobs.claim_token;
END;
$$;

CREATE FUNCTION public.claim_record_cover_account_cleanup()
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
		ORDER BY jobs.created_at, jobs.user_id
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	), claimed AS (
		UPDATE public.record_cover_account_cleanup_jobs AS jobs
		SET
			locked_until = statement_timestamp() + INTERVAL '2 minutes',
			claim_token = gen_random_uuid()
		FROM candidate
		WHERE jobs.user_id = candidate.user_id
		RETURNING jobs.user_id, jobs.claim_token
	)
	SELECT claimed.user_id, claimed.claim_token
	FROM claimed;
$$;

CREATE FUNCTION public.complete_record_cover_account_cleanup(
	target_user_id UUID,
	expected_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	DELETE FROM public.record_cover_account_cleanup_jobs
	WHERE user_id = target_user_id
		AND claim_token = expected_claim_token
		AND locked_until > statement_timestamp();
	RETURN FOUND;
END;
$$;

CREATE FUNCTION public.release_record_cover_account_cleanup(
	target_user_id UUID,
	expected_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	UPDATE public.record_cover_account_cleanup_jobs
	SET
		attempt_count = CASE
			WHEN attempt_count < 2147483647 THEN attempt_count + 1
			ELSE attempt_count
		END,
		last_attempted_at = statement_timestamp(),
		locked_until = statement_timestamp() + INTERVAL '30 seconds',
		claim_token = gen_random_uuid()
	WHERE user_id = target_user_id
		AND claim_token = expected_claim_token;
	RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_record_cover_account_cleanup(UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_record_cover_account_cleanup()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_record_cover_account_cleanup(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_record_cover_account_cleanup(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.enqueue_record_cover_account_cleanup(UUID)
TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_record_cover_account_cleanup()
TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_record_cover_account_cleanup(UUID, UUID)
TO service_role;
GRANT EXECUTE ON FUNCTION public.release_record_cover_account_cleanup(UUID, UUID)
TO service_role;
