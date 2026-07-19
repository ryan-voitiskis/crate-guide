BEGIN;

SELECT plan(58);

SELECT has_column(
	'public',
	'tracks',
	'user_id',
	'tracks have a direct owner column'
);
SELECT col_type_is(
	'public',
	'tracks',
	'user_id',
	'uuid',
	'track owners use UUIDs'
);
SELECT col_not_null(
	'public',
	'tracks',
	'user_id',
	'track owners are required'
);
SELECT is(
	(
		SELECT pg_get_expr(default_value.adbin, default_value.adrelid)
		FROM pg_attribute AS attribute
		INNER JOIN pg_attrdef AS default_value
			ON default_value.adrelid = attribute.attrelid
			AND default_value.adnum = attribute.attnum
		WHERE attribute.attrelid = 'public.tracks'::REGCLASS
			AND attribute.attname = 'user_id'
	),
	'auth.uid()',
	'track owners default to the authenticated user'
);

SELECT is(
	(
		SELECT pg_get_constraintdef(oid)
		FROM pg_constraint
		WHERE conrelid = 'public.records'::REGCLASS
			AND conname = 'records_user_id_id_key'
	),
	'UNIQUE (user_id, id)',
	'records expose a stable owner and id unique key'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_constraint
		WHERE conrelid = 'public.tracks'::REGCLASS
			AND confrelid = 'public.records'::REGCLASS
			AND contype = 'f'
	),
	1::BIGINT,
	'exactly one tracks-to-records foreign key remains'
);
SELECT is(
	(
		SELECT pg_get_constraintdef(oid)
		FROM pg_constraint
		WHERE conrelid = 'public.tracks'::REGCLASS
			AND conname = 'tracks_user_id_record_id_fkey'
	),
	'FOREIGN KEY (user_id, record_id) REFERENCES records(user_id, id) ON UPDATE RESTRICT ON DELETE CASCADE',
	'tracks reference records through the matching owner with restricted updates and cascading deletes'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_constraint
		WHERE conrelid = 'public.tracks'::REGCLASS
			AND conname = 'tracks_record_id_fkey'
	),
	0::BIGINT,
	'the former single-column foreign key is gone'
);

SELECT is(
	(
		SELECT count(*)
		FROM pg_policy
		WHERE polrelid = 'public.tracks'::REGCLASS
	),
	1::BIGINT,
	'tracks have exactly one RLS policy'
);
SELECT is(
	(
		SELECT polname
		FROM pg_policy
		WHERE polrelid = 'public.tracks'::REGCLASS
	),
	'users_crud_own_tracks_policy',
	'tracks use the direct-owner policy'
);
SELECT is(
	(
		SELECT regexp_replace(
			pg_get_expr(polqual, polrelid),
			'\\s+',
			' ',
			'g'
		)
		FROM pg_policy
		WHERE polrelid = 'public.tracks'::REGCLASS
	),
	'(( SELECT auth.uid() AS uid) = user_id)',
	'the track USING expression compares auth.uid directly to user_id'
);
SELECT is(
	(
		SELECT regexp_replace(
			pg_get_expr(polwithcheck, polrelid),
			'\\s+',
			' ',
			'g'
		)
		FROM pg_policy
		WHERE polrelid = 'public.tracks'::REGCLASS
	),
	'(( SELECT auth.uid() AS uid) = user_id)',
	'the track WITH CHECK expression matches its direct-owner USING expression'
);
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM pg_policy
		WHERE polrelid = 'public.tracks'::REGCLASS
			AND (
				pg_get_expr(polqual, polrelid) ILIKE '%records%'
				OR pg_get_expr(polwithcheck, polrelid) ILIKE '%records%'
			)
	),
	'track RLS contains no parent-table lookup'
);

