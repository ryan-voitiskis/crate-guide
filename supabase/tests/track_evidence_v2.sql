BEGIN;

SELECT plan(38);

INSERT INTO auth.users (id)
VALUES
	('71000000-0000-4000-8000-000000000001'),
	('71000000-0000-4000-8000-000000000002');

INSERT INTO public.records (id, user_id, title, artists, labels)
VALUES
	(
		'72000000-0000-4000-8000-000000000001',
		'71000000-0000-4000-8000-000000000001',
		'Evidence owner record',
		'[]'::JSONB,
		'[]'::JSONB
	),
	(
		'72000000-0000-4000-8000-000000000002',
		'71000000-0000-4000-8000-000000000002',
		'Other owner record',
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
		'73000000-0000-4000-8000-000000000001',
		'71000000-0000-4000-8000-000000000001',
		'72000000-0000-4000-8000-000000000001',
		'Evidence owner track',
		125,
		5,
		0,
		'2026-07-30 00:00:00+00'
	),
	(
		'73000000-0000-4000-8000-000000000002',
		'71000000-0000-4000-8000-000000000002',
		'72000000-0000-4000-8000-000000000002',
		'Other owner track',
		NULL,
		NULL,
		NULL,
		'2026-07-30 00:00:00+00'
	);

CREATE FUNCTION pg_temp.valid_audio_features_v1()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_build_object(
		'version', 1,
		'updatedAt', '2026-07-30T00:00:00.000Z',
		'applied', jsonb_build_object('bpm', NULL, 'keyMode', NULL),
		'match', jsonb_build_object(
			'confidence', 'high',
			'score', 100,
			'reasons', jsonb_build_array('Fixture match'),
			'warnings', '[]'::JSONB
		),
		'sources', '{}'::JSONB
	);
$$;

