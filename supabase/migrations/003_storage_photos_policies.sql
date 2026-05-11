-- =====================================================================
-- Storage bucket `photos` + RLS policies
-- ---------------------------------------------------------------------
-- Path convention enforced by src/photoCloudStorage.js :
--   farms/{farmId}/rabbits/{rabbitId}/{photoId}.jpg
--
-- The bucket is PRIVATE: clients must use a signed URL or `download()`
-- via the supabase-js SDK. Direct public URLs do not work.
-- =====================================================================

-- Create bucket if absent (idempotent).
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Helper: is the current authenticated user a member of farm <farmId>?
-- The path layout puts the farmId as the second segment, so we can derive
-- it from the storage object name.
create or replace function public.is_farm_member_for_storage(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.farm_members fm
    where fm.user_id = auth.uid()
      and fm.farm_id::text = split_part(object_name, '/', 2)
  );
$$;

-- ──────────────────────────────────────────────────────────────────────
-- Policies on storage.objects (scoped to bucket = 'photos')
-- ──────────────────────────────────────────────────────────────────────
drop policy if exists "photos_select_member" on storage.objects;
drop policy if exists "photos_insert_member" on storage.objects;
drop policy if exists "photos_update_member" on storage.objects;
drop policy if exists "photos_delete_member" on storage.objects;

-- READ : seuls les membres de la ferme accèdent aux signed URL / download.
create policy "photos_select_member" on storage.objects
  for select
  using (
    bucket_id = 'photos'
    and public.is_farm_member_for_storage(name)
  );

-- WRITE (upload / upsert)
create policy "photos_insert_member" on storage.objects
  for insert
  with check (
    bucket_id = 'photos'
    and public.is_farm_member_for_storage(name)
    and split_part(name, '/', 1) = 'farms'
  );

-- UPDATE (rare — supabase-js storage.upload with upsert: true emits update).
create policy "photos_update_member" on storage.objects
  for update
  using (
    bucket_id = 'photos'
    and public.is_farm_member_for_storage(name)
  )
  with check (
    bucket_id = 'photos'
    and public.is_farm_member_for_storage(name)
  );

-- DELETE : membres uniquement.
create policy "photos_delete_member" on storage.objects
  for delete
  using (
    bucket_id = 'photos'
    and public.is_farm_member_for_storage(name)
  );
