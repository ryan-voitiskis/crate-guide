BEGIN;

SELECT plan(47);

SELECT has_table(
	'public',
	'discogs_request_rate_limits',
	'the Discogs quota table exists'
);
SELECT ok(
	(
		SELECT relrowsecurity
		FROM pg_class
		WHERE oid = 'public.discogs_request_rate_limits'::regclass
	),
	'row-level security is enabled on the quota table'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'discogs_request_rate_limits'
	),
	0::BIGINT,
	'the quota table has no RLS policies'
);
SELECT ok(
	NOT has_table_privilege(
		'anon',
		'public.discogs_request_rate_limits',
		'SELECT'
	),
	'anonymous users cannot read quota state'
);
SELECT ok(
	NOT has_table_privilege(
		'authenticated',
		'public.discogs_request_rate_limits',
		'SELECT'
	),
	'authenticated users cannot read quota state'
);
SELECT ok(
	has_table_privilege(
		'service_role',
		'public.discogs_request_rate_limits',
		'SELECT'
	),
	'the service role can inspect quota state'
);

SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.consume_discogs_request_quota(uuid,integer,integer,integer)',
		'EXECUTE'
	),
	'anonymous users cannot consume quota'
);
SELECT ok(
	NOT has_function_privilege(
		'authenticated',
		'public.consume_discogs_request_quota(uuid,integer,integer,integer)',
		'EXECUTE'
	),
	'authenticated users cannot consume quota'
);
SELECT ok(
	has_function_privilege(
		'service_role',
		'public.consume_discogs_request_quota(uuid,integer,integer,integer)',
		'EXECUTE'
	),
	'the service role can consume quota'
);
SELECT ok(
	to_regprocedure('public.delete_discogs_user_rate_limit(uuid)') IS NOT NULL
	AND to_regprocedure(
		'public.prune_expired_discogs_user_rate_limits(integer)'
	) IS NOT NULL,
	'user-bucket deletion and bounded expiry pruning RPCs exist'
);
SELECT ok(
	(
		SELECT bool_and(
			prosecdef
			AND proconfig @> ARRAY['search_path=pg_catalog, public']
		)
		FROM pg_proc
		WHERE oid IN (
			'public.delete_discogs_user_rate_limit(uuid)'::REGPROCEDURE,
			'public.prune_expired_discogs_user_rate_limits(integer)'::REGPROCEDURE
		)
	),
	'rate-limit retirement RPCs are hardened security definers'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.delete_discogs_user_rate_limit(uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.delete_discogs_user_rate_limit(uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'anon',
		'public.prune_expired_discogs_user_rate_limits(integer)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.prune_expired_discogs_user_rate_limits(integer)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.delete_discogs_user_rate_limit(uuid)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.prune_expired_discogs_user_rate_limits(integer)',
		'EXECUTE'
	),
	'rate-limit retirement remains service-owned'
);
SELECT is(
	(
		SELECT pg_get_function_identity_arguments(oid)
		FROM pg_proc
		WHERE oid = 'public.consume_discogs_request_quota(uuid,integer,integer,integer)'::regprocedure
	),
	'target_user_id uuid, per_user_limit integer, global_limit integer, window_seconds integer',
	'the RPC accepts no caller-controlled bucket key'
);
SELECT ok(
	position(
		'pg_advisory_xact_lock' IN pg_get_functiondef(
			'public.consume_discogs_request_quota(uuid,integer,integer,integer)'::regprocedure
		)
	) > 0,
	'the RPC serializes concurrent first inserts with transaction advisory locks'
);
SELECT ok(
	position(
		'ORDER BY key_value' IN pg_get_functiondef(
			'public.consume_discogs_request_quota(uuid,integer,integer,integer)'::regprocedure
		)
	) > 0,
	'advisory locks are acquired in stable lexical order'
);

-- pgTAP cannot hold two calls inside this transaction at the advisory-lock
-- boundary. Concurrency proof is the reviewed stable-order transaction lock
-- above, acquired before either first insert or any counter read/write.

SET LOCAL ROLE service_role;

SELECT is(
	(
		SELECT allowed
		FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			2,
			5,
			60
		)
	),
	TRUE,
	'the first request is allowed'
);
SELECT is(
	(
		SELECT request_count
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:global'
	),
	1,
	'the first request increments the global bucket'
);
SELECT is(
	(
		SELECT request_count
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:user:00000000-0000-0000-0000-000000000061'
	),
	1,
	'the first request increments its verified-user bucket'
);
SELECT is(
	(
		SELECT allowed
		FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			2,
			5,
			60
		)
	),
	TRUE,
	'a request at the per-user limit is allowed'
);
SELECT is(
	(
		SELECT allowed
		FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			2,
			5,
			60
		)
	),
	FALSE,
	'the next request beyond the per-user limit is denied'
);
SELECT ok(
	(
		SELECT retry_after_seconds BETWEEN 1 AND 60
		FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			2,
			5,
			60
		)
	),
	'a denial returns a bounded remaining reset delay'
);
SELECT is(
	(
		SELECT request_count
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:user:00000000-0000-0000-0000-000000000061'
	),
	2,
	'a per-user denial does not consume user quota'
);
SELECT is(
	(
		SELECT request_count
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:global'
	),
	2,
	'a per-user denial does not consume global quota'
);

RESET ROLE;
TRUNCATE public.discogs_request_rate_limits;
SET LOCAL ROLE service_role;

