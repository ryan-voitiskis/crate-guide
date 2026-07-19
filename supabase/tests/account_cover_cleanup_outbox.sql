BEGIN;

SELECT plan(41);

SELECT has_table(
	'public',
	'record_cover_account_cleanup_jobs',
	'the deleted-account cover cleanup outbox exists'
);
SELECT ok(
	(
		SELECT relrowsecurity
		FROM pg_class
		WHERE oid = 'public.record_cover_account_cleanup_jobs'::regclass
	),
	'the account cleanup outbox has row-level security enabled'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'record_cover_account_cleanup_jobs'
	),
	0::BIGINT,
	'the account cleanup outbox exposes no RLS policies'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_constraint
		WHERE conrelid = 'public.record_cover_account_cleanup_jobs'::regclass
			AND contype = 'f'
	),
	0::BIGINT,
	'the account cleanup outbox has no auth-user foreign key'
);
SELECT ok(
	NOT has_table_privilege(
		'anon',
		'public.record_cover_account_cleanup_jobs',
		'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
	)
	AND NOT has_table_privilege(
		'authenticated',
		'public.record_cover_account_cleanup_jobs',
		'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
	)
	AND NOT has_table_privilege(
		'service_role',
		'public.record_cover_account_cleanup_jobs',
		'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
	),
	'outbox rows are inaccessible directly and must be mediated by service RPCs'
);
SELECT ok(
	to_regclass(
		'public.record_cover_account_cleanup_jobs_available_idx'
	) IS NULL
	AND pg_get_indexdef(
		'public.record_cover_account_cleanup_jobs_fair_available_idx'::regclass
	) LIKE '%(COALESCE(last_attempted_at, created_at), created_at, user_id) INCLUDE (locked_until)%',
	'the claim index serves fair ordering while carrying lease availability'
);
SELECT ok(
	to_regprocedure('public.enqueue_record_cover_account_cleanup(uuid)') IS NOT NULL
	AND to_regprocedure('public.claim_record_cover_account_cleanup()') IS NOT NULL
	AND to_regprocedure(
		'public.complete_record_cover_account_cleanup(uuid,uuid)'
	) IS NOT NULL
	AND to_regprocedure(
		'public.release_record_cover_account_cleanup(uuid,uuid)'
	) IS NOT NULL
	AND to_regprocedure(
		'public.list_record_cover_account_cleanup_objects(uuid)'
	) IS NOT NULL,
	'all account cleanup outbox RPCs exist'
);
SELECT ok(
	(
		SELECT bool_and(prosecdef)
		FROM pg_proc
		WHERE oid IN (
			'public.enqueue_record_cover_account_cleanup(uuid)'::regprocedure,
			'public.claim_record_cover_account_cleanup()'::regprocedure,
			'public.complete_record_cover_account_cleanup(uuid,uuid)'::regprocedure,
			'public.release_record_cover_account_cleanup(uuid,uuid)'::regprocedure,
			'public.list_record_cover_account_cleanup_objects(uuid)'::regprocedure
		)
	),
	'account cleanup outbox RPCs are security definers'
);
SELECT ok(
	(
		SELECT bool_and(
			proconfig @> ARRAY['search_path=pg_catalog, public']
		)
		FROM pg_proc
		WHERE oid IN (
			'public.enqueue_record_cover_account_cleanup(uuid)'::regprocedure,
			'public.claim_record_cover_account_cleanup()'::regprocedure,
			'public.complete_record_cover_account_cleanup(uuid,uuid)'::regprocedure,
			'public.release_record_cover_account_cleanup(uuid,uuid)'::regprocedure,
			'public.list_record_cover_account_cleanup_objects(uuid)'::regprocedure
		)
	),
	'account cleanup outbox RPCs pin their search paths'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.enqueue_record_cover_account_cleanup(uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.enqueue_record_cover_account_cleanup(uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'anon',
		'public.claim_record_cover_account_cleanup()',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.claim_record_cover_account_cleanup()',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'anon',
		'public.complete_record_cover_account_cleanup(uuid,uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.complete_record_cover_account_cleanup(uuid,uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'anon',
		'public.release_record_cover_account_cleanup(uuid,uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.release_record_cover_account_cleanup(uuid,uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'anon',
		'public.list_record_cover_account_cleanup_objects(uuid)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.list_record_cover_account_cleanup_objects(uuid)',
		'EXECUTE'
	),
	'browser roles cannot invoke account cleanup outbox RPCs'
);
SELECT ok(
	has_function_privilege(
		'service_role',
		'public.enqueue_record_cover_account_cleanup(uuid)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.claim_record_cover_account_cleanup()',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.complete_record_cover_account_cleanup(uuid,uuid)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.release_record_cover_account_cleanup(uuid,uuid)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.list_record_cover_account_cleanup_objects(uuid)',
		'EXECUTE'
	),
	'the service role can use every account cleanup outbox RPC'
);
SELECT ok(
	position(
		'FOR UPDATE SKIP LOCKED' IN pg_get_functiondef(
			'public.claim_record_cover_account_cleanup()'::regprocedure
		)
	) > 0,
	'the claim RPC uses skip-locked row leasing'
);
SELECT ok(
	position(
		'COALESCE(jobs.last_attempted_at, jobs.created_at)' IN pg_get_functiondef(
			'public.claim_record_cover_account_cleanup()'::REGPROCEDURE
		)
	) > 0
	AND position(
		'last_attempted_at = statement_timestamp()' IN pg_get_functiondef(
			'public.claim_record_cover_account_cleanup()'::REGPROCEDURE
		)
	) > 0,
	'the claim RPC orders by attempts and records an attempt at claim time'
);
SELECT is(
	(
		SELECT pronargs
		FROM pg_proc
		WHERE oid = 'public.list_record_cover_account_cleanup_objects(uuid)'::REGPROCEDURE
	),
	1::SMALLINT,
	'the object enumeration accepts only the internally claimed user UUID'
);
SELECT ok(
	position(
		'LIMIT 101' IN pg_get_functiondef(
			'public.list_record_cover_account_cleanup_objects(uuid)'::REGPROCEDURE
		)
	) > 0,
	'the object enumeration has a database-fixed 101-row bound'
);

SELECT throws_like(
	$$
		INSERT INTO public.record_cover_account_cleanup_jobs (
			user_id,
			attempt_count
		)
		VALUES (
			'00000000-0000-0000-0000-000000000499',
			-1
		)
	$$,
	'%record_cover_account_cleanup_jobs_attempt_count_check%',
	'the outbox rejects a negative attempt count'
);

INSERT INTO auth.users (id)
VALUES
	('00000000-0000-0000-0000-000000000401'),
	('00000000-0000-0000-0000-000000000402'),
	('00000000-0000-0000-0000-000000000403');

INSERT INTO storage.objects (bucket_id, name, owner_id)
SELECT
	'record-covers',
	'00000000-0000-0000-0000-000000000401/record/cover-'
		|| object_number::TEXT
		|| '.webp',
	'00000000-0000-0000-0000-000000000401'
FROM generate_series(1, 105) AS object_number;
INSERT INTO storage.buckets (id, name, public)
VALUES ('other-bucket', 'other-bucket', FALSE);
INSERT INTO storage.objects (bucket_id, name, owner_id)
VALUES
	(
		'record-covers',
		'00000000-0000-0000-0000-000000000401/000/deep/legacy/path/below/eight/folders/to/cover.webp',
		'00000000-0000-0000-0000-000000000401'
	),
	(
		'record-covers',
		'00000000-0000-0000-0000-000000000402/record/cross-account.webp',
		'00000000-0000-0000-0000-000000000402'
	),
	(
		'other-bucket',
		'00000000-0000-0000-0000-000000000401/record/wrong-bucket.webp',
		'00000000-0000-0000-0000-000000000401'
	);

SET LOCAL ROLE service_role;
SELECT is(
	(
		SELECT count(*)
		FROM public.list_record_cover_account_cleanup_objects(
			'00000000-0000-0000-0000-000000000401'
		)
	),
	101::BIGINT,
	'the service enumeration returns at most its fixed 101 rows'
);
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM public.list_record_cover_account_cleanup_objects(
			'00000000-0000-0000-0000-000000000401'
		)
		WHERE object_name NOT LIKE
			'00000000-0000-0000-0000-000000000401/%'
	),
	'the service enumeration returns only the claimed account prefix'
);
SELECT ok(
	EXISTS (
		SELECT 1
		FROM public.list_record_cover_account_cleanup_objects(
			'00000000-0000-0000-0000-000000000401'
		)
		WHERE object_name LIKE '%/below/eight/folders/to/cover.webp'
	),
	'the database enumeration sees deep legacy objects'
);
SELECT is(
	(
		SELECT array_agg(object_name)
		FROM public.list_record_cover_account_cleanup_objects(
			'00000000-0000-0000-0000-000000000401'
		)
	),
	(
		SELECT array_agg(object_name ORDER BY object_name)
		FROM public.list_record_cover_account_cleanup_objects(
			'00000000-0000-0000-0000-000000000401'
		)
	),
	'the bounded enumeration is deterministic by exact object name'
);
RESET ROLE;

