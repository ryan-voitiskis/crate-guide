BEGIN;

SELECT plan(45);

SELECT ok(
	to_regprocedure('public.read_library_snapshot()') IS NOT NULL,
	'the coherent library snapshot RPC exists'
);
SELECT is(
	(
		SELECT pronargs
		FROM pg_proc
		WHERE oid = 'public.read_library_snapshot()'::REGPROCEDURE
	),
	0::SMALLINT,
	'the snapshot RPC accepts no caller-owned input'
);
SELECT is(
	pg_get_function_identity_arguments(
		'public.read_library_snapshot()'::REGPROCEDURE
	),
	'',
	'the snapshot RPC has an empty identity argument list'
);
SELECT is(
	pg_get_function_result('public.read_library_snapshot()'::REGPROCEDURE),
	'jsonb',
	'the snapshot RPC returns one JSONB contract'
);
SELECT is(
	(
		SELECT language.lanname
		FROM pg_proc AS function
		INNER JOIN pg_language AS language ON language.oid = function.prolang
		WHERE function.oid = 'public.read_library_snapshot()'::REGPROCEDURE
	),
	'sql',
	'the snapshot RPC is one SQL function'
);
SELECT is(
	(
		SELECT provolatile
		FROM pg_proc
		WHERE oid = 'public.read_library_snapshot()'::REGPROCEDURE
	),
	's',
	'the snapshot RPC is stable for one statement snapshot'
);
SELECT ok(
	NOT (
		SELECT prosecdef
		FROM pg_proc
		WHERE oid = 'public.read_library_snapshot()'::REGPROCEDURE
	),
	'the snapshot RPC uses invoker security and RLS'
);
SELECT ok(
	COALESCE((
		SELECT proconfig @> ARRAY['search_path=pg_catalog']
		FROM pg_proc
		WHERE oid = 'public.read_library_snapshot()'::REGPROCEDURE
	), FALSE),
	'the snapshot RPC pins search_path to pg_catalog'
);
SELECT ok(
	COALESCE((
		SELECT lower(array_to_string(proconfig, ',')) LIKE '%timezone=utc%'
		FROM pg_proc
		WHERE oid = 'public.read_library_snapshot()'::REGPROCEDURE
	), FALSE),
	'the snapshot RPC renders timestamps in a deterministic UTC timezone'
);
SELECT ok(
	has_function_privilege(
		'authenticated',
		'public.read_library_snapshot()',
		'EXECUTE'
	),
	'authenticated callers can execute the snapshot RPC'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.read_library_snapshot()',
		'EXECUTE'
	),
	'anonymous callers cannot execute the snapshot RPC'
);
SELECT ok(
	NOT has_function_privilege(
		'service_role',
		'public.read_library_snapshot()',
		'EXECUTE'
	),
	'the service role is not part of the snapshot RPC allowlist'
);
SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM pg_proc
		CROSS JOIN LATERAL aclexplode(
			COALESCE(proacl, acldefault('f', proowner))
		) AS privilege
		WHERE oid = 'public.read_library_snapshot()'::REGPROCEDURE
			AND privilege.grantee = 0
			AND privilege.privilege_type = 'EXECUTE'
	),
	'PUBLIC has no snapshot RPC execution grant'
);
SELECT ok(
	position(
		'auth.uid()' IN pg_get_functiondef(
			'public.read_library_snapshot()'::REGPROCEDURE
		)
	) > 0,
	'the snapshot RPC derives ownership from auth.uid()'
);
SELECT ok(
	(
		SELECT bool_and(position(table_name IN prosrc) > 0)
		FROM pg_proc
		CROSS JOIN unnest(ARRAY[
			'public.profiles',
			'public.records',
			'public.tracks',
			'public.crates',
			'public.sets'
		]) AS expected(table_name)
		WHERE oid = 'public.read_library_snapshot()'::REGPROCEDURE
	),
	'the one statement reads every durable library section'
);
SELECT ok(
	(
		SELECT prosrc ~* '^[[:space:]]*WITH caller'
			AND regexp_count(prosrc, ';') = 1
		FROM pg_proc
		WHERE oid = 'public.read_library_snapshot()'::REGPROCEDURE
	),
	'the RPC result is produced by one CTE-backed SQL statement'
);
SELECT ok(
	COALESCE(
		obj_description(
			'public.read_library_snapshot()'::REGPROCEDURE,
			'pg_proc'
		) ILIKE '%cover_storage_path%operational%not portable archive%',
		FALSE
	),
	'the operational managed-cover path is explicitly outside the portable archive contract'
);

