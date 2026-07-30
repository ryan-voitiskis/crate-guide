BEGIN;

SELECT plan(44);

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
	to_regprocedure(
		'public.mark_record_cover_cleanup_attempts(uuid,bigint[],integer[],timestamp with time zone)'
	) IS NOT NULL,
	'the set-based cleanup-attempt RPC exists'
);
SELECT ok(
	(
		SELECT prosecdef
			AND proconfig @> ARRAY['search_path=pg_catalog, public']
		FROM pg_proc
		WHERE oid = 'public.mark_record_cover_cleanup_attempts(uuid,bigint[],integer[],timestamp with time zone)'::REGPROCEDURE
	),
	'the cleanup-attempt RPC is a hardened security definer'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.mark_record_cover_cleanup_attempts(uuid,bigint[],integer[],timestamp with time zone)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.mark_record_cover_cleanup_attempts(uuid,bigint[],integer[],timestamp with time zone)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.mark_record_cover_cleanup_attempts(uuid,bigint[],integer[],timestamp with time zone)',
		'EXECUTE'
	),
	'only the service role can invoke set-based attempt marking'
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

CREATE TEMPORARY TABLE cleanup_attempt_probe (
	label TEXT PRIMARY KEY,
	job_id BIGINT NOT NULL
);
GRANT SELECT ON cleanup_attempt_probe TO service_role;
WITH inserted AS (
	INSERT INTO public.record_cover_cleanup_jobs (
		user_id,
		record_id,
		object_path,
		attempt_count
	)
	VALUES (
		'00000000-0000-0000-0000-000000000201',
		'00000000-0000-0000-0000-000000000291',
		'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000291/attempt-fresh.webp',
		0
	)
	RETURNING id
)
INSERT INTO cleanup_attempt_probe
SELECT 'fresh', id FROM inserted;
WITH inserted AS (
	INSERT INTO public.record_cover_cleanup_jobs (
		user_id,
		record_id,
		object_path,
		attempt_count
	)
	VALUES (
		'00000000-0000-0000-0000-000000000201',
		'00000000-0000-0000-0000-000000000292',
		'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000292/attempt-stale.webp',
		1
	)
	RETURNING id
)
INSERT INTO cleanup_attempt_probe
SELECT 'stale', id FROM inserted;