CREATE FUNCTION pg_temp.valid_evidence_v2(
	observation_id TEXT DEFAULT 'obs-tags-current',
	applied_observation_id TEXT DEFAULT NULL,
	location_hint TEXT DEFAULT 'Artist/Release/track.wav'
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_build_object(
		'version', 2,
		'modelVersion', 'latest-per-source-v1',
		'origin', 'v2',
		'updatedAt', '2026-07-30T10:00:00.000Z',
		'applied', jsonb_build_object(
			'bpm', CASE
				WHEN applied_observation_id IS NULL THEN 'null'::JSONB
				ELSE jsonb_build_object(
					'source', 'embeddedTags',
					'observationId', applied_observation_id,
					'value', 125,
					'appliedAt', '2026-07-30T09:00:00.000Z'
				)
			END,
			'keyMode', 'null'::JSONB
		),
		'sources', jsonb_build_object(
			'embeddedTags', jsonb_build_object(
				'kind', 'observation',
				'observationId', observation_id,
				'observedAt', '2026-07-30T10:00:00.000Z',
				'match', jsonb_build_object(
					'confidence', 'high',
					'score', 95,
					'reasons', jsonb_build_array('Title and duration agree'),
					'warnings', '[]'::JSONB,
					'matcherPolicyVersion', 'identity-match-v2'
				),
				'data', jsonb_build_object(
					'fileName', 'track.wav',
					'locationHint', location_hint,
					'fileSize', 65000000,
					'lastModified', 1785405600000,
					'title', 'Evidence owner track',
					'artist', 'Fixture artist',
					'album', 'Fixture release',
					'genres', jsonb_build_array('Techno'),
					'durationSeconds', 360,
					'bpm', 125,
					'key', 'F minor'
				)
			)
		),
		'legacy', 'null'::JSONB
	);
$$;

CREATE FUNCTION pg_temp.valid_legacy_envelope()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_build_object(
		'sourceVersion', 1,
		'limitations', jsonb_build_array(
			'unattributed-global-match',
			'missing-application-values-and-observation-ids'
		),
		'applied', jsonb_build_object('bpm', NULL, 'keyMode', NULL),
		'globalMatch', jsonb_build_object(
			'confidence', 'high',
			'score', 95,
			'reasons', jsonb_build_array('Legacy global match'),
			'warnings', '[]'::JSONB,
			'unknownFields', '{}'::JSONB
		),
		'unknownFields', jsonb_build_object(
			'root', '{}'::JSONB,
			'applied', '{}'::JSONB,
			'sources', '{}'::JSONB
		)
	);
$$;

CREATE FUNCTION pg_temp.valid_migrated_evidence_v2()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_build_object(
		'version', 2,
		'modelVersion', 'latest-per-source-v1',
		'origin', 'v1-migrated',
		'updatedAt', '2026-07-29T10:00:00.000Z',
		'applied', jsonb_build_object('bpm', NULL, 'keyMode', NULL),
		'sources', jsonb_build_object(
			'embeddedTags', jsonb_build_object(
				'kind', 'legacy-v1',
				'observationId', NULL,
				'observedAt', '2026-07-29T10:00:00.000Z',
				'match', NULL,
				'data', jsonb_build_object(
					'fileName', 'track.wav',
					'locationHint', 'Artist/Release/track.wav',
					'fileSize', 65000000,
					'lastModified', 1785405600000,
					'title', 'Evidence owner track',
					'artist', 'Fixture artist',
					'album', 'Fixture release',
					'genres', jsonb_build_array('Techno'),
					'durationSeconds', 360,
					'bpm', 125,
					'key', 'F minor'
				),
				'limitations', jsonb_build_array(
					'missing-observation-id',
					'missing-source-match'
				),
				'unknownFields', '{}'::JSONB
			)
		),
		'legacy', pg_temp.valid_legacy_envelope()
	);
$$;

CREATE FUNCTION pg_temp.batch_item(
	item_ordinal BIGINT,
	track_id UUID,
	expected_updated_at TIMESTAMPTZ,
	audio_features JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_build_object(
		'ordinal', item_ordinal,
		'track_id', track_id,
		'expected_updated_at', expected_updated_at,
		'updates', jsonb_build_object('audio_features', audio_features),
		'preconditions', jsonb_build_object(
			'bpm_must_be_null', FALSE,
			'key_mode_must_be_null', FALSE
		),
		'request_hash', lpad(to_hex(item_ordinal + 1), 64, '0')
	);
$$;

SELECT ok(
	public.is_valid_track_enrichment_audio_features(
		pg_temp.valid_audio_features_v1()
	),
	'the stable validator retains safe Evidence v1 compatibility'
);
SELECT ok(
	public.is_valid_track_enrichment_audio_features(
		pg_temp.valid_evidence_v2()
	),
	'the stable validator accepts strict current Evidence v2'
);
SELECT ok(
	public.is_valid_track_enrichment_audio_features(
		pg_temp.valid_migrated_evidence_v2()
	),
	'the validator accepts an honest migrated-v1 v2 envelope'
);
SELECT ok(
	public.is_valid_track_enrichment_audio_features(
		(
			pg_temp.valid_migrated_evidence_v2()
			|| jsonb_build_object(
				'origin', 'v2',
				'updatedAt', '2026-07-30T10:00:00.000Z'
			)
		)
	),
	'an incremental v2 value may retain an untouched legacy source slot'
);
SELECT ok(
	NOT public.is_valid_track_enrichment_audio_features(
		jsonb_set(
			pg_temp.valid_migrated_evidence_v2() || jsonb_build_object(
				'origin', 'v2',
				'updatedAt', '2026-07-30T10:00:00.000Z'
			),
			'{legacy}',
			'null'::JSONB
		)
	),
	'a current v2 envelope cannot strand a legacy source slot'
);
SELECT ok(
	public.is_valid_track_enrichment_audio_features(
		pg_temp.valid_evidence_v2('obs-tags-new', 'obs-tags-superseded')
	),
	'an application snapshot may refer to a superseded observation'
);
SELECT ok(
	NOT public.is_valid_track_enrichment_audio_features(
		pg_temp.valid_evidence_v2() || jsonb_build_object('match', '{}'::JSONB)
	),
	'v1 fields mixed into a v2 envelope are rejected'
);
SELECT ok(
	NOT public.is_valid_track_enrichment_audio_features(
		jsonb_set(
			pg_temp.valid_evidence_v2(),
			'{sources,embeddedTags,data,locationHint}',
			to_jsonb('/Users/example/Music/private.wav'::TEXT)
		)
	),
	'absolute private paths are rejected'
);
SELECT ok(
	NOT public.is_valid_track_enrichment_audio_features(
		jsonb_set(
			pg_temp.valid_evidence_v2(),
			'{sources,embeddedTags,data,locationHint}',
			to_jsonb('Artist/%2e%2e/private.wav'::TEXT)
		)
	),
	'encoded traversal in a relative hint is rejected'
);
SELECT ok(
	NOT public.is_valid_track_enrichment_audio_features(
		jsonb_set(
			pg_temp.valid_evidence_v2(),
			'{sources,embeddedTags,data,fileName}',
			to_jsonb('Artist/track.wav'::TEXT)
		)
	),
	'current observation filenames must be basenames'
);
SELECT ok(
	NOT public.is_valid_track_enrichment_audio_features(
		jsonb_set(
			pg_temp.valid_evidence_v2(),
			'{sources,embeddedTags,match,warnings}',
			(
				SELECT jsonb_agg(to_jsonb('warning'::TEXT))
				FROM generate_series(1, 129)
			)
		)
	),
	'current match detail arrays are bounded'
);
SELECT ok(
	NOT public.is_valid_track_enrichment_audio_features(
		jsonb_set(
			pg_temp.valid_evidence_v2(),
			'{sources,embeddedTags,match,warnings}',
			(
				SELECT jsonb_agg(to_jsonb(repeat('x', 512)))
				FROM generate_series(1, 100)
			)
		)
	),
	'otherwise schema-valid Evidence over the serialized budget is rejected'
);
SELECT ok(
	NOT public.is_valid_track_enrichment_audio_features(
		jsonb_set(
			pg_temp.valid_evidence_v2(),
			'{sources,embeddedTags,rawAudio}',
			to_jsonb('private payload'::TEXT)
		)
	),
	'forbidden private payload fields are rejected'
);
SELECT ok(
	NOT has_function_privilege(
		'authenticated',
		'public.is_valid_track_enrichment_audio_features_v2(jsonb)',
		'EXECUTE'
	),
	'the v2 validator is not exposed as a browser RPC'
);
SELECT ok(
	NOT has_function_privilege(
		'authenticated',
		'public.protect_track_evidence_generation()',
		'EXECUTE'
	),
	'the generation trigger function is not browser executable'
);
SELECT is(
	(
		SELECT relrowsecurity
		FROM pg_class
		WHERE oid = 'public.track_evidence_rpc_write_guards'::REGCLASS
	),
	TRUE,
	'the Evidence RPC guard table has row-level security enabled'
);
SELECT ok(
	NOT has_table_privilege(
		'anon',
		'public.track_evidence_rpc_write_guards',
		'SELECT'
	)
	AND NOT has_table_privilege(
		'authenticated',
		'public.track_evidence_rpc_write_guards',
		'SELECT'
	)
	AND NOT has_table_privilege(
		'authenticated',
		'public.track_evidence_rpc_write_guards',
		'INSERT'
	)
	AND NOT has_table_privilege(
		'authenticated',
		'public.track_evidence_rpc_write_guards',
		'UPDATE'
	)
	AND NOT has_table_privilege(
		'authenticated',
		'public.track_evidence_rpc_write_guards',
		'DELETE'
	),
	'the Evidence RPC guard table is not browser accessible'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.persist_track_enrichment_batch_guarded_internal(uuid,text,jsonb)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.persist_track_enrichment_batch_guarded_internal(uuid,text,jsonb)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'service_role',
		'public.persist_track_enrichment_batch_guarded_internal(uuid,text,jsonb)',
		'EXECUTE'
	),
	'the internal Evidence batch implementation is not API executable'
);
SELECT ok(
	NOT has_function_privilege(
		'anon',
		'public.persist_track_enrichment_batch(uuid,text,jsonb)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'authenticated',
		'public.persist_track_enrichment_batch(uuid,text,jsonb)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'service_role',
		'public.persist_track_enrichment_batch(uuid,text,jsonb)',
		'EXECUTE'
	),
	'the stable Evidence batch RPC has only its intended API grant'
);
SELECT is(
	(
		SELECT tgenabled
		FROM pg_trigger
		WHERE tgrelid = 'public.tracks'::REGCLASS
			AND tgname = 'tracks_protect_evidence_generation_trigger'
	),
	'O',
	'the Evidence generation protection trigger is enabled'
);

SELECT set_config(
	'request.jwt.claim.sub',
	'71000000-0000-4000-8000-000000000001',
	true
);

CREATE TEMP TABLE initial_v2_request AS
SELECT jsonb_build_array(
	pg_temp.batch_item(
		0,
		'73000000-0000-4000-8000-000000000001',
		'2026-07-30 00:00:00+00',
		pg_temp.valid_evidence_v2(
			'obs-tags-initial',
			'obs-tags-superseded'
		)
	)
) AS payload;
GRANT SELECT ON initial_v2_request TO authenticated;

SELECT is(
	(
		SELECT public.persist_track_enrichment_batch(
			'74000000-0000-4000-8000-000000000000',
			repeat('0', 64),
			payload
		) #>> '{results,0,status}'
		FROM initial_v2_request
	),
	'updated',
	'the CAS RPC is the allowed transition from no Evidence to v2'
);

SET LOCAL ROLE authenticated;

SELECT throws_like(
	$$
		UPDATE public.tracks
		SET audio_features = pg_temp.valid_evidence_v2(
			'obs-tags-stale-direct',
			'obs-tags-superseded'
		)
		WHERE id = '73000000-0000-4000-8000-000000000001'
	$$,
	'%must be written through the CAS RPC%',
	'a direct stale v2 client cannot replace another valid v2 object'
);

UPDATE public.tracks
SET title = 'Evidence owner track renamed'
WHERE id = '73000000-0000-4000-8000-000000000001';

SELECT is(
	(
		SELECT title
		FROM public.tracks
		WHERE id = '73000000-0000-4000-8000-000000000001'
	),
	'Evidence owner track renamed',
	'unrelated direct edits remain compatible when v2 Evidence is unchanged'
);
SELECT throws_like(
	$$
		UPDATE public.tracks
		SET audio_features = pg_temp.valid_audio_features_v1()
		WHERE id = '73000000-0000-4000-8000-000000000001'
	$$,
	'%cannot be downgraded or cleared%',
	'a generic old-client update cannot downgrade a v2 row to v1'
);
SELECT throws_like(
	$$
		UPDATE public.tracks
		SET audio_features = NULL
		WHERE id = '73000000-0000-4000-8000-000000000001'
	$$,
	'%cannot be downgraded or cleared%',
	'a generic old-client update cannot clear a v2 row'
);

CREATE TEMP TABLE evidence_only_request AS
SELECT jsonb_build_array(
	pg_temp.batch_item(
		0,
		'73000000-0000-4000-8000-000000000001',
		(
			SELECT updated_at
			FROM public.tracks
			WHERE id = '73000000-0000-4000-8000-000000000001'
		),
		pg_temp.valid_evidence_v2(
			'obs-tags-replacement',
			'obs-tags-superseded'
		)
	)
) AS payload;
GRANT SELECT ON evidence_only_request TO authenticated;

CREATE TEMP TABLE evidence_only_response AS
SELECT public.persist_track_enrichment_batch(
	'74000000-0000-4000-8000-000000000001',
	repeat('a', 64),
	(SELECT payload FROM evidence_only_request)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,status}' FROM evidence_only_response),
	'updated',
	'the authenticated batch RPC accepts Evidence v2'
);
SELECT is(
	(
		SELECT audio_features #>> '{sources,embeddedTags,observationId}'
		FROM public.tracks
		WHERE id = '73000000-0000-4000-8000-000000000001'
	),
	'obs-tags-replacement',
	'the CAS RPC can replace a latest source observation'
);
SELECT is(
	(
		SELECT audio_features #>> '{applied,bpm,observationId}'
		FROM public.tracks
		WHERE id = '73000000-0000-4000-8000-000000000001'
	),
	'obs-tags-superseded',
	'source replacement does not rewrite an older application snapshot'
);
SELECT is(
	(
		SELECT bpm
		FROM public.tracks
		WHERE id = '73000000-0000-4000-8000-000000000001'
	),
	125.0::NUMERIC,
	'an evidence-only v2 update does not change a nonblank BPM'
);
SELECT is(
	(
		SELECT key
		FROM public.tracks
		WHERE id = '73000000-0000-4000-8000-000000000001'
	),
	5::SMALLINT,
	'an evidence-only v2 update does not change a nonblank key'
);
SELECT is(
	(
		SELECT mode
		FROM public.tracks
		WHERE id = '73000000-0000-4000-8000-000000000001'
	),
	0::SMALLINT,
	'an evidence-only v2 update does not change a nonblank mode'
);
SELECT is(
	public.persist_track_enrichment_batch(
		'74000000-0000-4000-8000-000000000001',
		repeat('a', 64),
		(SELECT payload FROM evidence_only_request)
	),
	(SELECT payload FROM evidence_only_response),
	'an Evidence v2 operation remains idempotently replayable'
);

