BEGIN;

-- Receipts cover the retry window for an ambiguous HTTP response. They are
-- owner-scoped, payload-bound, and pruned in bounded batches by each caller.
CREATE TABLE public.track_enrichment_batch_receipts (
	owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	operation_id UUID NOT NULL,
	operation_hash TEXT NOT NULL CHECK (operation_hash ~ '^[0-9a-f]{64}$'),
	request_payload JSONB NOT NULL,
	response_payload JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
	expires_at TIMESTAMPTZ NOT NULL,
	PRIMARY KEY (owner_id, operation_id),
	CHECK (jsonb_typeof(request_payload) = 'array'),
	CHECK (jsonb_typeof(response_payload) = 'object')
);

CREATE INDEX track_enrichment_batch_receipts_expiry_idx
ON public.track_enrichment_batch_receipts (owner_id, expires_at);

ALTER TABLE public.track_enrichment_batch_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.track_enrichment_batch_receipts
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.is_valid_track_enrichment_audio_features(candidate JSONB)
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
	source_name TEXT;
	source_value JSONB;
BEGIN
	IF jsonb_typeof(candidate) <> 'object'
		OR candidate->>'version' <> '1'
		OR jsonb_typeof(candidate->'updatedAt') <> 'string'
		OR length(candidate->>'updatedAt') NOT BETWEEN 1 AND 128
		OR jsonb_typeof(candidate->'applied') <> 'object'
		OR jsonb_typeof(candidate->'match') <> 'object'
		OR jsonb_typeof(candidate->'sources') <> 'object'
		OR NOT candidate ?& ARRAY['version', 'updatedAt', 'applied', 'match', 'sources']
		OR EXISTS (
			SELECT 1
			FROM jsonb_object_keys(candidate) AS root_key
			WHERE root_key <> ALL (ARRAY['version', 'updatedAt', 'applied', 'match', 'sources'])
		)
	THEN
		RETURN FALSE;
	END IF;

	IF NOT (candidate->'applied') ?& ARRAY['bpm', 'keyMode']
		OR EXISTS (
			SELECT 1
			FROM jsonb_object_keys(candidate->'applied') AS applied_key
			WHERE applied_key <> ALL (ARRAY['bpm', 'keyMode'])
		)
	THEN
		RETURN FALSE;
	END IF;

	FOREACH applied_name IN ARRAY ARRAY['bpm', 'keyMode']
	LOOP
		applied_value := candidate->'applied'->applied_name;
		IF jsonb_typeof(applied_value) = 'null' THEN
			CONTINUE;
		END IF;
		IF jsonb_typeof(applied_value) <> 'object'
			OR NOT applied_value ?& ARRAY['source', 'appliedAt']
			OR EXISTS (
				SELECT 1
				FROM jsonb_object_keys(applied_value) AS applied_field
				WHERE applied_field <> ALL (ARRAY['source', 'appliedAt'])
			)
			OR applied_value->>'source' NOT IN (
				'rekordboxXml',
				'embeddedTags',
				'essentiaBrowser'
			)
			OR jsonb_typeof(applied_value->'appliedAt') <> 'string'
			OR length(applied_value->>'appliedAt') NOT BETWEEN 1 AND 128
		THEN
			RETURN FALSE;
		END IF;
	END LOOP;

	IF NOT (candidate->'match') ?& ARRAY['confidence', 'score', 'reasons', 'warnings']
		OR EXISTS (
			SELECT 1
			FROM jsonb_object_keys(candidate->'match') AS match_key
			WHERE match_key <> ALL (ARRAY['confidence', 'score', 'reasons', 'warnings'])
		)
		OR candidate->'match'->>'confidence' NOT IN ('high', 'medium', 'manual')
		OR jsonb_typeof(candidate->'match'->'score') <> 'number'
		OR jsonb_typeof(candidate->'match'->'reasons') <> 'array'
		OR jsonb_typeof(candidate->'match'->'warnings') <> 'array'
		OR jsonb_array_length(candidate->'match'->'reasons') > 100
		OR jsonb_array_length(candidate->'match'->'warnings') > 100
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(candidate->'match'->'reasons') AS reason
			WHERE jsonb_typeof(reason) <> 'string' OR length(reason #>> '{}') > 512
		)
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(candidate->'match'->'warnings') AS warning
			WHERE jsonb_typeof(warning) <> 'string' OR length(warning #>> '{}') > 512
		)
	THEN
		RETURN FALSE;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_object_keys(candidate->'sources') AS source_key
		WHERE source_key <> ALL (ARRAY['rekordboxXml', 'embeddedTags', 'essentiaBrowser'])
	) THEN
		RETURN FALSE;
	END IF;

	FOREACH source_name IN ARRAY ARRAY['rekordboxXml', 'embeddedTags', 'essentiaBrowser']
	LOOP
		source_value := candidate->'sources'->source_name;
		IF source_value IS NULL THEN
			CONTINUE;
		END IF;
		IF jsonb_typeof(source_value) <> 'object' THEN
			RETURN FALSE;
		END IF;

		IF source_name = 'rekordboxXml' THEN
			IF NOT source_value ?& ARRAY[
				'importedAt', 'fileName', 'name', 'artist', 'album', 'genre',
				'locationHint', 'averageBpm', 'tonality', 'parsedKey',
				'parsedMode', 'totalTimeSeconds', 'year', 'kind', 'sampleRate',
				'bitRate', 'rating', 'playCount', 'comments', 'remixer', 'label',
				'dateAdded'
			]
				OR EXISTS (
					SELECT 1
					FROM jsonb_object_keys(source_value) AS source_key
					WHERE source_key <> ALL (ARRAY[
						'importedAt', 'fileName', 'name', 'artist', 'album', 'genre',
						'locationHint', 'averageBpm', 'tonality', 'parsedKey',
						'parsedMode', 'totalTimeSeconds', 'year', 'kind', 'sampleRate',
						'bitRate', 'rating', 'playCount', 'comments', 'remixer', 'label',
						'dateAdded'
					])
				)
				OR jsonb_typeof(source_value->'importedAt') <> 'string'
				OR jsonb_typeof(source_value->'fileName') <> 'string'
			THEN
				RETURN FALSE;
			END IF;

			FOREACH field_name IN ARRAY ARRAY[
				'name', 'artist', 'album', 'genre', 'locationHint', 'tonality',
				'kind', 'comments', 'remixer', 'label', 'dateAdded'
			]
			LOOP
				IF jsonb_typeof(source_value->field_name) NOT IN ('string', 'null') THEN
					RETURN FALSE;
				END IF;
			END LOOP;
			FOREACH field_name IN ARRAY ARRAY[
				'averageBpm', 'parsedKey', 'parsedMode', 'totalTimeSeconds',
				'year', 'sampleRate', 'bitRate', 'rating', 'playCount'
			]
			LOOP
				IF jsonb_typeof(source_value->field_name) NOT IN ('number', 'null') THEN
					RETURN FALSE;
				END IF;
			END LOOP;
		ELSIF source_name = 'embeddedTags' THEN
			IF NOT source_value ?& ARRAY[
				'importedAt', 'fileName', 'locationHint', 'fileSize', 'lastModified',
				'title', 'artist', 'album', 'genres', 'durationSeconds', 'bpm', 'key'
			]
				OR EXISTS (
					SELECT 1
					FROM jsonb_object_keys(source_value) AS source_key
					WHERE source_key <> ALL (ARRAY[
						'importedAt', 'fileName', 'locationHint', 'fileSize', 'lastModified',
						'title', 'artist', 'album', 'genres', 'durationSeconds', 'bpm', 'key'
					])
				)
				OR jsonb_typeof(source_value->'importedAt') <> 'string'
				OR jsonb_typeof(source_value->'fileName') <> 'string'
				OR jsonb_typeof(source_value->'fileSize') <> 'number'
				OR jsonb_typeof(source_value->'lastModified') <> 'number'
				OR jsonb_typeof(source_value->'genres') <> 'array'
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements(source_value->'genres') AS genre
					WHERE jsonb_typeof(genre) <> 'string'
				)
			THEN
				RETURN FALSE;
			END IF;

			FOREACH field_name IN ARRAY ARRAY[
				'locationHint', 'title', 'artist', 'album', 'key'
			]
			LOOP
				IF jsonb_typeof(source_value->field_name) NOT IN ('string', 'null') THEN
					RETURN FALSE;
				END IF;
			END LOOP;
			FOREACH field_name IN ARRAY ARRAY['durationSeconds', 'bpm']
			LOOP
				IF jsonb_typeof(source_value->field_name) NOT IN ('number', 'null') THEN
					RETURN FALSE;
				END IF;
			END LOOP;
		ELSE
			IF NOT source_value ?& ARRAY[
				'importedAt', 'analyzerVersion', 'configurationVersion', 'bpm',
				'bpmConfidence', 'bpmEstimates', 'key', 'scale', 'keyStrength',
				'sampleRate', 'durationSeconds', 'analyzedDurationSeconds',
				'analysisOffsetSeconds', 'warnings'
			]
				OR EXISTS (
					SELECT 1
					FROM jsonb_object_keys(source_value) AS source_key
					WHERE source_key <> ALL (ARRAY[
						'importedAt', 'analyzerVersion', 'configurationVersion', 'bpm',
						'bpmConfidence', 'bpmEstimates', 'key', 'scale', 'keyStrength',
						'sampleRate', 'durationSeconds', 'analyzedDurationSeconds',
						'analysisOffsetSeconds', 'warnings'
					])
				)
				OR jsonb_typeof(source_value->'importedAt') <> 'string'
				OR jsonb_typeof(source_value->'analyzerVersion') <> 'string'
				OR jsonb_typeof(source_value->'configurationVersion') <> 'string'
				OR jsonb_typeof(source_value->'bpmEstimates') <> 'array'
				OR jsonb_typeof(source_value->'sampleRate') <> 'number'
				OR jsonb_typeof(source_value->'durationSeconds') <> 'number'
				OR jsonb_typeof(source_value->'analyzedDurationSeconds') <> 'number'
				OR jsonb_typeof(source_value->'analysisOffsetSeconds') <> 'number'
				OR jsonb_typeof(source_value->'warnings') <> 'array'
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements(source_value->'bpmEstimates') AS estimate
					WHERE jsonb_typeof(estimate) <> 'number'
				)
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements(source_value->'warnings') AS warning
					WHERE jsonb_typeof(warning) <> 'string'
				)
			THEN
				RETURN FALSE;
			END IF;

			FOREACH field_name IN ARRAY ARRAY['key', 'scale']
			LOOP
				IF jsonb_typeof(source_value->field_name) NOT IN ('string', 'null') THEN
					RETURN FALSE;
				END IF;
			END LOOP;
			FOREACH field_name IN ARRAY ARRAY['bpm', 'bpmConfidence', 'keyStrength']
			LOOP
				IF jsonb_typeof(source_value->field_name) NOT IN ('number', 'null') THEN
					RETURN FALSE;
				END IF;
			END LOOP;
		END IF;
	END LOOP;

	FOREACH applied_name IN ARRAY ARRAY['bpm', 'keyMode']
	LOOP
		applied_value := candidate->'applied'->applied_name;
		IF jsonb_typeof(applied_value) = 'object'
			AND NOT (candidate->'sources') ? (applied_value->>'source')
		THEN
			RETURN FALSE;
		END IF;
	END LOOP;

	RETURN TRUE;
