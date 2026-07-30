BEGIN;

SELECT plan(43);

INSERT INTO auth.users (id)
VALUES
	('00000000-0000-4000-8000-000000000011'),
	('00000000-0000-4000-8000-000000000012');

INSERT INTO public.records (id, user_id, title, artists, labels)
VALUES
	(
		'10000000-0000-4000-8000-000000000001',
		'00000000-0000-4000-8000-000000000011',
		'Owner A record',
		'[]'::JSONB,
		'[]'::JSONB
	),
	(
		'10000000-0000-4000-8000-000000000002',
		'00000000-0000-4000-8000-000000000012',
		'Owner B record',
		'[]'::JSONB,
		'[]'::JSONB
	);

INSERT INTO public.tracks (
	id,
	user_id,
	record_id,
	title,
	bpm,
	key,
	mode,
	updated_at
)
VALUES
	(
		'20000000-0000-4000-8000-000000000001',
		'00000000-0000-4000-8000-000000000011',
		'10000000-0000-4000-8000-000000000001',
		'Owner A one',
		NULL,
		NULL,
		NULL,
		'2026-07-22 00:00:00+00'
	),
	(
		'20000000-0000-4000-8000-000000000002',
		'00000000-0000-4000-8000-000000000011',
		'10000000-0000-4000-8000-000000000001',
		'Owner A two',
		NULL,
		NULL,
		NULL,
		'2026-07-22 00:00:00+00'
	),
	(
		'20000000-0000-4000-8000-000000000003',
		'00000000-0000-4000-8000-000000000012',
		'10000000-0000-4000-8000-000000000002',
		'Owner B one',
		NULL,
		NULL,
		NULL,
		'2026-07-22 00:00:00+00'
	),
	(
		'20000000-0000-4000-8000-000000000004',
		'00000000-0000-4000-8000-000000000011',
		'10000000-0000-4000-8000-000000000001',
		'Owner A invalid',
		NULL,
		NULL,
		NULL,
		'2026-07-22 00:00:00+00'
	),
	(
		'20000000-0000-4000-8000-000000000005',
		'00000000-0000-4000-8000-000000000011',
		'10000000-0000-4000-8000-000000000001',
		'Owner A existing BPM',
		100,
		NULL,
		NULL,
		'2026-07-22 00:00:00+00'
	);

