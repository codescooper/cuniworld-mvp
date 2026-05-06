-- ============================================================
-- CuniWorld — Fonction RPC : créer une ferme avec son propriétaire
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- Crée la ferme ET ajoute l'utilisateur comme propriétaire en une
-- seule transaction, en contournant RLS côté serveur (security definer).
create or replace function public.create_farm_with_owner(farm_name text)
returns public.farms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm public.farms;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.farms (name, created_by)
  values (trim(farm_name), auth.uid())
  returning * into v_farm;

  insert into public.farm_members (farm_id, user_id, role)
  values (v_farm.id, auth.uid(), 'owner');

  return v_farm;
end;
$$;
