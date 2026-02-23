-- SEC-001: prevent tenant escape in import RPC by enforcing caller identity
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
    inserted_record_id UUID;
    track_record JSONB;
    result JSONB;
BEGIN
    caller_user_id := auth.uid();

    IF caller_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Validate that record contains required fields
    IF record->>'user_id' IS NULL OR record->>'title' IS NULL OR record->'artists' IS NULL OR record->'labels' IS NULL THEN
        RAISE EXCEPTION 'Missing required fields: user_id, title, artists, and labels are required';
    END IF;

    -- Never trust client-supplied tenant identity
    IF (record->>'user_id')::UUID IS DISTINCT FROM caller_user_id THEN
        RAISE EXCEPTION 'record.user_id must match authenticated user';
    END IF;

    -- Validate that artists is an array
    IF jsonb_typeof(record->'artists') != 'array' THEN
        RAISE EXCEPTION 'artists must be a JSON array';
    END IF;

    -- Validate that labels is an array
    IF jsonb_typeof(record->'labels') != 'array' THEN
        RAISE EXCEPTION 'labels must be a JSON array';
    END IF;

    -- Validate that tracks is an array
    IF jsonb_typeof(tracks) != 'array' THEN
        RAISE EXCEPTION 'tracks must be a JSON array';
    END IF;

    -- Insert the record
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
        CASE WHEN record->>'discogs_id' IS NOT NULL
              THEN (record->>'discogs_id')::INTEGER
              ELSE NULL END,
        record->>'discogs_release_url',
        record->>'title',
        record->'artists',
        record->'labels',
        CASE WHEN record->>'year' IS NOT NULL
              THEN (record->>'year')::INTEGER
              ELSE NULL END,
        record->>'cover'
    )
    RETURNING id INTO inserted_record_id;

    -- Insert tracks if any exist
    IF jsonb_array_length(tracks) > 0 THEN
        FOR track_record IN SELECT * FROM jsonb_array_elements(tracks)
        LOOP
            -- Validate required track fields
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

    -- Return success result with the inserted record data
    result := jsonb_build_object(
        'success', true,
        'record_id', inserted_record_id,
        'tracks_inserted', jsonb_array_length(tracks)
    );

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        -- Return error result
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

REVOKE ALL ON FUNCTION public.import_record_with_tracks(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_record_with_tracks(JSONB, JSONB) TO authenticated;
