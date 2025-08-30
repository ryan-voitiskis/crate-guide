-- ============================================================================
-- INIT MIGRATION - CRATE GUIDE DATABASE SCHEMA
-- ============================================================================
-- This migration creates the complete database schema for the Crate Guide application,
-- including profiles, records, tracks, crates, and sets tables with RLS policies.
-- ============================================================================

-- ============================================================================
-- LAYER 1: FOUNDATION (Types, Extensions, Utility Functions)
-- ============================================================================

-- Theme options enum
CREATE TYPE ui_theme_enum AS ENUM ('light', 'dark');

-- Function to automatically update the updated_at timestamp column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate played_tracks JSONB array structure
CREATE OR REPLACE FUNCTION public.validate_played_tracks()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if it's an array
    IF jsonb_typeof(NEW.played_tracks) != 'array' THEN
        RAISE EXCEPTION 'played_tracks must be a JSON array';
    END IF;

    -- Validate each track in the array
    FOR i IN 0..jsonb_array_length(NEW.played_tracks) - 1 LOOP
        -- Check required fields
        IF NEW.played_tracks->i->>'track_id' IS NULL THEN
            RAISE EXCEPTION 'track_id is required for all played tracks';
        END IF;

        IF NEW.played_tracks->i->>'time_added' IS NULL THEN
            RAISE EXCEPTION 'time_added is required for all played tracks';
        END IF;

        -- Validate transition_rating if present (must be 1-5)
        IF NEW.played_tracks->i->>'transition_rating' IS NOT NULL THEN
            IF (NEW.played_tracks->i->>'transition_rating')::integer < 1 OR
               (NEW.played_tracks->i->>'transition_rating')::integer > 5 THEN
                RAISE EXCEPTION 'transition_rating must be between 1 and 5';
            END IF;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate artists JSONB array structure
CREATE OR REPLACE FUNCTION public.validate_artists()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if it's an array
    IF jsonb_typeof(NEW.artists) != 'array' THEN
        RAISE EXCEPTION 'artists must be a JSON array';
    END IF;

    -- Validate each artist in the array
    FOR i IN 0..jsonb_array_length(NEW.artists) - 1 LOOP
        -- Check required fields
        IF NEW.artists->i->>'name' IS NULL OR NEW.artists->i->>'name' = '' THEN
            RAISE EXCEPTION 'name is required for all artists';
        END IF;

        -- Validate discogs_id if present (must be a positive integer)
        IF NEW.artists->i->>'discogs_id' IS NOT NULL THEN
            IF (NEW.artists->i->>'discogs_id')::integer <= 0 THEN
                RAISE EXCEPTION 'discogs_id must be a positive integer';
            END IF;
        END IF;

        -- role can be null or any string, no validation needed
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate labels JSONB array structure
CREATE OR REPLACE FUNCTION public.validate_labels()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if it's an array
    IF jsonb_typeof(NEW.labels) != 'array' THEN
        RAISE EXCEPTION 'labels must be a JSON array';
    END IF;

    -- Validate each label in the array
    FOR i IN 0..jsonb_array_length(NEW.labels) - 1 LOOP
        -- Check required fields
        IF NEW.labels->i->>'name' IS NULL OR NEW.labels->i->>'name' = '' THEN
            RAISE EXCEPTION 'name is required for all labels';
        END IF;

        -- Validate discogs_id if present (must be a positive integer)
        IF NEW.labels->i->>'discogs_id' IS NOT NULL THEN
            IF (NEW.labels->i->>'discogs_id')::integer <= 0 THEN
                RAISE EXCEPTION 'discogs_id must be a positive integer';
            END IF;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate track artists JSONB array structure
CREATE OR REPLACE FUNCTION public.validate_track_artists()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if artists is an array
    IF jsonb_typeof(NEW.artists) != 'array' THEN
        RAISE EXCEPTION 'track artists must be a JSON array';
    END IF;

    -- Validate each artist in the array
    FOR i IN 0..jsonb_array_length(NEW.artists) - 1 LOOP
        -- Check required fields
        IF NEW.artists->i->>'name' IS NULL OR NEW.artists->i->>'name' = '' THEN
            RAISE EXCEPTION 'name is required for all track artists';
        END IF;

        -- Validate discogs_id if present (must be a positive integer)
        IF NEW.artists->i->>'discogs_id' IS NOT NULL THEN
            IF (NEW.artists->i->>'discogs_id')::integer <= 0 THEN
                RAISE EXCEPTION 'discogs_id must be a positive integer';
            END IF;
        END IF;

        -- role can be null or any string, no validation needed
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate track extraartists JSONB array structure
CREATE OR REPLACE FUNCTION public.validate_track_extraartists()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if extraartists is an array
    IF jsonb_typeof(NEW.extraartists) != 'array' THEN
        RAISE EXCEPTION 'track extraartists must be a JSON array';
    END IF;

    -- Validate each extraartist in the array
    FOR i IN 0..jsonb_array_length(NEW.extraartists) - 1 LOOP
        -- Check required fields
        IF NEW.extraartists->i->>'name' IS NULL OR NEW.extraartists->i->>'name' = '' THEN
            RAISE EXCEPTION 'name is required for all track extraartists';
        END IF;

        -- Validate discogs_id if present (must be a positive integer)
        IF NEW.extraartists->i->>'discogs_id' IS NOT NULL THEN
            IF (NEW.extraartists->i->>'discogs_id')::integer <= 0 THEN
                RAISE EXCEPTION 'discogs_id must be a positive integer';
            END IF;
        END IF;

        -- role can be null or any string, no validation needed
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- LAYER 2: CORE SCHEMA (Tables Only)
-- ============================================================================

