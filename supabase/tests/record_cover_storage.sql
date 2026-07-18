BEGIN;

SELECT plan(8);

SELECT has_column(
	'public',
	'records',
	'cover_storage_path',
	'records track their managed cover object path'
);

SELECT ok(
	EXISTS (
		SELECT 1
		FROM storage.buckets
		WHERE id = 'record-covers'
	),
	'the record-covers bucket exists'
);

SELECT is(
	(SELECT public FROM storage.buckets WHERE id = 'record-covers'),
	FALSE,
	'record covers require authenticated or signed access'
);

SELECT is(
	(SELECT file_size_limit FROM storage.buckets WHERE id = 'record-covers'),
	2097152::BIGINT,
	'the bucket rejects stored covers larger than 2 MiB'
);

SELECT is(
	(SELECT allowed_mime_types FROM storage.buckets WHERE id = 'record-covers'),
	ARRAY['image/webp']::TEXT[],
	'the bucket accepts only normalized WebP objects'
);

SELECT ok(
	EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'storage'
			AND tablename = 'objects'
			AND policyname = 'users_select_own_record_covers'
	),
	'authenticated users can inspect only their own cover metadata'
);

SELECT ok(
	EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'storage'
			AND tablename = 'objects'
			AND policyname = 'users_insert_own_record_covers'
	),
	'cover uploads have an ownership and record-bound insert policy'
);

SELECT ok(
	EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'storage'
			AND tablename = 'objects'
			AND policyname = 'users_delete_own_record_covers'
	),
	'cover deletion has an owner-only policy'
);

SELECT * FROM finish();
ROLLBACK;
