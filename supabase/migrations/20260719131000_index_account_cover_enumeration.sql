CREATE OR REPLACE FUNCTION public.list_record_cover_account_cleanup_objects(
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
		AND objects.name COLLATE "C" >= target_user_id::TEXT || '/'
		AND objects.name COLLATE "C" < target_user_id::TEXT || '0'
	ORDER BY objects.name COLLATE "C"
	LIMIT 101;
$$;

REVOKE ALL ON FUNCTION public.list_record_cover_account_cleanup_objects(UUID)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_record_cover_account_cleanup_objects(UUID)
TO service_role;
