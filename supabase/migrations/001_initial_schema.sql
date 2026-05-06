-- ============================================================
-- CuniWorld — Schéma initial Supabase
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Farms ─────────────────────────────────────────────────────────
create table if not exists public.farms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ── Farm Members ─────────────────────────────────────────────────
create table if not exists public.farm_members (
  farm_id    uuid not null references public.farms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (farm_id, user_id)
);

-- ── Rabbits ───────────────────────────────────────────────────────
create table if not exists public.rabbits (
  id         text primary key,
  farm_id    uuid not null references public.farms(id) on delete cascade,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ── Events ────────────────────────────────────────────────────────
create table if not exists public.events (
  id         text primary key,
  farm_id    uuid not null references public.farms(id) on delete cascade,
  rabbit_id  text not null,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ── Photos ────────────────────────────────────────────────────────
create table if not exists public.photos (
  id         text primary key,
  farm_id    uuid not null references public.farms(id) on delete cascade,
  rabbit_id  text not null,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ── Used Names ────────────────────────────────────────────────────
create table if not exists public.used_names (
  farm_id    uuid not null references public.farms(id) on delete cascade,
  name       text not null,
  rabbit_id  text,
  primary key (farm_id, name)
);

-- ── Index pour les requêtes filtrées par ferme ────────────────────
create index if not exists idx_rabbits_farm_id    on public.rabbits(farm_id);
create index if not exists idx_events_farm_id     on public.events(farm_id);
create index if not exists idx_events_rabbit_id   on public.events(rabbit_id);
create index if not exists idx_photos_farm_id     on public.photos(farm_id);
create index if not exists idx_used_names_farm_id on public.used_names(farm_id);

-- ── Row Level Security ────────────────────────────────────────────
alter table public.farms       enable row level security;
alter table public.farm_members enable row level security;
alter table public.rabbits     enable row level security;
alter table public.events      enable row level security;
alter table public.photos      enable row level security;
alter table public.used_names  enable row level security;

-- Fonction helper : l'utilisateur connecté est-il membre de cette ferme ?
create or replace function public.is_farm_member(fid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.farm_members
    where farm_id = fid and user_id = auth.uid()
  );
$$;

-- Farms : accès si membre, création si propriétaire
create policy "farms_select" on public.farms
  for select using (is_farm_member(id));

create policy "farms_insert" on public.farms
  for insert with check (created_by = auth.uid());

create policy "farms_update" on public.farms
  for update using (
    exists (
      select 1 from public.farm_members
      where farm_id = farms.id and user_id = auth.uid() and role = 'owner'
    )
  );

-- Farm members : visible et modifiable par les membres de la ferme
create policy "members_select" on public.farm_members
  for select using (
    user_id = auth.uid()
    or is_farm_member(farm_id)
  );

create policy "members_insert" on public.farm_members
  for insert with check (user_id = auth.uid());

-- Rabbits / Events / Photos / Used Names : accès complet si membre
create policy "rabbits_all" on public.rabbits
  for all using (is_farm_member(farm_id))
  with check (is_farm_member(farm_id));

create policy "events_all" on public.events
  for all using (is_farm_member(farm_id))
  with check (is_farm_member(farm_id));

create policy "photos_all" on public.photos
  for all using (is_farm_member(farm_id))
  with check (is_farm_member(farm_id));

create policy "used_names_all" on public.used_names
  for all using (is_farm_member(farm_id))
  with check (is_farm_member(farm_id));

-- ── Realtime ─────────────────────────────────────────────────────
-- Nécessaire pour que les changements temps réel soient visibles
alter table public.rabbits replica identity full;
alter table public.events  replica identity full;

alter publication supabase_realtime add table public.rabbits;
alter publication supabase_realtime add table public.events;