CREATE TEMPORARY TABLE account_cleanup_claims (
	label TEXT PRIMARY KEY,
	claimed_user_id UUID NOT NULL,
	claim_token UUID NOT NULL
);

INSERT INTO account_cleanup_claims
SELECT 'first-enqueue', claimed_user_id, claim_token
FROM public.enqueue_record_cover_account_cleanup(
	'00000000-0000-0000-0000-000000000401'
);
INSERT INTO account_cleanup_claims
SELECT 'second-enqueue', claimed_user_id, claim_token
FROM public.enqueue_record_cover_account_cleanup(
	'00000000-0000-0000-0000-000000000401'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.record_cover_account_cleanup_jobs
		WHERE user_id = '00000000-0000-0000-0000-000000000401'
	),
	1::BIGINT,
	'enqueue is idempotent per account'
);
SELECT isnt(
	(
		SELECT claim_token
		FROM account_cleanup_claims
		WHERE label = 'first-enqueue'
	),
	(
		SELECT claim_token
		FROM account_cleanup_claims
		WHERE label = 'second-enqueue'
	),
	'a repeated enqueue rotates the exact claim token'
);
SELECT ok(
	public.release_record_cover_account_cleanup(
		'00000000-0000-0000-0000-000000000401',
		(
			SELECT claim_token
			FROM account_cleanup_claims
			WHERE label = 'second-enqueue'
		)
	),
	'an exact enqueue claim can release its lease'
);
SELECT is(
	(
		SELECT attempt_count
		FROM public.record_cover_account_cleanup_jobs
		WHERE user_id = '00000000-0000-0000-0000-000000000401'
	),
	1,
	'releasing a failed or incomplete claim increments attempt metadata'
);
SELECT ok(
	(
		SELECT locked_until > statement_timestamp()
			AND claim_token IS NOT NULL
			AND claim_token <> (
				SELECT claim_token
				FROM account_cleanup_claims
				WHERE label = 'second-enqueue'
			)
		FROM public.record_cover_account_cleanup_jobs
		WHERE user_id = '00000000-0000-0000-0000-000000000401'
	),
	'release rotates ownership and applies a short backoff instead of hot-looping'
);

