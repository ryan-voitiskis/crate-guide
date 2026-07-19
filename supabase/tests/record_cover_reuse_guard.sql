BEGIN;

SELECT plan(26);

SELECT ok(
	to_regprocedure('public.prevent_obsolete_record_cover_reuse()') IS NOT NULL,
	'the cover reuse guard exists without caller arguments'
);
SELECT ok(
	(
		SELECT prosecdef
		FROM pg_proc
		WHERE oid = 'public.prevent_obsolete_record_cover_reuse()'::regprocedure
	),
	'the cover reuse guard can inspect the hidden cleanup queue'
);
SELECT ok(
	coalesce(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.prevent_obsolete_record_cover_reuse()'::regprocedure
		),
		false
	),
	'the cover reuse guard pins its search path'
);
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM pg_proc
		CROSS JOIN LATERAL aclexplode(
			coalesce(proacl, acldefault('f', proowner))
		) AS privilege
		WHERE oid = 'public.prevent_obsolete_record_cover_reuse()'::regprocedure
			AND privilege.grantee = 0
			AND privilege.privilege_type = 'EXECUTE'
	)
	AND NOT has_function_privilege(
		'anon',
		'public.prevent_obsolete_record_cover_reuse()',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.prevent_obsolete_record_cover_reuse()',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'service_role',
		'public.prevent_obsolete_record_cover_reuse()',
		'EXECUTE'
	),
	'the guard cannot be invoked directly by public or application roles'
);
SELECT ok(
	EXISTS (
		SELECT 1
		FROM pg_trigger
		WHERE tgrelid = 'public.records'::regclass
			AND tgname = 'records_prevent_obsolete_cover_reuse_trigger'
			AND tgfoid = 'public.prevent_obsolete_record_cover_reuse()'::regprocedure
			AND NOT tgisinternal
	),
	'the records table uses the cover reuse guard'
);
SELECT ok(
	position(
		'BEFORE INSERT OR UPDATE OF cover_storage_path' IN pg_get_triggerdef(
			(
				SELECT oid
				FROM pg_trigger
				WHERE tgrelid = 'public.records'::regclass
					AND tgname = 'records_prevent_obsolete_cover_reuse_trigger'
			)
		)
	) > 0,
	'the guard runs before cover-path inserts and updates'
);
SELECT ok(
	NOT has_table_privilege(
		'anon',
		'public.record_cover_cleanup_jobs',
		'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
	)
	AND NOT has_table_privilege(
		'authenticated',
		'public.record_cover_cleanup_jobs',
		'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
	),
	'browser roles remain unable to access the cleanup queue'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.queue_obsolete_record_cover()',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.queue_obsolete_record_cover()',
		'EXECUTE'
	),
	'browser roles remain unable to invoke the queue trigger directly'
);

INSERT INTO auth.users (id)
VALUES
	('00000000-0000-0000-0000-000000000301'),
	('00000000-0000-0000-0000-000000000302');

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000301',
	true
);
SELECT lives_ok(
	$$
		INSERT INTO public.records (
			id,
			user_id,
			title,
			artists,
			labels,
			cover_storage_path
		)
		VALUES (
			'00000000-0000-0000-0000-000000000311',
			'00000000-0000-0000-0000-000000000301',
			'Reuse guard',
			'[]'::JSONB,
			'[]'::JSONB,
			'00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/a.webp'
		)
	$$,
	'an authenticated insert can attach a fresh cover path'
);
SELECT lives_ok(
	$$
		INSERT INTO public.records (
			id,
			user_id,
			title,
			artists,
			labels,
			cover_storage_path
		)
		VALUES (
			'00000000-0000-0000-0000-000000000312',
			'00000000-0000-0000-0000-000000000301',
			'Null cover',
			'[]'::JSONB,
			'[]'::JSONB,
			NULL
		)
	$$,
	'an authenticated insert can keep a null cover path'
);
SELECT lives_ok(
	$$
		UPDATE public.records
		SET cover_storage_path = '00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/b.webp'
		WHERE id = '00000000-0000-0000-0000-000000000311'
	$$,
	'an authenticated owner can replace cover A with fresh cover B'
);
RESET ROLE;