SELECT ok(
	to_regprocedure('public.prevent_library_key_update()') IS NOT NULL,
	'the library-key immutability function exists'
);
SELECT is(
	(
		SELECT pronargs
		FROM pg_proc
		WHERE oid = 'public.prevent_library_key_update()'::REGPROCEDURE
	),
	0::SMALLINT,
	'the library-key function accepts no arguments'
);
SELECT ok(
	coalesce(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.prevent_library_key_update()'::REGPROCEDURE
		),
		false
	),
	'the library-key function pins its search path'
);
SELECT ok(
	NOT (
		SELECT prosecdef
		FROM pg_proc
		WHERE oid = 'public.prevent_library_key_update()'::REGPROCEDURE
	),
	'the library-key function uses invoker security'
);
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM pg_proc
		CROSS JOIN LATERAL aclexplode(
			coalesce(proacl, acldefault('f', proowner))
		) AS privilege
		WHERE oid = 'public.prevent_library_key_update()'::REGPROCEDURE
			AND privilege.grantee = 0
			AND privilege.privilege_type = 'EXECUTE'
	)
	AND NOT has_function_privilege(
		'anon',
		'public.prevent_library_key_update()',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.prevent_library_key_update()',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'service_role',
		'public.prevent_library_key_update()',
		'EXECUTE'
	),
	'no application role can execute the trigger function directly'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_trigger
		WHERE tgfoid = 'public.prevent_library_key_update()'::REGPROCEDURE
			AND NOT tgisinternal
	),
	4::BIGINT,
	'exactly four library-key triggers exist'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_trigger AS trigger
		INNER JOIN (
			VALUES
				('public.records'::REGCLASS, 'records_prevent_key_update_trigger'),
				('public.tracks'::REGCLASS, 'tracks_prevent_key_update_trigger'),
				('public.crates'::REGCLASS, 'crates_prevent_key_update_trigger'),
				('public.sets'::REGCLASS, 'sets_prevent_key_update_trigger')
		) AS expected(table_oid, trigger_name)
			ON expected.table_oid = trigger.tgrelid
			AND expected.trigger_name = trigger.tgname
		WHERE NOT trigger.tgisinternal
			AND trigger.tgfoid = 'public.prevent_library_key_update()'::REGPROCEDURE
			AND trigger.tgenabled = 'O'
	),
	4::BIGINT,
	'all expected library-key triggers use the shared enabled function'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_trigger
		WHERE tgrelid IN (
			'public.records'::REGCLASS,
			'public.crates'::REGCLASS,
			'public.sets'::REGCLASS
		)
			AND tgfoid = 'public.prevent_library_key_update()'::REGPROCEDURE
			AND NOT tgisinternal
			AND tgtype = 19
			AND tgattr::TEXT = '1'
	),
	3::BIGINT,
	'record, crate, and set triggers run before row-level updates of id only'
);
SELECT ok(
	(
		SELECT pg_get_triggerdef(oid)
		FROM pg_trigger
		WHERE tgrelid = 'public.tracks'::REGCLASS
			AND tgname = 'tracks_prevent_key_update_trigger'
	) LIKE '%BEFORE UPDATE OF id, user_id ON public.tracks%FOR EACH ROW EXECUTE FUNCTION prevent_library_key_update()%',
	'the track trigger covers id and user_id updates'
);
SELECT is(
	(
		SELECT count(*)
		FROM pg_trigger
		WHERE tgname = 'tracks_update_updated_at_trigger'
			AND tgrelid = 'public.tracks'::REGCLASS
			AND tgenabled = 'O'
	),
	1::BIGINT,
	'the track timestamp trigger remains enabled after migration'
);

