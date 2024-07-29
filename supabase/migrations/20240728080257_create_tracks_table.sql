create table public.tracks (
  id uuid primary key default uuid_generate_v4(),
  record_id uuid not null references public.records(id) on delete cascade,
  spotify_id varchar,
  title varchar not null,
  artists varchar,
  position varchar,
  duration integer,
  bpm numeric,
  rpm integer,
  key_value smallint,
  mode smallint,
  genre varchar,
  time_signature_upper smallint,
  time_signature_lower smallint,
  playable boolean,
  sp_af_acousticness numeric,
  sp_af_danceability numeric,
  sp_af_duration_ms numeric,
  sp_af_energy numeric,
  sp_af_instrumentalness numeric,
  sp_af_key numeric,
  sp_af_liveness numeric,
  sp_af_loudness numeric,
  sp_af_mode numeric,
  sp_af_speechiness numeric,
  sp_af_tempo numeric,
  sp_af_time_signature numeric,
  sp_af_valence numeric,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.tracks enable row level security;

create policy "Users can perform CRUD on tracks of their own records"
  on public.tracks for all
  using (exists (
    select 1 from public.records
    where public.records.id = public.tracks.record_id
    and public.records.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.records
    where public.records.id = public.tracks.record_id
    and public.records.user_id = auth.uid()
  ));

create index idx_tracks_record_id ON public.tracks(record_id);