SET LOCAL ROLE anon;
SELECT throws_like(
	$$ SELECT public.read_library_snapshot() $$,
	'%permission denied for function read_library_snapshot%',
	'anonymous execution is denied in practice'
);
RESET ROLE;

INSERT INTO auth.users (id)
VALUES
	('00000000-0000-4000-8000-0000000000a1'),
	('00000000-0000-4000-8000-0000000000b1'),
	('00000000-0000-4000-8000-0000000000c1'),
	('00000000-0000-4000-8000-0000000000d1');

UPDATE public.profiles
SET
	name = 'PRIVATE PROFILE NAME',
	ui_theme = 'dark',
	turntable_theme = 'silver',
	turntable_pitch_range = 16,
	selected_crate = '30000000-0000-4000-8000-000000000001',
	key_format = 'camelot',
	list_layout = 'record',
	discogs_username = 'PRIVATE_DISCOGS_USERNAME',
	discogs_avatar_url = 'https://private.invalid/avatar.png',
	discogs_uid = 'PRIVATE_DISCOGS_UID',
	just_completed_discogs_oauth = TRUE
WHERE id = '00000000-0000-4000-8000-0000000000a1';

UPDATE public.profiles
SET
	name = 'OTHER PRIVATE PROFILE',
	discogs_username = 'OTHER_PRIVATE_DISCOGS_USERNAME'
WHERE id = '00000000-0000-4000-8000-0000000000b1';

INSERT INTO public.discogs_credentials (
	user_id,
	request_token,
	request_secret,
	access_token,
	access_secret
)
VALUES (
	'00000000-0000-4000-8000-0000000000a1',
	'PRIVATE_REQUEST_TOKEN',
	'PRIVATE_REQUEST_SECRET',
	'PRIVATE_ACCESS_TOKEN',
	'PRIVATE_ACCESS_SECRET'
);

INSERT INTO public.records (
	id,
	user_id,
	discogs_id,
	discogs_release_url,
	title,
	artists,
	labels,
	year,
	cover,
	cover_storage_path,
	created_at,
	updated_at
)
VALUES
	(
		'10000000-0000-4000-8000-000000000002',
		'00000000-0000-4000-8000-0000000000a1',
		1002,
		'https://www.discogs.com/release/1002',
		'Owner A record two',
		'[{"discogs_id":102,"name":"Artist A","role":null}]'::JSONB,
		'[{"discogs_id":202,"name":"Label A","catno":"A-2"}]'::JSONB,
		2026,
		'https://images.invalid/a-two.jpg',
		NULL,
		'2026-07-22 12:00:02+00',
		'2026-07-22 12:30:02+00'
	),
	(
		'10000000-0000-4000-8000-000000000001',
		'00000000-0000-4000-8000-0000000000a1',
		1001,
		'https://www.discogs.com/release/1001',
		'Owner A record one',
		'[{"discogs_id":101,"name":"Artist A","role":null}]'::JSONB,
		'[{"discogs_id":201,"name":"Label A","catno":"A-1"}]'::JSONB,
		2025,
		'https://images.invalid/a-one.jpg',
		'00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001.webp',
		'2026-07-22 12:00:01+00',
		'2026-07-22 12:30:01+00'
	),
	(
		'10000000-0000-4000-8000-000000000003',
		'00000000-0000-4000-8000-0000000000b1',
		2001,
		'https://www.discogs.com/release/2001',
		'PRIVATE OTHER OWNER RECORD',
		'[]'::JSONB,
		'[]'::JSONB,
		2024,
		NULL,
		NULL,
		'2026-07-22 12:00:03+00',
		'2026-07-22 12:30:03+00'
	),
	(
		'10000000-0000-4000-8000-000000000004',
		'00000000-0000-4000-8000-0000000000d1',
		NULL,
		NULL,
		'Missing-profile owner record',
		'[]'::JSONB,
		'[]'::JSONB,
		NULL,
		NULL,
		NULL,
		'2026-07-22 12:00:04+00',
		'2026-07-22 12:30:04+00'
	);