CREATE FUNCTION pg_temp.valid_audio_features(
	bpm_applied BOOLEAN DEFAULT FALSE,
	key_mode_applied BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_build_object(
		'version', 1,
		'updatedAt', '2026-07-22T00:00:00.000Z',
		'applied', jsonb_build_object(
			'bpm', CASE WHEN bpm_applied THEN jsonb_build_object(
				'source', 'rekordboxXml',
				'appliedAt', '2026-07-22T00:00:00.000Z'
			) ELSE 'null'::JSONB END,
			'keyMode', CASE WHEN key_mode_applied THEN jsonb_build_object(
				'source', 'rekordboxXml',
				'appliedAt', '2026-07-22T00:00:00.000Z'
			) ELSE 'null'::JSONB END
		),
		'match', jsonb_build_object(
			'confidence', 'high',
			'score', 100,
			'reasons', jsonb_build_array('Fixture match'),
			'warnings', '[]'::JSONB
		),
		'sources', jsonb_build_object(
			'rekordboxXml', jsonb_build_object(
				'importedAt', '2026-07-22T00:00:00.000Z',
				'fileName', 'fixture.xml',
				'name', 'Fixture track',
				'artist', 'Fixture artist',
				'album', 'Fixture album',
				'genre', 'House',
				'locationHint', 'Fixture/track.wav',
				'averageBpm', 128,
				'tonality', '8A',
				'parsedKey', 9,
				'parsedMode', 0,
				'totalTimeSeconds', 180,
				'year', 2026,
				'kind', 'WAV File',
				'sampleRate', 44100,
				'bitRate', 1411,
				'rating', 0,
				'playCount', 0,
				'comments', NULL,
				'remixer', NULL,
				'label', NULL,
				'dateAdded', NULL
			)
		)
	);
$$;

CREATE FUNCTION pg_temp.batch_item(
	item_ordinal BIGINT,
	track_id UUID,
	expected_updated_at TIMESTAMPTZ,
	updates JSONB,
	bpm_must_be_null BOOLEAN DEFAULT FALSE,
	key_mode_must_be_null BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_build_object(
		'ordinal', item_ordinal,
		'track_id', track_id,
		'expected_updated_at', expected_updated_at,
		'updates', updates,
		'preconditions', jsonb_build_object(
			'bpm_must_be_null', bpm_must_be_null,
			'key_mode_must_be_null', key_mode_must_be_null
		),
		'request_hash', lpad(to_hex(item_ordinal + 1), 64, '0')
	);
$$;

SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.persist_track_enrichment_batch(uuid,text,jsonb)',
		'EXECUTE'
	),
	'anon cannot execute the enrichment batch RPC'
);
SELECT ok(
	has_function_privilege(
		'authenticated',
		'public.persist_track_enrichment_batch(uuid,text,jsonb)',
		'EXECUTE'
	),
	'authenticated callers can execute the enrichment batch RPC'
);
SELECT ok(
	NOT has_function_privilege(
		'service_role',
		'public.persist_track_enrichment_batch(uuid,text,jsonb)',
		'EXECUTE'
	),
	'the enrichment batch RPC execute allowlist excludes service_role'
);
SELECT ok(
	NOT has_function_privilege(
		'authenticated',
		'public.is_valid_track_enrichment_audio_features(jsonb)',
		'EXECUTE'
	),
	'the audio feature validator is not a public RPC'
);
SELECT ok(
	NOT has_table_privilege(
		'authenticated',
		'public.track_enrichment_batch_receipts',
		'SELECT'
	),
	'clients cannot read idempotency receipts directly'
);
SELECT ok(
	(
		SELECT relrowsecurity
		FROM pg_class
		WHERE oid = 'public.track_enrichment_batch_receipts'::REGCLASS
	),
	'the receipt table has row-level security enabled'
);
SELECT is(
	(
		SELECT prosecdef
		FROM pg_proc
		WHERE oid = 'public.persist_track_enrichment_batch(uuid,text,jsonb)'::REGPROCEDURE
	),
	TRUE,
	'the enrichment batch RPC is a security definer'
);
SELECT ok(
	COALESCE(
		(
			SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
			FROM pg_proc
			WHERE oid = 'public.persist_track_enrichment_batch(uuid,text,jsonb)'::REGPROCEDURE
		),
		FALSE
	),
	'the enrichment batch RPC has a pinned search path'
);

CREATE TEMP TABLE mixed_request AS
SELECT jsonb_build_array(
	pg_temp.batch_item(
		0,
		'20000000-0000-4000-8000-000000000001',
		'2026-07-22 00:00:00+00',
		jsonb_build_object(
			'bpm', 128,
			'audio_features', pg_temp.valid_audio_features(TRUE, FALSE)
		),
		TRUE,
		FALSE
	),
	pg_temp.batch_item(
		1,
		'20000000-0000-4000-8000-000000000002',
		'2000-01-01 00:00:00+00',
		jsonb_build_object(
			'bpm', 129,
			'audio_features', pg_temp.valid_audio_features(TRUE, FALSE)
		),
		TRUE,
		FALSE
	),
	pg_temp.batch_item(
		2,
		'20000000-0000-4000-8000-000000000003',
		'2026-07-22 00:00:00+00',
		jsonb_build_object('audio_features', pg_temp.valid_audio_features())
	),
	pg_temp.batch_item(
		3,
		'20000000-0000-4000-8000-000000000004',
		'2026-07-22 00:00:00+00',
		jsonb_build_object('audio_features', jsonb_build_object('version', 99))
	)
) AS payload;

GRANT SELECT ON mixed_request TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-4000-8000-000000000011',
	true
);

CREATE TEMP TABLE mixed_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	repeat('a', 64),
	(SELECT payload FROM mixed_request)
) AS payload;

