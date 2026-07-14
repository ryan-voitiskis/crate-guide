DO $$
BEGIN
	IF to_regprocedure('public.check_rate_limit(text[],integer,integer)') IS NOT NULL THEN
		EXECUTE 'REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT[], INT, INT) FROM authenticated';
	END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT[], INT, INT);
DROP TABLE IF EXISTS public.rate_limits;
