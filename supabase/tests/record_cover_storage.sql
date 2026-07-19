BEGIN;

SELECT plan(12);

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
	(
		SELECT pg_get_expr(polwithcheck, polrelid)
		FROM pg_policy
		WHERE polrelid = 'storage.objects'::REGCLASS
			AND polname = 'users_insert_own_record_covers'
	) LIKE '%array_length(storage.foldername(name), 1) = 2%',
	'cover uploads require exactly the user and record folder components'
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

INSERT INTO auth.users (id)
VALUES ('00000000-0000-0000-0000-000000000701');
INSERT INTO public.records (id, user_id, title, artists, labels)
VALUES (
	'00000000-0000-0000-0000-000000000711',
	'00000000-0000-0000-0000-000000000701',
	'Upload policy record',
	'[]'::JSONB,
	'[]'::JSONB
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000701',
	true
);
SELECT lives_ok(
	$$
		INSERT INTO storage.objects (bucket_id, name, owner_id)
		VALUES (
			'record-covers',
			'00000000-0000-0000-0000-000000000701/00000000-0000-0000-0000-000000000711/product.webp',
			'00000000-0000-0000-0000-000000000701'
		)
	$$,
	'the exact product upload path is accepted'
);
SELECT throws_like(
	$$
		INSERT INTO storage.objects (bucket_id, name, owner_id)
		VALUES (
			'record-covers',
			'00000000-0000-0000-0000-000000000701/00000000-0000-0000-0000-000000000711/legacy/deep.webp',
			'00000000-0000-0000-0000-000000000701'
		)
	$$,
	'%row-level security policy%',
	'new deeper upload paths are rejected'
);
SELECT throws_like(
	$$
		INSERT INTO storage.objects (bucket_id, name, owner_id)
		VALUES (
			'record-covers',
			'00000000-0000-0000-0000-000000000701/shallow.webp',
			'00000000-0000-0000-0000-000000000701'
		)
	$$,
	'%row-level security policy%',
	'new shallow upload paths are rejected'
);

SELECT * FROM finish();
ROLLBACK;