SET LOCAL ROLE service_role;
SELECT is(
	(
		SELECT array_agg(changed_job_id ORDER BY changed_job_id)
		FROM public.mark_record_cover_cleanup_attempts(
			'00000000-0000-0000-0000-000000000201',
			ARRAY[
				(SELECT job_id FROM cleanup_attempt_probe WHERE label = 'fresh'),
				(SELECT job_id FROM cleanup_attempt_probe WHERE label = 'stale')
			]::BIGINT[],
			ARRAY[0, 0]::INTEGER[],
			'2026-07-22T05:00:00Z'::TIMESTAMPTZ
		)
	),
	ARRAY[(SELECT job_id FROM cleanup_attempt_probe WHERE label = 'fresh')]::BIGINT[],
	'the set-based RPC returns only the row whose observed count still matches'
);
SELECT ok(
	(
		SELECT attempt_count = 1
			AND last_attempted_at = '2026-07-22T05:00:00Z'::TIMESTAMPTZ
		FROM public.record_cover_cleanup_jobs
		WHERE id = (
			SELECT job_id FROM cleanup_attempt_probe WHERE label = 'fresh'
		)
	),
	'a matching row increments once and receives the shared attempt timestamp'
);
SELECT ok(
	(
		SELECT attempt_count = 1 AND last_attempted_at IS NULL
		FROM public.record_cover_cleanup_jobs
		WHERE id = (
			SELECT job_id FROM cleanup_attempt_probe WHERE label = 'stale'
		)
	),
	'a concurrently advanced row is not incremented or restamped'
);
SELECT throws_like(
	$$
		SELECT *
		FROM public.mark_record_cover_cleanup_attempts(
			'00000000-0000-0000-0000-000000000201',
			ARRAY(SELECT value::BIGINT FROM generate_series(1, 101) AS value),
			ARRAY(SELECT 0 FROM generate_series(1, 101)),
			statement_timestamp()
		)
	$$,
	'%cleanup attempt batch exceeds 100 jobs%',
	'the set-based RPC rejects a batch above the handler limit'
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
		'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/20000000-0000-4000-8000-000000000001.webp'
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
		'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000213/20000000-0000-4000-8000-000000000002.webp'
	),
	(
		'00000000-0000-0000-0000-000000000214',
		'00000000-0000-0000-0000-000000000201',
		'Rollback cover',
		'[]'::JSONB,
		'[]'::JSONB,
		'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000214/20000000-0000-4000-8000-000000000003.webp'
	),
	(
		'00000000-0000-0000-0000-000000000215',
		'00000000-0000-0000-0000-000000000201',
		'Cross-user path rejected',
		'[]'::JSONB,
		'[]'::JSONB,
		NULL
	),
	(
		'00000000-0000-0000-0000-000000000216',
		'00000000-0000-0000-0000-000000000201',
		'Nested path rejected',
		'[]'::JSONB,
		'[]'::JSONB,
		NULL
	),
	(
		'00000000-0000-0000-0000-000000000217',
		'00000000-0000-0000-0000-000000000201',
		'External path rejected',
		'[]'::JSONB,
		'[]'::JSONB,
		NULL
	),
	(
		'00000000-0000-0000-0000-000000000218',
		'00000000-0000-0000-0000-000000000203',
		'Auth cascade cover',
		'[]'::JSONB,
		'[]'::JSONB,
		'00000000-0000-0000-0000-000000000203/00000000-0000-0000-0000-000000000218/20000000-0000-4000-8000-000000000006.webp'
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
		SET cover_storage_path = '00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/20000000-0000-4000-8000-000000000004.webp'
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
	'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/20000000-0000-4000-8000-000000000001.webp',
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
		SET cover_storage_path = '00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000212/20000000-0000-4000-8000-000000000005.webp'
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

CREATE TEMPORARY TABLE record_cover_cleanup_dedup_probe (
	id UUID NOT NULL,
	user_id UUID NOT NULL,
	cover_storage_path TEXT
);
CREATE TRIGGER record_cover_cleanup_dedup_probe_trigger
AFTER UPDATE OF cover_storage_path ON record_cover_cleanup_dedup_probe
FOR EACH ROW
EXECUTE FUNCTION public.queue_obsolete_record_cover();
INSERT INTO record_cover_cleanup_dedup_probe (
	id,
	user_id,
	cover_storage_path
)
VALUES (
	'00000000-0000-0000-0000-000000000211',
	'00000000-0000-0000-0000-000000000201',
	'00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/20000000-0000-4000-8000-000000000004.webp'
);
UPDATE record_cover_cleanup_dedup_probe
SET cover_storage_path = '00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/20000000-0000-4000-8000-000000000001.webp';
UPDATE record_cover_cleanup_dedup_probe
SET cover_storage_path = '00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000211/20000000-0000-4000-8000-000000000004.webp';
SELECT is(
	(
		SELECT count(*)
		FROM public.record_cover_cleanup_jobs
		WHERE record_id = '00000000-0000-0000-0000-000000000211'
	),
	2::BIGINT,
	'the queue trigger deduplicates repeated obsolete paths without reattaching them to records'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000201',
	true
);
SELECT lives_ok(
	$$
		SELECT public.remove_record_from_collection(
			'00000000-0000-0000-0000-000000000213'
		)
	$$,
	'transactional authenticated record removal atomically enqueues its managed path'
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
SELECT throws_like(
	$$
		UPDATE public.records
		SET cover_storage_path = '00000000-0000-0000-0000-000000000202/00000000-0000-0000-0000-000000000215/20000000-0000-4000-8000-000000000007.webp'
		WHERE id = '00000000-0000-0000-0000-000000000215'
	$$,
	'%records_cover_storage_path_ownership_check%',
	'a cross-user path cannot enter the managed column'
);
SELECT throws_like(
	$$
		UPDATE public.records
		SET cover_storage_path = '00000000-0000-0000-0000-000000000201/00000000-0000-0000-0000-000000000216/nested/unsafe.webp'
		WHERE id = '00000000-0000-0000-0000-000000000216'
	$$,
	'%records_cover_storage_path_ownership_check%',
	'a nested path cannot enter the managed column'
);
SELECT throws_like(
	$$
		UPDATE public.records
		SET cover_storage_path = 'https://covers.example/unsafe.webp'
		WHERE id = '00000000-0000-0000-0000-000000000217'
	$$,
	'%records_cover_storage_path_ownership_check%',
	'an external URL cannot enter the managed column'
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
	'rejected invalid paths never become service-role cleanup jobs'
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
			AND object_path = '00000000-0000-0000-0000-000000000203/00000000-0000-0000-0000-000000000218/20000000-0000-4000-8000-000000000006.webp'
	),
	'cascading auth deletion enqueues a job that survives both deleted parents'
);

SELECT * FROM finish();
ROLLBACK;
