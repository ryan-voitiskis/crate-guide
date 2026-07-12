-- Table-backed, platform-portable rate limiter.
--
-- Counter rows live in public.rate_limits keyed by an opaque string (the
-- server route picks what to key on — e.g. `beatport:user:<uid>` or
-- `beatport:ip:<addr>`). `check_rate_limit` atomically evaluates an array of
-- keys: if *any* key would exceed the budget, none are incremented and the
-- RPC returns false. Otherwise all keys are incremented and it returns true.
--
-- This multi-key atomic semantics preserves the "don't consume user quota
-- when a shared key (IP) is the one being throttled" property that the
-- in-memory limiter had.
--
-- RLS is enabled with no policies, so only SECURITY DEFINER functions and the
-- service role can touch these rows. Authenticated callers interact with the
-- limiter exclusively through check_rate_limit().

CREATE TABLE IF NOT EXISTS public.rate_limits (
	key TEXT PRIMARY KEY,
	count INT NOT NULL,
	reset_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS rate_limits_reset_at_idx
	ON public.rate_limits (reset_at);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
	rate_keys TEXT[],
	max_requests INT,
	window_ms INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	now_ts TIMESTAMPTZ := NOW();
	new_reset_at TIMESTAMPTZ := now_ts + make_interval(secs => window_ms / 1000.0);
	k TEXT;
	existing_count INT;
	existing_reset TIMESTAMPTZ;
	next_count INT;
BEGIN
	IF auth.uid() IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	IF max_requests <= 0 OR window_ms <= 0 THEN
		RAISE EXCEPTION 'max_requests and window_ms must be positive';
	END IF;

	IF rate_keys IS NULL OR array_length(rate_keys, 1) IS NULL THEN
		RETURN TRUE;
	END IF;

	-- Lock existing rows to serialise concurrent check_rate_limit callers.
	PERFORM 1
	FROM public.rate_limits
	WHERE key = ANY(rate_keys)
	FOR UPDATE;

	-- Pass 1: dry-run — would any key exceed?
	FOREACH k IN ARRAY rate_keys LOOP
		SELECT count, reset_at
		INTO existing_count, existing_reset
		FROM public.rate_limits
		WHERE key = k;

		IF existing_count IS NULL OR existing_reset <= now_ts THEN
			next_count := 1;
		ELSE
			next_count := existing_count + 1;
		END IF;

		IF next_count > max_requests THEN
			RETURN FALSE;
		END IF;
	END LOOP;

	-- Pass 2: commit increments for every key.
	FOREACH k IN ARRAY rate_keys LOOP
		INSERT INTO public.rate_limits (key, count, reset_at)
		VALUES (k, 1, new_reset_at)
		ON CONFLICT (key) DO UPDATE
		SET
			count = CASE
				WHEN public.rate_limits.reset_at <= now_ts THEN 1
				ELSE public.rate_limits.count + 1
			END,
			reset_at = CASE
				WHEN public.rate_limits.reset_at <= now_ts THEN EXCLUDED.reset_at
				ELSE public.rate_limits.reset_at
			END;
	END LOOP;

	RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT[], INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT[], INT, INT) TO authenticated;
