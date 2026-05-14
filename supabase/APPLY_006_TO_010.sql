-- =====================================================================
-- CuniWorld — Migrations consolidées 006 → 010
-- ---------------------------------------------------------------------
-- À COLLER dans : Supabase Dashboard → SQL Editor → New query → Run
-- Projet : myttxsscoullkocuzfnu
--
-- Toutes les sections sont IDEMPOTENTES : ce script peut être rejoué
-- sans risque même si certaines migrations ont déjà été appliquées.
--
-- Contenu :
--   006 — RPC get_farm_members (emails des membres)
--   007 — Table profiles (prénom/nom) + RPC enrichi
--   008 — Table farm_settings + rôles admin/viewer + RPC gestion membres
--   009 — Boutique : orders, order_items, RLS anon, RPCs shop_*
--   010 — Accès anon aux images storage des lapins en vente
-- =====================================================================


-- #####################################################################
-- ## migrations/006_farm_members_rpc.sql
-- #####################################################################

-- Migration 006 : RPC `get_farm_members` exposant les emails des membres.
--
-- Permet à un membre connecté d'obtenir la liste des autres membres de SA ferme
-- avec leur email (utile pour attribuer une action à un autre membre). Utilise
-- SECURITY DEFINER pour traverser le RLS d'auth.users, mais vérifie en interne
-- que l'appelant est bien membre de la ferme demandée.