SELECT is(
	(
		SELECT cover_storage_path
		FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000311'
	),
	'00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/b.webp',
	'the record now references cover B'
);
SELECT ok(
	EXISTS (
		SELECT 1
		FROM public.record_cover_cleanup_jobs
		WHERE object_path = '00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/a.webp'
	),
	'the existing queue trigger tombstones obsolete cover A'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000301',
	true
);
SELECT throws_ok(
	$$
		UPDATE public.records
		SET cover_storage_path = '00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/a.webp'
		WHERE id = '00000000-0000-0000-0000-000000000311'
	$$,
	'23514',
	'Cover path cannot be reused.',
	'a queued path fails with a generic check violation'
);
RESET ROLE;

SELECT is(
	(
		SELECT cover_storage_path
		FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000311'
	),
	'00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/b.webp',
	'a rejected reuse leaves the record on cover B'
);
SELECT ok(
	EXISTS (
		SELECT 1
		FROM public.record_cover_cleanup_jobs
		WHERE object_path = '00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/a.webp'
	),
	'a rejected reuse leaves the cleanup job intact'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000301',
	true
);
SELECT lives_ok(
	$$
		UPDATE public.records
		SET cover_storage_path = cover_storage_path
		WHERE id = '00000000-0000-0000-0000-000000000311'
	$$,
	'an unchanged cover B remains valid'
);
SELECT lives_ok(
	$$
		UPDATE public.records
		SET title = 'Metadata still updates'
		WHERE id = '00000000-0000-0000-0000-000000000311'
	$$,
	'a metadata-only record update is not bricked by the guard'
);
SELECT lives_ok(
	$$
		UPDATE public.records
		SET cover_storage_path = '00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/c.webp'
		WHERE id = '00000000-0000-0000-0000-000000000311'
	$$,
	'a fresh cover C remains valid'
);
SELECT lives_ok(
	$$
		UPDATE public.records
		SET cover_storage_path = NULL
		WHERE id = '00000000-0000-0000-0000-000000000311'
	$$,
	'clearing a cover path remains valid'
);
RESET ROLE;

SELECT is(
	(
		SELECT count(*)
		FROM public.record_cover_cleanup_jobs
		WHERE record_id = '00000000-0000-0000-0000-000000000311'
	),
	3::BIGINT,
	'the existing queue trigger still captures covers A, B, and C'
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
	$$
		DELETE FROM public.record_cover_cleanup_jobs
		WHERE object_path = '00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/a.webp'
	$$,
	'the service role can remove the completed cleanup job for cover A'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000301',
	true
);
SELECT lives_ok(
	$$
		UPDATE public.records
		SET cover_storage_path = '00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/a.webp'
		WHERE id = '00000000-0000-0000-0000-000000000311'
	$$,
	'cover A can be referenced again after its cleanup job is deleted'
);
RESET ROLE;
SELECT is(
	(
		SELECT cover_storage_path
		FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000311'
	),
	'00000000-0000-0000-0000-000000000301/00000000-0000-0000-0000-000000000311/a.webp',
	'the record accepts cover A after its tombstone is gone'
);

INSERT INTO public.records (
	id,
	user_id,
	title,
	artists,
	labels,
	cover_storage_path
)
VALUES (
	'00000000-0000-0000-0000-000000000313',
	'00000000-0000-0000-0000-000000000302',
	'Cascade cover',
	'[]'::JSONB,
	'[]'::JSONB,
	'00000000-0000-0000-0000-000000000302/00000000-0000-0000-0000-000000000313/cascade.webp'
);
SELECT lives_ok(
	$$
		DELETE FROM auth.users
		WHERE id = '00000000-0000-0000-0000-000000000302'
	$$,
	'an auth-user cascade is not bricked by the cover reuse guard'
);
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000313'
	)
	AND EXISTS (
		SELECT 1
		FROM public.record_cover_cleanup_jobs
		WHERE object_path = '00000000-0000-0000-0000-000000000302/00000000-0000-0000-0000-000000000313/cascade.webp'
	),
	'the cascade still leaves its obsolete cover queued for cleanup'
);

SELECT * FROM finish();
ROLLBACK;
