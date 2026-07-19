BEGIN;

SELECT plan(37);

SELECT has_table(
	'public',
	'record_cover_cleanup_jobs',
	'the durable record-cover cleanup queue exists'
);
SELECT ok(
	(
		SELECT relrowsecurity
		FROM pg_class
		WHERE oid = 'public.record_cover_cleanup_jobs'::regclass
	),
	'the cleanup queue has row-level security enabled'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'record_cover_cleanup_jobs'
	),
	0::BIGINT,
	'the cleanup queue exposes no RLS policies'
);
SELECT ok(
	NOT has_table_privilege(
		'anon',
		'public.record_cover_cleanup_jobs',
		'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
	),
	'anonymous callers have no cleanup-queue privileges'
);
SELECT ok(
	NOT has_table_privilege(
		'authenticated',
		'public.record_cover_cleanup_jobs',
		'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
	),
	'authenticated callers have no cleanup-queue privileges'
);
SELECT ok(
	has_table_privilege(
		'service_role',
		'public.record_cover_cleanup_jobs',
		'SELECT, INSERT, UPDATE, DELETE'
	),
	'the service role can drain and maintain cleanup jobs'
);
SELECT ok(
	has_column_privilege(
		'service_role',
		'public.records',
		'user_id',
		'SELECT'
	)
	AND has_column_privilege(
		'service_role',
		'public.records',
		'cover_storage_path',
		'SELECT'
	),
	'the service role can recheck only the record columns used by cleanup'
);
SELECT ok(
	NOT has_sequence_privilege(
		'authenticated',
		'public.record_cover_cleanup_jobs_id_seq',
		'USAGE, SELECT'
	),
	'authenticated callers cannot use the cleanup-job identity sequence'
);
SELECT ok(
	has_sequence_privilege(
		'service_role',
		'public.record_cover_cleanup_jobs_id_seq',
		'USAGE, SELECT'
	),
	'the service role can use the cleanup-job identity sequence'
);
SELECT ok(
	to_regprocedure('public.queue_obsolete_record_cover()') IS NOT NULL,
	'the queue trigger function exists without caller arguments'
);
SELECT ok(
	(
		SELECT prosecdef
		FROM pg_proc
		WHERE oid = 'public.queue_obsolete_record_cover()'::regprocedure
	),
	'the trigger can enqueue while browser roles remain denied'
);
SELECT ok(
	coalesce(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.queue_obsolete_record_cover()'::regprocedure
		),
		false
	),
	'the queue trigger function pins its search path'
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
	)
	AND NOT has_function_privilege(
		'service_role',
		'public.queue_obsolete_record_cover()',
		'EXECUTE'
	),
	'application roles cannot invoke the trigger function directly'
);
SELECT ok(
	EXISTS (
		SELECT 1
		FROM pg_trigger
		WHERE tgrelid = 'public.records'::regclass
			AND tgname = 'records_queue_obsolete_cover_trigger'
			AND tgfoid = 'public.queue_obsolete_record_cover()'::regprocedure
			AND NOT tgisinternal
	),
	'the records table uses the cleanup-queue trigger'
);
SELECT ok(
	position(
		'DELETE OR UPDATE OF cover_storage_path' IN pg_get_triggerdef(
			(
				SELECT oid
				FROM pg_trigger
				WHERE tgrelid = 'public.records'::regclass
					AND tgname = 'records_queue_obsolete_cover_trigger'
			)
		)
	) > 0,
	'the trigger runs after cover-path updates and deletes'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_constraint
		WHERE conrelid = 'public.record_cover_cleanup_jobs'::regclass
			AND contype = 'f'
	),
	0::BIGINT,
	'cleanup jobs have no foreign keys that can erase pending work'
);

SET LOCAL ROLE service_role;
SELECT throws_like(
	$$
		INSERT INTO public.record_cover_cleanup_jobs (
			user_id,
			record_id,
			object_path
		)
		VALUES (
			'00000000-0000-0000-0000-000000000201',
			'00000000-0000-0000-0000-000000000211',
			'00000000-0000-0000-0000-000000000299/00000000-0000-0000-0000-000000000211/cover.webp'
		)
	$$,
	'%record_cover_cleanup_jobs_object_path_check%',
	'the table rejects a cross-user object path'
);
SELECT throws_like(
	$$
		INSERT INTO public.record_cover_cleanup_jobs (
			user_id,
			record_id,
			object_path,
			attempt_count
		)
		VALUES (
			'00000000-0000-0000-0000-000000000201',
			'00000000-0000-0000-0000-000000000211',
			'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/cover.webp',
			-1
		)
	$$,
	'%record_cover_cleanup_jobs_attempt_count_check%',
	'the table rejects a negative retry count'
);
RESET ROLE;

