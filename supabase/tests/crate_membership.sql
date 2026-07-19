BEGIN;

SELECT plan(40);

SELECT ok(
	to_regprocedure('public.add_record_to_crate(uuid,uuid)') IS NOT NULL,
	'the add membership RPC exists'
);
SELECT ok(
	to_regprocedure('public.remove_record_from_crate(uuid,uuid)') IS NOT NULL,
	'the remove membership RPC exists'
);
SELECT ok(
	to_regprocedure('public.update_crate_updated_at_monotonic()') IS NOT NULL,
	'the crate-specific monotonic timestamp trigger function exists'
);
SELECT ok(
	NOT (
		SELECT prosecdef
		FROM pg_proc
		WHERE oid = 'public.update_crate_updated_at_monotonic()'::regprocedure
	),
	'the crate timestamp trigger function uses invoker security'
);
SELECT ok(
	coalesce(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.update_crate_updated_at_monotonic()'::regprocedure
		),
		false
	),
	'the crate timestamp trigger function pins its search path'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.update_crate_updated_at_monotonic()',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.update_crate_updated_at_monotonic()',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'service_role',
		'public.update_crate_updated_at_monotonic()',
		'EXECUTE'
	),
	'application roles cannot invoke the crate timestamp trigger function directly'
);
SELECT ok(
	EXISTS (
		SELECT 1
		FROM pg_trigger
		WHERE tgrelid = 'public.crates'::regclass
			AND tgname = 'crates_update_updated_at_trigger'
			AND tgfoid = 'public.update_crate_updated_at_monotonic()'::regprocedure
			AND NOT tgisinternal
	),
	'the crates table uses the monotonic timestamp trigger function'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_trigger AS trigger
		INNER JOIN (
			VALUES
				(
					'public.records'::regclass,
					'records_update_updated_at_trigger'
				),
				(
					'public.tracks'::regclass,
					'tracks_update_updated_at_trigger'
				),
				(
					'public.sets'::regclass,
					'sets_update_updated_at_trigger'
				)
		) AS expected(table_oid, trigger_name)
			ON trigger.tgrelid = expected.table_oid
			AND trigger.tgname = expected.trigger_name
		WHERE trigger.tgfoid = 'public.update_updated_at_column()'::regprocedure
			AND NOT trigger.tgisinternal
	),
	3::BIGINT,
	'unrelated timestamp triggers still use the shared trigger function'
);
SELECT is(
	(
		SELECT pg_get_function_identity_arguments(oid)
		FROM pg_proc
		WHERE oid = 'public.add_record_to_crate(uuid,uuid)'::regprocedure
	),
	'target_crate_id uuid, target_record_id uuid',
	'the add RPC accepts no caller-supplied user or array'
);
SELECT is(
	(
		SELECT pg_get_function_identity_arguments(oid)
		FROM pg_proc
		WHERE oid = 'public.remove_record_from_crate(uuid,uuid)'::regprocedure
	),
	'target_crate_id uuid, target_record_id uuid',
	'the remove RPC accepts no caller-supplied user or array'
);
SELECT is(
	pg_get_function_result(
		'public.add_record_to_crate(uuid,uuid)'::regprocedure
	),
	'crates',
	'the add RPC returns a crate row'
);
SELECT is(
	pg_get_function_result(
		'public.remove_record_from_crate(uuid,uuid)'::regprocedure
	),
	'crates',
	'the remove RPC returns a crate row'
);
SELECT ok(
	has_function_privilege(
		'authenticated',
		'public.add_record_to_crate(uuid,uuid)',
		'EXECUTE'
	),
	'authenticated users can add crate membership'
);
SELECT ok(
	has_function_privilege(
		'authenticated',
		'public.remove_record_from_crate(uuid,uuid)',
		'EXECUTE'
	),
	'authenticated users can remove crate membership'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.add_record_to_crate(uuid,uuid)',
		'EXECUTE'
	),
	'anonymous users cannot add crate membership'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.remove_record_from_crate(uuid,uuid)',
		'EXECUTE'
	),
	'anonymous users cannot remove crate membership'
);
SELECT ok(
	NOT has_function_privilege(
		'service_role',
		'public.add_record_to_crate(uuid,uuid)',
		'EXECUTE'
	),
	'the service role cannot add crate membership'
);
SELECT ok(
	NOT has_function_privilege(
		'service_role',
		'public.remove_record_from_crate(uuid,uuid)',
		'EXECUTE'
	),
	'the service role cannot remove crate membership'
);
SELECT ok(
	position(
		'FOR UPDATE' IN pg_get_functiondef(
			'public.add_record_to_crate(uuid,uuid)'::regprocedure
		)
	) > 0,
	'the add RPC locks the owned crate row'
);
SELECT ok(
	position(
		'FOR UPDATE' IN pg_get_functiondef(
			'public.remove_record_from_crate(uuid,uuid)'::regprocedure
		)
	) > 0,
	'the remove RPC locks the owned crate row'
);
SELECT ok(
	position(
		'auth.uid()' IN pg_get_functiondef(
			'public.add_record_to_crate(uuid,uuid)'::regprocedure
		)
	) > 0,
	'the add RPC derives ownership from the authenticated subject'
);
SELECT ok(
	position(
		'auth.uid()' IN pg_get_functiondef(
			'public.remove_record_from_crate(uuid,uuid)'::regprocedure
		)
	) > 0,
	'the remove RPC derives ownership from the authenticated subject'
);

