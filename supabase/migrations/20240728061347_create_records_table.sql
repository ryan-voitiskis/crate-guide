create table public.records (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  discogs_id integer,
  spotify_id varchar,
  catno varchar,
  title varchar not null,
  artists varchar not null,
  label varchar,
  year integer,
  cover varchar,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.records enable row level security;

create policy "Users can only access their own records"
  on public.records for all
  using (auth.uid() = user_id);

create index idx_records_user_id on public.records (user_id);

create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

create trigger update_crates_updated_at
before update on public.records
for each row
execute function update_updated_at_column();