INSERT INTO public.tracks (
	id,
	user_id,
	record_id,
	title,
	artists,
	extraartists,
	position,
	duration,
	bpm,
	rpm,
	key,
	mode,
	genres,
	time_signature_upper,
	time_signature_lower,
	playable,
	beatport_data,
	audio_features,
	created_at,
	updated_at
)
VALUES
	(
		'20000000-0000-4000-8000-000000000002',
		'00000000-0000-4000-8000-0000000000a1',
		'10000000-0000-4000-8000-000000000002',
		'Owner A track two',
		'[]'::JSONB,
		'[]'::JSONB,
		'B1',
		240,
		129.0,
		45,
		6,
		1,
		'["House"]'::JSONB,
		4,
		4,
		TRUE,
		NULL,
		NULL,
		'2026-07-22 13:00:02+00',
		'2026-07-22 13:30:02+00'
	),
	(
		'20000000-0000-4000-8000-000000000001',
		'00000000-0000-4000-8000-0000000000a1',
		'10000000-0000-4000-8000-000000000001',
		'Owner A track one',
		'[{"discogs_id":101,"name":"Artist A","role":null}]'::JSONB,
		'[{"discogs_id":301,"name":"Remixer A","role":"Remix"}]'::JSONB,
		'A1',
		360,
		128.0,
		33,
		5,
		0,
		'["Techno"]'::JSONB,
		4,
		4,
		TRUE,
		'{"accessed":1,"url":"https://beatport.invalid/track","genre":"Techno","bpm":128,"key":"F Minor","img":"https://images.invalid/track.jpg"}'::JSONB,
		'{"version":1,"updatedAt":"2026-07-22T13:00:00.000Z","applied":{"bpm":null,"keyMode":null},"match":{"confidence":"manual","score":0,"reasons":[],"warnings":[]},"sources":{}}'::JSONB,
		'2026-07-22 13:00:01+00',
		'2026-07-22 13:30:01+00'
	),
	(
		'20000000-0000-4000-8000-000000000003',
		'00000000-0000-4000-8000-0000000000b1',
		'10000000-0000-4000-8000-000000000003',
		'PRIVATE OTHER OWNER TRACK',
		'[]'::JSONB,
		'[]'::JSONB,
		'A1',
		180,
		120.0,
		33,
		0,
		0,
		'[]'::JSONB,
		4,
		4,
		TRUE,
		NULL,
		NULL,
		'2026-07-22 13:00:03+00',
		'2026-07-22 13:30:03+00'
	);

INSERT INTO public.crates (
	id,
	user_id,
	name,
	description,
	color,
	records,
	created_at,
	updated_at
)
VALUES
	(
		'30000000-0000-4000-8000-000000000002',
		'00000000-0000-4000-8000-0000000000a1',
		'Owner A crate two',
		'Second crate',
		'blue',
		ARRAY['10000000-0000-4000-8000-000000000002']::UUID[],
		'2026-07-22 14:00:02+00',
		'2026-07-22 14:30:02+00'
	),
	(
		'30000000-0000-4000-8000-000000000001',
		'00000000-0000-4000-8000-0000000000a1',
		'Owner A crate one',
		'First crate',
		'red',
		ARRAY[
			'10000000-0000-4000-8000-000000000001',
			'10000000-0000-4000-8000-000000000002'
		]::UUID[],
		'2026-07-22 14:00:01+00',
		'2026-07-22 14:30:01+00'
	),
	(
		'30000000-0000-4000-8000-000000000003',
		'00000000-0000-4000-8000-0000000000b1',
		'PRIVATE OTHER OWNER CRATE',
		NULL,
		NULL,
		ARRAY['10000000-0000-4000-8000-000000000003']::UUID[],
		'2026-07-22 14:00:03+00',
		'2026-07-22 14:30:03+00'
	);