INSERT INTO account_cleanup_claims
SELECT 'locked-second-user', claimed_user_id, claim_token
FROM public.enqueue_record_cover_account_cleanup(
	'00000000-0000-0000-0000-000000000402'
);
UPDATE public.record_cover_account_cleanup_jobs
SET locked_until = statement_timestamp() - INTERVAL '1 second'
WHERE user_id = '00000000-0000-0000-0000-000000000401';
INSERT INTO account_cleanup_claims
SELECT 'worker-claim', claimed_user_id, claim_token
FROM public.claim_record_cover_account_cleanup();
SELECT is(
	(
		SELECT claimed_user_id
		FROM account_cleanup_claims
		WHERE label = 'worker-claim'
	),
	'00000000-0000-0000-0000-000000000401'::UUID,
	'the oldest available job is claimed while another lease remains locked'
);
SELECT ok(
	(
		SELECT last_attempted_at IS NOT NULL
			AND locked_until > statement_timestamp()
		FROM public.record_cover_account_cleanup_jobs
		WHERE user_id = '00000000-0000-0000-0000-000000000401'
	),
	'claiming immediately records the attempt and active lease'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.claim_record_cover_account_cleanup()
	),
	0::BIGINT,
	'an active lease prevents a second claimant from receiving the same job'
);
SELECT ok(
	NOT public.complete_record_cover_account_cleanup(
		'00000000-0000-0000-0000-000000000401',
		gen_random_uuid()
	),
	'a mismatched claim token cannot complete an outbox job'
);
SELECT ok(
	EXISTS (
		SELECT 1
		FROM public.record_cover_account_cleanup_jobs
		WHERE user_id = '00000000-0000-0000-0000-000000000401'
	),
	'a failed exact completion leaves the job intact'
);
SELECT ok(
	public.complete_record_cover_account_cleanup(
		'00000000-0000-0000-0000-000000000401',
		(
			SELECT claim_token
			FROM account_cleanup_claims
			WHERE label = 'worker-claim'
		)
	),
	'the exact active claim completes its outbox job'
);

