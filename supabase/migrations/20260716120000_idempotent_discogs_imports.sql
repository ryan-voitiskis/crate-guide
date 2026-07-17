-- A retry must not create a second copy if the original transaction committed
-- but its response was lost. Fail visibly if historical duplicates need manual
-- resolution; deleting them automatically could orphan UUIDs stored in crates.
DO $$
DECLARE
    duplicate_groups BIGINT;
BEGIN
    SELECT count(*)
    INTO duplicate_groups
    FROM (
        SELECT user_id, discogs_id
        FROM public.records
        WHERE discogs_id IS NOT NULL
        GROUP BY user_id, discogs_id
        HAVING count(*) > 1
    ) duplicates;

    IF duplicate_groups > 0 THEN
        RAISE EXCEPTION 'Cannot enforce Discogs import uniqueness: % duplicate user/release groups require manual resolution', duplicate_groups;
    END IF;
END;
$$;

CREATE UNIQUE INDEX records_user_discogs_id_key
ON public.records (user_id, discogs_id)
WHERE discogs_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.import_record_with_tracks(
    record JSONB,
    tracks JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    caller_user_id UUID;
    input_discogs_id INTEGER;
    inserted_record_id UUID;
    track_record JSONB;
BEGIN
    caller_user_id := auth.uid();

    IF caller_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF record->>'user_id' IS NULL OR record->>'title' IS NULL OR record->'artists' IS NULL OR record->'labels' IS NULL THEN
        RAISE EXCEPTION 'Missing required fields: user_id, title, artists, and labels are required';
    END IF;

    IF (record->>'user_id')::UUID IS DISTINCT FROM caller_user_id THEN
        RAISE EXCEPTION 'record.user_id must match authenticated user';
    END IF;

    IF jsonb_typeof(record->'artists') != 'array' THEN
        RAISE EXCEPTION 'artists must be a JSON array';
    END IF;

    IF jsonb_typeof(record->'labels') != 'array' THEN
        RAISE EXCEPTION 'labels must be a JSON array';
    END IF;

    IF jsonb_typeof(tracks) != 'array' THEN
        RAISE EXCEPTION 'tracks must be a JSON array';
    END IF;

    input_discogs_id := CASE
        WHEN record->>'discogs_id' IS NOT NULL
        THEN (record->>'discogs_id')::INTEGER
        ELSE NULL
    END;

    INSERT INTO public.records (
        user_id,
        discogs_id,
        discogs_release_url,
        title,
        artists,
        labels,
        year,
        cover
    )
    VALUES (
        caller_user_id,
        input_discogs_id,
        record->>'discogs_release_url',
        record->>'title',
        record->'artists',
        record->'labels',
        CASE WHEN record->>'year' IS NOT NULL
              THEN (record->>'year')::INTEGER
              ELSE NULL END,
        record->>'cover'
    )
    ON CONFLICT (user_id, discogs_id) WHERE discogs_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO inserted_record_id;

    IF inserted_record_id IS NULL THEN
        SELECT id
        INTO inserted_record_id
        FROM public.records
        WHERE user_id = caller_user_id
          AND discogs_id = input_discogs_id;

        IF inserted_record_id IS NULL THEN
            RAISE EXCEPTION 'Could not resolve the existing Discogs record';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'record_id', inserted_record_id,
            'tracks_inserted', 0,
            'already_exists', true
        );
    END IF;

    IF jsonb_array_length(tracks) > 0 THEN
        FOR track_record IN SELECT * FROM jsonb_array_elements(tracks)
        LOOP
            IF track_record->>'title' IS NULL THEN
                RAISE EXCEPTION 'Track title is required';
            END IF;

            INSERT INTO public.tracks (
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
                playable
            )
            VALUES (
                inserted_record_id,
                track_record->>'title',
                COALESCE(track_record->'artists', '[]'::jsonb),
                COALESCE(track_record->'extraartists', '[]'::jsonb),
                track_record->>'position',
                CASE WHEN track_record->>'duration' IS NOT NULL
                      THEN (track_record->>'duration')::INTEGER
                      ELSE NULL END,
                CASE WHEN track_record->>'bpm' IS NOT NULL
                      THEN (track_record->>'bpm')::NUMERIC
                      ELSE NULL END,
                CASE WHEN track_record->>'rpm' IS NOT NULL
                      THEN (track_record->>'rpm')::INTEGER
                      ELSE NULL END,
                CASE WHEN track_record->>'key' IS NOT NULL
                      THEN (track_record->>'key')::SMALLINT
                      ELSE NULL END,
                CASE WHEN track_record->>'mode' IS NOT NULL
                      THEN (track_record->>'mode')::SMALLINT
                      ELSE NULL END,
                COALESCE(track_record->'genres', '[]'::jsonb),
                CASE WHEN track_record->>'time_signature_upper' IS NOT NULL
                      THEN (track_record->>'time_signature_upper')::SMALLINT
                      ELSE NULL END,
                CASE WHEN track_record->>'time_signature_lower' IS NOT NULL
                      THEN (track_record->>'time_signature_lower')::SMALLINT
                      ELSE NULL END,
                CASE WHEN track_record->>'playable' IS NOT NULL
                      THEN (track_record->>'playable')::BOOLEAN
                      ELSE TRUE END
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'record_id', inserted_record_id,
        'tracks_inserted', jsonb_array_length(tracks),
        'already_exists', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.import_record_with_tracks(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_record_with_tracks(JSONB, JSONB) TO authenticated;
