BEGIN;

SELECT plan(15);

INSERT INTO auth.users (id) VALUES
	('00000000-1024-4000-8000-000000000001'),
	('00000000-1024-4000-8000-000000000002');
INSERT INTO public.records (id,user_id,title,artists,labels,year,updated_at) VALUES
	('10000000-1024-4000-8000-000000000001','00000000-1024-4000-8000-000000000001','Original','[]'::JSONB,'[]'::JSONB,2000,'2020-01-01T00:00:00Z'),
	('10000000-1024-4000-8000-000000000002','00000000-1024-4000-8000-000000000001','Legacy','[]'::JSONB,'[]'::JSONB,NULL,NULL);
INSERT INTO public.crates (id,user_id,name,records,updated_at) VALUES
	('30000000-1024-4000-8000-000000000001','00000000-1024-4000-8000-000000000001','Original crate',ARRAY[]::UUID[],'2020-01-01T00:00:00Z');

SELECT ok(
	NOT has_function_privilege('authenticated','public.update_record_updated_at_monotonic()','EXECUTE')
	AND NOT has_function_privilege('anon','public.update_record_updated_at_monotonic()','EXECUTE'),
	'application roles cannot invoke the record trigger directly'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-1024-4000-8000-000000000001',true);

WITH written AS (
	UPDATE public.records SET title='First editor'
	WHERE id='10000000-1024-4000-8000-000000000001' AND updated_at='2020-01-01T00:00:00Z' RETURNING id
) SELECT is(count(*),1::BIGINT,'a current record editor can save') FROM written;
CREATE TEMP TABLE first_record_version AS SELECT updated_at FROM public.records WHERE id='10000000-1024-4000-8000-000000000001';
UPDATE public.records SET year=2001 WHERE id='10000000-1024-4000-8000-000000000001';
SELECT ok((SELECT updated_at FROM public.records WHERE id='10000000-1024-4000-8000-000000000001')>(SELECT updated_at FROM first_record_version),'repeated record writes in one transaction advance the token');
WITH written AS (
	UPDATE public.records SET title='Stale editor',year=2000
	WHERE id='10000000-1024-4000-8000-000000000001' AND updated_at=(SELECT updated_at FROM first_record_version) RETURNING id
) SELECT is(count(*),0::BIGINT,'a stale record editor cannot overwrite any metadata') FROM written;
SELECT is((SELECT title FROM public.records WHERE id='10000000-1024-4000-8000-000000000001'),'First editor','rejected edit preserves the current title');
SELECT is((SELECT year FROM public.records WHERE id='10000000-1024-4000-8000-000000000001'),2001,'rejected edit preserves a different changed field');
WITH written AS (
	UPDATE public.records SET title='First legacy edit' WHERE id='10000000-1024-4000-8000-000000000002' AND updated_at IS NULL RETURNING id
) SELECT is(count(*),1::BIGINT,'a null record version can be edited once') FROM written;
WITH written AS (
	UPDATE public.records SET title='Stale legacy edit' WHERE id='10000000-1024-4000-8000-000000000002' AND updated_at IS NULL RETURNING id
) SELECT is(count(*),0::BIGINT,'a stale null version cannot replace its first edit') FROM written;

WITH written AS (
	UPDATE public.crates SET name='First crate editor' WHERE id='30000000-1024-4000-8000-000000000001' AND updated_at='2020-01-01T00:00:00Z' RETURNING id
) SELECT is(count(*),1::BIGINT,'a current crate editor can save') FROM written;
CREATE TEMP TABLE first_crate_version AS SELECT updated_at FROM public.crates WHERE id='30000000-1024-4000-8000-000000000001';
DO $$ BEGIN PERFORM public.add_record_to_crate('30000000-1024-4000-8000-000000000001','10000000-1024-4000-8000-000000000001'); END $$;
SELECT ok((SELECT updated_at FROM public.crates WHERE id='30000000-1024-4000-8000-000000000001')>(SELECT updated_at FROM first_crate_version),'membership advances the crate token in the same transaction');
WITH written AS (
	UPDATE public.crates SET name='Stale crate editor' WHERE id='30000000-1024-4000-8000-000000000001' AND updated_at=(SELECT updated_at FROM first_crate_version) RETURNING id
) SELECT is(count(*),0::BIGINT,'stale metadata cannot overwrite a crate after membership changed') FROM written;
SELECT is((SELECT name FROM public.crates WHERE id='30000000-1024-4000-8000-000000000001'),'First crate editor','rejected crate edit preserves its latest name');
SELECT is((SELECT records FROM public.crates WHERE id='30000000-1024-4000-8000-000000000001'),ARRAY['10000000-1024-4000-8000-000000000001'::UUID],'rejected crate edit preserves membership');
SELECT set_config('request.jwt.claim.sub','00000000-1024-4000-8000-000000000002',true);
WITH written AS (
	UPDATE public.records SET title='Other owner' WHERE id='10000000-1024-4000-8000-000000000001' RETURNING id
) SELECT is(count(*),0::BIGINT,'record version support preserves ownership enforcement') FROM written;
WITH written AS (
	UPDATE public.crates SET name='Other owner' WHERE id='30000000-1024-4000-8000-000000000001' RETURNING id
) SELECT is(count(*),0::BIGINT,'crate version support preserves ownership enforcement') FROM written;

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
