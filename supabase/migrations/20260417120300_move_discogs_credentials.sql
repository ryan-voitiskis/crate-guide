-- H3. Move Discogs OAuth credentials out of public.profiles into a dedicated
-- table with no SELECT policy. Reads/writes flow through SECURITY DEFINER
-- RPCs so that:
--  * An XSS in the SPA cannot exfiltrate tokens from a cached profile row.
--  * The Pinia profile type no longer carries secrets in memory.
--  * Edge functions continue to operate on behalf of the caller using the
--    caller's Authorization header — no service-role key needed.

CREATE TABLE IF NOT EXISTS public.discogs_credentials (
	user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	request_token TEXT,
	request_secret TEXT,
	access_token TEXT,
	access_secret TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.discogs_credentials ENABLE ROW LEVEL SECURITY;
-- No policies: no SELECT / INSERT / UPDATE / DELETE from the authenticated
-- role. Access is exclusively via the SECURITY DEFINER RPCs below.

-- Backfill from profiles for any existing users that already completed or
-- started an OAuth dance before this migration.
INSERT INTO public.discogs_credentials (
	user_id, request_token, request_secret, access_token, access_secret
)
SELECT
	id,
	discogs_request_token,
	discogs_request_secret,
	discogs_access_token,
	discogs_access_secret
FROM public.profiles
WHERE discogs_request_token IS NOT NULL
	OR discogs_request_secret IS NOT NULL
	OR discogs_access_token IS NOT NULL
	OR discogs_access_secret IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Drop the columns from profiles now that the data has moved.
ALTER TABLE public.profiles
	DROP COLUMN IF EXISTS discogs_request_token,
	DROP COLUMN IF EXISTS discogs_request_secret,
	DROP COLUMN IF EXISTS discogs_access_token,
	DROP COLUMN IF EXISTS discogs_access_secret;

-- =========================================================================
-- RPCs: the only way for an authenticated caller to read/write credentials.
-- Each function re-derives identity from auth.uid(), never trusts client
-- parameters for the user, and pins search_path.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_discogs_credentials()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
	caller_user_id UUID;
	creds public.discogs_credentials%ROWTYPE;
BEGIN
	caller_user_id := auth.uid();
	IF caller_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	SELECT * INTO creds
	FROM public.discogs_credentials
	WHERE user_id = caller_user_id;

	IF NOT FOUND THEN
		RETURN jsonb_build_object(
			'request_token', NULL,
			'request_secret', NULL,
			'access_token', NULL,
			'access_secret', NULL
		);
	END IF;

	RETURN jsonb_build_object(
		'request_token', creds.request_token,
		'request_secret', creds.request_secret,
		'access_token', creds.access_token,
		'access_secret', creds.access_secret
	);
END;
$$;

REVOKE ALL ON FUNCTION public.get_discogs_credentials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discogs_credentials() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_discogs_request_credentials(
	p_token TEXT,
	p_secret TEXT
)
RETURNS VOID
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

	IF p_token IS NULL OR p_secret IS NULL THEN
		RAISE EXCEPTION 'request token and secret are required';
	END IF;

	INSERT INTO public.discogs_credentials (
		user_id, request_token, request_secret, updated_at
	)
	VALUES (caller_user_id, p_token, p_secret, NOW())
	ON CONFLICT (user_id) DO UPDATE
	SET
		request_token = EXCLUDED.request_token,
		request_secret = EXCLUDED.request_secret,
		updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.set_discogs_request_credentials(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_discogs_request_credentials(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_discogs_access_credentials(
	p_token TEXT,
	p_secret TEXT
)
RETURNS VOID
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

	IF p_token IS NULL OR p_secret IS NULL THEN
		RAISE EXCEPTION 'access token and secret are required';
	END IF;

	INSERT INTO public.discogs_credentials (
		user_id, access_token, access_secret, updated_at
	)
	VALUES (caller_user_id, p_token, p_secret, NOW())
	ON CONFLICT (user_id) DO UPDATE
	SET
		access_token = EXCLUDED.access_token,
		access_secret = EXCLUDED.access_secret,
		updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.set_discogs_access_credentials(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_discogs_access_credentials(TEXT, TEXT) TO authenticated;

-- Atomic disconnect: wipe credentials row and clear the identity bits on the
-- profile (username + avatar), matching the pre-migration client behaviour.
-- discogs_uid and just_completed_discogs_oauth are left as-is (same as the
-- old UPDATE did).
CREATE OR REPLACE FUNCTION public.disconnect_discogs()
RETURNS VOID
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

	DELETE FROM public.discogs_credentials
	WHERE user_id = caller_user_id;

	UPDATE public.profiles
	SET
		discogs_username = NULL,
		discogs_avatar_url = NULL
	WHERE id = caller_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_discogs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disconnect_discogs() TO authenticated;
