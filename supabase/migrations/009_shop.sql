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