INSERT INTO auth.users (id)
VALUES
	('00000000-0000-0000-0000-000000000201'),
	('00000000-0000-0000-0000-000000000202'),
	('00000000-0000-0000-0000-000000000203');

INSERT INTO public.records (
	id,
	user_id,
	title,
	artists,
	labels,
	cover_storage_path
)
VALUES
	(
		'00000000-0000-0000-0000-000000000211',
		'00000000-0000-0000-0000-000000000201',
		'Replace cover',
		'[]'::JSONB,
		'[]'::JSONB,
		'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/old.webp'
	),
	(
		'00000000-0000-0000-0000-000000000212',
		'00000000-0000-0000-0000-000000000201',
		'No old cover',
		'[]'::JSONB,
		'[]'::JSONB,
		NULL
	),
	(
		'00000000-0000-0000-0000-000000000213',
		'00000000-0000-0000-0000-000000000201',
		'Delete cover',
		'[]'::JSONB,
		'[]'::JSONB,
		'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000213/delete.webp'
	),
	(
		'00000000-0000-0000-0000-000000000214',
		'00000000-0000-0000-0000-000000000201',
		'Rollback cover',
		'[]'::JSONB,
		'[]'::JSONB,
		'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000214/rollback.webp'
	),
	(
		'00000000-0000-0000-0000-000000000215',
		'00000000-0000-0000-0000-000000000201',
		'Cross-user legacy path',
		'[]'::JSONB,
		'[]'::JSONB,
		'00000000-0000-0000-0000-000000000202/00000000-0000-0000-0000-000000000215/unsafe.webp'
	),
	(
		'00000000-0000-0000-0000-000000000216',
		'00000000-0000-0000-0000-000000000201',
		'Nested legacy path',
		'[]'::JSONB,
		'[]'::JSONB,
		'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000216/nested/unsafe.webp'
	),
	(
		'00000000-0000-0000-0000-000000000217',
		'00000000-0000-0000-0000-000000000201',
		'External legacy path',
		'[]'::JSONB,
		'[]'::JSONB,
		'https://covers.example/unsafe.webp'
	),
	(
		'00000000-0000-0000-0000-000000000218',
		'00000000-0000-0000-0000-000000000203',
		'Auth cascade cover',
		'[]'::JSONB,
		'[]'::JSONB,
		'00000000-0000-0000-0000-000000000203/00000000-0000-0000-0000-000000000218/cascade.webp'
	);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000201',
	true
);
SELECT throws_like(
	$$ SELECT * FROM public.record_cover_cleanup_jobs $$,
	'%permission denied for table record_cover_cleanup_jobs%',
	'authenticated callers cannot read cleanup jobs'
);
SELECT throws_like(
	$$
		INSERT INTO public.record_cover_cleanup_jobs (
			user_id,
			record_id,
			object_path
		)
		VALUES (
			'00000000-0000-0000-0000-000000000201',
			'00000000-0000-0000-0000-000000000211',
			'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/client.webp'
		)
	$$,
	'%permission denied for table record_cover_cleanup_jobs%',
	'authenticated callers cannot create cleanup jobs directly'
);
SELECT lives_ok(
	$$
		UPDATE public.records
		SET cover_storage_path = '00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/new.webp'
		WHERE id = '00000000-0000-0000-0000-000000000211'
	$$,
	'an authenticated cover replacement atomically enqueues through the definer trigger'
);
RESET ROLE;

