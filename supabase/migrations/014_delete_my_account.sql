-- Migration 014 : RPC `delete_my_account()` — droit à l'effacement (RGPD art. 17)
--
-- Permet à un utilisateur authentifié de supprimer son propre compte ainsi que
-- toutes les données qui y sont rattachées, sans intervention manuelle.
--
-- COMPORTEMENT :
--   1. Pour chaque ferme dont l'utilisateur est l'unique propriétaire (owner)
--      → suppression de la ferme (cascade vers rabbits/events/lots/photos/orders/…
--        grâce aux FK `on delete cascade` posées par les migrations 001/008/009).
--   2. Pour les fermes partagées, retrait du `farm_members` (RLS-safe).
--   3. Suppression du `profiles` de l'utilisateur (cascade depuis auth.users).
--   4. Suppression de la ligne `auth.users` → cascade sur tout le reste.
--
-- SÉCURITÉ :
--   `security definer` : la fonction est exécutée avec les droits du
--   propriétaire (postgres), seul rôle capable d'écrire dans `auth.users`.
--   `auth.uid()` garantit qu'un utilisateur ne peut supprimer QUE son propre
--   compte — jamais celui d'un autre.
--
-- Idempotente.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_farm_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- 1. Supprimer les fermes dont je suis l'unique propriétaire.
  --    On itère pour éviter qu'une cascade partielle laisse des fermes vides.
  for v_farm_id in
    select fm.farm_id
    from public.farm_members fm
    where fm.user_id = v_uid
      and fm.role = 'owner'
      and not exists (
        select 1 from public.farm_members fm2
        where fm2.farm_id = fm.farm_id
          and fm2.user_id <> v_uid
          and fm2.role = 'owner'
      )
  loop
    delete from public.farms where id = v_farm_id;
  end loop;

  -- 2. Sortir des fermes partagées restantes.
  delete from public.farm_members where user_id = v_uid;

  -- 3. Profil + 4. utilisateur auth (cascade sur tout le reste).
  delete from public.profiles where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
