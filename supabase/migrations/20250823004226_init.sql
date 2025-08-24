-- ============================================================================
-- INIT MIGRATION - CRATE GUIDE DATABASE SCHEMA
-- ============================================================================
-- This migration creates the complete database schema for the Crate Guide application,
-- including profiles, records, tracks, crates, and sets tables with RLS policies.
-- ============================================================================

-- ============================================================================
-- SHARED FUNCTIONS
-- ============================================================================

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

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================

-- User profiles linked to auth.users
CREATE TABLE public.profiles (
    id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
    name varchar,
    ui_theme varchar DEFAULT 'light' NOT NULL,
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

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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

-- RLS policy: Users can only access their own profile
CREATE POLICY "Users can only access their own profile"
    ON public.profiles FOR ALL
    USING (auth.uid() = id);

-- ============================================================================
-- RECORDS TABLE
-- ============================================================================

-- Vinyl records/albums collection
CREATE TABLE public.records (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    discogs_id integer,
    catno varchar,
    title varchar NOT NULL,
    artists varchar NOT NULL,
    label varchar,
    year integer,
    cover varchar,
    created_at timestamp with time zone DEFAULT NOW(),
    updated_at timestamp with time zone DEFAULT NOW()
);

-- Enable RLS for records
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only access their own records
CREATE POLICY "Users can only access their own records"
    ON public.records FOR ALL
    USING (auth.uid() = user_id);

-- Index for user_id lookups
CREATE INDEX idx_records_user_id ON public.records (user_id);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER update_records_updated_at
    BEFORE UPDATE ON public.records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRACKS TABLE
-- ============================================================================

-- Individual tracks on records
CREATE TABLE public.tracks (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
    spotify_id varchar,
    title varchar NOT NULL,
    artists varchar,
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

-- Enable RLS for tracks
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can CRUD tracks of their own records
CREATE POLICY "Users can perform CRUD on tracks of their own records"
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

-- Index for record_id lookups
CREATE INDEX idx_tracks_record_id ON public.tracks(record_id);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER update_tracks_updated_at
    BEFORE UPDATE ON public.tracks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CRATES TABLE
-- ============================================================================

-- Collections of records (playlists/crates)
CREATE TABLE public.crates (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name varchar NOT NULL,
    records uuid[] NOT NULL DEFAULT '{}',
    created_at timestamp with time zone DEFAULT NOW(),
    updated_at timestamp with time zone DEFAULT NOW()
);

-- Enable RLS for crates
ALTER TABLE public.crates ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can CRUD their own crates
CREATE POLICY "Users can perform CRUD on their own crates"
    ON public.crates FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Index for user_id lookups
CREATE INDEX idx_crates_user_id ON public.crates(user_id);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER update_crates_updated_at
    BEFORE UPDATE ON public.crates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SETS TABLE
-- ============================================================================

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

-- Enable RLS for sets
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can CRUD their own sets
CREATE POLICY "Users can perform CRUD on their own sets"
    ON public.sets FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Index for user_id lookups
CREATE INDEX idx_sets_user_id ON public.sets(user_id);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER update_sets_updated_at
    BEFORE UPDATE ON public.sets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for complex validation of played_tracks
CREATE TRIGGER validate_sets_played_tracks
    BEFORE INSERT OR UPDATE ON public.sets
    FOR EACH ROW
    EXECUTE FUNCTION validate_played_tracks();

-- ============================================================================
-- COMMENTS ON JSONB STRUCTURE
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
-- Array order determines track position in the set
