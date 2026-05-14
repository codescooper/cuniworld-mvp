-- Migration 011 : Fix `get_farm_members` — erreur 42702 (colonne ambiguë)
--
-- PROBLÈME :
--   La fonction déclare `returns table(user_id uuid, email text, role text,
--   joined_at timestamptz, ...)`. Ces noms de colonnes de sortie sont des
--   variables en scope dans le corps de la fonction. Dans le check
--   d'appartenance `... where farm_id = p_farm_id and user_id = auth.uid()`,
--   `user_id` est ambigu entre la colonne `farm_members.user_id` et la
--   variable de sortie `user_id` → PostgreSQL lève 42702 (ambiguous_column).
--   Conséquence : fetchFarmMembers échoue, le sélecteur "Effectué par" et la
--   gestion des membres tombent en mode dégradé.
--
-- SOLUTION : qualifier explicitement toutes les colonnes avec un alias de
-- table dans le check d'appartenance.

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
  -- Check d'appartenance — colonnes qualifiées (fm.) pour éviter l'ambiguïté
  -- avec les colonnes de sortie de la fonction.
  if not exists (
    select 1 from public.farm_members fm
    where fm.farm_id = p_farm_id
      and fm.user_id = auth.uid()
  ) then
    raise exception 'Not a member of this farm';
  end if;

  return query
    select
      m.user_id,
      u.email::text,
      m.role,
      m.joined_at,
      coalesce(p.first_name, '')::text,
      coalesce(p.last_name,  '')::text
    from public.farm_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.farm_id = p_farm_id
    order by m.joined_at asc;
end;
$$;

grant execute on function public.get_farm_members(uuid) to authenticated;
