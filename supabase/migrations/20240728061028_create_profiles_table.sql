create table public.profiles (
  id uuid not null references auth.users on delete cascade,
  name varchar not null,
  ui_theme varchar default 'auto' not null,
  turntable_theme varchar default 'black' not null,
  turntable_pitch_range int2 default 8 not null,
  selected_crate varchar default 'all' not null,
  key_format varchar default 'key' not null,
  list_layout varchar default 'track' not null,
  discogs_username varchar,
  discogs_token varchar,
  discogs_token_secret varchar,
  primary key (id)
);

alter table public.profiles enable row level security;