INSERT INTO public.sets (
	id,
	user_id,
	name,
	played_tracks,
	created_at,
	updated_at
)
VALUES
	(
		'40000000-0000-4000-8000-000000000002',
		'00000000-0000-4000-8000-0000000000a1',
		'Owner A set two',
		'[{"track_id":"20000000-0000-4000-8000-000000000002","time_added":20,"adjusted_bpm":129,"transition_rating":5,"track_title":"Owner A track two","artist_display":"Artist A"}]'::JSONB,
		'2026-07-22 15:00:02+00',
		'2026-07-22 15:30:02+00'
	),
	(
		'40000000-0000-4000-8000-000000000001',
		'00000000-0000-4000-8000-0000000000a1',
		'Owner A set one',
		'[{"track_id":"20000000-0000-4000-8000-000000000001","time_added":10,"adjusted_bpm":128,"transition_rating":4,"track_title":"Immutable track snapshot","artist_display":"Immutable artist snapshot"}]'::JSONB,
		'2026-07-22 15:00:01+00',
		'2026-07-22 15:30:01+00'
	),
	(
		'40000000-0000-4000-8000-000000000003',
		'00000000-0000-4000-8000-0000000000b1',
		'PRIVATE OTHER OWNER SET',
		'[{"track_id":"20000000-0000-4000-8000-000000000003","time_added":30,"adjusted_bpm":120,"transition_rating":3}]'::JSONB,
		'2026-07-22 15:00:03+00',
		'2026-07-22 15:30:03+00'
	);

-- Exercise the explicit missing-profile contract without losing owned rows.
DELETE FROM public.profiles
WHERE id = '00000000-0000-4000-8000-0000000000d1';

CREATE TEMP TABLE captured_library_snapshots (
	label TEXT PRIMARY KEY,
	payload JSONB NOT NULL
);
GRANT INSERT, SELECT ON TABLE captured_library_snapshots TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-4000-8000-0000000000a1',
	TRUE
);
SET LOCAL timezone = 'Australia/Melbourne';
INSERT INTO captured_library_snapshots (label, payload)
SELECT 'owner-a-melbourne', public.read_library_snapshot();
SET LOCAL timezone = 'America/Los_Angeles';
INSERT INTO captured_library_snapshots (label, payload)
SELECT 'owner-a-los-angeles', public.read_library_snapshot();

SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-4000-8000-0000000000c1',
	TRUE
);
INSERT INTO captured_library_snapshots (label, payload)
SELECT 'empty-profile', public.read_library_snapshot();

SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-4000-8000-0000000000d1',
	TRUE
);
INSERT INTO captured_library_snapshots (label, payload)
SELECT 'missing-profile', public.read_library_snapshot();
RESET ROLE;