SELECT is(
	(
		SELECT object_path
		FROM public.record_cover_cleanup_jobs
		WHERE record_id = '00000000-0000-0000-0000-000000000211'
		ORDER BY id
		LIMIT 1
	),
	'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/old.webp',
	'replacement queues the old managed path'
);
SELECT is(
	(
		SELECT attempt_count
		FROM public.record_cover_cleanup_jobs
		WHERE record_id = '00000000-0000-0000-0000-000000000211'
		ORDER BY id
		LIMIT 1
	),
	0,
	'new cleanup jobs start with zero attempts'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000201',
	true
);
SELECT lives_ok(
	$$
		UPDATE public.records
		SET cover_storage_path = cover_storage_path
		WHERE id = '00000000-0000-0000-0000-000000000211'
	$$,
	'an unchanged managed path does not fail the record update'
);
RESET ROLE;
SELECT is(
	(
		SELECT count(*)
		FROM public.record_cover_cleanup_jobs
		WHERE record_id = '00000000-0000-0000-0000-000000000211'
	),
	1::BIGINT,
	'an unchanged managed path creates no job'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000201',
	true
);
SELECT lives_ok(
	$$
		UPDATE public.records
		SET cover_storage_path = '00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000212/first.webp'
		WHERE id = '00000000-0000-0000-0000-000000000212'
	$$,
	'setting the first managed path succeeds without obsolete work'
);
RESET ROLE;
SELECT is(
	(
		SELECT count(*)
		FROM public.record_cover_cleanup_jobs
		WHERE record_id = '00000000-0000-0000-0000-000000000212'
	),
	0::BIGINT,
	'a null old path creates no cleanup job'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000201',
	true
);
UPDATE public.records
SET cover_storage_path = '00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/old.webp'
WHERE id = '00000000-0000-0000-0000-000000000211';
UPDATE public.records
SET cover_storage_path = '00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/new.webp'
WHERE id = '00000000-0000-0000-0000-000000000211';
RESET ROLE;
SELECT is(
	(
		SELECT count(*)
		FROM public.record_cover_cleanup_jobs
		WHERE record_id = '00000000-0000-0000-0000-000000000211'
	),
	2::BIGINT,
	'reused obsolete paths are deduplicated'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000201',
	true
);
SELECT lives_ok(
	$$
		DELETE FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000213'
	$$,
	'an authenticated record deletion atomically enqueues its managed path'
);
RESET ROLE;
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000213'
	)
	AND EXISTS (
		SELECT 1
		FROM public.record_cover_cleanup_jobs
		WHERE record_id = '00000000-0000-0000-0000-000000000213'
	),
	'the cleanup job survives record deletion without a foreign key'
);

SAVEPOINT before_rolled_back_delete;
DELETE FROM public.records
WHERE id = '00000000-0000-0000-0000-000000000214';
ROLLBACK TO SAVEPOINT before_rolled_back_delete;
SELECT ok(
	EXISTS (
		SELECT 1
		FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000214'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.record_cover_cleanup_jobs
		WHERE record_id = '00000000-0000-0000-0000-000000000214'
	),
	'rolling back a record deletion also rolls back its cleanup job'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000201',
	true
);
SELECT lives_ok(
	$$
		DELETE FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000215'
	$$,
	'a cross-user legacy path does not brick record deletion'
);
SELECT lives_ok(
	$$
		UPDATE public.records
		SET cover_storage_path = NULL
		WHERE id = '00000000-0000-0000-0000-000000000216'
	$$,
	'a nested legacy path does not brick cover removal'
);
SELECT lives_ok(
	$$
		DELETE FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000217'
	$$,
	'an external URL in the legacy path column does not brick record deletion'
);
RESET ROLE;
SELECT is(
	(
		SELECT count(*)
		FROM public.record_cover_cleanup_jobs
		WHERE record_id IN (
			'00000000-0000-0000-0000-000000000215',
			'00000000-0000-0000-0000-000000000216',
			'00000000-0000-0000-0000-000000000217'
		)
	),
	0::BIGINT,
	'invalid legacy paths never become service-role cleanup jobs'
);

SELECT lives_ok(
	$$
		DELETE FROM auth.users
		WHERE id = '00000000-0000-0000-0000-000000000203'
	$$,
	'the auth-user cascade can delete records without the queue trigger bricking it'
);
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000218'
	)
	AND EXISTS (
		SELECT 1
		FROM public.record_cover_cleanup_jobs
		WHERE record_id = '00000000-0000-0000-0000-000000000218'
			AND object_path = '00000000-0000-0000-0000-000000000203/00000000-0000-0000-0000-000000000218/cascade.webp'
	),
	'cascading auth deletion enqueues a job that survives both deleted parents'
);

SELECT * FROM finish();
ROLLBACK;
