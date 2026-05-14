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
