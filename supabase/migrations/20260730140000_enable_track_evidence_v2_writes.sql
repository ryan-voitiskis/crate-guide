BEGIN;

-- Preserve the deployed v1 contract verbatim. The stable wrapper name below
-- lets the existing batch RPC accept both generations without redefining its
-- security, ownership, CAS, or receipt logic.
ALTER FUNCTION public.is_valid_track_enrichment_audio_features(JSONB)
RENAME TO is_valid_track_enrichment_audio_features_v1;

CREATE FUNCTION public.track_evidence_has_exact_keys(
	candidate JSONB,
	required_keys TEXT[],
	allowed_keys TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
	SELECT jsonb_typeof(candidate) = 'object'
		AND candidate ?& required_keys
		AND NOT EXISTS (
			SELECT 1
			FROM jsonb_object_keys(candidate) AS candidate_key
			WHERE NOT (candidate_key = ANY (allowed_keys))
		);
$$;

CREATE FUNCTION public.track_evidence_is_bounded_text(
	candidate JSONB,
	minimum_length INTEGER,
	maximum_length INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
	SELECT jsonb_typeof(candidate) = 'string'
		AND length(candidate #>> '{}') BETWEEN minimum_length AND maximum_length
		AND candidate #>> '{}' !~ '[[:cntrl:]]';
$$;

CREATE FUNCTION public.track_evidence_is_timestamp(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
	parsed_timestamp TIMESTAMPTZ;
	timestamp_text TEXT;
BEGIN
	IF NOT public.track_evidence_is_bounded_text(candidate, 1, 64) THEN
		RETURN FALSE;
	END IF;

	timestamp_text := candidate #>> '{}';
	IF timestamp_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
		RETURN FALSE;
	END IF;

	parsed_timestamp := timestamp_text::TIMESTAMPTZ;
	RETURN parsed_timestamp IS NOT NULL;
EXCEPTION
	WHEN OTHERS THEN
		RETURN FALSE;
END;
$$;

CREATE FUNCTION public.track_evidence_is_safe_relative_hint(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
	hint TEXT;
	path_segment TEXT;
	path_segments TEXT[];
BEGIN
	IF jsonb_typeof(candidate) = 'null' THEN
		RETURN TRUE;
	END IF;
	IF NOT public.track_evidence_is_bounded_text(candidate, 1, 4096) THEN
		RETURN FALSE;
	END IF;

	hint := candidate #>> '{}';
	IF hint IS DISTINCT FROM btrim(hint)
		OR hint ~ '[\\]'
		OR hint ~ '(^|/)[.][.]?(/|$)'
		OR hint ~* '^(?:/|//|~|[a-z]:|[a-z][a-z0-9+.-]*:)'
		OR hint ~* '%(?:2e|2f|5c|25)'
	THEN
		RETURN FALSE;
	END IF;

	path_segments := string_to_array(hint, '/');
	IF cardinality(path_segments) NOT BETWEEN 1 AND 64 THEN
		RETURN FALSE;
	END IF;
	FOREACH path_segment IN ARRAY path_segments
	LOOP
		IF length(path_segment) NOT BETWEEN 1 AND 255
			OR octet_length(path_segment) > 255
			OR path_segment ~ '[[:cntrl:]]'
		THEN
			RETURN FALSE;
		END IF;
	END LOOP;

	RETURN octet_length(hint) <= 4096;
END;
$$;

CREATE FUNCTION public.track_evidence_contains_private_data(
	candidate JSONB,
	current_depth INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
	field_name TEXT;
	field_value JSONB;
	normalized_field_name TEXT;
	scalar_text TEXT;
BEGIN
	IF current_depth > 64 THEN
		RETURN TRUE;
	END IF;

	IF jsonb_typeof(candidate) = 'object' THEN
		FOR field_name, field_value IN
			SELECT entry.key, entry.value
			FROM jsonb_each(candidate) AS entry
		LOOP
			normalized_field_name := regexp_replace(
				lower(field_name),
				'[^a-z0-9]',
				'',
				'g'
			);
			IF normalized_field_name = ANY (ARRAY[
				'audio', 'audiobytes', 'audiobuffer', 'binary', 'blob',
				'bloburl', 'bytes', 'dialog', 'directoryhandle', 'file',
				'filehandle', 'inflight', 'isapplying', 'location', 'objecturl',
				'parseroutput', 'parserresult', 'path', 'promise', 'rawaudio',
				'rawxml', 'record', 'records', 'row', 'rows', 'track', 'tracks',
				'worker', 'xml', 'xmltext'
			])
				OR normalized_field_name ~ '(file|directory)handle$'
				OR normalized_field_name ~ '(object|blob)url$'
				OR normalized_field_name ~ '^raw(xml|audio|bytes|content)'
				OR public.track_evidence_contains_private_data(
					field_value,
					current_depth + 1
				)
			THEN
				RETURN TRUE;
			END IF;
		END LOOP;
		RETURN FALSE;
	END IF;

	IF jsonb_typeof(candidate) = 'array' THEN
		FOR field_value IN
			SELECT element.value
			FROM jsonb_array_elements(candidate) AS element
		LOOP
			IF public.track_evidence_contains_private_data(
				field_value,
				current_depth + 1
			) THEN
				RETURN TRUE;
			END IF;
		END LOOP;
		RETURN FALSE;
	END IF;

	IF jsonb_typeof(candidate) <> 'string' THEN
		RETURN FALSE;
	END IF;

	scalar_text := btrim(candidate #>> '{}');
	RETURN scalar_text ~* '^(?:[a-z]:[\\/]|\\\\|//|/|~[^\\/]*[\\/]|[a-z][a-z0-9+.-]*:[\\/]|(?:file|blob|data):)'
		OR scalar_text ~* '(^|[[:space:]''"(:=])(?:[a-z]:[\\/]|\\\\[^\\]|//|/(?:[^/[:space:]]+/)+[^/[:space:]]+|[a-z][a-z0-9+.-]*:[\\/]|(?:file|blob|data):)'
		OR scalar_text ~* '%(?:2f|5c|25(?:2f|5c))';
END;
$$;

CREATE FUNCTION public.track_evidence_is_text_array(
	candidate JSONB,
	maximum_items INTEGER,
	maximum_text_length INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
	SELECT jsonb_typeof(candidate) = 'array'
		AND jsonb_array_length(candidate) <= maximum_items
		AND NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements(candidate) AS item
			WHERE NOT public.track_evidence_is_bounded_text(
				item,
				0,
				maximum_text_length
			)
		);
$$;

CREATE FUNCTION public.track_evidence_is_match(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
	SELECT public.track_evidence_has_exact_keys(
			candidate,
			ARRAY['confidence', 'score', 'reasons', 'warnings', 'matcherPolicyVersion'],
			ARRAY['confidence', 'score', 'reasons', 'warnings', 'matcherPolicyVersion']
		)
		AND candidate->>'confidence' IN ('high', 'medium', 'manual')
		AND jsonb_typeof(candidate->'score') = 'number'
		AND (candidate->>'score')::NUMERIC BETWEEN 0 AND 100
		AND public.track_evidence_is_text_array(candidate->'reasons', 128, 512)
		AND public.track_evidence_is_text_array(candidate->'warnings', 128, 512)
		AND public.track_evidence_is_bounded_text(
			candidate->'matcherPolicyVersion',
			1,
			128
		);
$$;

CREATE FUNCTION public.track_evidence_is_rekordbox_data(
	candidate JSONB,
	is_legacy BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
	field_name TEXT;
BEGIN
	IF NOT public.track_evidence_has_exact_keys(
		candidate,
		ARRAY[
			'fileName', 'name', 'artist', 'album', 'genre', 'locationHint',
			'averageBpm', 'tonality', 'parsedKey', 'parsedMode',
			'totalTimeSeconds', 'year', 'kind', 'sampleRate', 'bitRate',
			'rating', 'playCount', 'comments', 'remixer', 'label', 'dateAdded',
			'rekordboxTrackId'
		],
		ARRAY[
			'fileName', 'name', 'artist', 'album', 'genre', 'locationHint',
			'averageBpm', 'tonality', 'parsedKey', 'parsedMode',
			'totalTimeSeconds', 'year', 'kind', 'sampleRate', 'bitRate',
			'rating', 'playCount', 'comments', 'remixer', 'label', 'dateAdded',
			'rekordboxTrackId'
		]
	) THEN
		RETURN FALSE;
	END IF;

	IF NOT public.track_evidence_is_bounded_text(
		candidate->'fileName',
		CASE WHEN is_legacy THEN 0 ELSE 1 END,
		CASE WHEN is_legacy THEN 49152 ELSE 255 END
	) OR (
		NOT is_legacy
		AND (candidate->>'fileName' LIKE '%/%' OR candidate->>'fileName' LIKE '%\%')
	) OR NOT public.track_evidence_is_safe_relative_hint(candidate->'locationHint')
	THEN
		RETURN FALSE;
	END IF;

	FOREACH field_name IN ARRAY ARRAY[
		'name', 'artist', 'album', 'genre', 'tonality', 'kind', 'comments',
		'remixer', 'label', 'dateAdded'
	]
	LOOP
		IF jsonb_typeof(candidate->field_name) = 'null' THEN
			CONTINUE;
		END IF;
		IF NOT public.track_evidence_is_bounded_text(
			candidate->field_name,
			0,
			CASE WHEN is_legacy THEN 49152 ELSE 4096 END
		) THEN
			RETURN FALSE;
		END IF;
	END LOOP;

	FOREACH field_name IN ARRAY ARRAY[
		'averageBpm', 'parsedKey', 'parsedMode', 'totalTimeSeconds', 'year',
		'sampleRate', 'bitRate', 'rating', 'playCount'
	]
	LOOP
		IF jsonb_typeof(candidate->field_name) NOT IN ('number', 'null') THEN
			RETURN FALSE;
		END IF;
	END LOOP;

	IF is_legacy THEN
		RETURN jsonb_typeof(candidate->'rekordboxTrackId') = 'null';
	END IF;
	RETURN jsonb_typeof(candidate->'rekordboxTrackId') = 'null'
		OR public.track_evidence_is_bounded_text(
			candidate->'rekordboxTrackId',
			1,
			512
		);
END;
$$;

CREATE FUNCTION public.track_evidence_is_embedded_tags_data(
	candidate JSONB,
	is_legacy BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
	field_name TEXT;
BEGIN
	IF NOT public.track_evidence_has_exact_keys(
		candidate,
		ARRAY[
			'fileName', 'locationHint', 'fileSize', 'lastModified', 'title',
			'artist', 'album', 'genres', 'durationSeconds', 'bpm', 'key'
		],
		ARRAY[
			'fileName', 'locationHint', 'fileSize', 'lastModified', 'title',
			'artist', 'album', 'genres', 'durationSeconds', 'bpm', 'key'
		]
	) THEN
		RETURN FALSE;
	END IF;

	IF NOT public.track_evidence_is_bounded_text(
		candidate->'fileName',
		CASE WHEN is_legacy THEN 0 ELSE 1 END,
		CASE WHEN is_legacy THEN 49152 ELSE 255 END
	) OR (
		NOT is_legacy
		AND (candidate->>'fileName' LIKE '%/%' OR candidate->>'fileName' LIKE '%\%')
	) OR NOT public.track_evidence_is_safe_relative_hint(candidate->'locationHint')
		OR jsonb_typeof(candidate->'fileSize') <> 'number'
		OR jsonb_typeof(candidate->'lastModified') <> 'number'
		OR NOT public.track_evidence_is_text_array(
			candidate->'genres',
			CASE WHEN is_legacy THEN 49152 ELSE 128 END,
			CASE WHEN is_legacy THEN 49152 ELSE 512 END
		)
	THEN
		RETURN FALSE;
	END IF;

	FOREACH field_name IN ARRAY ARRAY['title', 'artist', 'album', 'key']
	LOOP
		IF jsonb_typeof(candidate->field_name) = 'null' THEN
			CONTINUE;
		END IF;
		IF NOT public.track_evidence_is_bounded_text(
			candidate->field_name,
			0,
			CASE WHEN is_legacy THEN 49152 ELSE 4096 END
		) THEN
			RETURN FALSE;
		END IF;
	END LOOP;

	RETURN jsonb_typeof(candidate->'durationSeconds') IN ('number', 'null')
		AND jsonb_typeof(candidate->'bpm') IN ('number', 'null');
END;
$$;

CREATE FUNCTION public.track_evidence_is_essentia_data(
	candidate JSONB,
	is_legacy BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
	field_name TEXT;
BEGIN
	IF NOT public.track_evidence_has_exact_keys(
		candidate,
		ARRAY[
			'analyzerVersion', 'configurationVersion', 'bpm', 'bpmConfidence',
			'bpmEstimates', 'key', 'scale', 'keyStrength', 'sampleRate',
			'durationSeconds', 'analyzedDurationSeconds',
			'analysisOffsetSeconds', 'warnings'
		],
		ARRAY[
			'analyzerVersion', 'configurationVersion', 'bpm', 'bpmConfidence',
			'bpmEstimates', 'key', 'scale', 'keyStrength', 'sampleRate',
			'durationSeconds', 'analyzedDurationSeconds',
			'analysisOffsetSeconds', 'warnings'
		]
	) THEN
		RETURN FALSE;
	END IF;

	IF NOT public.track_evidence_is_bounded_text(
			candidate->'analyzerVersion',
			CASE WHEN is_legacy THEN 0 ELSE 1 END,
			CASE WHEN is_legacy THEN 49152 ELSE 128 END
		)
		OR NOT public.track_evidence_is_bounded_text(
			candidate->'configurationVersion',
			CASE WHEN is_legacy THEN 0 ELSE 1 END,
			CASE WHEN is_legacy THEN 49152 ELSE 128 END
		)
		OR jsonb_typeof(candidate->'bpmEstimates') <> 'array'
		OR jsonb_array_length(candidate->'bpmEstimates')
			> (CASE WHEN is_legacy THEN 49152 ELSE 64 END)
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(candidate->'bpmEstimates') AS estimate
			WHERE jsonb_typeof(estimate) <> 'number'
		)
		OR NOT public.track_evidence_is_text_array(
			candidate->'warnings',
			CASE WHEN is_legacy THEN 49152 ELSE 128 END,
			CASE WHEN is_legacy THEN 49152 ELSE 512 END
		)
	THEN
		RETURN FALSE;
	END IF;

	FOREACH field_name IN ARRAY ARRAY['key', 'scale']
	LOOP
		IF jsonb_typeof(candidate->field_name) = 'null' THEN
			CONTINUE;
		END IF;
		IF NOT public.track_evidence_is_bounded_text(
			candidate->field_name,
			0,
			CASE WHEN is_legacy THEN 49152 ELSE 4096 END
		) THEN
			RETURN FALSE;
		END IF;
	END LOOP;
	FOREACH field_name IN ARRAY ARRAY['bpm', 'bpmConfidence', 'keyStrength']
	LOOP
		IF jsonb_typeof(candidate->field_name) NOT IN ('number', 'null') THEN
			RETURN FALSE;
		END IF;
	END LOOP;
	FOREACH field_name IN ARRAY ARRAY[
		'sampleRate', 'durationSeconds', 'analyzedDurationSeconds',
		'analysisOffsetSeconds'
	]
	LOOP
		IF jsonb_typeof(candidate->field_name) <> 'number' THEN
			RETURN FALSE;
		END IF;
	END LOOP;
	RETURN TRUE;
END;
$$;

CREATE FUNCTION public.track_evidence_is_legacy_observation(
	candidate JSONB,
	source_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
	expected_limitations JSONB;
BEGIN
	IF NOT public.track_evidence_has_exact_keys(
		candidate,
		ARRAY[
			'kind', 'observationId', 'observedAt', 'match', 'data',
			'limitations', 'unknownFields'
		],
		ARRAY[
			'kind', 'observationId', 'observedAt', 'match', 'data',
			'limitations', 'unknownFields'
		]
	) OR candidate->>'kind' <> 'legacy-v1'
		OR jsonb_typeof(candidate->'observationId') <> 'null'
		OR jsonb_typeof(candidate->'match') <> 'null'
		OR NOT public.track_evidence_is_bounded_text(
			candidate->'observedAt',
			0,
			49152
		)
		OR jsonb_typeof(candidate->'unknownFields') <> 'object'
	THEN
		RETURN FALSE;
	END IF;

	expected_limitations := CASE source_name
		WHEN 'rekordboxXml' THEN
			'["missing-observation-id","missing-source-match","missing-rekordbox-track-id"]'::JSONB
		ELSE
			'["missing-observation-id","missing-source-match"]'::JSONB
	END;
	IF candidate->'limitations' IS DISTINCT FROM expected_limitations THEN
		RETURN FALSE;
	END IF;

	RETURN CASE source_name
		WHEN 'rekordboxXml' THEN
			public.track_evidence_is_rekordbox_data(candidate->'data', TRUE)
		WHEN 'embeddedTags' THEN
			public.track_evidence_is_embedded_tags_data(candidate->'data', TRUE)
		WHEN 'essentiaBrowser' THEN
			public.track_evidence_is_essentia_data(candidate->'data', TRUE)
		ELSE FALSE
	END;
END;
$$;

CREATE FUNCTION public.track_evidence_is_current_observation(
	candidate JSONB,
	source_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
BEGIN
	IF NOT public.track_evidence_has_exact_keys(
		candidate,
		ARRAY['kind', 'observationId', 'observedAt', 'match', 'data'],
		ARRAY['kind', 'observationId', 'observedAt', 'match', 'data']
	) OR candidate->>'kind' <> 'observation'
		OR NOT public.track_evidence_is_bounded_text(
			candidate->'observationId',
			1,
			512
		)
		OR NOT public.track_evidence_is_timestamp(candidate->'observedAt')
		OR NOT public.track_evidence_is_match(candidate->'match')
	THEN
		RETURN FALSE;
	END IF;

	RETURN CASE source_name
		WHEN 'rekordboxXml' THEN
			public.track_evidence_is_rekordbox_data(candidate->'data', FALSE)
		WHEN 'embeddedTags' THEN
			public.track_evidence_is_embedded_tags_data(candidate->'data', FALSE)
		WHEN 'essentiaBrowser' THEN
			public.track_evidence_is_essentia_data(candidate->'data', FALSE)
		ELSE FALSE
	END;
END;
$$;

CREATE FUNCTION public.track_evidence_is_application(
	candidate JSONB,
	application_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
BEGIN
	IF jsonb_typeof(candidate) = 'null' THEN
		RETURN TRUE;
	END IF;
	IF application_name = 'bpm' THEN
		RETURN public.track_evidence_has_exact_keys(
				candidate,
				ARRAY['source', 'observationId', 'value', 'appliedAt'],
				ARRAY['source', 'observationId', 'value', 'appliedAt']
			)
			AND candidate->>'source' IN (
				'rekordboxXml',
				'embeddedTags',
				'essentiaBrowser'
			)
			AND public.track_evidence_is_bounded_text(
				candidate->'observationId',
				1,
				512
			)
			AND jsonb_typeof(candidate->'value') = 'number'
			AND public.track_evidence_is_timestamp(candidate->'appliedAt');
	END IF;
	IF application_name = 'keyMode' THEN
		RETURN public.track_evidence_has_exact_keys(
				candidate,
				ARRAY['source', 'observationId', 'value', 'appliedAt'],
				ARRAY['source', 'observationId', 'value', 'appliedAt']
			)
			AND candidate->>'source' IN (
				'rekordboxXml',
				'embeddedTags',
				'essentiaBrowser'
			)
			AND public.track_evidence_is_bounded_text(
				candidate->'observationId',
				1,
				512
			)
			AND public.track_evidence_has_exact_keys(
				candidate->'value',
				ARRAY['key', 'mode'],
				ARRAY['key', 'mode']
			)
			AND jsonb_typeof(candidate->'value'->'key') = 'number'
			AND candidate->'value'->>'key' ~ '^(0|[1-9]|10|11)$'
			AND jsonb_typeof(candidate->'value'->'mode') = 'number'
			AND candidate->'value'->>'mode' ~ '^[01]$'
			AND public.track_evidence_is_timestamp(candidate->'appliedAt');
	END IF;
	RETURN FALSE;
END;
$$;

CREATE FUNCTION public.track_evidence_is_legacy_envelope(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
	applied_name TEXT;
	applied_value JSONB;
	field_name TEXT;
BEGIN
	IF NOT public.track_evidence_has_exact_keys(
		candidate,
		ARRAY[
			'sourceVersion', 'limitations', 'applied', 'globalMatch',
			'unknownFields'
		],
		ARRAY[
			'sourceVersion', 'limitations', 'applied', 'globalMatch',
			'unknownFields'
		]
	) OR candidate->>'sourceVersion' <> '1'
		OR candidate->'limitations' IS DISTINCT FROM
			'["unattributed-global-match","missing-application-values-and-observation-ids"]'::JSONB
		OR NOT public.track_evidence_has_exact_keys(
			candidate->'applied',
			ARRAY['bpm', 'keyMode'],
			ARRAY['bpm', 'keyMode']
		)
		OR NOT public.track_evidence_has_exact_keys(
			candidate->'globalMatch',
			ARRAY['confidence', 'score', 'reasons', 'warnings', 'unknownFields'],
			ARRAY['confidence', 'score', 'reasons', 'warnings', 'unknownFields']
		)
		OR candidate->'globalMatch'->>'confidence'
			NOT IN ('high', 'medium', 'manual')
		OR jsonb_typeof(candidate->'globalMatch'->'score') <> 'number'
		OR jsonb_typeof(candidate->'globalMatch'->'reasons') <> 'array'
		OR jsonb_typeof(candidate->'globalMatch'->'warnings') <> 'array'
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(candidate->'globalMatch'->'reasons') AS reason
			WHERE jsonb_typeof(reason) <> 'string'
		)
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(candidate->'globalMatch'->'warnings') AS warning
			WHERE jsonb_typeof(warning) <> 'string'
		)
		OR jsonb_typeof(candidate->'globalMatch'->'unknownFields') <> 'object'
		OR NOT public.track_evidence_has_exact_keys(
			candidate->'unknownFields',
			ARRAY['root', 'applied', 'sources'],
			ARRAY['root', 'applied', 'sources']
		)
	THEN
		RETURN FALSE;
	END IF;

	FOREACH field_name IN ARRAY ARRAY['root', 'applied', 'sources']
	LOOP
		IF jsonb_typeof(candidate->'unknownFields'->field_name) <> 'object' THEN
			RETURN FALSE;
		END IF;
	END LOOP;

	FOREACH applied_name IN ARRAY ARRAY['bpm', 'keyMode']
	LOOP
		applied_value := candidate->'applied'->applied_name;
		IF jsonb_typeof(applied_value) = 'null' THEN
			CONTINUE;
		END IF;
		IF NOT public.track_evidence_has_exact_keys(
			applied_value,
			ARRAY['source', 'appliedAt', 'unknownFields'],
			ARRAY['source', 'appliedAt', 'unknownFields']
		) OR applied_value->>'source' NOT IN (
			'rekordboxXml',
			'embeddedTags',
			'essentiaBrowser'
		) OR jsonb_typeof(applied_value->'appliedAt') <> 'string'
			OR jsonb_typeof(applied_value->'unknownFields') <> 'object'
		THEN
			RETURN FALSE;
		END IF;
	END LOOP;
	RETURN TRUE;
END;
$$;

CREATE FUNCTION public.is_valid_track_enrichment_audio_features_v2(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
	has_legacy_source BOOLEAN := FALSE;
	source_name TEXT;
	source_value JSONB;
BEGIN
	IF pg_column_size(candidate) > 49152
		OR public.track_evidence_contains_private_data(candidate)
		OR NOT public.track_evidence_has_exact_keys(
			candidate,
			ARRAY[
				'version', 'modelVersion', 'origin', 'updatedAt', 'applied',
				'sources', 'legacy'
			],
			ARRAY[
				'version', 'modelVersion', 'origin', 'updatedAt', 'applied',
				'sources', 'legacy'
			]
		)
		OR candidate->>'version' <> '2'
		OR candidate->>'modelVersion' <> 'latest-per-source-v1'
		OR candidate->>'origin' NOT IN ('v2', 'v1-migrated')
		OR NOT public.track_evidence_has_exact_keys(
			candidate->'applied',
			ARRAY['bpm', 'keyMode'],
			ARRAY['bpm', 'keyMode']
		)
		OR jsonb_typeof(candidate->'sources') <> 'object'
		OR EXISTS (
			SELECT 1
			FROM jsonb_object_keys(candidate->'sources') AS source_key
			WHERE source_key <> ALL (
				ARRAY['rekordboxXml', 'embeddedTags', 'essentiaBrowser']
			)
		)
	THEN
		RETURN FALSE;
	END IF;

	FOREACH source_name IN ARRAY ARRAY[
		'rekordboxXml',
		'embeddedTags',
		'essentiaBrowser'
	]
	LOOP
		source_value := candidate->'sources'->source_name;
		IF source_value IS NULL THEN
			CONTINUE;
		END IF;
		IF source_value->>'kind' = 'legacy-v1' THEN
			has_legacy_source := TRUE;
			IF NOT public.track_evidence_is_legacy_observation(
				source_value,
				source_name
			) THEN
				RETURN FALSE;
			END IF;
		ELSIF NOT public.track_evidence_is_current_observation(
			source_value,
			source_name
		) THEN
			RETURN FALSE;
		END IF;
	END LOOP;

	IF candidate->>'origin' = 'v1-migrated' THEN
		RETURN public.track_evidence_is_bounded_text(
				candidate->'updatedAt',
				1,
				128
			)
			AND jsonb_typeof(candidate->'applied'->'bpm') = 'null'
			AND jsonb_typeof(candidate->'applied'->'keyMode') = 'null'
			AND NOT EXISTS (
				SELECT 1
				FROM jsonb_each(candidate->'sources') AS source_entry
				WHERE source_entry.value->>'kind' IS DISTINCT FROM 'legacy-v1'
			)
			AND public.track_evidence_is_legacy_envelope(candidate->'legacy');
	END IF;

	RETURN public.track_evidence_is_timestamp(candidate->'updatedAt')
		AND public.track_evidence_is_application(
			candidate->'applied'->'bpm',
			'bpm'
		)
		AND public.track_evidence_is_application(
			candidate->'applied'->'keyMode',
			'keyMode'
		)
		AND (
			jsonb_typeof(candidate->'legacy') = 'null'
			OR public.track_evidence_is_legacy_envelope(candidate->'legacy')
		)
		AND (NOT has_legacy_source OR jsonb_typeof(candidate->'legacy') = 'object');
EXCEPTION
	WHEN OTHERS THEN
		RETURN FALSE;
END;
$$;

CREATE FUNCTION public.is_valid_track_enrichment_audio_features(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
	SELECT CASE candidate->>'version'
		WHEN '1' THEN
			public.is_valid_track_enrichment_audio_features_v1(candidate)
			AND NOT public.track_evidence_contains_private_data(candidate)
		WHEN '2' THEN
			public.is_valid_track_enrichment_audio_features_v2(candidate)
		ELSE FALSE
	END;
$$;

-- Keep the deployed implementation intact behind a non-executable internal
-- name. The stable public entry point arms the v2 table guard only for the
-- duration of the existing owner-scoped, CAS-protected, idempotent RPC.
ALTER FUNCTION public.persist_track_enrichment_batch(UUID, TEXT, JSONB)
RENAME TO persist_track_enrichment_batch_guarded_internal;

REVOKE ALL ON FUNCTION
	public.persist_track_enrichment_batch_guarded_internal(UUID, TEXT, JSONB)
FROM PUBLIC, anon, authenticated, service_role;

-- A denied, owner-only table makes the RPC write capability unforgeable by an
-- authenticated SQL role. Each row exists only inside the wrapper transaction
-- and is removed before the RPC returns.
CREATE TABLE public.track_evidence_rpc_write_guards (
	backend_pid INTEGER PRIMARY KEY,
	transaction_id BIGINT NOT NULL
);

ALTER TABLE public.track_evidence_rpc_write_guards ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.track_evidence_rpc_write_guards
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.persist_track_enrichment_batch(
	p_operation_id UUID,
	p_operation_hash TEXT,
	p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	guard_was_present BOOLEAN;
	response JSONB;
BEGIN
	SELECT EXISTS (
		SELECT 1
		FROM public.track_evidence_rpc_write_guards AS active_guard
		WHERE active_guard.backend_pid = pg_backend_pid()
			AND active_guard.transaction_id = txid_current()
	)
	INTO guard_was_present;

	IF NOT guard_was_present THEN
		INSERT INTO public.track_evidence_rpc_write_guards (
			backend_pid,
			transaction_id
		)
		VALUES (pg_backend_pid(), txid_current());
	END IF;

	BEGIN
		response := public.persist_track_enrichment_batch_guarded_internal(
			p_operation_id,
			p_operation_hash,
			p_items
		);
	EXCEPTION
		WHEN OTHERS THEN
			IF NOT guard_was_present THEN
				DELETE FROM public.track_evidence_rpc_write_guards AS active_guard
				WHERE active_guard.backend_pid = pg_backend_pid()
					AND active_guard.transaction_id = txid_current();
			END IF;
			RAISE;
	END;
	IF NOT guard_was_present THEN
		DELETE FROM public.track_evidence_rpc_write_guards AS active_guard
		WHERE active_guard.backend_pid = pg_backend_pid()
			AND active_guard.transaction_id = txid_current();
	END IF;
	RETURN response;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_track_enrichment_batch(UUID, TEXT, JSONB)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_track_enrichment_batch(UUID, TEXT, JSONB)
TO authenticated;

CREATE FUNCTION public.protect_track_evidence_generation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF TG_OP = 'UPDATE'
		AND OLD.audio_features->>'version' = '2'
		AND NEW.audio_features->>'version' IS DISTINCT FROM '2'
	THEN
		RAISE EXCEPTION
			USING
				ERRCODE = '23514',
				MESSAGE = 'Track Evidence v2 cannot be downgraded or cleared.';
	END IF;

	IF (
		(TG_OP = 'INSERT' AND NEW.audio_features->>'version' = '2')
		OR (
			TG_OP = 'UPDATE'
			AND NEW.audio_features IS DISTINCT FROM OLD.audio_features
			AND (
				OLD.audio_features->>'version' = '2'
				OR NEW.audio_features->>'version' = '2'
			)
		)
	) AND NOT EXISTS (
		SELECT 1
		FROM public.track_evidence_rpc_write_guards AS active_guard
		WHERE active_guard.backend_pid = pg_backend_pid()
			AND active_guard.transaction_id = txid_current()
	)
	THEN
		RAISE EXCEPTION
			USING
				ERRCODE = '23514',
				MESSAGE = 'Track Evidence v2 must be written through the CAS RPC.';
	END IF;

	IF NEW.audio_features->>'version' = '2'
		AND NOT public.is_valid_track_enrichment_audio_features_v2(
			NEW.audio_features
		)
	THEN
		RAISE EXCEPTION
			USING
				ERRCODE = '23514',
				MESSAGE = 'Track Evidence v2 is malformed or unsafe.';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER tracks_protect_evidence_generation_trigger
BEFORE INSERT OR UPDATE ON public.tracks
FOR EACH ROW
EXECUTE FUNCTION public.protect_track_evidence_generation();

REVOKE ALL ON FUNCTION
	public.track_evidence_has_exact_keys(JSONB, TEXT[], TEXT[]),
	public.track_evidence_is_bounded_text(JSONB, INTEGER, INTEGER),
	public.track_evidence_is_timestamp(JSONB),
	public.track_evidence_is_safe_relative_hint(JSONB),
	public.track_evidence_contains_private_data(JSONB, INTEGER),
	public.track_evidence_is_text_array(JSONB, INTEGER, INTEGER),
	public.track_evidence_is_match(JSONB),
	public.track_evidence_is_rekordbox_data(JSONB, BOOLEAN),
	public.track_evidence_is_embedded_tags_data(JSONB, BOOLEAN),
	public.track_evidence_is_essentia_data(JSONB, BOOLEAN),
	public.track_evidence_is_legacy_observation(JSONB, TEXT),
	public.track_evidence_is_current_observation(JSONB, TEXT),
	public.track_evidence_is_application(JSONB, TEXT),
	public.track_evidence_is_legacy_envelope(JSONB),
	public.is_valid_track_enrichment_audio_features_v1(JSONB),
	public.is_valid_track_enrichment_audio_features_v2(JSONB),
	public.is_valid_track_enrichment_audio_features(JSONB),
	public.persist_track_enrichment_batch_guarded_internal(UUID, TEXT, JSONB),
	public.protect_track_evidence_generation()
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