create or replace function public.get_farm_members(p_farm_id uuid)
returns table(user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- L'appelant doit lui-même être membre de la ferme demandée.
  if not exists (
    select 1 from public.farm_members
    where farm_id = p_farm_id and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this farm';
  end if;

  return query
    select m.user_id, u.email::text, m.role, m.joined_at
    from public.farm_members m
    join auth.users u on u.id = m.user_id
    where m.farm_id = p_farm_id
    order by m.joined_at asc;
end;
$$;

grant execute on function public.get_farm_members(uuid) to authenticated;

-- #####################################################################
-- ## migrations/007_profiles.sql
-- #####################################################################

-- Migration 007 : Table `profiles` (prénom/nom du membre) + RPC enrichi.
--
-- Permet d'afficher Prénom + Nom dans les sélecteurs "Effectué par" plutôt
-- qu'un email anonyme ou un matricule. Chaque utilisateur gère son propre
-- profil. Le RPC `get_farm_members` est mis à jour pour joindre la table.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  first_name text default '',
  last_name  text default '',
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Chaque utilisateur peut lire/écrire son propre profil.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists profiles_self_write on public.profiles;
create policy profiles_self_write on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── RPC mis à jour : retourne aussi first_name / last_name ───────────────────

create or replace function public.get_farm_members(p_farm_id uuid)
returns table(
  user_id    uuid,
  email      text,
  role       text,
  joined_at  timestamptz,
  first_name text,
  last_name  text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- L'appelant doit lui-même être membre de la ferme demandée.
  if not exists (
    select 1 from public.farm_members
    where farm_id = p_farm_id and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this farm';
  end if;

  return query
    select
      m.user_id,
      u.email::text                                      as email,
      m.role                                             as role,
      m.joined_at                                        as joined_at,
      coalesce(p.first_name, '')::text                   as first_name,
      coalesce(p.last_name,  '')::text                   as last_name
    from public.farm_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.farm_id = p_farm_id
    order by m.joined_at asc;
end;
$$;

grant execute on function public.get_farm_members(uuid) to authenticated;

-- #####################################################################
-- ## migrations/008_farm_settings.sql
-- #####################################################################

-- Migration 008 : Table `farm_settings` (config personnalisable par ferme)
--                  + extension du rôle pour supporter admin / viewer.
--
-- - farm_settings.data : JSONB libre (cf. DEFAULT_SETTINGS côté client) qui
--   contient devise, prix de référence, seuils de soins, durées de repro, etc.
-- - Lecture : tout membre de la ferme.
-- - Écriture : owners et admins uniquement.
-- - Rôles : on étend le check pour permettre 'admin' (gère paramètres mais pas
--   les membres) et 'viewer' (lecture seule).

-- ── farm_settings ────────────────────────────────────────────────────────────
create table if not exists public.farm_settings (
  farm_id    uuid primary key references public.farms(id) on delete cascade,
  data       jsonb not null default '{}',
  updated_at timestamptz default now()
);

alter table public.farm_settings enable row level security;

drop policy if exists farm_settings_select on public.farm_settings;
create policy farm_settings_select on public.farm_settings
  for select using (
    exists (
      select 1 from public.farm_members
      where farm_id = farm_settings.farm_id
        and user_id = auth.uid()
    )
  );

drop policy if exists farm_settings_write on public.farm_settings;
create policy farm_settings_write on public.farm_settings
  for all
  using (
    exists (
      select 1 from public.farm_members
      where farm_id = farm_settings.farm_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.farm_members
      where farm_id = farm_settings.farm_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- ── Élargir le check role sur farm_members ──────────────────────────────────
-- On retire l'ancienne contrainte (owner/member) pour autoriser admin/viewer.
do $$
declare cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.farm_members'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%role%';
  if cname is not null then
    execute format('alter table public.farm_members drop constraint %I', cname);
  end if;
end $$;

alter table public.farm_members
  add constraint farm_members_role_check
  check (role in ('owner', 'admin', 'member', 'viewer'));

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.farm_settings;
  end if;
end $$;

-- ── Helpers pour gestion des membres (RPC) ──────────────────────────────────
-- Permet à un owner de changer le rôle d'un membre, ou de le retirer.
create or replace function public.set_farm_member_role(
  p_farm_id uuid,
  p_user_id uuid,
  p_role    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- L'appelant doit être owner de la ferme.
  if not exists (
    select 1 from public.farm_members
    where farm_id = p_farm_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'Only owner can change member roles';
  end if;

  if p_role not in ('owner', 'admin', 'member', 'viewer') then
    raise exception 'Invalid role: %', p_role;
  end if;

  update public.farm_members
  set role = p_role
  where farm_id = p_farm_id and user_id = p_user_id;
end;
$$;

grant execute on function public.set_farm_member_role(uuid, uuid, text) to authenticated;

create or replace function public.remove_farm_member(
  p_farm_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- L'appelant doit être owner, ou bien se retirer lui-même.
  if not exists (
    select 1 from public.farm_members
    where farm_id = p_farm_id
      and user_id = auth.uid()
      and role = 'owner'
  ) and auth.uid() <> p_user_id then
    raise exception 'Only owner can remove members (or member can remove themselves)';
  end if;

  -- Empêche de retirer le dernier owner pour ne pas orphaner la ferme.
  if (
    select count(*) from public.farm_members
    where farm_id = p_farm_id and role = 'owner'
  ) = 1
  and exists (
    select 1 from public.farm_members
    where farm_id = p_farm_id and user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'Cannot remove the last owner';
  end if;

  delete from public.farm_members
  where farm_id = p_farm_id and user_id = p_user_id;
end;
$$;

grant execute on function public.remove_farm_member(uuid, uuid) to authenticated;

-- #####################################################################
-- ## migrations/009_shop.sql
-- #####################################################################

-- Migration 009 : Boutique publique
--
-- - Tables `orders` et `order_items` (commandes guest, sans compte client).
-- - Politiques RLS additionnelles permettant à un visiteur anonyme de lire
--   les lapins explicitement marqués `forSale=true`, leurs photos, leurs
--   pesées (pour le prix calculé), le nom de la ferme et ses paramètres
--   publics (devise, description, WhatsApp). Les politiques existantes pour
--   les membres restent en place : ce sont des canaux supplémentaires.
-- - RPCs `shop_place_order` et `shop_get_order` accessibles à anon, qui
--   gèrent la création de commande et la lecture pour suivi client.
-- - RPC `shop_set_order_status` réservé aux membres de la ferme.

-- ── Table orders ────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  farm_id     uuid not null references public.farms(id) on delete cascade,
  status      text not null default 'reserve'
              check (status in ('reserve','paye','en_route','livre','annule')),
  data        jsonb not null default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.orders enable row level security;

drop policy if exists orders_member_select on public.orders;
create policy orders_member_select on public.orders
  for select using (
    exists (
      select 1 from public.farm_members
      where farm_id = orders.farm_id and user_id = auth.uid()
    )
  );

drop policy if exists orders_member_update on public.orders;
create policy orders_member_update on public.orders
  for update using (
    exists (
      select 1 from public.farm_members
      where farm_id = orders.farm_id
        and user_id = auth.uid()
        and role in ('owner','admin','member')
    )
  );

-- ── Table order_items ───────────────────────────────────────────────────────
create table if not exists public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  rabbit_id       text not null,
  unit_price      numeric default 0,
  rabbit_snapshot jsonb default '{}',
  created_at      timestamptz default now()
);

alter table public.order_items enable row level security;

drop policy if exists order_items_member_select on public.order_items;
create policy order_items_member_select on public.order_items
  for select using (
    exists (
      select 1
      from public.orders o
      join public.farm_members fm on fm.farm_id = o.farm_id
      where o.id = order_items.order_id and fm.user_id = auth.uid()
    )
  );

create index if not exists order_items_rabbit_idx on public.order_items(rabbit_id);
create index if not exists order_items_order_idx  on public.order_items(order_id);

-- ── Politiques RLS additionnelles : lecture publique des lapins en vente ────
-- Visiteur anonyme peut LIRE :
--   - rabbits avec forSale=true
--   - leurs photos
--   - leurs pesées (pour le prix calculé)
--   - le nom de la ferme et les paramètres publics

drop policy if exists rabbits_public_shop on public.rabbits;
create policy rabbits_public_shop on public.rabbits
  for select to anon, authenticated
  using ((data->>'forSale')::boolean is true);

drop policy if exists photos_public_shop on public.photos;
create policy photos_public_shop on public.photos
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.rabbits r
      where r.id = photos.rabbit_id
        and (r.data->>'forSale')::boolean is true
    )
  );

drop policy if exists events_public_shop on public.events;
create policy events_public_shop on public.events
  for select to anon, authenticated
  using (
    data->>'type' = 'pesée'
    and exists (
      select 1 from public.rabbits r
      where r.id = events.rabbit_id
        and (r.data->>'forSale')::boolean is true
    )
  );

drop policy if exists farms_public_shop on public.farms;
create policy farms_public_shop on public.farms
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.rabbits r
      where r.farm_id = farms.id
        and (r.data->>'forSale')::boolean is true
    )
  );

drop policy if exists farm_settings_public_shop on public.farm_settings;
create policy farm_settings_public_shop on public.farm_settings
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.rabbits r
      where r.farm_id = farm_settings.farm_id
        and (r.data->>'forSale')::boolean is true
    )
  );

-- ── RPC : passer une commande (anon, sans compte) ───────────────────────────
create or replace function public.shop_place_order(
  p_farm_id         uuid,
  p_rabbit_ids      text[],
  p_customer_name   text,
  p_customer_phone  text,
  p_customer_email  text default '',
  p_customer_address text default '',
  p_customer_notes  text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id   uuid;
  v_rabbit_id  text;
  v_currency   text;
begin
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'Customer name required';
  end if;
  if p_customer_phone is null or btrim(p_customer_phone) = '' then
    raise exception 'Customer phone required';
  end if;
  if p_rabbit_ids is null or coalesce(array_length(p_rabbit_ids, 1), 0) = 0 then
    raise exception 'At least one rabbit required';
  end if;

  select coalesce(data->>'currencySymbol', 'FCFA') into v_currency
  from public.farm_settings where farm_id = p_farm_id;
  v_currency := coalesce(v_currency, 'FCFA');

  -- Vérifie disponibilité : chaque lapin doit être forSale, de la bonne ferme,
  -- pas déjà engagé dans une commande active.
  if exists (
    select 1 from unnest(p_rabbit_ids) as rid
    where not exists (
      select 1 from public.rabbits r
      where r.id = rid
        and r.farm_id = p_farm_id
        and (r.data->>'forSale')::boolean is true
        and coalesce(r.data->>'status', 'actif') = 'actif'
    )
    or exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.rabbit_id = rid and o.status in ('reserve','paye','en_route')
    )
  ) then
    raise exception 'One or more rabbits are no longer available';
  end if;

  -- Création de la commande
  insert into public.orders (farm_id, status, data)
  values (
    p_farm_id, 'reserve',
    jsonb_build_object(
      'customer', jsonb_build_object(
        'name',    p_customer_name,
        'phone',   p_customer_phone,
        'email',   coalesce(p_customer_email, ''),
        'address', coalesce(p_customer_address, ''),
        'notes',   coalesce(p_customer_notes, '')
      ),
      'currencySymbol', v_currency
    )
  )
  returning id into v_order_id;

  -- Lignes de commande : prix = salePrice du lapin si défini, sinon 0
  -- (l'éleveur ajustera). Snapshot pour conserver le nom/race au moment T.
  foreach v_rabbit_id in array p_rabbit_ids loop
    insert into public.order_items (order_id, rabbit_id, unit_price, rabbit_snapshot)
    select
      v_order_id,
      v_rabbit_id,
      coalesce(nullif(r.data->>'salePrice', '')::numeric, 0),
      jsonb_build_object(
        'name',  r.data->>'name',
        'code',  r.data->>'code',
        'breed', r.data->>'breed',
        'sex',   r.data->>'sex'
      )
    from public.rabbits r where r.id = v_rabbit_id;
  end loop;

  return v_order_id;
end;
$$;

grant execute on function public.shop_place_order(uuid, text[], text, text, text, text, text)
  to anon, authenticated;

-- ── RPC : récupérer une commande par id (suivi client) ──────────────────────
create or replace function public.shop_get_order(p_order_id uuid)
returns table(
  order_id        uuid,
  farm_id         uuid,
  farm_name       text,
  status          text,
  customer_name   text,
  customer_phone  text,
  customer_email  text,
  customer_address text,
  customer_notes  text,
  currency_symbol text,
  total           numeric,
  created_at      timestamptz,
  updated_at      timestamptz,
  items           jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    o.id,
    o.farm_id,
    f.name,
    o.status,
    o.data#>>'{customer,name}',
    o.data#>>'{customer,phone}',
    o.data#>>'{customer,email}',
    o.data#>>'{customer,address}',
    o.data#>>'{customer,notes}',
    coalesce(o.data->>'currencySymbol', 'FCFA'),
    coalesce(
      (select sum(oi.unit_price) from public.order_items oi where oi.order_id = o.id),
      0
    ),
    o.created_at,
    o.updated_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rabbitId',  oi.rabbit_id,
            'unitPrice', oi.unit_price,
            'snapshot',  oi.rabbit_snapshot
          )
        )
        from public.order_items oi where oi.order_id = o.id
      ),
      '[]'::jsonb
    )
  from public.orders o
  left join public.farms f on f.id = o.farm_id
  where o.id = p_order_id;
end;
$$;

grant execute on function public.shop_get_order(uuid) to anon, authenticated;

-- ── RPC : changer le statut d'une commande (membres uniquement) ─────────────
create or replace function public.shop_set_order_status(
  p_order_id uuid,
  p_status   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_farm_id uuid;
begin
  if p_status not in ('reserve','paye','en_route','livre','annule') then
    raise exception 'Invalid status: %', p_status;
  end if;
  select farm_id into v_farm_id from public.orders where id = p_order_id;
  if v_farm_id is null then
    raise exception 'Order not found';
  end if;
  if not exists (
    select 1 from public.farm_members
    where farm_id = v_farm_id and user_id = auth.uid()
      and role in ('owner','admin','member')
  ) then
    raise exception 'Not a member of this farm';
  end if;

  update public.orders
  set status = p_status, updated_at = now()
  where id = p_order_id;
end;
$$;

grant execute on function public.shop_set_order_status(uuid, text) to authenticated;

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.order_items;
  end if;
end $$;

-- #####################################################################
-- ## migrations/010_shop_storage_anon.sql
-- #####################################################################

-- Migration 010 : Accès anonyme aux images des lapins en vente (boutique)
--
-- PROBLÈME corrigé :
--   Migration 003 a créé le bucket `photos` en PRIVÉ avec une policy de
--   lecture réservée aux membres de la ferme (photos_select_member).
--   La boutique publique (Phase 2 / migration 009) est consultée par des
--   visiteurs ANONYMES : la migration 009 a bien ouvert la table `photos`
--   (les métadonnées) à anon, mais PAS `storage.objects` (les octets de
--   l'image). Conséquence : aucune photo ne s'affiche dans la boutique.
--
-- SOLUTION :
--   Ajouter une policy SELECT sur storage.objects autorisant anon (et
--   authenticated) à lire les images du bucket `photos` UNIQUEMENT pour
--   les lapins explicitement marqués forSale=true.
--
--   Convention de chemin (src/photoCloudStorage.js) :
--     farms/{farmId}/rabbits/{rabbitId}/{photoId}.jpg
--   → split_part(name, '/', 4) = rabbitId
--
-- Idempotente : peut être rejouée sans risque.

drop policy if exists "photos_select_public_shop" on storage.objects;
create policy "photos_select_public_shop" on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'photos'
    and split_part(name, '/', 1) = 'farms'
    and split_part(name, '/', 3) = 'rabbits'
    and exists (
      select 1 from public.rabbits r
      where r.id = split_part(name, '/', 4)
        and (r.data->>'forSale')::boolean is true
    )
  );

-- Note : la policy "photos_select_member" (migration 003) reste en place.
-- Les deux policies SELECT sont en OR — un membre garde l'accès complet à
-- toutes les photos de sa ferme, un visiteur anonyme n'accède qu'aux photos
-- des lapins en vente. Aucune fuite des photos non mises en vente.