SELECT is(
	(payload->>'contractVersion')::INTEGER,
	1,
	'the RPC exposes explicit contract version 1'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT is(
	(
		SELECT array_agg(key ORDER BY key)
		FROM jsonb_object_keys(payload) AS key
	),
	ARRAY[
		'contractVersion',
		'crates',
		'preferences',
		'records',
		'sets',
		'tracks'
	]::TEXT[],
	'the root contract has only its complete declared sections'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT ok(
	jsonb_typeof(payload->'records') = 'array'
		AND jsonb_typeof(payload->'tracks') = 'array'
		AND jsonb_typeof(payload->'crates') = 'array'
		AND jsonb_typeof(payload->'sets') = 'array',
	'every durable entity section is always an array'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT is(
	(
		SELECT array_agg(key ORDER BY key)
		FROM jsonb_object_keys(payload->'preferences') AS key
	),
	ARRAY[
		'key_format',
		'list_layout',
		'selected_crate',
		'turntable_pitch_range',
		'turntable_theme',
		'ui_theme'
	]::TEXT[],
	'preferences contain exactly the six library-owned fields'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT is(
	payload->'preferences',
	jsonb_build_object(
		'ui_theme', 'dark',
		'key_format', 'camelot',
		'list_layout', 'record',
		'selected_crate', '30000000-0000-4000-8000-000000000001',
		'turntable_pitch_range', 16,
		'turntable_theme', 'silver'
	),
	'library preference values are complete and unchanged'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT ok(
	payload::TEXT NOT LIKE '%"name": "PRIVATE PROFILE NAME"%'
		AND payload::TEXT NOT LIKE '%discogs_username%'
		AND payload::TEXT NOT LIKE '%discogs_avatar_url%'
		AND payload::TEXT NOT LIKE '%discogs_uid%'
		AND payload::TEXT NOT LIKE '%just_completed_discogs_oauth%',
	'profile identity and OAuth-state fields are excluded structurally'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT ok(
	payload::TEXT NOT LIKE '%PRIVATE_REQUEST_TOKEN%'
		AND payload::TEXT NOT LIKE '%PRIVATE_REQUEST_SECRET%'
		AND payload::TEXT NOT LIKE '%PRIVATE_ACCESS_TOKEN%'
		AND payload::TEXT NOT LIKE '%PRIVATE_ACCESS_SECRET%',
	'Discogs credentials never enter the snapshot'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT ok(
	NOT EXISTS (
		SELECT 1
		FROM unnest(ARRAY['records', 'tracks', 'crates', 'sets']) AS section(name)
		CROSS JOIN LATERAL jsonb_array_elements(payload->section.name) AS item
		WHERE item ? 'user_id'
	),
	'transport owner IDs are excluded from every entity DTO'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT is(
	jsonb_array_length(payload->'records'),
	2,
	'the snapshot includes every owned record'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';
SELECT is(
	jsonb_array_length(payload->'tracks'),
	2,
	'the snapshot includes every owned track'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';
SELECT is(
	jsonb_array_length(payload->'crates'),
	2,
	'the snapshot includes every owned crate'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';
SELECT is(
	jsonb_array_length(payload->'sets'),
	2,
	'the snapshot includes every owned saved set'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT ok(
	payload::TEXT NOT LIKE '%PRIVATE OTHER OWNER%'
		AND payload::TEXT NOT LIKE '%00000000-0000-4000-8000-0000000000b1%'
		AND payload::TEXT NOT LIKE '%10000000-0000-4000-8000-000000000003%'
		AND payload::TEXT NOT LIKE '%20000000-0000-4000-8000-000000000003%'
		AND payload::TEXT NOT LIKE '%30000000-0000-4000-8000-000000000003%'
		AND payload::TEXT NOT LIKE '%40000000-0000-4000-8000-000000000003%',
	'cross-user profile and library data are absent'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT is(
	(
		SELECT array_agg(key ORDER BY key)
		FROM jsonb_object_keys(payload->'records'->0) AS key
	),
	ARRAY[
		'artists',
		'cover',
		'cover_storage_path',
		'created_at',
		'discogs_id',
		'discogs_release_url',
		'id',
		'labels',
		'title',
		'updated_at',
		'year'
	]::TEXT[],
	'record DTOs contain every current durable non-owner field'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT is(
	(
		SELECT array_agg(key ORDER BY key)
		FROM jsonb_object_keys(payload->'tracks'->0) AS key
	),
	ARRAY[
		'artists',
		'audio_features',
		'beatport_data',
		'bpm',
		'created_at',
		'duration',
		'extraartists',
		'genres',
		'id',
		'key',
		'mode',
		'playable',
		'position',
		'record_id',
		'rpm',
		'time_signature_lower',
		'time_signature_upper',
		'title',
		'updated_at'
	]::TEXT[],
	'track DTOs contain every current durable non-owner field'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT is(
	(
		SELECT array_agg(key ORDER BY key)
		FROM jsonb_object_keys(payload->'crates'->0) AS key
	),
	ARRAY[
		'color',
		'created_at',
		'description',
		'id',
		'name',
		'records',
		'updated_at'
	]::TEXT[],
	'crate DTOs contain every current durable non-owner field'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT is(
	(
		SELECT array_agg(key ORDER BY key)
		FROM jsonb_object_keys(payload->'sets'->0) AS key
	),
	ARRAY['created_at', 'id', 'name', 'played_tracks', 'updated_at']::TEXT[],
	'saved-set DTOs contain every current durable non-owner field'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT ok(
	payload->'tracks'->0->'audio_features'->>'version' = '1'
		AND payload->'tracks'->0->'beatport_data'->>'genre' = 'Techno',
	'audio Evidence and Beatport data survive the coherent snapshot'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT ok(
	payload->'sets'->0->'played_tracks'->0->>'track_title'
		= 'Immutable track snapshot'
		AND payload->'sets'->0->'played_tracks'->0->>'artist_display'
			= 'Immutable artist snapshot',
	'immutable saved-set title and artist snapshots are retained'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT is(
	payload->'records'->0->>'cover_storage_path',
	'00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001.webp',
	'the internal DTO retains operational managed-cover resolution input'
)
FROM captured_library_snapshots
WHERE label = 'owner-a-melbourne';

SELECT is(
	(
		SELECT payload
		FROM captured_library_snapshots
		WHERE label = 'owner-a-melbourne'
	),
	(
		SELECT payload
		FROM captured_library_snapshots
		WHERE label = 'owner-a-los-angeles'
	),
	'identical rows produce identical snapshots across caller timezones'
);

SELECT is(
	ARRAY(
		SELECT item->>'id'
		FROM captured_library_snapshots
		CROSS JOIN LATERAL jsonb_array_elements(payload->'records') AS item
		WHERE label = 'owner-a-melbourne'
	),
	ARRAY[
		'10000000-0000-4000-8000-000000000001',
		'10000000-0000-4000-8000-000000000002'
	]::TEXT[],
	'records use deterministic UUID ordering'
);

SELECT ok(
	ARRAY(
		SELECT item->>'id'
		FROM captured_library_snapshots
		CROSS JOIN LATERAL jsonb_array_elements(payload->'tracks') AS item
		WHERE label = 'owner-a-melbourne'
	) = ARRAY[
		'20000000-0000-4000-8000-000000000001',
		'20000000-0000-4000-8000-000000000002'
	]::TEXT[]
	AND ARRAY(
		SELECT item->>'id'
		FROM captured_library_snapshots
		CROSS JOIN LATERAL jsonb_array_elements(payload->'crates') AS item
		WHERE label = 'owner-a-melbourne'
	) = ARRAY[
		'30000000-0000-4000-8000-000000000001',
		'30000000-0000-4000-8000-000000000002'
	]::TEXT[]
	AND ARRAY(
		SELECT item->>'id'
		FROM captured_library_snapshots
		CROSS JOIN LATERAL jsonb_array_elements(payload->'sets') AS item
		WHERE label = 'owner-a-melbourne'
	) = ARRAY[
		'40000000-0000-4000-8000-000000000001',
		'40000000-0000-4000-8000-000000000002'
	]::TEXT[],
	'tracks, crates, and sets use deterministic UUID ordering'
);

SELECT ok(
	jsonb_array_length(payload->'records') = 0
		AND jsonb_array_length(payload->'tracks') = 0
		AND jsonb_array_length(payload->'crates') = 0
		AND jsonb_array_length(payload->'sets') = 0,
	'empty libraries retain all four empty sections'
)
FROM captured_library_snapshots
WHERE label = 'empty-profile';

SELECT is(
	payload->'preferences',
	jsonb_build_object(
		'ui_theme', 'auto',
		'key_format', 'key',
		'list_layout', 'track',
		'selected_crate', 'all',
		'turntable_pitch_range', 8,
		'turntable_theme', 'black'
	),
	'an existing default profile returns complete default preferences'
)
FROM captured_library_snapshots
WHERE label = 'empty-profile';

SELECT is(
	payload->'preferences',
	'null'::JSONB,
	'a missing profile is represented explicitly as null preferences'
)
FROM captured_library_snapshots
WHERE label = 'missing-profile';

SELECT is(
	jsonb_array_length(payload->'records'),
	1,
	'a missing profile does not hide otherwise owned durable rows'
)
FROM captured_library_snapshots
WHERE label = 'missing-profile';

SELECT * FROM finish();

ROLLBACK;