CREATE TEMP TABLE stale_v2_response AS
SELECT public.persist_track_enrichment_batch(
	'74000000-0000-4000-8000-000000000002',
	repeat('b', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'73000000-0000-4000-8000-000000000001',
			'2000-01-01 00:00:00+00',
			pg_temp.valid_evidence_v2('obs-tags-stale')
		)
	)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,status}' FROM stale_v2_response),
	'stale',
	'Evidence v2 retains the row compare-and-swap boundary'
);

CREATE TEMP TABLE other_owner_v2_response AS
SELECT public.persist_track_enrichment_batch(
	'74000000-0000-4000-8000-000000000003',
	repeat('c', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'73000000-0000-4000-8000-000000000002',
			'2026-07-30 00:00:00+00',
			pg_temp.valid_evidence_v2('obs-tags-other-owner')
		)
	)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,status}' FROM other_owner_v2_response),
	'not_found',
	'Evidence v2 retains owner-scoped not-found behavior'
);

CREATE TEMP TABLE v1_downgrade_response AS
SELECT public.persist_track_enrichment_batch(
	'74000000-0000-4000-8000-000000000004',
	repeat('d', 64),
	jsonb_build_array(
		pg_temp.batch_item(
			0,
			'73000000-0000-4000-8000-000000000001',
			(
				SELECT updated_at
				FROM public.tracks
				WHERE id = '73000000-0000-4000-8000-000000000001'
			),
			pg_temp.valid_audio_features_v1()
		)
	)
) AS payload;

SELECT is(
	(SELECT payload #>> '{results,0,issue_code}' FROM v1_downgrade_response),
	'update_rejected',
	'an old batch client cannot overwrite a v2 row with v1'
);
SELECT is(
	(
		SELECT audio_features->>'version'
		FROM public.tracks
		WHERE id = '73000000-0000-4000-8000-000000000001'
	),
	'2',
	'a rejected old batch write leaves the v2 generation intact'
);

RESET ROLE;

SELECT is(
	(
		SELECT count(*)
		FROM public.track_evidence_rpc_write_guards
	),
	0::BIGINT,
	'the Evidence RPC guard is empty after successful and rejected writes'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.track_enrichment_batch_receipts
		WHERE owner_id = '71000000-0000-4000-8000-000000000001'
			AND operation_id = '74000000-0000-4000-8000-000000000001'
	),
	1::BIGINT,
	'v2 idempotency receipts remain owner scoped and singular'
);

SELECT * FROM finish();
ROLLBACK;
