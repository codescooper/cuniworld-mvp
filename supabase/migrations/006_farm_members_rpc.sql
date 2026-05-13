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