SELECT is(
	jsonb_array_length(payload->'results'),
	4,
	'the RPC returns one status for every input item'
)
FROM mixed_response;
SELECT is(
	(
		SELECT string_agg(result->>'status', ',' ORDER BY result_index)
		FROM mixed_response,
			jsonb_array_elements(payload->'results') WITH ORDINALITY AS result(result, result_index)
	),
	'updated,stale,not_found,invalid',
	'mixed statuses preserve input order'
);
SELECT is(
	(payload #>> '{results,0,track,id}')::UUID,
	'20000000-0000-4000-8000-000000000001'::UUID,
	'an updated status includes the complete owned row'
)
FROM mixed_response;
SELECT is(
	(payload #>> '{results,0,track,user_id}')::UUID,
	'00000000-0000-4000-8000-000000000011'::UUID,
	'the returned updated row is owned by the caller'
)
FROM mixed_response;
SELECT is(
	payload #> '{results,2,track}',
	'null'::JSONB,
	'not-found results do not leak another owner row'
)
FROM mixed_response;
SELECT is(
	(
		SELECT bpm
		FROM public.tracks
		WHERE id = '20000000-0000-4000-8000-000000000001'
	),
	128.0::NUMERIC,
	'the valid item commits its fill-only update'
);
SELECT is(
	(
		SELECT audio_features->>'version'
		FROM public.tracks
		WHERE id = '20000000-0000-4000-8000-000000000001'
	),
	'1',
	'the valid item commits its validated evidence'
);
SELECT is(
	(
		SELECT audio_features
		FROM public.tracks
		WHERE id = '20000000-0000-4000-8000-000000000004'
	),
	NULL::JSONB,
	'an invalid item rolls back without erasing another item success'
);
RESET ROLE;
SELECT is(
	(
		SELECT count(*)
		FROM public.track_enrichment_batch_receipts
		WHERE owner_id = '00000000-0000-4000-8000-000000000011'
			AND operation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
	),
	1::BIGINT,
	'the mixed result is recorded once in the update transaction'
);
SET LOCAL ROLE authenticated;
SELECT is(
	public.persist_track_enrichment_batch(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		repeat('a', 64),
		(SELECT payload FROM mixed_request)
	),
	(SELECT payload FROM mixed_response),
	'an identical replay returns the original outcome instead of becoming stale'
);
RESET ROLE;
SELECT is(
	(
		SELECT count(*)
		FROM public.track_enrichment_batch_receipts
		WHERE owner_id = '00000000-0000-4000-8000-000000000011'
			AND operation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
	),
	1::BIGINT,
	'an identical replay does not create another receipt'
);
SET LOCAL ROLE authenticated;
SELECT throws_like(
	$$
		SELECT public.persist_track_enrichment_batch(
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			repeat('b', 64),
			(SELECT payload FROM mixed_request)
		)
	$$,
	'%operation ID was reused with a different request%',
	'reusing an operation ID with a different hash is rejected'
);
SELECT throws_like(
	$$
		SELECT public.persist_track_enrichment_batch(
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			repeat('a', 64),
			(SELECT payload FROM mixed_request) || jsonb_build_array(
				pg_temp.batch_item(
					4,
					'20000000-0000-4000-8000-000000000002',
					'2026-07-22 00:00:00+00',
					jsonb_build_object('audio_features', pg_temp.valid_audio_features())
				)
			)
		)
	$$,
	'%operation ID was reused with a different request%',
	'the stored payload also protects against a false matching hash'
);

CREATE TEMP TABLE duplicate_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
	repeat('b', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'20000000-0000-4000-8000-000000000002',
			'2026-07-22 00:00:00+00',
			jsonb_build_object('audio_features', pg_temp.valid_audio_features())
		),
		pg_temp.batch_item(
			1,
			'20000000-0000-4000-8000-000000000002',
			'2026-07-22 00:00:00+00',
			jsonb_build_object('audio_features', pg_temp.valid_audio_features())
		)
	)
) AS payload;

SELECT is(
	(
		SELECT string_agg(result->>'issue_code', ',' ORDER BY result_index)
		FROM duplicate_response,
			jsonb_array_elements(payload->'results') WITH ORDINALITY AS result(result, result_index)
	),
	'duplicate_track_id,duplicate_track_id',
	'every occurrence of a duplicate track ID is invalid'
);
SELECT is(
	(
		SELECT audio_features
		FROM public.tracks
		WHERE id = '20000000-0000-4000-8000-000000000002'
	),
	NULL::JSONB,
	'duplicate IDs cannot update the row'
);
SELECT throws_like(
	$$
		SELECT public.persist_track_enrichment_batch(
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
			repeat('c', 64),
			(
				SELECT jsonb_agg(
					pg_temp.batch_item(
						item_index,
						('30000000-0000-4000-8000-' || lpad(item_index::TEXT, 12, '0'))::UUID,
						'2026-07-22 00:00:00+00',
						jsonb_build_object('audio_features', pg_temp.valid_audio_features())
					)
					ORDER BY item_index
				)
				FROM generate_series(0, 100) AS item_index
			)
		)
	$$,
	'%request bounds%',
	'a 101-item server request is rejected'
);
SELECT throws_like(
	$$
		SELECT public.persist_track_enrichment_batch(
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
			repeat('d', 64),
			jsonb_build_array(
				pg_temp.batch_item(
					0,
					'20000000-0000-4000-8000-000000000002',
					'2026-07-22 00:00:00+00',
					jsonb_build_object(
						'audio_features', pg_temp.valid_audio_features(),
						'padding', (
							SELECT string_agg(md5(item_index::TEXT), '')
							FROM generate_series(1, 40000) AS item_index
						)
					)
				)
			)
		)
	$$,
	'%request bounds%',
	'an oversized JSON request is rejected before processing'
);

