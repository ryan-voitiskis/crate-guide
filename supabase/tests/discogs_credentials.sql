BEGIN;

SELECT plan(8);

SELECT ok(
	NOT has_table_privilege('anon', 'public.discogs_credentials', 'SELECT'),
	'anonymous users cannot select Discogs credentials'
);
SELECT ok(
	NOT has_table_privilege(
		'authenticated',
		'public.discogs_credentials',
		'SELECT'
	),
	'authenticated users cannot select Discogs credentials'
);
SELECT ok(
	to_regprocedure('public.get_discogs_credentials()') IS NULL,
	'the secret-returning getter is unavailable'
);
SELECT ok(
	to_regprocedure('public.set_discogs_request_credentials(text,text)') IS NULL,
	'the request-credential setter is unavailable'
);
SELECT ok(
	to_regprocedure('public.set_discogs_access_credentials(text,text)') IS NULL,
	'the access-credential setter is unavailable'
);
SELECT ok(
	(
		SELECT relrowsecurity
		FROM pg_class
		WHERE oid = 'public.discogs_credentials'::regclass
	),
	'row-level security remains enabled'
);
SELECT ok(
	has_table_privilege('service_role', 'public.discogs_credentials', 'SELECT'),
	'the Edge service role can read credentials after caller validation'
);

INSERT INTO auth.users (id)
VALUES
	('00000000-0000-0000-0000-000000000001'),
	('00000000-0000-0000-0000-000000000002');

INSERT INTO public.discogs_credentials (user_id, access_token, access_secret)
VALUES
	('00000000-0000-0000-0000-000000000001', 'fixture-token-a', 'fixture-secret-a'),
	('00000000-0000-0000-0000-000000000002', 'fixture-token-b', 'fixture-secret-b');

SET LOCAL ROLE service_role;
SELECT is(
	(
		SELECT count(*)
		FROM public.discogs_credentials
		WHERE user_id = '00000000-0000-0000-0000-000000000001'
	),
	1::BIGINT,
	'the service role can scope a read to the verified user id'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
