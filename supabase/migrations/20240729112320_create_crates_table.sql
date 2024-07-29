create table public.crates (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name varchar not null,
  records uuid[] not null default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.crates enable row level security;

create policy "Users can perform CRUD on their own crates"
  on public.crates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_crates_user_id on public.crates(user_id);

create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

create trigger update_crates_updated_at
before update on public.crates
for each row
execute function update_updated_at_column();