SET LOCAL ROLE anon;
SELECT throws_like(
	$$
		SELECT public.add_record_to_crate(
			'00000000-0000-0000-0000-000000000141',
			'00000000-0000-0000-0000-000000000131'
		)
	$$,
	'%permission denied for function add_record_to_crate%',
	'anonymous callers cannot invoke the add RPC'
);
SELECT throws_like(
	$$
		SELECT public.remove_record_from_crate(
			'00000000-0000-0000-0000-000000000141',
			'00000000-0000-0000-0000-000000000131'
		)
	$$,
	'%permission denied for function remove_record_from_crate%',
	'anonymous callers cannot invoke the remove RPC'
);
RESET ROLE;

INSERT INTO auth.users (id)
VALUES
	('00000000-0000-0000-0000-000000000121'),
	('00000000-0000-0000-0000-000000000122');

INSERT INTO public.records (id, user_id, title, artists, labels)
VALUES
	(
		'00000000-0000-0000-0000-000000000131',
		'00000000-0000-0000-0000-000000000121',
		'Owner record one',
		'[]'::JSONB,
		'[]'::JSONB
	),
	(
		'00000000-0000-0000-0000-000000000132',
		'00000000-0000-0000-0000-000000000121',
		'Owner record two',
		'[]'::JSONB,
		'[]'::JSONB
	),
	(
		'00000000-0000-0000-0000-000000000133',
		'00000000-0000-0000-0000-000000000121',
		'Deleted record',
		'[]'::JSONB,
		'[]'::JSONB
	),
	(
		'00000000-0000-0000-0000-000000000134',
		'00000000-0000-0000-0000-000000000122',
		'Other user record',
		'[]'::JSONB,
		'[]'::JSONB
	);

INSERT INTO public.crates (
	id,
	user_id,
	name,
	records,
	updated_at
)
VALUES
	(
		'00000000-0000-0000-0000-000000000141',
		'00000000-0000-0000-0000-000000000121',
		'Owner crate',
		'{}'::UUID[],
		'2100-01-01 00:00:00+00'
	),
	(
		'00000000-0000-0000-0000-000000000142',
		'00000000-0000-0000-0000-000000000122',
		'Other user crate',
		ARRAY['00000000-0000-0000-0000-000000000134'::UUID],
		'2100-01-01 00:00:00+00'
	),
	(
		'00000000-0000-0000-0000-000000000143',
		'00000000-0000-0000-0000-000000000121',
		'Deleted record crate',
		ARRAY['00000000-0000-0000-0000-000000000133'::UUID],
		'2100-01-01 00:00:00+00'
	);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000121',
	true
);

SELECT is(
	(
		SELECT id
		FROM public.add_record_to_crate(
			'00000000-0000-0000-0000-000000000141',
			'00000000-0000-0000-0000-000000000131'
		)
	),
	'00000000-0000-0000-0000-000000000141'::UUID,
	'owner add returns the authoritative crate row'
);
SELECT is(
	(
		SELECT records
		FROM public.crates
		WHERE id = '00000000-0000-0000-0000-000000000141'
	),
	ARRAY['00000000-0000-0000-0000-000000000131'::UUID],
	'owner add stores the record exactly once'
);
SELECT ok(
	(
		SELECT updated_at > '2100-01-01 00:00:00+00'::TIMESTAMPTZ
		FROM public.crates
		WHERE id = '00000000-0000-0000-0000-000000000141'
	),
	'owner add advances the crate timestamp monotonically under the row lock'
);