CREATE TEMP TABLE oversized_item_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
	repeat('e', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'20000000-0000-4000-8000-000000000002',
			'2026-07-22 00:00:00+00',
			jsonb_build_object(
				'audio_features', pg_temp.valid_audio_features(),
				'padding', (
					SELECT string_agg(md5(item_index::TEXT), '')
					FROM generate_series(1, 2200) AS item_index
				)
			)
		)
	)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,status}' FROM oversized_item_response),
	'invalid',
	'an oversized individual item receives an ordered invalid status'
);

CREATE TEMP TABLE invalid_track_id_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13',
	repeat('b', 64),
	jsonb_build_array(
		jsonb_set(
			pg_temp.batch_item(
				0,
				'20000000-0000-4000-8000-000000000002',
				'2026-07-22 00:00:00+00',
				jsonb_build_object('audio_features', pg_temp.valid_audio_features())
			),
			'{track_id}',
			to_jsonb('not-a-uuid'::TEXT)
		)
	)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,issue_code}' FROM invalid_track_id_response),
	'invalid_item',
	'a malformed track ID is rejected without casting or lookup detail'
);

CREATE TEMP TABLE invalid_numeric_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
	repeat('f', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'20000000-0000-4000-8000-000000000002',
			'2026-07-22 00:00:00+00',
			jsonb_build_object(
				'bpm', 301,
				'audio_features', pg_temp.valid_audio_features(TRUE, FALSE)
			),
			TRUE
		)
	)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,status}' FROM invalid_numeric_response),
	'invalid',
	'out-of-range BPM is rejected per item'
);

CREATE TEMP TABLE stale_precondition_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7',
	repeat('0', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'20000000-0000-4000-8000-000000000005',
			'2026-07-22 00:00:00+00',
			jsonb_build_object(
				'bpm', 120,
				'audio_features', pg_temp.valid_audio_features(TRUE, FALSE)
			),
			TRUE
		)
	)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,issue_code}' FROM stale_precondition_response),
	'stale_revision',
	'a failed fill-only null precondition returns a redacted stale issue'
);
SELECT is(
	(SELECT payload #>> '{results,0,status}' FROM stale_precondition_response),
	'stale',
	'a failed fill-only null precondition returns stale'
);
SELECT is(
	(
		SELECT bpm
		FROM public.tracks
		WHERE id = '20000000-0000-4000-8000-000000000005'
	),
	100.0::NUMERIC,
	'a failed fill-only precondition never overwrites a nonblank value'
);

CREATE TEMP TABLE owner_id_input_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8',
	repeat('1', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'20000000-0000-4000-8000-000000000002',
			'2026-07-22 00:00:00+00',
			jsonb_build_object('audio_features', pg_temp.valid_audio_features())
		) || jsonb_build_object(
			'user_id', '00000000-0000-4000-8000-000000000012'
		)
	)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,status}' FROM owner_id_input_response),
	'invalid',
	'items cannot supply an owner ID'
);

CREATE TEMP TABLE arbitrary_column_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9',
	repeat('2', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'20000000-0000-4000-8000-000000000002',
			'2026-07-22 00:00:00+00',
			jsonb_build_object(
				'title', 'Not allowed',
				'audio_features', pg_temp.valid_audio_features()
			)
		)
	)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,status}' FROM arbitrary_column_response),
	'invalid',
	'arbitrary track columns cannot enter the enrichment RPC'
);

CREATE TEMP TABLE hundred_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
	repeat('3', 64),
	(
		SELECT jsonb_agg(
			pg_temp.batch_item(
				item_index,
				('30000000-0000-4000-8000-' || lpad(item_index::TEXT, 12, '0'))::UUID,
				'2026-07-22 00:00:00+00',
				jsonb_build_object('audio_features', pg_temp.valid_audio_features())
			)
			ORDER BY item_index
		)
		FROM generate_series(0, 99) AS item_index
	)
) AS payload;