UPDATE public.record_cover_account_cleanup_jobs
SET locked_until = statement_timestamp() - INTERVAL '1 second'
WHERE user_id = '00000000-0000-0000-0000-000000000402';
INSERT INTO account_cleanup_claims
SELECT 'expired-reclaim', claimed_user_id, claim_token
FROM public.claim_record_cover_account_cleanup();
SELECT is(
	(
		SELECT claimed_user_id
		FROM account_cleanup_claims
		WHERE label = 'expired-reclaim'
	),
	'00000000-0000-0000-0000-000000000402'::UUID,
	'an expired lease can be reclaimed'
);
SELECT isnt(
	(
		SELECT claim_token
		FROM account_cleanup_claims
		WHERE label = 'locked-second-user'
	),
	(
		SELECT claim_token
		FROM account_cleanup_claims
		WHERE label = 'expired-reclaim'
	),
	'an expired lease receives a new exact claim token'
);
SELECT ok(
	public.release_record_cover_account_cleanup(
		'00000000-0000-0000-0000-000000000402',
		(
			SELECT claim_token
			FROM account_cleanup_claims
			WHERE label = 'expired-reclaim'
		)
	),
	'an expired-lease claimant can release the job after failure'
);
SELECT ok(
	(
		SELECT attempt_count = 1
			AND last_attempted_at IS NOT NULL
			AND locked_until > statement_timestamp()
			AND claim_token IS NOT NULL
			AND claim_token <> (
				SELECT claim_token
				FROM account_cleanup_claims
				WHERE label = 'expired-reclaim'
			)
		FROM public.record_cover_account_cleanup_jobs
		WHERE user_id = '00000000-0000-0000-0000-000000000402'
	),
	'failure release increments diagnostics and rotates the lease atomically'
);
SELECT ok(
	NOT public.complete_record_cover_account_cleanup(
		'00000000-0000-0000-0000-000000000402',
		(
			SELECT claim_token
			FROM account_cleanup_claims
			WHERE label = 'locked-second-user'
		)
	)
	AND EXISTS (
		SELECT 1
		FROM public.record_cover_account_cleanup_jobs
		WHERE user_id = '00000000-0000-0000-0000-000000000402'
	),
	'a stalled deleter cannot complete a worker-rotated live-user cleanup claim'
);

UPDATE public.record_cover_account_cleanup_jobs
SET
	created_at = statement_timestamp() - INTERVAL '10 minutes',
	last_attempted_at = statement_timestamp() - INTERVAL '1 minute',
	locked_until = statement_timestamp() - INTERVAL '1 second',
	claim_token = gen_random_uuid()
WHERE user_id = '00000000-0000-0000-0000-000000000402';
INSERT INTO public.record_cover_account_cleanup_jobs (user_id, created_at)
VALUES (
	'00000000-0000-0000-0000-000000000403',
	statement_timestamp() - INTERVAL '2 minutes'
);
INSERT INTO account_cleanup_claims
SELECT 'fair-untouched', claimed_user_id, claim_token
FROM public.claim_record_cover_account_cleanup();
SELECT is(
	(
		SELECT claimed_user_id
		FROM account_cleanup_claims
		WHERE label = 'fair-untouched'
	),
	'00000000-0000-0000-0000-000000000403'::UUID,
	'an untouched newer job is selected before an older attempted expired row'
);
SELECT ok(
	(
		SELECT last_attempted_at > created_at
			AND locked_until > statement_timestamp()
		FROM public.record_cover_account_cleanup_jobs
		WHERE user_id = '00000000-0000-0000-0000-000000000403'
	),
	'the fair claim marks the formerly untouched job at claim time'
);
SELECT ok(
	public.complete_record_cover_account_cleanup(
		'00000000-0000-0000-0000-000000000403',
		(
			SELECT claim_token
			FROM account_cleanup_claims
			WHERE label = 'fair-untouched'
		)
	),
	'the exact fair claim can complete'
);
INSERT INTO account_cleanup_claims
SELECT 'fair-attempted-next', claimed_user_id, claim_token
FROM public.claim_record_cover_account_cleanup();
SELECT is(
	(
		SELECT claimed_user_id
		FROM account_cleanup_claims
		WHERE label = 'fair-attempted-next'
	),
	'00000000-0000-0000-0000-000000000402'::UUID,
	'the previously attempted job remains available after untouched work receives service'
);

DELETE FROM auth.users
WHERE id = '00000000-0000-0000-0000-000000000402';
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM auth.users
		WHERE id = '00000000-0000-0000-0000-000000000402'
	)
	AND EXISTS (
		SELECT 1
		FROM public.record_cover_account_cleanup_jobs
		WHERE user_id = '00000000-0000-0000-0000-000000000402'
	),
	'the outbox job survives an auth-user cascade'
);

SELECT * FROM finish();
ROLLBACK;