-- User profiles linked to auth.users
CREATE TABLE public.profiles (
    id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
    name varchar,
    ui_theme ui_theme_enum DEFAULT 'light' NOT NULL,
    turntable_theme varchar DEFAULT 'black' NOT NULL,
    turntable_pitch_range int2 DEFAULT 8 NOT NULL,
    selected_crate varchar DEFAULT 'all' NOT NULL,
    key_format varchar DEFAULT 'key' NOT NULL,
    list_layout varchar DEFAULT 'track' NOT NULL,
    discogs_username varchar,
    discogs_avatar_url text,
    discogs_uid varchar,
    discogs_request_token varchar,
    discogs_request_secret varchar,
    discogs_access_token varchar,
    discogs_access_secret varchar,
    just_completed_discogs_oauth boolean DEFAULT false,
    PRIMARY KEY (id)
);

-- Vinyl records/albums collection
CREATE TABLE public.records (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    discogs_id integer,
    title varchar NOT NULL,
    artists jsonb NOT NULL DEFAULT '[]'::jsonb,
    labels jsonb NOT NULL DEFAULT '[]'::jsonb,
    year integer,
    cover varchar,
    created_at timestamp with time zone DEFAULT NOW(),
    updated_at timestamp with time zone DEFAULT NOW()
);

-- Individual tracks on records
CREATE TABLE public.tracks (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
    title varchar NOT NULL,
    artists jsonb NOT NULL DEFAULT '[]'::jsonb,
    extraartists jsonb NOT NULL DEFAULT '[]'::jsonb,
    position varchar,
    duration integer,
    bpm numeric,
    rpm integer,
    key smallint,
    mode smallint,
    genre varchar,
    time_signature_upper smallint,
    time_signature_lower smallint,
    playable boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT NOW(),
    updated_at timestamp with time zone DEFAULT NOW()
);

-- Collections of records
CREATE TABLE public.crates (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name varchar NOT NULL,
    records uuid[] NOT NULL DEFAULT '{}',
    created_at timestamp with time zone DEFAULT NOW(),
    updated_at timestamp with time zone DEFAULT NOW()
);

-- DJ sets/performance history with played tracks stored as JSONB array
CREATE TABLE public.sets (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name varchar,
    played_tracks jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT NOW(),
    updated_at timestamp with time zone DEFAULT NOW(),
    -- Simple check that it's an array
    CONSTRAINT valid_played_tracks_type CHECK (jsonb_typeof(played_tracks) = 'array')
);

-- ============================================================================
-- LAYER 3: SECURITY (RLS and Policies)
-- ============================================================================

-- Enable RLS for all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "users_own_profile_policy"
    ON public.profiles FOR ALL
    USING (auth.uid() = id);

-- Records policies
CREATE POLICY "users_own_records_policy"
    ON public.records FOR ALL
    USING (auth.uid() = user_id);

-- Tracks policies
CREATE POLICY "users_crud_own_record_tracks_policy"
    ON public.tracks FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.records
        WHERE public.records.id = public.tracks.record_id
        AND public.records.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.records
        WHERE public.records.id = public.tracks.record_id
        AND public.records.user_id = auth.uid()
    ));

-- Crates policies
CREATE POLICY "users_crud_own_crates_policy"
    ON public.crates FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Sets policies
CREATE POLICY "users_crud_own_sets_policy"
    ON public.sets FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- LAYER 4: PERFORMANCE (Indexes)
-- ============================================================================

-- Records indexes
CREATE INDEX idx_records_user_id ON public.records (user_id);

-- Tracks indexes
CREATE INDEX idx_tracks_record_id ON public.tracks(record_id);

-- Crates indexes
CREATE INDEX idx_crates_user_id ON public.crates(user_id);