SELECT is(
	pg_get_indexdef('public.records_user_id_id_key'::REGCLASS),
	'CREATE UNIQUE INDEX records_user_id_id_key ON public.records USING btree (user_id, id)',
	'the records unique constraint supplies its owner cursor index'
);
SELECT is(
	pg_get_indexdef('public.tracks_user_id_id_desc_idx'::REGCLASS),
	'CREATE INDEX tracks_user_id_id_desc_idx ON public.tracks USING btree (user_id, id DESC)',
	'tracks have the direct-owner descending cursor index'
);
SELECT is(
	pg_get_indexdef('public.crates_user_id_id_desc_idx'::REGCLASS),
	'CREATE INDEX crates_user_id_id_desc_idx ON public.crates USING btree (user_id, id DESC)',
	'crates have the descending owner cursor index'
);
SELECT is(
	pg_get_indexdef('public.sets_user_id_id_desc_idx'::REGCLASS),
	'CREATE INDEX sets_user_id_id_desc_idx ON public.sets USING btree (user_id, id DESC)',
	'sets have the descending owner cursor index'
);
SELECT ok(
	to_regclass('public.idx_tracks_record_id') IS NOT NULL,
	'the record lookup index on tracks remains available'
);
SELECT ok(
	to_regclass('public.tracks_record_id_id_desc_idx') IS NULL,
	'the rejected record-and-id cursor index is absent'
);
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM pg_index
		WHERE indexrelid IN (
			'public.records_user_id_id_key'::REGCLASS,
			'public.tracks_user_id_id_desc_idx'::REGCLASS,
			'public.crates_user_id_id_desc_idx'::REGCLASS,
			'public.sets_user_id_id_desc_idx'::REGCLASS
		)
			AND (
				NOT indisvalid
				OR NOT indisready
				OR indpred IS NOT NULL
			)
	),
	'all cursor indexes are ready, valid, and non-partial'
);