CREATE TEMP TABLE pg_temp.crate_membership_timestamps AS
SELECT updated_at AS first_updated_at
FROM public.crates
WHERE id = '00000000-0000-0000-0000-000000000141';

CREATE TEMP TABLE pg_temp.repeated_add_response AS
SELECT *
FROM public.add_record_to_crate(
	'00000000-0000-0000-0000-000000000141',
	'00000000-0000-0000-0000-000000000131'
);

SELECT is(
	(
		SELECT cardinality(records)
		FROM pg_temp.repeated_add_response
	),
	1,
	'repeated add is idempotent'
);
SELECT ok(
	(
		SELECT response.updated_at - timestamp.first_updated_at
			>= INTERVAL '1 microsecond'
		FROM pg_temp.repeated_add_response AS response
		CROSS JOIN pg_temp.crate_membership_timestamps AS timestamp
	),
	'successive same-transaction RPC responses advance at microsecond granularity'
);
SELECT is(
	(
		SELECT records
		FROM public.add_record_to_crate(
			'00000000-0000-0000-0000-000000000141',
			'00000000-0000-0000-0000-000000000132'
		)
	),
	ARRAY[
		'00000000-0000-0000-0000-000000000131'::UUID,
		'00000000-0000-0000-0000-000000000132'::UUID
	],
	'sequential calls from stale client assumptions accumulate on the locked server row'
);
SELECT is(
	(
		SELECT records
		FROM public.remove_record_from_crate(
			'00000000-0000-0000-0000-000000000141',
			'00000000-0000-0000-0000-000000000131'
		)
	),
	ARRAY['00000000-0000-0000-0000-000000000132'::UUID],
	'owner remove returns the authoritative remaining membership'
);
SELECT is(
	(
		SELECT records
		FROM public.remove_record_from_crate(
			'00000000-0000-0000-0000-000000000141',
			'00000000-0000-0000-0000-000000000131'
		)
	),
	ARRAY['00000000-0000-0000-0000-000000000132'::UUID],
	'repeated remove is idempotent'
);
SELECT throws_like(
	$$
		SELECT public.add_record_to_crate(
			'00000000-0000-0000-0000-000000000142',
			'00000000-0000-0000-0000-000000000131'
		)
	$$,
	'%Crate not found%',
	'adding to another user crate is rejected'
);
SELECT throws_like(
	$$
		SELECT public.remove_record_from_crate(
			'00000000-0000-0000-0000-000000000142',
			'00000000-0000-0000-0000-000000000134'
		)
	$$,
	'%Crate not found%',
	'removing from another user crate is rejected'
);
SELECT throws_like(
	$$
		SELECT public.add_record_to_crate(
			'00000000-0000-0000-0000-000000000141',
			'00000000-0000-0000-0000-000000000134'
		)
	$$,
	'%Record not found%',
	'adding another user record is rejected'
);
SELECT throws_like(
	$$
		SELECT public.add_record_to_crate(
			'00000000-0000-0000-0000-000000000141',
			'00000000-0000-0000-0000-000000000139'
		)
	$$,
	'%Record not found%',
	'adding a missing record is rejected'
);
SELECT is(
	(
		SELECT records
		FROM public.crates
		WHERE id = '00000000-0000-0000-0000-000000000141'
	),
	ARRAY['00000000-0000-0000-0000-000000000132'::UUID],
	'rejected adds leave the owned crate unchanged'
);

RESET ROLE;
SELECT is(
	(
		SELECT records
		FROM public.crates
		WHERE id = '00000000-0000-0000-0000-000000000142'
	),
	ARRAY['00000000-0000-0000-0000-000000000134'::UUID],
	'rejected cross-user operations leave the other crate unchanged'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000121',
	true
);

DELETE FROM public.records
WHERE id = '00000000-0000-0000-0000-000000000133';

SELECT is(
	(
		SELECT records
		FROM public.remove_record_from_crate(
			'00000000-0000-0000-0000-000000000143',
			'00000000-0000-0000-0000-000000000133'
		)
	),
	'{}'::UUID[],
	'remove remains safe after the record row is deleted'
);
SELECT is(
	(
		SELECT records
		FROM public.crates
		WHERE id = '00000000-0000-0000-0000-000000000143'
	),
	'{}'::UUID[],
	'the orphaned membership is removed from stored state'
);

-- pgTAP runs this file in one transaction and cannot hold two independent
-- client calls at the FOR UPDATE boundary. Concurrency proof is the reviewed
-- row lock above plus the stale-input accumulation characterization.

SELECT * FROM finish();
ROLLBACK;
