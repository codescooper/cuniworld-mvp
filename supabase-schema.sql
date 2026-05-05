-- ================================================================
-- CuniWorld – Supabase Schema
-- À coller dans : SQL Editor → New query → Run
-- ================================================================

-- Extension UUID (souvent déjà active)
create extension if not exists "uuid-ossp";

-- ── Tables ───────────────────────────────────────────────────────

create table public.farms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table public.farm_members (
  farm_id   uuid references public.farms(id)   on delete cascade not null,
  user_id   uuid references auth.users(id)     on delete cascade not null,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  primary key (farm_id, user_id)
);

-- Données stockées en JSONB pour rester compatible avec l'app
create table public.rabbits (
  id      text primary key,
  farm_id uuid references public.farms(id) on delete cascade not null,
  data    jsonb not null default '{}'
);

create table public.events (
  id        text primary key,
  farm_id   uuid references public.farms(id) on delete cascade not null,
  rabbit_id text,
  data      jsonb not null default '{}'
);

create table public.photos (
  id        text primary key,
  farm_id   uuid references public.farms(id) on delete cascade not null,
  rabbit_id text,
  data      jsonb not null default '{}'
);

create table public.used_names (
  farm_id   uuid references public.farms(id) on delete cascade not null,
  name      text not null,
  rabbit_id text,
  primary key (farm_id, name)
);

-- ── Index ────────────────────────────────────────────────────────

create index on public.rabbits   (farm_id);
create index on public.events    (farm_id);
create index on public.events    (rabbit_id);
create index on public.photos    (farm_id);
create index on public.used_names(farm_id);

-- ── Row Level Security ───────────────────────────────────────────

alter table public.farms       enable row level security;
alter table public.farm_members enable row level security;
alter table public.rabbits     enable row level security;
alter table public.events      enable row level security;
alter table public.photos      enable row level security;
alter table public.used_names  enable row level security;

-- Fonction helper : l'utilisateur courant est-il membre de la ferme ?
create or replace function public.is_farm_member(fid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.farm_members
    where farm_id = fid and user_id = auth.uid()
  );
$$;

-- farms : visible si membre ; créable par tout utilisateur connecté
create policy "farms_select"  on public.farms for select  using (is_farm_member(id));
create policy "farms_insert"  on public.farms for insert  with check (auth.uid() is not null and created_by = auth.uid());
create policy "farms_update"  on public.farms for update  using (
  exists (select 1 from public.farm_members where farm_id = id and user_id = auth.uid() and role = 'owner')
);

-- farm_members : tout utilisateur connecté peut voir ses propres lignes et s'ajouter
create policy "members_select" on public.farm_members for select using (user_id = auth.uid() or is_farm_member(farm_id));
create policy "members_insert" on public.farm_members for insert with check (user_id = auth.uid());
create policy "members_delete" on public.farm_members for delete using (user_id = auth.uid());

-- rabbits / events / photos / used_names : CRUD complet pour les membres de la ferme
create policy "farm_all" on public.rabbits    for all using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));
create policy "farm_all" on public.events     for all using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));
create policy "farm_all" on public.photos     for all using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));
create policy "farm_all" on public.used_names for all using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));

-- ── Realtime (activer le broadcast pour les tables qui changent) ──
alter publication supabase_realtime add table public.rabbits;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.photos;
