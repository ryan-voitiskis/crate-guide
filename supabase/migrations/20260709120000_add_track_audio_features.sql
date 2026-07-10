ALTER TABLE public.tracks
ADD COLUMN IF NOT EXISTS audio_features jsonb;