-- Sets indexes
CREATE INDEX idx_sets_user_id ON public.sets(user_id);

-- Artists GIN index for JSONB queries
CREATE INDEX idx_records_artists_gin ON public.records USING GIN (artists);

-- Labels GIN index for JSONB queries
CREATE INDEX idx_records_labels_gin ON public.records USING GIN (labels);

-- ============================================================================
-- LAYER 5: AUTOMATION (Triggers and Functions)
-- ============================================================================

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on user creation
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp triggers
CREATE TRIGGER records_update_updated_at_trigger
    BEFORE UPDATE ON public.records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tracks_update_updated_at_trigger
    BEFORE UPDATE ON public.tracks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER crates_update_updated_at_trigger
    BEFORE UPDATE ON public.crates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER sets_update_updated_at_trigger
    BEFORE UPDATE ON public.sets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Validation triggers
CREATE TRIGGER sets_validate_played_tracks_trigger
    BEFORE INSERT OR UPDATE ON public.sets
    FOR EACH ROW
    EXECUTE FUNCTION validate_played_tracks();

-- Artists validation trigger
CREATE TRIGGER records_validate_artists_trigger
    BEFORE INSERT OR UPDATE ON public.records
    FOR EACH ROW
    EXECUTE FUNCTION validate_artists();

-- Labels validation trigger
CREATE TRIGGER records_validate_labels_trigger
    BEFORE INSERT OR UPDATE ON public.records
    FOR EACH ROW
    EXECUTE FUNCTION validate_labels();

-- Track artists validation trigger
CREATE TRIGGER tracks_validate_artists_trigger
    BEFORE INSERT OR UPDATE ON public.tracks
    FOR EACH ROW
    EXECUTE FUNCTION validate_track_artists();

-- Track extraartists validation trigger
CREATE TRIGGER tracks_validate_extraartists_trigger
    BEFORE INSERT OR UPDATE ON public.tracks
    FOR EACH ROW
    EXECUTE FUNCTION validate_track_extraartists();

-- ============================================================================
-- LAYER 6: BUSINESS LOGIC (Complex Functions)
-- ============================================================================

-- Function to import a record with its tracks atomically
CREATE OR REPLACE FUNCTION public.import_record_with_tracks(
    record JSONB,
    tracks JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inserted_record_id UUID;
    track_record JSONB;
    result JSONB;
BEGIN
    -- Validate that record contains required fields
    IF record->>'user_id' IS NULL OR record->>'title' IS NULL OR record->'artists' IS NULL OR record->'labels' IS NULL THEN
        RAISE EXCEPTION 'Missing required fields: user_id, title, artists, and labels are required';
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
        title,
        artists,
        labels,
        year,
        cover
    )
    VALUES (
        (record->>'user_id')::UUID,
        CASE WHEN record->>'discogs_id' IS NOT NULL
              THEN (record->>'discogs_id')::INTEGER
              ELSE NULL END,
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
                genre,
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
                track_record->>'genre',
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.import_record_with_tracks(JSONB, JSONB) TO authenticated;

-- ============================================================================
-- DOCUMENTATION: JSONB STRUCTURE
-- ============================================================================
-- The played_tracks JSONB array in sets table follows this structure:
-- [
--   {
--     "track_id": "uuid",            -- Required: References tracks.id
--     "time_added": "ISO 8601",      -- Required: When track was added
--     "adjusted_bpm": 128.5,         -- Optional: BPM when loaded/played
--     "transition_rating": 4         -- Optional: Rating 1-5 for transition
--   },
--   ...
-- ]

-- The artists and extraartists JSONB arrays in tracks table follow this structure:
-- [
--   {
--     "discogs_id": 12345,           -- Optional: Discogs artist ID
--     "name": "Artist Name",         -- Required: Artist name
--     "role": "remix"                -- Optional: Artist role (null for main artists, specific role for extraartists)
--   },
--   ...
-- ]
-- Array order determines track position in the set

-- The artists JSONB array in records table follows this structure:
-- [
--   {
--     "discogs_id": 12345,           -- Optional: Discogs artist ID
--     "name": "Artist Name",         -- Required: Artist name
--     "role": null                   -- Optional: Artist role (usually null for main artists)
--   },
--   ...
-- ]

-- The labels JSONB array in records table follows this structure:
-- [
--   {
--     "discogs_id": 12345,           -- Optional: Discogs label ID
--     "name": "Label Name",          -- Required: Label name
--     "catno": "ABC123",             -- Optional: Catalog number
--     "entity_type": "1",            -- Optional: Discogs entity type
--     "thumbnail_url": "https://..." -- Optional: Label thumbnail image URL
--   },
--   ...
-- ]
