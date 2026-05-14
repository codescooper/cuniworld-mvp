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
