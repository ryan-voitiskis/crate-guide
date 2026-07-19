CREATE TABLE public.discogs_request_rate_limits (
	bucket_key TEXT PRIMARY KEY,
	request_count INTEGER NOT NULL CHECK (request_count >= 0),
	reset_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.discogs_request_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX discogs_request_rate_limits_reset_at_idx
	ON public.discogs_request_rate_limits (reset_at);

REVOKE ALL ON TABLE public.discogs_request_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.discogs_request_rate_limits FROM anon;
REVOKE ALL ON TABLE public.discogs_request_rate_limits FROM authenticated;
GRANT SELECT ON TABLE public.discogs_request_rate_limits TO service_role;

CREATE FUNCTION public.consume_discogs_request_quota(
	target_user_id UUID,
	per_user_limit INTEGER,
	global_limit INTEGER,
	window_seconds INTEGER
)
RETURNS TABLE (
	allowed BOOLEAN,
	retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	now_ts TIMESTAMPTZ;
	new_reset_at TIMESTAMPTZ;
	global_key CONSTANT TEXT := 'discogs:global';
	user_key TEXT;
	lock_key TEXT;
	global_count INTEGER;
	user_count INTEGER;
	global_reset_at TIMESTAMPTZ;
	user_reset_at TIMESTAMPTZ;
	global_retry_seconds INTEGER := 0;
	user_retry_seconds INTEGER := 0;
BEGIN
	IF target_user_id IS NULL THEN
		RAISE EXCEPTION 'target_user_id must not be null';
	END IF;

	IF per_user_limit IS NULL
		OR global_limit IS NULL
		OR window_seconds IS NULL
		OR per_user_limit <= 0
		OR global_limit <= 0
		OR window_seconds <= 0
	THEN
		RAISE EXCEPTION 'quota limits and window_seconds must be positive';
	END IF;

	IF per_user_limit > global_limit THEN
		RAISE EXCEPTION 'per_user_limit must not exceed global_limit';
	END IF;

	IF global_limit > 60 THEN
		RAISE EXCEPTION 'global_limit must not exceed 60';
	END IF;

	IF window_seconds < 60 OR window_seconds > 120 THEN
		RAISE EXCEPTION 'window_seconds must be between 60 and 120';
	END IF;

	user_key := 'discogs:user:' || target_user_id::TEXT;

	-- Every caller locks the same internally constructed keys in lexical order.
	-- Transaction advisory locks serialize concurrent first inserts, where row
	-- locks cannot exist yet, and avoid deadlocks between later calls.
	FOR lock_key IN
		SELECT key_value
		FROM unnest(ARRAY[global_key, user_key]) AS keys(key_value)
		ORDER BY key_value
	LOOP
		PERFORM pg_advisory_xact_lock(hashtextextended(lock_key, 0));
	END LOOP;

	now_ts := clock_timestamp();
	new_reset_at := now_ts + make_interval(secs => window_seconds);

	SELECT request_count, reset_at
	INTO global_count, global_reset_at
	FROM public.discogs_request_rate_limits
	WHERE bucket_key = global_key;

	IF global_count IS NULL OR global_reset_at <= now_ts THEN
		global_count := 0;
		global_reset_at := new_reset_at;
	END IF;

	SELECT request_count, reset_at
	INTO user_count, user_reset_at
	FROM public.discogs_request_rate_limits
	WHERE bucket_key = user_key;

	IF user_count IS NULL OR user_reset_at <= now_ts THEN
		user_count := 0;
		user_reset_at := new_reset_at;
	END IF;

	IF global_count + 1 > global_limit THEN
		global_retry_seconds := greatest(
			1,
			ceil(extract(epoch FROM global_reset_at - now_ts))::INTEGER
		);
	END IF;

	IF user_count + 1 > per_user_limit THEN
		user_retry_seconds := greatest(
			1,
			ceil(extract(epoch FROM user_reset_at - now_ts))::INTEGER
		);
	END IF;

	-- A denial consumes neither budget. Expired state is normalized only when a
	-- request is accepted and both counters are written atomically below.
	IF global_retry_seconds > 0 OR user_retry_seconds > 0 THEN
		RETURN QUERY
		SELECT FALSE, greatest(global_retry_seconds, user_retry_seconds);
		RETURN;
	END IF;

	INSERT INTO public.discogs_request_rate_limits (
		bucket_key,
		request_count,
		reset_at
	)
	VALUES
		(global_key, global_count + 1, global_reset_at),
		(user_key, user_count + 1, user_reset_at)
	ON CONFLICT (bucket_key) DO UPDATE
	SET
		request_count = EXCLUDED.request_count,
		reset_at = EXCLUDED.reset_at;

	RETURN QUERY SELECT TRUE, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_discogs_request_quota(
	UUID,
	INTEGER,
	INTEGER,
	INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_discogs_request_quota(
	UUID,
	INTEGER,
	INTEGER,
	INTEGER
) FROM anon;
REVOKE ALL ON FUNCTION public.consume_discogs_request_quota(
	UUID,
	INTEGER,
	INTEGER,
	INTEGER
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_discogs_request_quota(
	UUID,
	INTEGER,
	INTEGER,
	INTEGER
) TO service_role;
