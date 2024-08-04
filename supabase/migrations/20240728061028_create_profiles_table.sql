create table public.profiles (
  id uuid not null references auth.users on delete cascade,
  name varchar,
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

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (NEW.id, NEW.raw_user_meta_data->>'name');
  return NEW;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create policy "Users can only access their own profile"
  on public.profiles for all
  using (auth.uid() = id);