SELECT is(
	(SELECT jsonb_array_length(payload->'results') FROM hundred_response),
	100,
	'the maximum supported server batch returns 100 statuses'
);
SELECT is(
	(SELECT payload #>> '{results,99,ordinal}' FROM hundred_response),
	'99',
	'the maximum supported server batch preserves its final ordinal'
);

SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-4000-8000-000000000012',
	true
);

CREATE TEMP TABLE owner_b_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	repeat('4', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'20000000-0000-4000-8000-000000000003',
			'2026-07-22 00:00:00+00',
			jsonb_build_object(
				'bpm', 126,
				'audio_features', pg_temp.valid_audio_features(TRUE, FALSE)
			),
			TRUE
		)
	)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,status}' FROM owner_b_response),
	'updated',
	'the same operation UUID is independently scoped to another owner'
);
RESET ROLE;
SELECT is(
	(
		SELECT count(*)
		FROM public.track_enrichment_batch_receipts
		WHERE operation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
	),
	2::BIGINT,
	'receipts with the same operation UUID remain owner-scoped'
);

INSERT INTO public.track_enrichment_batch_receipts (
	owner_id,
	operation_id,
	operation_hash,
	request_payload,
	response_payload,
	expires_at
)
SELECT
	'00000000-0000-4000-8000-000000000011',
	('50000000-0000-4000-8000-' || lpad(receipt_index::TEXT, 12, '0'))::UUID,
	repeat('6', 64),
	'[]'::JSONB,
	'{}'::JSONB,
	clock_timestamp() + INTERVAL '24 hours'
FROM generate_series(
	1,
	1000 - (
		SELECT count(*)::INTEGER
		FROM public.track_enrichment_batch_receipts
		WHERE owner_id = '00000000-0000-4000-8000-000000000011'
	)
) AS receipt_index;

SELECT is(
	(
		SELECT count(*)
		FROM public.track_enrichment_batch_receipts
		WHERE owner_id = '00000000-0000-4000-8000-000000000011'
	),
	1000::BIGINT,
	'the owner receipt fixture reaches the exact rolling cardinality cap'
);

SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-4000-8000-000000000011',
	true
);
SET LOCAL ROLE authenticated;

SELECT is(
	public.persist_track_enrichment_batch(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		repeat('a', 64),
		(SELECT payload FROM mixed_request)
	),
	(SELECT payload FROM mixed_response),
	'an existing operation remains replayable when the owner is at capacity'
);
SELECT throws_like(
	$$
		SELECT public.persist_track_enrichment_batch(
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12',
			repeat('7', 64),
			jsonb_build_array(
				pg_temp.batch_item(
					0,
					'20000000-0000-4000-8000-000000000002',
					'2026-07-22 00:00:00+00',
					jsonb_build_object('audio_features', pg_temp.valid_audio_features())
				)
			)
		)
	$$,
	'%receipt capacity reached%',
	'a new operation is rejected before mutation when the owner is at capacity'
);

RESET ROLE;
SELECT is(
	(
		SELECT audio_features
		FROM public.tracks
		WHERE id = '20000000-0000-4000-8000-000000000002'
	),
	NULL::JSONB,
	'a capacity rejection cannot mutate its requested track'
);
DELETE FROM public.track_enrichment_batch_receipts
WHERE owner_id = '00000000-0000-4000-8000-000000000011'
	AND operation_id::TEXT LIKE '50000000-0000-4000-8000-%';

SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-4000-8000-000000000011',
	true
);
UPDATE public.track_enrichment_batch_receipts
SET expires_at = clock_timestamp() - INTERVAL '1 second'
WHERE owner_id = '00000000-0000-4000-8000-000000000011'
	AND operation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
SET LOCAL ROLE authenticated;

SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
	repeat('5', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'40000000-0000-4000-8000-000000000001',
			'2026-07-22 00:00:00+00',
			jsonb_build_object('audio_features', pg_temp.valid_audio_features())
		)
	)
);

RESET ROLE;
SELECT is(
	(
		SELECT count(*)
		FROM public.track_enrichment_batch_receipts
		WHERE owner_id = '00000000-0000-4000-8000-000000000011'
			AND operation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
	),
	0::BIGINT,
	'an expired receipt is pruned inside the documented retry window maintenance'
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE expired_replay_response AS
SELECT public.persist_track_enrichment_batch(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	repeat('a', 64),
	(SELECT payload FROM mixed_request)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,status}' FROM expired_replay_response),
	'stale',
	'an expired operation is no longer reported as a confirmed replay'
);

SELECT * FROM finish();
ROLLBACK;
