-- Credentials are read and written only after an Edge Function validates the
-- caller and scopes a service-role query to that verified user.
REVOKE ALL ON TABLE public.discogs_credentials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.discogs_credentials
TO service_role;

REVOKE ALL ON FUNCTION public.get_discogs_credentials() FROM authenticated;
DROP FUNCTION public.get_discogs_credentials();

REVOKE ALL ON FUNCTION public.set_discogs_request_credentials(TEXT, TEXT)
FROM authenticated;
DROP FUNCTION public.set_discogs_request_credentials(TEXT, TEXT);

REVOKE ALL ON FUNCTION public.set_discogs_access_credentials(TEXT, TEXT)
FROM authenticated;
DROP FUNCTION public.set_discogs_access_credentials(TEXT, TEXT);