SELECT is(
	(
		SELECT allowed
		FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			2,
			2,
			60
		)
	),
	TRUE,
	'the first user can consume shared quota'
);
SELECT is(
	(
		SELECT allowed
		FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000062',
			2,
			2,
			60
		)
	),
	TRUE,
	'a second user can consume its independent user budget'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.discogs_request_rate_limits
		WHERE bucket_key LIKE 'discogs:user:%'
	),
	2::BIGINT,
	'two users receive independent user buckets'
);
SELECT is(
	(
		SELECT request_count
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:global'
	),
	2,
	'two users share the same global bucket'
);
SELECT is(
	(
		SELECT allowed
		FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000062',
			2,
			2,
			60
		)
	),
	FALSE,
	'the shared global budget denies the next request'
);
SELECT is(
	(
		SELECT request_count
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:global'
	),
	2,
	'a global denial does not consume global quota'
);
SELECT is(
	(
		SELECT request_count
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:user:00000000-0000-0000-0000-000000000062'
	),
	1,
	'a global denial does not consume user quota'
);

RESET ROLE;
UPDATE public.discogs_request_rate_limits
SET reset_at = clock_timestamp() - INTERVAL '1 second';
SET LOCAL ROLE service_role;

SELECT is(
	(
		SELECT allowed
		FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			5,
			5,
			60
		)
	),
	TRUE,
	'an expired window accepts a new request'
);
SELECT is(
	(
		SELECT request_count
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:global'
	),
	1,
	'an expired global bucket resets before incrementing'
);
SELECT is(
	(
		SELECT request_count
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:user:00000000-0000-0000-0000-000000000061'
	),
	1,
	'an expired user bucket resets before incrementing'
);
SELECT ok(
	(
		SELECT reset_at > clock_timestamp()
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:global'
	),
	'an expired bucket receives a future reset time'
);

SELECT throws_like(
	$$
		SELECT * FROM public.consume_discogs_request_quota(NULL, 1, 1, 60)
	$$,
	'%target_user_id must not be null%',
	'a null verified user id is rejected'
);
SELECT throws_like(
	$$
		SELECT * FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			0,
			1,
			60
		)
	$$,
	'%quota limits and window_seconds must be positive%',
	'non-positive quota bounds are rejected'
);
SELECT throws_like(
	$$
		SELECT * FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			1,
			NULL,
			60
		)
	$$,
	'%quota limits and window_seconds must be positive%',
	'null quota bounds are rejected'
);
SELECT throws_like(
	$$
		SELECT * FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			2,
			1,
			60
		)
	$$,
	'%per_user_limit must not exceed global_limit%',
	'an inverted per-user/global bound is rejected'
);
SELECT throws_like(
	$$
		SELECT * FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			45,
			61,
			60
		)
	$$,
	'%global_limit must not exceed 60%',
	'a global bound above the provider allowance is rejected'
);
SELECT throws_like(
	$$
		SELECT * FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			45,
			55,
			59
		)
	$$,
	'%window_seconds must be between 60 and 120%',
	'a window below the provider interval is rejected'
);
SELECT throws_like(
	$$
		SELECT * FROM public.consume_discogs_request_quota(
			'00000000-0000-0000-0000-000000000061',
			45,
			55,
			121
		)
	$$,
	'%window_seconds must be between 60 and 120%',
	'a window above the retry metadata cap is rejected'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.discogs_request_rate_limits
		WHERE bucket_key <> 'discogs:global'
			AND bucket_key !~ '^discogs:user:[0-9a-f-]{36}$'
	),
	0::BIGINT,
	'all persisted keys are constructed internally from the verified UUID'
);

RESET ROLE;
TRUNCATE public.discogs_request_rate_limits;
INSERT INTO public.discogs_request_rate_limits (
	bucket_key,
	request_count,
	reset_at
)
VALUES
	('discogs:global', 9, statement_timestamp() - INTERVAL '1 minute'),
	(
		'discogs:user:00000000-0000-0000-0000-000000000061',
		3,
		statement_timestamp() - INTERVAL '1 minute'
	),
	(
		'discogs:user:00000000-0000-0000-0000-000000000062',
		2,
		statement_timestamp() + INTERVAL '1 minute'
	),
	(
		'discogs:user:00000000-0000-0000-0000-000000000063',
		1,
		statement_timestamp() - INTERVAL '2 minutes'
	),
	(
		'discogs:user:not-a-uuid',
		1,
		statement_timestamp() - INTERVAL '3 minutes'
	);

SET LOCAL ROLE service_role;
SELECT ok(
	public.delete_discogs_user_rate_limit(
		'00000000-0000-0000-0000-000000000061'
	),
	'account cleanup deletes its exact per-user quota bucket'
);
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:user:00000000-0000-0000-0000-000000000061'
	)
	AND EXISTS (
		SELECT 1
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:global'
	)
	AND EXISTS (
		SELECT 1
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:user:00000000-0000-0000-0000-000000000062'
	),
	'exact account retirement leaves the global and other user buckets intact'
);
SELECT is(
	public.prune_expired_discogs_user_rate_limits(1),
	1,
	'expiry pruning deletes no more than its explicit row bound'
);
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:user:00000000-0000-0000-0000-000000000063'
	)
	AND EXISTS (
		SELECT 1
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:global'
	)
	AND EXISTS (
		SELECT 1
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:user:00000000-0000-0000-0000-000000000062'
	)
	AND EXISTS (
		SELECT 1
		FROM public.discogs_request_rate_limits
		WHERE bucket_key = 'discogs:user:not-a-uuid'
	),
	'pruning removes only expired canonical user buckets, never global, active, or unrelated rows'
);
SELECT throws_like(
	$$ SELECT public.prune_expired_discogs_user_rate_limits(101) $$,
	'%maximum_rows must be between 1 and 100%',
	'quota pruning rejects an unbounded row request'
);

SELECT * FROM finish();
ROLLBACK;
