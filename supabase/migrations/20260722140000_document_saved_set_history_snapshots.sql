COMMENT ON COLUMN public.sets.played_tracks IS
'Ordered JSON array of played-track history. Each entry requires track_id, time_added, adjusted_bpm, and transition_rating; new entries also include immutable track_title and artist_display snapshots. Snapshot fields remain optional so legacy entries can use live library metadata when available.';
