-- Joining with a farm invitation must never let the caller become its owner.
drop policy if exists members_insert on public.farm_members;
create policy members_insert on public.farm_members
  for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'member');

revoke create on schema public from public;
alter function public.is_farm_member(uuid) set search_path = public, pg_temp;
alter function public.is_farm_member_for_storage(text) set search_path = public, pg_temp;

-- PUBLIC inherits EXECUTE by default, even when a migration grants only
-- authenticated explicitly. Remove that implicit anonymous RPC access.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
    execute format('grant execute on function %s to authenticated, service_role', f.signature);
    if f.proname in ('is_farm_member', 'is_farm_member_for_storage',
                      'shop_place_order', 'shop_get_order') then
      execute format('grant execute on function %s to anon', f.signature);
    end if;
  end loop;
end $$;

-- RLS remains the row-level authority on every application table.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