SELECT ok(
	has_table_privilege('authenticated', 'public.records', 'SELECT,INSERT,UPDATE,DELETE')
	AND has_table_privilege('authenticated', 'public.tracks', 'SELECT,INSERT,UPDATE,DELETE')
	AND has_table_privilege('authenticated', 'public.crates', 'SELECT,INSERT,UPDATE,DELETE')
	AND has_table_privilege('authenticated', 'public.sets', 'SELECT,INSERT,UPDATE,DELETE')
	AND NOT has_table_privilege('authenticated', 'public.records', 'TRUNCATE,REFERENCES,TRIGGER')
	AND NOT has_table_privilege('authenticated', 'public.tracks', 'TRUNCATE,REFERENCES,TRIGGER')
	AND NOT has_table_privilege('authenticated', 'public.crates', 'TRUNCATE,REFERENCES,TRIGGER')
	AND NOT has_table_privilege('authenticated', 'public.sets', 'TRUNCATE,REFERENCES,TRIGGER'),
	'authenticated CRUD grants remain intact'
);
SELECT ok(
	NOT has_table_privilege('anon', 'public.records', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
	AND NOT has_table_privilege('anon', 'public.tracks', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
	AND NOT has_table_privilege('anon', 'public.crates', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
	AND NOT has_table_privilege('anon', 'public.sets', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
	'anonymous library access remains revoked'
);

INSERT INTO auth.users (id)
VALUES
	('00000000-0000-0000-0000-000000000501'),
	('00000000-0000-0000-0000-000000000502'),
	('00000000-0000-0000-0000-000000000503');

INSERT INTO public.records (id, user_id, title, artists, labels)
VALUES
	(
		'00000000-0000-0000-0000-000000000511',
		'00000000-0000-0000-0000-000000000501',
		'Owner record one',
		'[]'::JSONB,
		'[]'::JSONB
	),
	(
		'00000000-0000-0000-0000-000000000512',
		'00000000-0000-0000-0000-000000000501',
		'Owner record two',
		'[]'::JSONB,
		'[]'::JSONB
	),
	(
		'00000000-0000-0000-0000-000000000513',
		'00000000-0000-0000-0000-000000000502',
		'Other record',
		'[]'::JSONB,
		'[]'::JSONB
	),
	(
		'00000000-0000-0000-0000-000000000514',
		'00000000-0000-0000-0000-000000000501',
		'Delete record',
		'[]'::JSONB,
		'[]'::JSONB
	),
	(
		'00000000-0000-0000-0000-000000000515',
		'00000000-0000-0000-0000-000000000503',
		'Cascade user record',
		'[]'::JSONB,
		'[]'::JSONB
	);

INSERT INTO public.tracks (id, user_id, record_id, title, updated_at)
VALUES
	(
		'00000000-0000-0000-0000-000000000521',
		'00000000-0000-0000-0000-000000000501',
		'00000000-0000-0000-0000-000000000511',
		'Owner track',
		'2026-01-01 00:00:00+00'
	),
	(
		'00000000-0000-0000-0000-000000000522',
		'00000000-0000-0000-0000-000000000502',
		'00000000-0000-0000-0000-000000000513',
		'Other track',
		'2026-01-01 00:00:00+00'
	),
	(
		'00000000-0000-0000-0000-000000000523',
		'00000000-0000-0000-0000-000000000501',
		'00000000-0000-0000-0000-000000000514',
		'Delete track',
		'2026-01-01 00:00:00+00'
	),
	(
		'00000000-0000-0000-0000-000000000524',
		'00000000-0000-0000-0000-000000000503',
		'00000000-0000-0000-0000-000000000515',
		'Cascade user track',
		'2026-01-01 00:00:00+00'
	);

INSERT INTO public.crates (id, user_id, name)
VALUES (
	'00000000-0000-0000-0000-000000000531',
	'00000000-0000-0000-0000-000000000501',
	'Owner crate'
);
INSERT INTO public.sets (id, user_id, name)
VALUES (
	'00000000-0000-0000-0000-000000000541',
	'00000000-0000-0000-0000-000000000501',
	'Owner set'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000501',
	true
);

SELECT lives_ok(
	$$
		INSERT INTO public.tracks (id, record_id, title)
		VALUES (
			'00000000-0000-0000-0000-000000000525',
			'00000000-0000-0000-0000-000000000511',
			'Default-owner track'
		)
	$$,
	'authenticated inserts may omit track user_id'
);
SELECT is(
	(
		SELECT user_id
		FROM public.tracks
		WHERE id = '00000000-0000-0000-0000-000000000525'
	),
	'00000000-0000-0000-0000-000000000501'::UUID,
	'the omitted track owner resolves to auth.uid'
);
SELECT throws_ok(
	$$
		INSERT INTO public.tracks (id, user_id, record_id, title)
		VALUES (
			'00000000-0000-0000-0000-000000000526',
			'00000000-0000-0000-0000-000000000502',
			'00000000-0000-0000-0000-000000000513',
			'Forged-owner track'
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "tracks"',
	'RLS rejects an explicitly forged track owner'
);
SELECT throws_ok(
	$$
		INSERT INTO public.tracks (id, record_id, title)
		VALUES (
			'00000000-0000-0000-0000-000000000527',
			'00000000-0000-0000-0000-000000000513',
			'Cross-owner default track'
		)
	$$,
	'23503',
	NULL,
	'the composite foreign key rejects a default owner paired with another user record'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.tracks
		WHERE user_id = '00000000-0000-0000-0000-000000000502'
	),
	0::BIGINT,
	'direct track RLS hides another owner rows'
);

SELECT lives_ok(
	$$
		SELECT public.import_record_with_tracks(
			jsonb_build_object(
				'user_id', '00000000-0000-0000-0000-000000000501',
				'discogs_id', 36001,
				'discogs_release_url', 'https://www.discogs.com/release/36001',
				'title', 'Imported owner record',
				'artists', '[]'::JSONB,
				'labels', '[]'::JSONB
			),
			'[{"title":"Imported owner track","artists":[],"extraartists":[],"genres":[]}]'::JSONB
		)
	$$,
	'the existing authenticated import RPC still inserts tracks without a supplied owner'
);
SELECT is(
	(
		SELECT track.user_id
		FROM public.tracks AS track
		INNER JOIN public.records AS record ON record.id = track.record_id
		WHERE record.discogs_id = 36001
	),
	'00000000-0000-0000-0000-000000000501'::UUID,
	'imported tracks receive their owner from the column default'
);

SELECT lives_ok(
	$$
		UPDATE public.tracks
		SET record_id = '00000000-0000-0000-0000-000000000512'
		WHERE id = '00000000-0000-0000-0000-000000000521'
	$$,
	'an owner may move a track between their own records'
);
SELECT is(
	(
		SELECT record_id
		FROM public.tracks
		WHERE id = '00000000-0000-0000-0000-000000000521'
	),
	'00000000-0000-0000-0000-000000000512'::UUID,
	'the same-owner record move persists'
);
SELECT throws_ok(
	$$
		UPDATE public.tracks
		SET record_id = '00000000-0000-0000-0000-000000000513'
		WHERE id = '00000000-0000-0000-0000-000000000521'
	$$,
	'23503',
	NULL,
	'the composite foreign key rejects a cross-owner record move'
);
SELECT is(
	(
		SELECT record_id
		FROM public.tracks
		WHERE id = '00000000-0000-0000-0000-000000000521'
	),
	'00000000-0000-0000-0000-000000000512'::UUID,
	'a rejected cross-owner move leaves the track unchanged'
);
SELECT lives_ok(
	$$
		UPDATE public.tracks
		SET title = 'Updated owner track'
		WHERE id = '00000000-0000-0000-0000-000000000521'
	$$,
	'ordinary track metadata remains mutable'
);
SELECT is(
	(
		SELECT title
		FROM public.tracks
		WHERE id = '00000000-0000-0000-0000-000000000521'
	),
	'Updated owner track',
	'track metadata updates persist'
);

SELECT throws_ok(
	$$
		UPDATE public.records
		SET id = '00000000-0000-0000-0000-000000000591'
		WHERE id = '00000000-0000-0000-0000-000000000511'
	$$,
	'23514',
	'Library row key is immutable.',
	'record IDs are immutable with a generic error'
);
SELECT throws_ok(
	$$
		UPDATE public.tracks
		SET id = '00000000-0000-0000-0000-000000000592'
		WHERE id = '00000000-0000-0000-0000-000000000521'
	$$,
	'23514',
	'Library row key is immutable.',
	'track IDs are immutable with the same generic error'
);
SELECT throws_ok(
	$$
		UPDATE public.tracks
		SET user_id = '00000000-0000-0000-0000-000000000502'
		WHERE id = '00000000-0000-0000-0000-000000000521'
	$$,
	'23514',
	'Library row key is immutable.',
	'track owners are immutable with the same generic error'
);
SELECT throws_ok(
	$$
		UPDATE public.crates
		SET id = '00000000-0000-0000-0000-000000000593'
		WHERE id = '00000000-0000-0000-0000-000000000531'
	$$,
	'23514',
	'Library row key is immutable.',
	'crate IDs are immutable with the same generic error'
);
SELECT throws_ok(
	$$
		UPDATE public.sets
		SET id = '00000000-0000-0000-0000-000000000594'
		WHERE id = '00000000-0000-0000-0000-000000000541'
	$$,
	'23514',
	'Library row key is immutable.',
	'set IDs are immutable with the same generic error'
);

SELECT lives_ok(
	$$
		DELETE FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000514'
	$$,
	'owners may still delete their records'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.tracks
		WHERE id = '00000000-0000-0000-0000-000000000523'
	),
	0::BIGINT,
	'record deletion still cascades to owned tracks'
);

RESET ROLE;

SELECT throws_ok(
	$$
		UPDATE public.records
		SET user_id = '00000000-0000-0000-0000-000000000502'
		WHERE id = '00000000-0000-0000-0000-000000000512'
	$$,
	'23503',
	NULL,
	'a parent owner change is restricted while tracks reference it'
);
SELECT is(
	(
		SELECT user_id
		FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000512'
	),
	'00000000-0000-0000-0000-000000000501'::UUID,
	'a rejected parent owner change leaves the record owner unchanged'
);
SELECT is(
	(
		SELECT user_id
		FROM public.tracks
		WHERE id = '00000000-0000-0000-0000-000000000521'
	),
	'00000000-0000-0000-0000-000000000501'::UUID,
	'a rejected parent owner change leaves the track owner unchanged'
);
SELECT lives_ok(
	$$
		DELETE FROM auth.users
		WHERE id = '00000000-0000-0000-0000-000000000503'
	$$,
	'auth-user deletion remains valid with composite ownership'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.records
		WHERE id = '00000000-0000-0000-0000-000000000515'
	),
	0::BIGINT,
	'auth-user deletion still cascades to records'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.tracks
		WHERE id = '00000000-0000-0000-0000-000000000524'
	),
	0::BIGINT,
	'auth-user deletion still cascades through records to tracks'
);

SELECT * FROM finish();
ROLLBACK;
