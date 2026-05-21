-- Online-1: city save blobs (auth-scoped saves in a follow-up migration)
create table public.city_saves (
  city_key text primary key,
  snapshot jsonb not null,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.city_saves enable row level security;

create policy "allow local city save for anon and authenticated"
  on public.city_saves
  for all
  to anon, authenticated
  using (city_key = 'local')
  with check (city_key = 'local');

comment on table public.city_saves is 'Civitas city snapshots; city_key local until per-user auth saves land.';