EXCEPTION
	WHEN OTHERS THEN
		RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_track_enrichment_audio_features(JSONB)
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
	new_audio_features JSONB;
	bpm_must_be_null BOOLEAN;
	caller_user_id UUID;
	duplicate_track_ids UUID[];
	expected_updated_at TIMESTAMPTZ;
	item JSONB;
	item_position BIGINT;
	item_request_hash TEXT;
	item_track_id_text TEXT;
	item_updates JSONB;
	key_mode_must_be_null BOOLEAN;
	last_ordinal BIGINT := -1;
	owned_track_exists BOOLEAN;
	receipt public.track_enrichment_batch_receipts%ROWTYPE;
	response JSONB;
	result_issue_code TEXT;
	result_ordinal BIGINT;
	result_status TEXT;
	results JSONB := '[]'::JSONB;
	target_track_id UUID;
	updated_track public.tracks%ROWTYPE;
BEGIN
	caller_user_id := auth.uid();
	IF caller_user_id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required.';
	END IF;
	IF p_operation_id IS NULL
		OR p_operation_hash IS NULL
		OR p_operation_hash !~ '^[0-9a-f]{64}$'
	THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid enrichment operation identity.';
	END IF;
	IF jsonb_typeof(p_items) <> 'array'
		OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100
		OR pg_column_size(p_items) > 1000000
	THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enrichment batch exceeds its request bounds.';
	END IF;

	-- The RPC is the only writer. Serializing each owner's receipt mutations
	-- makes the 1,000-operation rolling cap exact under concurrent requests.
	PERFORM pg_advisory_xact_lock(
		hashtextextended('track-enrichment-receipts:' || caller_user_id::TEXT, 0)
	);

	DELETE FROM public.track_enrichment_batch_receipts AS expired
	WHERE (expired.owner_id, expired.operation_id) IN (
		SELECT candidate.owner_id, candidate.operation_id
		FROM public.track_enrichment_batch_receipts AS candidate
		WHERE candidate.owner_id = caller_user_id
			AND candidate.expires_at <= clock_timestamp()
		ORDER BY candidate.expires_at, candidate.operation_id
		LIMIT 100
	);

	-- Concurrent delivery of the same operation must observe one receipt.
	PERFORM pg_advisory_xact_lock(
		hashtextextended(caller_user_id::TEXT || ':' || p_operation_id::TEXT, 0)
	);

	SELECT *
	INTO receipt
	FROM public.track_enrichment_batch_receipts AS existing
	WHERE existing.owner_id = caller_user_id
		AND existing.operation_id = p_operation_id;

	IF FOUND THEN
		IF receipt.operation_hash IS DISTINCT FROM p_operation_hash
			OR receipt.request_payload IS DISTINCT FROM p_items
		THEN
			RAISE EXCEPTION USING
				ERRCODE = '22023',
				MESSAGE = 'Enrichment operation ID was reused with a different request.';
		END IF;
		RETURN receipt.response_payload;
	END IF;

	IF (
		SELECT count(*)
		FROM public.track_enrichment_batch_receipts AS owner_receipt
		WHERE owner_receipt.owner_id = caller_user_id
	) >= 1000 THEN
		RAISE EXCEPTION USING
			ERRCODE = '54000',
			MESSAGE = 'Enrichment receipt capacity reached; retry after the receipt window expires.';
	END IF;

	SELECT COALESCE(array_agg(duplicate.track_id), ARRAY[]::UUID[])
	INTO duplicate_track_ids
	FROM (
		SELECT (candidate->>'track_id')::UUID AS track_id
		FROM jsonb_array_elements(p_items) AS candidate
		WHERE jsonb_typeof(candidate) = 'object'
			AND candidate->>'track_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		GROUP BY (candidate->>'track_id')::UUID
		HAVING count(*) > 1
	) AS duplicate;

	FOR item, item_position IN
		SELECT candidate.value, candidate.ordinality
		FROM jsonb_array_elements(p_items) WITH ORDINALITY AS candidate(value, ordinality)
	LOOP
		result_status := 'invalid';
		result_issue_code := 'invalid_item';
		result_ordinal := item_position - 1;
		item_track_id_text := CASE
			WHEN jsonb_typeof(item) = 'object' THEN item->>'track_id'
			ELSE NULL
		END;
		item_request_hash := CASE
			WHEN jsonb_typeof(item) = 'object' THEN item->>'request_hash'
			ELSE NULL
		END;
		item_updates := NULL;
		target_track_id := NULL;
		expected_updated_at := NULL;

		IF jsonb_typeof(item) = 'object'
			AND item ?& ARRAY[
				'ordinal', 'track_id', 'expected_updated_at', 'updates',
				'preconditions', 'request_hash'
			]
			AND NOT EXISTS (
				SELECT 1
				FROM jsonb_object_keys(item) AS item_key
				WHERE item_key <> ALL (ARRAY[
					'ordinal', 'track_id', 'expected_updated_at', 'updates',
					'preconditions', 'request_hash'
				])
			)
			AND jsonb_typeof(item->'ordinal') = 'number'
			AND item->>'ordinal' ~ '^(0|[1-9][0-9]{0,9})$'
			AND (item->>'ordinal')::BIGINT > last_ordinal
			AND jsonb_typeof(item->'track_id') = 'string'
			AND item->>'track_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
			AND jsonb_typeof(item->'expected_updated_at') = 'string'
			AND length(item->>'expected_updated_at') BETWEEN 1 AND 64
			AND jsonb_typeof(item->'updates') = 'object'
			AND jsonb_typeof(item->'preconditions') = 'object'
			AND jsonb_typeof(item->'request_hash') = 'string'
			AND item_request_hash ~ '^[0-9a-f]{64}$'
			AND pg_column_size(item) <= 65536
		THEN
			BEGIN
				result_ordinal := (item->>'ordinal')::BIGINT;
				last_ordinal := result_ordinal;
				target_track_id := (item->>'track_id')::UUID;
				expected_updated_at := (item->>'expected_updated_at')::TIMESTAMPTZ;
			EXCEPTION
				WHEN OTHERS THEN
					target_track_id := NULL;
			END;
		END IF;

		IF target_track_id IS NOT NULL THEN
			item_updates := item->'updates';
			IF target_track_id = ANY (duplicate_track_ids) THEN
				result_issue_code := 'duplicate_track_id';
			ELSIF EXISTS (
				SELECT 1
				FROM jsonb_object_keys(item_updates) AS update_key
				WHERE update_key <> ALL (ARRAY['bpm', 'key', 'mode', 'audio_features'])
			)
				OR NOT item_updates ? 'audio_features'
				OR EXISTS (
					SELECT 1
					FROM jsonb_object_keys(item->'preconditions') AS precondition_key
					WHERE precondition_key <> ALL (ARRAY['bpm_must_be_null', 'key_mode_must_be_null'])
				)
				OR NOT (item->'preconditions') ?& ARRAY['bpm_must_be_null', 'key_mode_must_be_null']
				OR jsonb_typeof(item->'preconditions'->'bpm_must_be_null') <> 'boolean'
				OR jsonb_typeof(item->'preconditions'->'key_mode_must_be_null') <> 'boolean'
			THEN
				result_issue_code := 'invalid_item';
			ELSE
				bpm_must_be_null := (item->'preconditions'->>'bpm_must_be_null')::BOOLEAN;
				key_mode_must_be_null := (item->'preconditions'->>'key_mode_must_be_null')::BOOLEAN;
				new_audio_features := item_updates->'audio_features';

				IF pg_column_size(new_audio_features) > 49152
					OR NOT public.is_valid_track_enrichment_audio_features(new_audio_features)
				THEN
					result_issue_code := 'invalid_audio_features';
				ELSIF item_updates ? 'bpm'
					AND (
						jsonb_typeof(item_updates->'bpm') <> 'number'
						OR (item_updates->>'bpm')::NUMERIC NOT BETWEEN 30 AND 300
						OR NOT bpm_must_be_null
					)
				THEN
					result_issue_code := 'invalid_item';
				ELSIF NOT item_updates ? 'bpm' AND bpm_must_be_null THEN
					result_issue_code := 'invalid_item';
				ELSIF (item_updates ? 'key') IS DISTINCT FROM (item_updates ? 'mode')
					OR (
						item_updates ? 'key'
						AND (
							jsonb_typeof(item_updates->'key') <> 'number'
							OR jsonb_typeof(item_updates->'mode') <> 'number'
							OR item_updates->>'key' !~ '^(0|[1-9]|10|11)$'
							OR item_updates->>'mode' !~ '^[01]$'
							OR NOT key_mode_must_be_null
						)
					)
					OR (NOT item_updates ? 'key' AND key_mode_must_be_null)
				THEN
					result_issue_code := 'invalid_item';
				ELSIF (item_updates ? 'bpm')
					AND jsonb_typeof(new_audio_features->'applied'->'bpm') <> 'object'
				THEN
					result_issue_code := 'invalid_audio_features';
				ELSIF (item_updates ? 'key')
					AND jsonb_typeof(new_audio_features->'applied'->'keyMode') <> 'object'
				THEN
					result_issue_code := 'invalid_audio_features';
				ELSE
					BEGIN
						UPDATE public.tracks AS target
						SET
							bpm = CASE
								WHEN item_updates ? 'bpm' THEN (item_updates->>'bpm')::NUMERIC
								ELSE target.bpm
							END,
							key = CASE
								WHEN item_updates ? 'key' THEN (item_updates->>'key')::SMALLINT
								ELSE target.key
							END,
							mode = CASE
								WHEN item_updates ? 'mode' THEN (item_updates->>'mode')::SMALLINT
								ELSE target.mode
							END,
							audio_features = new_audio_features
						FROM public.records AS owned_record
						WHERE target.id = target_track_id
							AND target.user_id = caller_user_id
							AND owned_record.id = target.record_id
							AND owned_record.user_id = caller_user_id
							AND target.updated_at = expected_updated_at
							AND (NOT bpm_must_be_null OR target.bpm IS NULL)
							AND (
								NOT key_mode_must_be_null
								OR (target.key IS NULL AND target.mode IS NULL)
							)
						RETURNING target.* INTO updated_track;

						IF FOUND THEN
							result_status := 'updated';
							result_issue_code := NULL;
						ELSE
							SELECT EXISTS (
								SELECT 1
								FROM public.tracks AS owned_track
								JOIN public.records AS owned_record
									ON owned_record.id = owned_track.record_id
									AND owned_record.user_id = owned_track.user_id
								WHERE owned_track.id = target_track_id
									AND owned_track.user_id = caller_user_id
							) INTO owned_track_exists;
							IF owned_track_exists THEN
								result_status := 'stale';
								result_issue_code := 'stale_revision';
							ELSE
								result_status := 'not_found';
								result_issue_code := 'not_found';
							END IF;
						END IF;
					EXCEPTION
						WHEN OTHERS THEN
							result_status := 'invalid';
							result_issue_code := 'update_rejected';
					END;
				END IF;
			END IF;
		END IF;

		results := results || jsonb_build_array(
			jsonb_build_object(
				'ordinal', result_ordinal,
				'track_id', item_track_id_text,
				'request_hash', item_request_hash,
				'status', result_status,
				'issue_code', result_issue_code,
				'track', CASE
					WHEN result_status = 'updated' THEN to_jsonb(updated_track)
					ELSE NULL
				END
			)
		);
	END LOOP;

	response := jsonb_build_object(
		'version', 1,
		'operation_id', p_operation_id,
		'operation_hash', p_operation_hash,
		'results', results
	);

	INSERT INTO public.track_enrichment_batch_receipts (
		owner_id,
		operation_id,
		operation_hash,
		request_payload,
		response_payload,
		expires_at
	)
	VALUES (
		caller_user_id,
		p_operation_id,
		p_operation_hash,
		p_items,
		response,
		clock_timestamp() + INTERVAL '24 hours'
	);

	RETURN response;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_track_enrichment_batch(UUID, TEXT, JSONB)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_track_enrichment_batch(UUID, TEXT, JSONB)
TO authenticated;

COMMIT;
