BEGIN;

SELECT plan(19);

SELECT ok(
	NOT has_function_privilege('anon', 'public.delete_all_user_data()', 'EXECUTE'),
	'anon cannot execute delete_all_user_data'
);
SELECT ok(
	NOT has_function_privilege('anon', 'public.disconnect_discogs()', 'EXECUTE'),
	'anon cannot execute disconnect_discogs'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.import_record_with_tracks(jsonb, jsonb)',
		'EXECUTE'
	),
	'anon cannot execute import_record_with_tracks'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.remove_record_from_collection(uuid)',
		'EXECUTE'
	),
	'anon cannot execute remove_record_from_collection'
);

SELECT ok(
	has_function_privilege(
		'authenticated',
		'public.delete_all_user_data()',
		'EXECUTE'
	),
	'authenticated can execute delete_all_user_data'
);
SELECT ok(
	has_function_privilege(
		'authenticated',
		'public.disconnect_discogs()',
		'EXECUTE'
	),
	'authenticated can execute disconnect_discogs'
);
SELECT ok(
	has_function_privilege(
		'authenticated',
		'public.import_record_with_tracks(jsonb, jsonb)',
		'EXECUTE'
	),
	'authenticated can execute import_record_with_tracks'
);
SELECT ok(
	has_function_privilege(
		'authenticated',
		'public.remove_record_from_collection(uuid)',
		'EXECUTE'
	),
	'authenticated can execute remove_record_from_collection'
);

SELECT ok(
	NOT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
	'anon cannot execute handle_new_user directly'
);
SELECT ok(
	NOT has_function_privilege(
		'authenticated',
		'public.handle_new_user()',
		'EXECUTE'
	),
	'authenticated cannot execute handle_new_user directly'
);
SELECT ok(
	NOT has_function_privilege(
		'service_role',
		'public.handle_new_user()',
		'EXECUTE'
	),
	'service_role cannot execute handle_new_user directly'
);

SELECT ok(
	COALESCE(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.update_updated_at_column()'::REGPROCEDURE
		),
		FALSE
	),
	'update_updated_at_column has a pinned search path'
);
SELECT ok(
	COALESCE(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.validate_played_tracks()'::REGPROCEDURE
		),
		FALSE
	),
	'validate_played_tracks has a pinned search path'
);
SELECT ok(
	COALESCE(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.validate_artists()'::REGPROCEDURE
		),
		FALSE
	),
	'validate_artists has a pinned search path'
);
SELECT ok(
	COALESCE(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.validate_labels()'::REGPROCEDURE
		),
		FALSE
	),
	'validate_labels has a pinned search path'
);
SELECT ok(
	COALESCE(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.validate_track_artists()'::REGPROCEDURE
		),
		FALSE
	),
	'validate_track_artists has a pinned search path'
);
SELECT ok(
	COALESCE(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.validate_track_extraartists()'::REGPROCEDURE
		),
		FALSE
	),
	'validate_track_extraartists has a pinned search path'
);
SELECT ok(
	COALESCE(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.validate_genres()'::REGPROCEDURE
		),
		FALSE
	),
	'validate_genres has a pinned search path'
);

SELECT ok(
	has_function_privilege(
		'postgres',
		'public.handle_new_user()',
		'EXECUTE'
	),
	'function owner retains handle_new_user execution'
);

SELECT * FROM finish();

ROLLBACK;
