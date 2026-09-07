BEGIN;

SELECT plan(10);

INSERT INTO auth.users (id) VALUES
	('00000000-0907-4000-8000-000000000001'),
	('00000000-0907-4000-8000-000000000002');
INSERT INTO public.records (id, user_id, title, artists, labels) VALUES (
	'10000000-0907-4000-8000-000000000001',
	'00000000-0907-4000-8000-000000000001',
	'Edit conflict fixture', '[]'::JSONB, '[]'::JSONB
);
INSERT INTO public.tracks (id, record_id, user_id, title, artists, extraartists, genres, bpm, updated_at) VALUES
	('20000000-0907-4000-8000-000000000001', '10000000-0907-4000-8000-000000000001', '00000000-0907-4000-8000-000000000001', 'Original', '[]'::JSONB, '[]'::JSONB, '[]'::JSONB, 128, '2020-01-01T00:00:00Z'),
	('20000000-0907-4000-8000-000000000002', '10000000-0907-4000-8000-000000000001', '00000000-0907-4000-8000-000000000001', 'Legacy null version', '[]'::JSONB, '[]'::JSONB, '[]'::JSONB, 128, NULL);

SELECT ok(
	NOT has_function_privilege('authenticated', 'public.update_track_updated_at_monotonic()', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'public.update_track_updated_at_monotonic()', 'EXECUTE'),
	'application roles cannot invoke the version trigger directly'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0907-4000-8000-000000000001', true);

WITH written AS (
	UPDATE public.tracks SET bpm = 140
	WHERE id = '20000000-0907-4000-8000-000000000001'
		AND updated_at = '2020-01-01T00:00:00Z'
	RETURNING id
)
SELECT is(count(*), 1::BIGINT, 'an editor with the current version saves') FROM written;

CREATE TEMP TABLE first_edit_version AS
SELECT updated_at FROM public.tracks WHERE id = '20000000-0907-4000-8000-000000000001';

UPDATE public.tracks SET title = 'Another editor'
WHERE id = '20000000-0907-4000-8000-000000000001';

SELECT ok(
	(SELECT updated_at FROM public.tracks WHERE id = '20000000-0907-4000-8000-000000000001')
		> (SELECT updated_at FROM first_edit_version),
	'every write advances the version even in the same transaction'
);

WITH written AS (
	UPDATE public.tracks SET title = 'Stale edit'
	WHERE id = '20000000-0907-4000-8000-000000000001'
		AND updated_at = (SELECT updated_at FROM first_edit_version)
	RETURNING id
)
SELECT is(count(*), 0::BIGINT, 'a stale editor cannot replace a newer save') FROM written;

SELECT is(
	(SELECT title FROM public.tracks WHERE id = '20000000-0907-4000-8000-000000000001'),
	'Another editor', 'a rejected edit preserves the newer title'
);
SELECT is(
	(SELECT bpm::NUMERIC FROM public.tracks WHERE id = '20000000-0907-4000-8000-000000000001'),
	140::NUMERIC, 'a rejected title edit preserves newer BPM metadata'
);

WITH written AS (
	UPDATE public.tracks SET title = 'Reviewed edit'
	WHERE id = '20000000-0907-4000-8000-000000000001'
		AND updated_at = (SELECT updated_at FROM public.tracks WHERE id = '20000000-0907-4000-8000-000000000001')
	RETURNING id
)
SELECT is(count(*), 1::BIGINT, 'reviewing the latest version permits a deliberate retry') FROM written;

WITH written AS (
	UPDATE public.tracks SET title = 'First edit'
	WHERE id = '20000000-0907-4000-8000-000000000002' AND updated_at IS NULL
	RETURNING id
)
SELECT is(count(*), 1::BIGINT, 'a null legacy version can be edited once') FROM written;

WITH written AS (
	UPDATE public.tracks SET title = 'Stale null edit'
	WHERE id = '20000000-0907-4000-8000-000000000002' AND updated_at IS NULL
	RETURNING id
)
SELECT is(count(*), 0::BIGINT, 'a stale null version cannot replace the first edit') FROM written;

SELECT set_config('request.jwt.claim.sub', '00000000-0907-4000-8000-000000000002', true);
WITH written AS (
	UPDATE public.tracks SET title = 'Other owner'
	WHERE id = '20000000-0907-4000-8000-000000000001'
	RETURNING id
)
SELECT is(count(*), 0::BIGINT, 'version support does not bypass track ownership') FROM written;

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
